#!/usr/bin/env bash

set -euo pipefail
set +x

readonly BOT_BRANCH="bot/sync-prod-selfhost-warm"
readonly TARGET_BRANCH="main"
readonly TEMPLATE_BRANCH="prod_selfhost"
readonly OMA_PROJECT_PATH_ENCODED="sky-search%2Fagent%2Foh-my-agent"
readonly ARTIFACT_DIR=".gitlab-package"
readonly MANIFEST_FILE="$ARTIFACT_DIR/release-manifest.env"
readonly EXPECTED_PACKAGE_NAME="coding_agent_web_template-prod_selfhost.tar.gz"

die() {
    echo "[oma-sync] ERROR: $*" >&2
    exit 1
}

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

require_var() {
    local name="$1"
    [ -n "${!name:-}" ] || die "missing required CI variable: $name"
}

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

parse_release_manifest() {
    local manifest="$1"
    local line key value
    local seen_commit_sha="" seen_tarball_sha256="" seen_archive_root="" seen_package_name=""

    [ -f "$manifest" ] || die "release manifest not found: $manifest"
    while IFS= read -r line || [ -n "$line" ]; do
        [[ "$line" == *=* ]] || die "invalid release manifest line"
        key="${line%%=*}"
        value="${line#*=}"
        case "$key" in
            commit_sha)
                [ -z "$seen_commit_sha" ] || die "duplicate manifest key: $key"
                manifest_commit_sha="$value"
                seen_commit_sha=1
                ;;
            tarball_sha256)
                [ -z "$seen_tarball_sha256" ] || die "duplicate manifest key: $key"
                manifest_tarball_sha256="$value"
                seen_tarball_sha256=1
                ;;
            archive_root)
                [ -z "$seen_archive_root" ] || die "duplicate manifest key: $key"
                manifest_archive_root="$value"
                seen_archive_root=1
                ;;
            package_name)
                [ -z "$seen_package_name" ] || die "duplicate manifest key: $key"
                manifest_package_name="$value"
                seen_package_name=1
                ;;
            *) die "unexpected manifest key: $key" ;;
        esac
    done < "$manifest"

    [[ "${manifest_commit_sha:-}" =~ ^[0-9a-f]{40}$ ]] || die "invalid commit_sha in release manifest"
    [[ "${manifest_tarball_sha256:-}" =~ ^[0-9a-f]{64}$ ]] || die "invalid tarball_sha256 in release manifest"
    [ "${manifest_archive_root:-}" = "coding_agent_web_template" ] || die "unexpected archive_root"
    [ "${manifest_package_name:-}" = "$EXPECTED_PACKAGE_NAME" ] || die "unexpected package_name"
}

validate_and_extract_archive() {
    local tarball="$1"
    local extract_dir="$2"
    local list_file="$3"
    local verbose_file="$4"
    local entry rel
    local required

    [ -f "$tarball" ] || die "release tarball not found: $tarball"
    [ "$(sha256_file "$tarball")" = "$manifest_tarball_sha256" ] || die "tarball SHA256 does not match release manifest"
    tar -tzf "$tarball" > "$list_file"
    tar -tvzf "$tarball" > "$verbose_file"
    [ -s "$list_file" ] || die "release tarball is empty"
    [ "$(wc -l < "$list_file" | tr -d ' ')" = "$(wc -l < "$verbose_file" | tr -d ' ')" ] \
        || die "archive contains unsupported entry names"
    [ -z "$(sort "$list_file" | uniq -d)" ] || die "archive contains duplicate entries"

    while IFS= read -r entry; do
        [ -n "$entry" ] || die "archive contains an empty entry"
        [[ "$entry" != /* ]] || die "archive contains an absolute path: $entry"
        [[ "$entry" == "$manifest_archive_root/"* ]] || die "archive entry is outside the expected root: $entry"
        rel="${entry#"$manifest_archive_root/"}"
        [[ "/$rel/" != *"/../"* ]] || die "archive contains parent traversal: $entry"
    done < "$list_file"

    while IFS= read -r entry; do
        [ "${entry:0:1}" = "-" ] || die "archive contains a non-regular entry"
    done < "$verbose_file"

    for required in package.json apps/client/package.json apps/server/package.json pnpm-lock.yaml pnpm-workspace.yaml; do
        grep -Fx "$manifest_archive_root/$required" "$list_file" >/dev/null \
            || die "release tarball is missing required file: $required"
    done

    mkdir -p "$extract_dir"
    while IFS= read -r entry; do
        rel="${entry#"$manifest_archive_root/"}"
        if [ "$rel" = "package.json" ] || [[ "$rel" == */package.json ]] \
            || [ "$rel" = "pnpm-lock.yaml" ] || [ "$rel" = "pnpm-workspace.yaml" ]; then
            tar -xzf "$tarball" -C "$extract_dir" "$entry"
        fi
    done < "$list_file"
}

sync_dependency_files() {
    local source_dir="$1"
    local destination_dir="$2"
    local source_file rel

    mkdir -p "$destination_dir"
    find "$destination_dir" -path '*/node_modules/*' -prune -o -type f -name package.json -delete
    rm -f "$destination_dir/pnpm-lock.yaml" "$destination_dir/pnpm-workspace.yaml"
    while IFS= read -r source_file; do
        rel="${source_file#"$source_dir/"}"
        mkdir -p "$destination_dir/$(dirname "$rel")"
        cp "$source_file" "$destination_dir/$rel"
    done < <(find "$source_dir" -type f \( -name package.json -o -name pnpm-lock.yaml -o -name pnpm-workspace.yaml \) | sort)
}

api_get() {
    local url="$1"
    shift
    curl -fsS --header "PRIVATE-TOKEN: $OMA_SYNC_TOKEN" "$url" "$@"
}

api_write() {
    local method="$1"
    local url="$2"
    shift 2
    curl -fsS --request "$method" --header "PRIVATE-TOKEN: $OMA_SYNC_TOKEN" "$url" "$@"
}

template_head() {
    curl -fsS --header "JOB-TOKEN: $CI_JOB_TOKEN" \
        "$CI_API_V4_URL/projects/$CI_PROJECT_ID/repository/branches/$TEMPLATE_BRANCH" \
        | jq -er '.commit.id'
}

assert_template_current() {
    local current
    current="$(template_head)"
    [ "$current" = "$manifest_commit_sha" ] \
        || die "pipeline artifact is superseded: artifact=$manifest_commit_sha current=$current"
}

opened_mr_iids() {
    api_get "$CI_API_V4_URL/projects/$oma_project_id/merge_requests" \
        --get \
        --data-urlencode "state=opened" \
        --data-urlencode "source_branch=$BOT_BRANCH" \
        --data-urlencode "target_branch=$TARGET_BRANCH" \
        --data-urlencode "per_page=100" \
        | jq -er '.[].iid'
}

close_stale_mrs() {
    local iid
    while IFS= read -r iid; do
        [ -n "$iid" ] || continue
        api_write PUT "$CI_API_V4_URL/projects/$oma_project_id/merge_requests/$iid" \
            --data-urlencode "state_event=close" >/dev/null
        echo "[oma-sync] closed stale OMA MR !$iid"
    done < <(opened_mr_iids || true)
}

upsert_mr() {
    local title="$1"
    local description="$2"
    local iid
    iid="$(opened_mr_iids | head -n 1 || true)"
    if [ -n "$iid" ]; then
        api_write PUT "$CI_API_V4_URL/projects/$oma_project_id/merge_requests/$iid" \
            --data-urlencode "title=$title" \
            --data-urlencode "description=$description" >/dev/null
    else
        iid="$(api_write POST "$CI_API_V4_URL/projects/$oma_project_id/merge_requests" \
            --data-urlencode "source_branch=$BOT_BRANCH" \
            --data-urlencode "target_branch=$TARGET_BRANCH" \
            --data-urlencode "title=$title" \
            --data-urlencode "description=$description" \
            --data-urlencode "remove_source_branch=true" | jq -er '.iid')"
    fi
    echo "$iid"
}

mark_mr_superseded() {
    local iid="$1"
    local current="$2"
    if ! api_write POST "$CI_API_V4_URL/projects/$oma_project_id/merge_requests/$iid/notes" \
        --data-urlencode "body=Sync superseded after push. Bot commit: \`$local_bot_oid\`; artifact Template SHA: \`$manifest_commit_sha\`; current Template HEAD: \`$current\`. A newer pipeline must take over this MR." >/dev/null; then
        echo "[oma-sync] warning: failed to add superseded note to OMA MR !$iid" >&2
    fi
    api_write PUT "$CI_API_V4_URL/projects/$oma_project_id/merge_requests/$iid" \
        --data-urlencode "state_event=close" >/dev/null \
        || die "failed to close superseded OMA MR !$iid"
    [ "$(api_get "$CI_API_V4_URL/projects/$oma_project_id/merge_requests/$iid" | jq -er '.state')" = "closed" ] \
        || die "superseded OMA MR !$iid did not reach closed state"
    if [ -n "${remote_bot_oid:-}" ]; then
        local delete_check_status=0
        GIT_ASKPASS="$askpass_file" GIT_TERMINAL_PROMPT=0 \
            git -C "$checkout_dir" push --quiet \
            "--force-with-lease=refs/heads/$BOT_BRANCH:$remote_bot_oid" \
            origin ":refs/heads/$BOT_BRANCH" \
            || die "failed to lease-delete superseded branch $BOT_BRANCH"
        if GIT_ASKPASS="$askpass_file" GIT_TERMINAL_PROMPT=0 \
            git -C "$checkout_dir" ls-remote --exit-code --heads origin "refs/heads/$BOT_BRANCH" >/dev/null 2>&1; then
            die "superseded branch $BOT_BRANCH still exists after lease deletion"
        else
            delete_check_status=$?
            [ "$delete_check_status" -eq 2 ] \
                || die "failed to verify deletion of superseded branch $BOT_BRANCH"
        fi
    fi
}

main() {
    local tarball temp_dir archive_dir list_file verbose_file
    local project_json oma_repo_url target_oid target_oid_before_push observed_bot_oid
    local askpass_file checkout_dir changed_path local_bot_oid_after_push remote_bot_oid trailer_sha
    local mr_iid mr_title mr_description current_template_head

    unset OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET
    need_cmd awk
    need_cmd curl
    need_cmd find
    need_cmd git
    need_cmd jq
    need_cmd sort
    need_cmd tar
    require_var CI_API_V4_URL
    require_var CI_COMMIT_SHA
    require_var CI_JOB_TOKEN
    require_var CI_PIPELINE_URL
    require_var CI_PROJECT_ID
    require_var OMA_SYNC_TOKEN
    require_var OMA_SYNC_USERNAME

    parse_release_manifest "$MANIFEST_FILE"
    [ "$manifest_commit_sha" = "$CI_COMMIT_SHA" ] || die "release manifest commit does not match CI_COMMIT_SHA"
    tarball="$ARTIFACT_DIR/$manifest_package_name"
    temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/oma-sync.XXXXXX")"
    trap 'rm -rf "$temp_dir"' EXIT
    archive_dir="$temp_dir/archive"
    list_file="$temp_dir/tar-list.txt"
    verbose_file="$temp_dir/tar-verbose.txt"
    validate_and_extract_archive "$tarball" "$archive_dir" "$list_file" "$verbose_file"
    assert_template_current

    project_json="$(api_get "$CI_API_V4_URL/projects/$OMA_PROJECT_PATH_ENCODED")"
    oma_project_id="$(jq -er '.id' <<< "$project_json")"
    oma_repo_url="$(jq -er '.http_url_to_repo' <<< "$project_json")"
    target_oid="$(api_get "$CI_API_V4_URL/projects/$oma_project_id/repository/branches/$TARGET_BRANCH" | jq -er '.commit.id')"

    askpass_file="$temp_dir/git-askpass.sh"
    printf '%s\n' '#!/usr/bin/env bash' 'case "$1" in' \
        '  *Username*) printf "%s\\n" "$OMA_SYNC_USERNAME" ;;' \
        '  *) printf "%s\\n" "$OMA_SYNC_TOKEN" ;;' 'esac' > "$askpass_file"
    chmod 700 "$askpass_file"
    checkout_dir="$temp_dir/oma"
    GIT_ASKPASS="$askpass_file" GIT_TERMINAL_PROMPT=0 \
        git clone --quiet --no-tags --single-branch --branch "$TARGET_BRANCH" "$oma_repo_url" "$checkout_dir"
    [ "$(git -C "$checkout_dir" rev-parse HEAD)" = "$target_oid" ] || die "OMA main changed while cloning; retry with a new pipeline"

    observed_bot_oid="$(GIT_ASKPASS="$askpass_file" GIT_TERMINAL_PROMPT=0 \
        git -C "$checkout_dir" ls-remote --heads origin "refs/heads/$BOT_BRANCH" | awk '{print $1}')"
    sync_dependency_files "$archive_dir/$manifest_archive_root" "$checkout_dir/scripts/skybase-warm"
    git -C "$checkout_dir" add -A -- scripts/skybase-warm
    while IFS= read -r changed_path; do
        [[ "$changed_path" == scripts/skybase-warm/* ]] || die "refusing out-of-scope change: $changed_path"
    done < <(git -C "$checkout_dir" diff --cached --name-only)

    if git -C "$checkout_dir" diff --cached --quiet; then
        assert_template_current
        close_stale_mrs
        if [ -n "$observed_bot_oid" ]; then
            GIT_ASKPASS="$askpass_file" GIT_TERMINAL_PROMPT=0 \
                git -C "$checkout_dir" push --quiet \
                "--force-with-lease=refs/heads/$BOT_BRANCH:$observed_bot_oid" \
                origin ":refs/heads/$BOT_BRANCH"
        fi
        echo "[oma-sync] OMA main already matches Template $manifest_commit_sha"
        return 0
    fi

    target_oid_before_push="$(api_get "$CI_API_V4_URL/projects/$oma_project_id/repository/branches/$TARGET_BRANCH" | jq -er '.commit.id')"
    [ "$target_oid_before_push" = "$target_oid" ] || die "OMA main changed before push; retry with a new pipeline"
    assert_template_current
    git -C "$checkout_dir" switch --quiet -c "$BOT_BRANCH"
    git -C "$checkout_dir" \
        -c user.name="${OMA_SYNC_GIT_NAME:-Template Sync Bot}" \
        -c user.email="${OMA_SYNC_GIT_EMAIL:-template-sync-bot@localhost}" \
        commit --quiet -m "chore: sync prod_selfhost warm dependencies" \
        -m "Template-Commit: $manifest_commit_sha"
    local_bot_oid="$(git -C "$checkout_dir" rev-parse HEAD)"
    GIT_ASKPASS="$askpass_file" GIT_TERMINAL_PROMPT=0 \
        git -C "$checkout_dir" push --quiet \
        "--force-with-lease=refs/heads/$BOT_BRANCH:$observed_bot_oid" \
        origin "HEAD:refs/heads/$BOT_BRANCH"

    mr_title="chore: sync prod_selfhost warm dependencies"
    mr_description="Automated dependency sync from Template \`prod_selfhost\`.\n\n- Template commit: \`$manifest_commit_sha\`\n- Template pipeline: $CI_PIPELINE_URL\n- Allowed paths: \`scripts/skybase-warm/**\`\n\nThis MR must pass the existing external pre-commit and approval statuses and be merged manually."
    mr_iid="$(upsert_mr "$mr_title" "$mr_description")"

    remote_bot_oid="$(GIT_ASKPASS="$askpass_file" GIT_TERMINAL_PROMPT=0 \
        git -C "$checkout_dir" ls-remote --heads origin "refs/heads/$BOT_BRANCH" | awk '{print $1}')"
    trailer_sha="$(git -C "$checkout_dir" log -1 --format='%(trailers:key=Template-Commit,valueonly)' | tr -d '[:space:]')"
    current_template_head="$(template_head)"
    local_bot_oid_after_push="$(git -C "$checkout_dir" rev-parse HEAD)"
    if [ "$remote_bot_oid" != "$local_bot_oid_after_push" ] \
        || [ "$trailer_sha" != "$manifest_commit_sha" ] \
        || [ "$current_template_head" != "$manifest_commit_sha" ]; then
        mark_mr_superseded "$mr_iid" "$current_template_head"
        die "post-push identity check failed; OMA MR !$mr_iid was marked superseded"
    fi

    echo "[oma-sync] updated OMA MR !$mr_iid from Template $manifest_commit_sha"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi

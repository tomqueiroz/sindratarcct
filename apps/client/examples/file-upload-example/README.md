# File Upload Example

Copy and adapt the patterns below. Do not import this file directly — it is a reference, not a module.

Backend routes (from `apps/server/routes/storage.route.ts`):

```
POST   /api/storage                 upload a file (multipart/form-data)
GET    /api/storage/:id             get file metadata
GET    /api/storage/:id/download    redirect to download URL
DELETE /api/storage/:id             delete a file
```

---

## 1. Basic upload

Use `apiFetch` with `FormData`. Do not use `XMLHttpRequest`, `fetch`, or `axios` directly — these are blocked by the project ESLint rule and violate the API boundary in `AGENTS.md`.

```tsx
import { apiFetch } from "@/lib/api";

type StoredFile = {
  id: string;
  fileName: string;
  fileSuffix: string;
  contentType: string;
  fileSize: number;
  downloadUrl: string;
  status: "pending" | "uploaded" | "failed" | "deleted";
  createdAt?: string;
};

async function uploadFile(file: File): Promise<StoredFile> {
  const form = new FormData();
  form.append("file", file);
  form.append("path", file.name); // optional: controls the storage path/key

  const res = await apiFetch("/storage", {
    method: "POST",
    body: form,
    // auth: false  ← add this if the route is public (no session required)
  });

  const json = await res.json();
  return json.data.file;
}
```

---

## 2. Simulated upload progress

The browser `fetch` API does not expose stable upload progress events. Do not switch to `XMLHttpRequest` just to get a progress bar — use a timer-based simulation instead.

```tsx
async function uploadWithSimulatedProgress(
  file: File,
  onProgress: (progress: number) => void
): Promise<StoredFile> {
  onProgress(5);

  let progress = 5;

  const timer = window.setInterval(() => {
    progress = Math.min(90, progress + Math.round(Math.random() * 10));
    onProgress(progress);
  }, 300);

  try {
    const storedFile = await uploadFile(file);
    onProgress(100);
    return storedFile;
  } finally {
    window.clearInterval(timer);
  }
}
```

---

## 3. Download and delete

```tsx
import { apiFetch } from "@/lib/api";
import { apiUrl } from "@/lib/api-base";

/** Returns a URL that redirects to the file's download URL. Use as <a href> or window.open. */
function storageDownloadUrl(id: string): string {
  return apiUrl(`/storage/${id}/download`);
}

/** Get file metadata by id. */
async function getStoredFile(id: string): Promise<StoredFile> {
  const res = await apiFetch(`/storage/${id}`);
  const json = await res.json();
  return json.data.file;
}

/** Delete a file by id. Returns the deleted file record. */
async function deleteStoredFile(id: string): Promise<StoredFile> {
  const res = await apiFetch(`/storage/${id}`, {
    method: "DELETE",
  });
  const json = await res.json();
  return json.data.file;
}
```

---

## 4. Multiple file upload (parallel with concurrency limit)

```tsx
const MAX_CONCURRENT = 3;

async function uploadFiles(
  files: File[],
  onFileProgress: (name: string, progress: number) => void
): Promise<StoredFile[]> {
  const results: StoredFile[] = [];
  const queue = [...files];

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift();
      if (!file) return;

      const stored = await uploadWithSimulatedProgress(file, (pct) => {
        onFileProgress(file.name, pct);
      });

      results.push(stored);
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT, files.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}
```

---

## 5. Minimal React component (single file, upload + download + delete)

A self-contained example wiring all of the above together. Adapt to your UI library and state management.

```tsx
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { apiUrl } from "@/lib/api-base";

// ... (uploadFile, uploadWithSimulatedProgress, deleteStoredFile as above)

export function FileUploadExample() {
  const [stored, setStored] = useState<StoredFile | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    setProgress(0);
    try {
      const result = await uploadWithSimulatedProgress(file, setProgress);
      setStored(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!stored) return;
    try {
      await deleteStoredFile(stored.id);
      setStored(null);
      setProgress(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <section>
      <input type="file" onChange={handleChange} disabled={uploading} />
      {uploading && <progress value={progress} max={100}>{progress}%</progress>}
      {stored && (
        <div>
          <span>{stored.fileName}</span>
          <a href={apiUrl(`/storage/${stored.id}/download`)} target="_blank" rel="noreferrer">
            Download
          </a>
          <button type="button" onClick={handleDelete} disabled={uploading}>Delete</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
```

---

## Notes

- Always use `apiFetch` from `@/lib/api` — it handles auth headers, base URL, and error reporting.
- Use `apiUrl` from `@/lib/api-base` when you need a plain URL string (`<a href>`, `window.open`, `<img src>`).
- Pass `auth: false` for routes that are intentionally public (no session required).
- The browser `fetch` API has no stable upload progress event. Simulated progress (timer → 90%, jump to 100% on success) is the correct pattern.
- Do not use `XMLHttpRequest`, `window.fetch`, or `axios` — the ESLint rule `no-direct-api-request` will error.
- The `path` field in `FormData` controls the storage key; falls back to `file.name` if omitted.
- Adapt `/storage` to your actual route prefix as registered in `route-registry.ts`.
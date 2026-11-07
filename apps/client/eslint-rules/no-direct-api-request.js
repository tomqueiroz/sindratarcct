const API_FETCH_MESSAGE = 'no fetch, use apiFetch from "@/lib/api"';

function normalizePath(filename) {
  return filename.replaceAll("\\", "/");
}

function isAllowedFile(filename) {
  const normalized = normalizePath(filename);

  return (
    normalized.endsWith("/apps/client/src/lib/api.ts") ||
    /(?:^|\/)__tests__\//.test(normalized) ||
    /(?:^|\/)__mocks__\//.test(normalized) ||
    /(?:^|\/)mocks?\//.test(normalized) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function isIdentifier(node, name) {
  return node?.type === "Identifier" && node.name === name;
}

function isFetchMember(node) {
  return (
    node?.type === "MemberExpression" &&
    !node.computed &&
    (isIdentifier(node.object, "window") || isIdentifier(node.object, "globalThis")) &&
    isIdentifier(node.property, "fetch")
  );
}

function isAxiosCreateMember(node) {
  return (
    node?.type === "MemberExpression" &&
    !node.computed &&
    isIdentifier(node.object, "axios") &&
    isIdentifier(node.property, "create")
  );
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Require client business API calls to go through apiFetch"
    },
    messages: {
      useApiFetch: API_FETCH_MESSAGE
    },
    schema: []
  },
  create(context) {
    if (isAllowedFile(context.filename ?? context.getFilename())) {
      return {};
    }

    function report(node) {
      context.report({
        node,
        messageId: "useApiFetch"
      });
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value === "axios") {
          report(node.source);
        }
      },
      CallExpression(node) {
        if (isIdentifier(node.callee, "fetch") || isFetchMember(node.callee) || isAxiosCreateMember(node.callee)) {
          report(node.callee);
          return;
        }

        if (
          isIdentifier(node.callee, "require") &&
          node.arguments[0]?.type === "Literal" &&
          node.arguments[0].value === "axios"
        ) {
          report(node.arguments[0]);
        }
      },
      NewExpression(node) {
        if (isIdentifier(node.callee, "XMLHttpRequest")) {
          report(node.callee);
        }
      }
    };
  }
};

import {
  SmartCApiFunctions,
  SmartCFixedApiFunctions,
  type ApiFunctionDeclaration,
  type ApiInclude,
} from "../language-definitions/api-functions";

export type ApiIncludes = Record<ApiInclude, boolean>;

/**
 * `#include APIFunctions [true|false|1|0]` — the value is optional and defaults
 * to true, as in the compiler's `getBoolVal`. Anchored at line start, so a
 * `// #include ...` comment does not count.
 */
const INCLUDE_LINE =
  /^[ \t]*#[ \t]*include[ \t]+(APIFunctions|fixedAPIFunctions)\b[ \t]*(\S*)/gm;

/** Which low-level API tables `source` turns on. Later lines override earlier ones. */
export function scanApiIncludes(source: string): ApiIncludes {
  const found: ApiIncludes = { APIFunctions: false, fixedAPIFunctions: false };
  for (const [, table, value] of source.matchAll(INCLUDE_LINE)) {
    found[table as ApiInclude] = value !== "false" && value !== "0";
  }
  return found;
}

/** The low-level API functions the compiler accepts in `source`. */
export function enabledApiFunctions(
  source: string,
): Record<string, ApiFunctionDeclaration> {
  const includes = scanApiIncludes(source);
  return {
    ...(includes.APIFunctions ? SmartCApiFunctions : {}),
    ...(includes.fixedAPIFunctions ? SmartCFixedApiFunctions : {}),
  };
}

import {
  applyEdits,
  findNodeAtLocation,
  getNodeValue,
  modify,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";
import type { z } from "zod";
import { t } from "@/i18n/runtime";

/**
 * The two inspector file types are JSONC: comments are how people annotate a
 * Label Map, so every read tolerates them and every UI write keeps them.
 * `jsonc-parser` is the library Monaco's JSON service is built on, so what this
 * module calls an error is what the editor underlines.
 */

export type JsonPath = (string | number)[];

export interface DocError {
  path: JsonPath;
  message: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: DocError[] };

const PARSE_OPTIONS = { allowTrailingComma: true, disallowComments: false };
const FORMATTING = { tabSize: 2, insertSpaces: true, eol: "\n" };

export function offsetToPosition(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** The deepest existing node along `path`: a missing field points at its parent. */
function nearestNode(root: Node, path: JsonPath): Node {
  for (let depth = path.length; depth > 0; depth--) {
    const node = findNodeAtLocation(root, path.slice(0, depth));
    if (node) return node;
  }
  return root;
}

function issueMessage(issue: z.core.$ZodIssue, node: Node | undefined): string {
  // A field that is not in the text at all is "missing", whatever Zod calls it.
  if (node === undefined && issue.code !== "unrecognized_keys" && issue.code !== "custom") {
    return t("inspector.validation.required");
  }
  switch (issue.code) {
    case "invalid_type":
      return t("inspector.validation.type", { expected: String(issue.expected) });
    case "invalid_value":
      return t("inspector.validation.value", {
        allowed: issue.values.map((v) => JSON.stringify(v)).join(", "),
      });
    case "invalid_format":
      return t("inspector.validation.pattern");
    case "unrecognized_keys":
      return t("inspector.validation.unknownKey", { keys: issue.keys.join(", ") });
    default:
      return t("inspector.validation.other", { message: issue.message });
  }
}

export function parseDocument<T>(text: string, schema: z.ZodType<T>): Parsed<T> {
  const syntax: ParseError[] = [];
  const root = parseTree(text, syntax, PARSE_OPTIONS);
  if (syntax.length || !root) {
    const first = syntax[0];
    const offset = first?.offset ?? 0;
    return {
      ok: false,
      errors: [
        {
          path: [],
          message: first
            ? t("inspector.validation.syntax", { error: printParseErrorCode(first.error) })
            : t("inspector.validation.empty"),
          ...offsetToPosition(text, offset),
        },
      ],
    };
  }

  const result = schema.safeParse(getNodeValue(root));
  if (result.success) return { ok: true, value: result.data };

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.filter(
        (p): p is string | number => typeof p === "string" || typeof p === "number",
      );
      const exact = path.length ? findNodeAtLocation(root, path) : root;
      const at = exact ?? nearestNode(root, path);
      return {
        path,
        message: issueMessage(issue, exact),
        ...offsetToPosition(text, at.offset),
      };
    }),
  };
}

/**
 * Changes one node and leaves the rest of the text — comments, spacing, key
 * order — exactly as the user wrote it. Re-serializing the parsed value would
 * be shorter and would delete every comment in the file.
 */
export function editDocument(
  text: string,
  path: JsonPath,
  value: unknown,
  options: { insert?: boolean } = {},
): string {
  const edits = modify(text, path, value, {
    formattingOptions: FORMATTING,
    isArrayInsertion: options.insert ?? false,
  });
  return applyEdits(text, edits);
}

import { type SmartCSymbols, type SmartCDecl, emptySymbols } from "./symbols";

/** Replaces comment and string/char contents with spaces, preserving newlines and length. */
export function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  type State = "code" | "line" | "block" | "dq" | "sq";
  let state: State = "code";
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && c2 === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === '"') { state = "dq"; out += " "; i++; continue; }
      if (c === "'") { state = "sq"; out += " "; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") { out += c === "\n" ? "\n" : " "; if (c === "\n") state = "code"; i++; continue; }
    if (state === "block") {
      if (c === "*" && c2 === "/") { state = "code"; out += "  "; i += 2; }
      else { out += c === "\n" ? "\n" : " "; i++; }
      continue;
    }
    // dq / sq
    if (c === "\\") { out += "  "; i += 2; continue; }
    if ((state === "dq" && c === '"') || (state === "sq" && c === "'")) state = "code";
    out += c === "\n" ? "\n" : " ";
    i++;
  }
  return out;
}

interface Declarator { name: string; isPointer?: boolean; isArray?: boolean; value?: string }

function splitDeclarators(s: string): Declarator[] {
  return s
    .split(",")
    .map((part): Declarator => {
      const p = part.trim();
      const isPointer = /^\*/.test(p);
      const isArray = /\[/.test(p);
      const eq = p.indexOf("=");
      const lhs = (eq >= 0 ? p.slice(0, eq) : p).trim();
      const value = eq >= 0 ? p.slice(eq + 1).trim() : undefined;
      const m = /(\w+)/.exec(lhs.replace(/^\*+\s*/, ""));
      return { name: m ? m[1] : "", isPointer: isPointer || undefined, isArray: isArray || undefined, value };
    })
    .filter((d) => d.name.length > 0);
}

const TYPE = String.raw`(?:long|fixed|void|struct\s+\w+)`;

export function scanSymbols(source: string): SmartCSymbols {
  const syms = emptySymbols();
  const lines = stripCommentsAndStrings(source).split("\n");

  let inStruct: { name: string; line: number; members: { name: string; declaration: string }[] } | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    const lineNo = idx + 1;
    if (!line) continue;

    const mDef = /^#define\s+(\w+)\s*(\(([^)]*)\))?\s*(.*)$/.exec(line);
    if (mDef) {
      const params = mDef[2]
        ? mDef[3].split(",").map((x) => x.trim()).filter(Boolean)
        : undefined;
      syms.macros.push({ name: mDef[1], params, value: (mDef[4] ?? "").trim() || undefined, line: lineNo });
      continue;
    }
    if (line.startsWith("#")) continue; // #program / #pragma / #include

    if (inStruct) {
      if (line.startsWith("}")) {
        syms.structs.push({ name: inStruct.name, members: inStruct.members, line: inStruct.line });
        const inst = /^\}\s*(\w+)\s*;/.exec(line);
        if (inst) syms.variables.push({ name: inst[1], declaration: "struct", typeName: inStruct.name, line: lineNo });
        inStruct = null;
        continue;
      }
      const mem = new RegExp(String.raw`^(long|fixed|void|struct\s+\w+)\s+(.+);`).exec(line);
      if (mem) for (const d of splitDeclarators(mem[2])) inStruct.members.push({ name: d.name, declaration: mem[1] });
      continue;
    }

    const structOpen = /^struct\s+(\w+)\s*\{/.exec(line);
    if (structOpen) {
      inStruct = { name: structOpen[1], line: lineNo, members: [] };
      continue;
    }

    const fn = new RegExp(String.raw`^(${TYPE})\s+\*?\s*(\w+)\s*\(([^)]*)\)\s*\{?\s*$`).exec(line);
    if (fn) {
      const params = fn[3].trim()
        ? fn[3].split(",").map((p) => {
            const parts = p.trim().split(/\s+/);
            const name = (parts.pop() ?? "").replace(/[*[\]]/g, "");
            return { type: parts.join(" "), name };
          })
        : [];
      syms.functions.push({ name: fn[2], returnType: fn[1], params, line: lineNo });
      continue;
    }

    const structInst = /^struct\s+(\w+)\s+([^;{]+);/.exec(line);
    if (structInst) {
      for (const d of splitDeclarators(structInst[2]))
        syms.variables.push({ name: d.name, declaration: "struct", typeName: structInst[1], isPointer: d.isPointer, isArray: d.isArray, line: lineNo });
      continue;
    }

    const decl = /^(const\s+)?(long|fixed|void)\s+([^;{]+);/.exec(line);
    if (decl) {
      const declaration = decl[2] as SmartCDecl;
      for (const d of splitDeclarators(decl[3])) {
        if (decl[1]) syms.constants.push({ name: d.name, value: d.value, line: lineNo });
        else syms.variables.push({ name: d.name, declaration, isPointer: d.isPointer, isArray: d.isArray, line: lineNo });
      }
      continue;
    }

    const lab = /^(\w+)\s*:(?!:)/.exec(line);
    if (lab && lab[1] !== "case" && lab[1] !== "default" && !line.includes("?")) {
      syms.labels.push({ name: lab[1], line: lineNo });
    }
  }

  return syms;
}

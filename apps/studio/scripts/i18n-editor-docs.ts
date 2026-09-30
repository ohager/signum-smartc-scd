#!/usr/bin/env bun
/**
 * Writes src/i18n/locales/en/editor-docs.json from the language definitions.
 * The English of the editor documentation lives in code; this file is what
 * translators translate. Run it after changing any documentation text.
 */
import path from "path";
import { collectDocs } from "../src/i18n/doc-walk";
import { SmartCFunctions } from "../src/features/smartc-editor/language-definitions/functions";
import { AllSmartCApiFunctions } from "../src/features/smartc-editor/language-definitions/api-functions";
import { SmartCDirectives } from "../src/features/smartc-editor/language-definitions/directives";
import { SmartCKeywords } from "../src/features/smartc-editor/language-definitions/keywords";
import { AsmDirectiveDocs } from "../src/features/asm-editor/code-editor/language-definitions/directives";
import { AsmOpcodes } from "../src/features/asm-editor/code-editor/language-definitions/opcodes/index";

export function generateEditorDocs(): string {
  const docs = {
    builtins: collectDocs("builtins", SmartCFunctions),
    api: collectDocs("api", AllSmartCApiFunctions),
    keywords: collectDocs("keywords", SmartCKeywords),
    directives: collectDocs("directives", SmartCDirectives),
    asmDirectives: collectDocs("asmDirectives", AsmDirectiveDocs),
    opcodes: collectDocs("opcodes", AsmOpcodes),
  };
  return JSON.stringify(docs, null, 2) + "\n";
}

if (import.meta.main) {
  const out = path.join(import.meta.dir, "../src/i18n/locales/en/editor-docs.json");
  await Bun.write(out, generateEditorDocs());
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

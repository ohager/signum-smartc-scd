import { describe, expect, it } from "bun:test";
import path from "path";
import { SmartCFunctions } from "@/features/smartc-editor/language-definitions/functions";
import { AllSmartCApiFunctions } from "@/features/smartc-editor/language-definitions/api-functions";
import { SmartCDirectives } from "@/features/smartc-editor/language-definitions/directives";
import { SmartCKeywords } from "@/features/smartc-editor/language-definitions/keywords";
import { AsmDirectiveDocs } from "@/features/asm-editor/code-editor/language-definitions/directives";
import { AsmOpcodes } from "@/features/asm-editor/code-editor/language-definitions/opcodes/index";

const FIXTURE = path.join(import.meta.dir, "__fixtures__/editor-docs.en.json");

function current() {
  return JSON.stringify(
    {
      functions: SmartCFunctions,
      api: AllSmartCApiFunctions,
      directives: SmartCDirectives,
      keywords: SmartCKeywords,
      asm: AsmDirectiveDocs,
      opcodes: AsmOpcodes,
    },
    null,
    2,
  );
}

describe("editor documentation", () => {
  it("renders exactly the English it rendered before i18n", async () => {
    const file = Bun.file(FIXTURE);
    if (!(await file.exists())) await Bun.write(FIXTURE, current());
    expect(current()).toBe(await file.text());
  });
});

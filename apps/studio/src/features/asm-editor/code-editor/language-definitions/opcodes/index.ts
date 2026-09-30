import { localizeDocs } from "@/i18n/doc-walk";
import type { AsmOpcodeDeclaration } from "./types.ts";
import { AsmProgramFlowOpcodes } from "./program-flow.ts";
import { AsmArithmeticOpcodes } from "./arithmetic.ts";
import { AsmMemoryOpcodes } from "./memory-stack.ts";
import { AsmApiOpcodes } from "./api.ts";

export type {
  AsmOpcodeDeclaration,
  AsmOpcodeForm,
  AsmOpcodeGroup,
} from "./types.ts";

/** Every mnemonic the SmartC assembler accepts, keyed by mnemonic. */
export const AsmOpcodes: Record<string, AsmOpcodeDeclaration> = localizeDocs("editor-docs.opcodes", {
  ...AsmProgramFlowOpcodes,
  ...AsmArithmeticOpcodes,
  ...AsmMemoryOpcodes,
  ...AsmApiOpcodes,
});

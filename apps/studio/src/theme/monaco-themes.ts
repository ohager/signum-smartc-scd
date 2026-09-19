import { CLIMATES, type Climate, type ClimateId } from "./climates";

/**
 * Monaco themes generated from the climates.
 *
 * Seven call sites used to hard-code `theme === "dark" ? "vs-dark" : "light"`,
 * which is where the app visibly stopped and the editor began. Both the SmartC
 * and the assembly theme now come out of the same values as the chrome.
 *
 * The theme shape is declared here rather than imported from `monaco-editor`:
 * the app resolves two copies of that package whose types are not mutually
 * assignable (see the same note in `components/ui/editor/file-actions.tsx`).
 */

export interface MonacoThemeRule {
  token: string;
  foreground?: string;
  fontStyle?: string;
}

export interface MonacoThemeData {
  base: "vs" | "vs-dark";
  inherit: boolean;
  rules: MonacoThemeRule[];
  colors: Record<string, string>;
}

/** Minimal structural view of the Monaco namespace — see the note above. */
interface MonacoLike {
  editor: {
    defineTheme(name: string, theme: MonacoThemeData): void;
  };
}

export function smartcThemeName(id: ClimateId): string {
  return `smartc-${id}`;
}

export function asmThemeName(id: ClimateId): string {
  return `asm-${id}`;
}

/** Monaco takes alpha as two trailing hex digits. */
function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

function groundColours(climate: Climate): Record<string, string> {
  return {
    "editor.background": climate.editor.code,
    "editor.foreground": climate.text,
    "editorLineNumber.foreground": climate.editor.gutter,
    "editorLineNumber.activeForeground": climate.accent2,
    "editor.lineHighlightBackground": withAlpha(climate.accent2, "1a"),
    "editor.selectionBackground": withAlpha(climate.accent1, "40"),
    "editorCursor.foreground": climate.accent2,
    "editorGutter.background": climate.editor.code,
    "editorWidget.background": climate.editor.code,
    "editorWidget.border": climate.accent2,
    // The hover tooltip is the one place inside the editor that is allowed to
    // look like the console.
    "editorHoverWidget.background": climate.editor.code,
    "editorHoverWidget.border": climate.accent2,
    "editorSuggestWidget.background": climate.editor.code,
    "editorSuggestWidget.border": climate.accent2,
    "editorIndentGuide.background1": withAlpha(climate.editor.gutter, "55"),
  };
}

export function buildSmartcTheme(climate: Climate): MonacoThemeData {
  const { editor } = climate;

  return {
    base: climate.base,
    inherit: true,
    rules: [
      { token: "keyword", foreground: editor.keyword, fontStyle: "bold" },
      { token: "type", foreground: editor.type },
      { token: "number", foreground: editor.number },
      { token: "string", foreground: editor.string },
      { token: "comment", foreground: editor.comment, fontStyle: "italic" },
      { token: "identifier", foreground: climate.text },
      { token: "delimiter", foreground: editor.gutter },
      { token: "keyword.directive", foreground: editor.type, fontStyle: "bold" },
      { token: "api", foreground: editor.type, fontStyle: "bold" },
    ],
    colors: groundColours(climate),
  };
}

export function buildAsmTheme(climate: Climate): MonacoThemeData {
  const { editor } = climate;

  return {
    base: climate.base,
    inherit: true,
    rules: [
      { token: "keyword.control", foreground: editor.keyword, fontStyle: "bold" },
      { token: "keyword.stack", foreground: editor.string, fontStyle: "bold" },
      { token: "keyword.operator", foreground: editor.number, fontStyle: "bold" },
      { token: "keyword.api", foreground: editor.type, fontStyle: "bold" },
      { token: "keyword.memory", foreground: editor.type, fontStyle: "bold" },
      { token: "directive", foreground: editor.number, fontStyle: "italic" },
      { token: "preprocessor", foreground: editor.keyword, fontStyle: "bold" },
      { token: "preprocessor.param", foreground: editor.type },
      { token: "preprocessor.value", foreground: editor.comment, fontStyle: "italic" },
      { token: "comment", foreground: editor.comment, fontStyle: "italic" },
      { token: "label", foreground: climate.accent2, fontStyle: "bold" },
      { token: "number", foreground: editor.number },
      { token: "number.hex", foreground: editor.number },
      { token: "api", foreground: editor.type, fontStyle: "bold" },
      { token: "type", foreground: editor.type },
      { token: "variable.register", foreground: editor.string },
      { token: "variable", foreground: climate.text },
      { token: "variable.declaration", foreground: editor.string },
      { token: "constant", foreground: editor.keyword },
      { token: "identifier", foreground: climate.text },
    ],
    colors: groundColours(climate),
  };
}

/** Registers all eight themes. Idempotent, so any `beforeMount` may call it. */
export function registerClimateThemes(monaco: MonacoLike): void {
  for (const climate of CLIMATES) {
    monaco.editor.defineTheme(smartcThemeName(climate.id), buildSmartcTheme(climate));
    monaco.editor.defineTheme(asmThemeName(climate.id), buildAsmTheme(climate));
  }
}

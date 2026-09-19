/**
 * The four climates, as far as TypeScript needs to know them.
 *
 * The chrome's palette lives in `styles/globals.css` — one source, switched by
 * `[data-theme]`. What cannot be reached from CSS is Monaco, which takes its
 * colours as a JavaScript object, and the picker, which needs a label and a
 * dot. That, and nothing else, is what this file holds.
 */

export type ClimateId = "nexus" | "dawn" | "solaris" | "terminal";

/** The colours Monaco paints the code surface with. */
export interface ClimateEditorColours {
  /** The editor ground. A step off `--bg`, so code sits apart from the chrome. */
  code: string;
  gutter: string;
  keyword: string;
  type: string;
  number: string;
  comment: string;
  string: string;
}

export interface Climate {
  id: ClimateId;
  label: string;
  /** Monaco inherits from one of its two built-in bases. */
  base: "vs" | "vs-dark";
  /** The dot in the picker, and the colour a selection is tinted with. */
  accent1: string;
  /** Cursor, active line, focused border. */
  accent2: string;
  text: string;
  editor: ClimateEditorColours;
}

export const CLIMATES: Climate[] = [
  {
    id: "nexus",
    label: "Nexus",
    base: "vs-dark",
    accent1: "#0066ff",
    accent2: "#00aaff",
    text: "#d0e4ff",
    editor: {
      code: "#0a0f1c",
      gutter: "#2e3c55",
      keyword: "#5aa7ff",
      type: "#60c8ff",
      number: "#ffd700",
      comment: "#3d4d68",
      string: "#00ffaa",
    },
  },
  {
    id: "dawn",
    label: "Dawn",
    base: "vs",
    accent1: "#0055cc",
    accent2: "#0066ff",
    text: "#1a2540",
    editor: {
      code: "#f7f9ff",
      gutter: "#a8b6d4",
      keyword: "#0b3d91",
      type: "#0055cc",
      number: "#b87000",
      comment: "#94a3b8",
      string: "#00956b",
    },
  },
  {
    id: "solaris",
    label: "Solaris",
    base: "vs-dark",
    accent1: "#ff9500",
    accent2: "#ffd700",
    text: "#ffe8c0",
    editor: {
      code: "#120c05",
      gutter: "#5c4520",
      keyword: "#ffb84d",
      type: "#ffe566",
      number: "#39d353",
      comment: "#5c4520",
      string: "#39d353",
    },
  },
  {
    id: "terminal",
    label: "Terminal",
    base: "vs-dark",
    accent1: "#00cc00",
    accent2: "#00ff00",
    text: "#90ee90",
    editor: {
      code: "#001200",
      gutter: "#2a5a2a",
      keyword: "#66ff66",
      type: "#00cc00",
      number: "#ffcc00",
      comment: "#2a5a2a",
      string: "#00ff00",
    },
  },
];

export const CLIMATE_IDS = CLIMATES.map((climate) => climate.id);

export const DEFAULT_CLIMATE: ClimateId = "nexus";

export function climateById(id: string): Climate | undefined {
  return CLIMATES.find((climate) => climate.id === id);
}

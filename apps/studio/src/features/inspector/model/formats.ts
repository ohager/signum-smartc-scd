/** How a 64-bit value is shown. Shared by the schemas, the decoder and every format select. */
export const FORMATS = ["long", "unsigned", "fixed", "hex", "address", "string", "bool", "enum"] as const; // i18n-ignore
export type ValueFormat = (typeof FORMATS)[number];

export const ORIGINS = ["manual", "compiler", "imported"] as const; // i18n-ignore
export type Origin = (typeof ORIGINS)[number];

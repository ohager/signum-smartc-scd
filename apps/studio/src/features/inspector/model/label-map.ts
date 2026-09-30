import { z } from "zod";
import { FORMATS, ORIGINS } from "./formats";
import { parseDocument, type Parsed } from "./jsonc";
import { t } from "@/i18n/runtime";

/**
 * A Label Map gives names and meanings to a contract's memory, maps and code.
 * It belongs to a set of machine-code hashes, not to one contract: every
 * instance of the same code shares it, and the same source built with other
 * `#define`s adds another hash.
 */

const Decimal = z.string().regex(/^-?\d+$/).describe("Decimal 64-bit integer as a string");
const Unsigned = z.string().regex(/^\d+$/).describe("Unsigned decimal id as a string");
const Format = z.enum(FORMATS).describe("How the value is displayed");
const Origin = z.enum(ORIGINS).describe("Who wrote this entry; regeneration only replaces 'compiler'");

const SlotLabelSchema = z.strictObject({
  index: z.int().nonnegative().describe("Memory slot index (8 bytes each)"),
  name: z.string().min(1),
  format: Format.optional(),
  enum: z.string().optional().describe("Key in 'enums' when format is 'enum'"),
  length: z.int().min(1).optional().describe("Number of consecutive slots (array)"),
  comment: z.string().optional(),
  origin: Origin.optional(),
});

const Key2LabelSchema = z.strictObject({
  key2: Decimal,
  name: z.string().min(1),
  valueFormat: Format.optional(),
  enum: z.string().optional(),
  comment: z.string().optional(),
});

const groupFields = {
  name: z.string().min(1),
  key2Format: Format.optional().describe("Format of every key2 in this group"),
  key2: z.array(Key2LabelSchema).optional().describe("Named key2 entries"),
  valueFormat: Format.optional(),
  enum: z.string().optional(),
  comment: z.string().optional(),
  origin: Origin.optional(),
};

const FixedMapGroupSchema = z.strictObject({ key1: Decimal, ...groupFields });
const PatternMapGroupSchema = z.strictObject({
  key1Format: Format.describe("Every key1 of this group has this format"),
  ...groupFields,
});

const CodeHashSchema = z.strictObject({
  hash: Unsigned.describe("Machine code hash id"),
  network: z.string().optional().describe("Informational only"),
  note: z.string().optional(),
});

const CodeLabelSchema = z.strictObject({
  address: z.int().nonnegative(),
  name: z.string().min(1),
  origin: Origin.optional(),
});

const EnumsSchema = z.record(z.string(), z.record(z.string().regex(/^-?\d+$/), z.string()));

export const LabelMapSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    name: z.string().min(1),
    codeHashes: z.array(CodeHashSchema),
    source: z.strictObject({ file: z.string(), generatedAt: z.string() }).optional(),
    slots: z.array(SlotLabelSchema).default([]),
    maps: z.array(z.union([FixedMapGroupSchema, PatternMapGroupSchema])).default([]),
    enums: EnumsSchema.default({}),
    codeLabels: z.array(CodeLabelSchema).default([]),
  })
  .superRefine((map, ctx) => {
    const check = (
      entry: { format?: string; valueFormat?: string; enum?: string },
      path: (string | number)[],
    ) => {
      const usesEnum = entry.format === "enum" || entry.valueFormat === "enum";
      if (usesEnum && !entry.enum) {
        ctx.addIssue({ code: "custom", path: [...path, "enum"], message: t("inspector.validation.enumRequired") });
      } else if (entry.enum && !(entry.enum in map.enums)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "enum"],
          message: t("inspector.validation.enumMissing", { name: entry.enum }),
        });
      }
    };
    map.slots.forEach((s, i) => check(s, ["slots", i]));
    map.maps.forEach((g, i) => {
      check(g, ["maps", i]);
      g.key2?.forEach((k, j) => check(k, ["maps", i, "key2", j]));
    });
  });

export type LabelMap = z.infer<typeof LabelMapSchema>;
export type SlotLabel = z.infer<typeof SlotLabelSchema>;
export type Key2Label = z.infer<typeof Key2LabelSchema>;
export type FixedMapGroup = z.infer<typeof FixedMapGroupSchema>;
export type PatternMapGroup = z.infer<typeof PatternMapGroupSchema>;
export type MapGroup = FixedMapGroup | PatternMapGroup;
export type CodeHashEntry = z.infer<typeof CodeHashSchema>;
export type CodeLabel = z.infer<typeof CodeLabelSchema>;

export { SlotLabelSchema, FixedMapGroupSchema, PatternMapGroupSchema };

export function isFixedGroup(group: MapGroup): group is FixedMapGroup {
  return "key1" in group;
}

export function parseLabelMap(text: string): Parsed<LabelMap> {
  return parseDocument(text, LabelMapSchema);
}

export function emptyLabelMap(name: string, codeHashes: CodeHashEntry[] = []): string {
  const map = { version: 1, name, codeHashes, slots: [], maps: [], enums: {}, codeLabels: [] };
  return JSON.stringify(map, null, 2) + "\n";
}

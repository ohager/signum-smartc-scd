import { z } from "zod";
import { LabelMapSchema } from "./label-map";
import { WatchlistSchema } from "./watchlist";

/**
 * JSON Schemas for Monaco, derived from the same Zod schemas the model
 * validates with — one source, so completion and validation cannot disagree.
 * Refinements (enum names must exist) are not representable and stay Zod-only.
 */
export const labelMapJsonSchema = () => z.toJSONSchema(LabelMapSchema, { unrepresentable: "any", io: "input" });
export const watchlistJsonSchema = () => z.toJSONSchema(WatchlistSchema, { unrepresentable: "any", io: "input" });

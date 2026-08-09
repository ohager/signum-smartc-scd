/** Compiler-internal memory slots not worth showing by default in the inspector. */
export function isInternalVar(name: string): boolean {
  return /^r\d+$/.test(name) || name === "ZERO";
}

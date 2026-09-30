/**
 * The rail describes a contract's way from source to chain. A folder that
 * only inspects contracts has no such way, and four empty cells would say
 * something false about it. An empty new project keeps the rail: there, "no
 * contract yet" is the guidance.
 */
const INSPECTION = /\.(inspect|labels)\.json$/i;

export function showsRail(files: { name: string }[], hasContract: boolean): boolean {
  return hasContract || !files.some((f) => INSPECTION.test(f.name));
}

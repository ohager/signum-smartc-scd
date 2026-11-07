/*
 * Model URIs for one opening of the round diff dialog. Monaco keeps models in a global
 * registry keyed by URI and `@monaco-editor/react` reuses whatever it finds there, so a
 * fixed path would hand a reopened dialog a model we already disposed. The counter makes
 * every opening unique; round and file keep the URIs readable when debugging.
 */
export function diffModelPaths(roundId: string, relPath: string, opening: number): { original: string; modified: string } {
  const file = relPath.split("/").map(encodeURIComponent).join("/");
  const base = `inmemory://assistant-diff/${encodeURIComponent(roundId)}/${opening}`;
  return { original: `${base}/original/${file}`, modified: `${base}/modified/${file}` };
}

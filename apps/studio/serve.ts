import { serve } from "bun";
import index from "./src/index.html";

/** Fixed URL -> entry, mirroring the standalone files build.ts emits. */
const WORKERS: Record<string, string> = {
  "/testbed-worker.js": "./src/features/testbed/runner/worker.ts",
  "/analysis-worker.js": "./src/features/analysis/worker/analysis-worker.ts",
};

const workerCache = new Map<string, { mtimeMs: number; code: string }>();

async function buildWorker(entrypoint: string): Promise<Response> {
  const { mtimeMs } = await Bun.file(entrypoint).stat();
  const cached = workerCache.get(entrypoint);

  if (cached && cached.mtimeMs === mtimeMs) {
    return new Response(cached.code, {
      headers: { "Content-Type": "text/javascript" },
    });
  }

  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    splitting: false,
  });

  if (!result.success) {
    const logs = result.logs.map((log) => String(log)).join("\n");
    return new Response(logs, { status: 500 });
  }

  const code = await result.outputs[0].text();
  workerCache.set(entrypoint, { mtimeMs, code });

  return new Response(code, {
    headers: { "Content-Type": "text/javascript" },
  });
}

const server = serve({
  routes: {
    ...Object.fromEntries(Object.entries(WORKERS).map(([url, entry]) => [url, () => buildWorker(entry)])),
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);

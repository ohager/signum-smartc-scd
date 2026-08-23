import { serve } from "bun";
import index from "./src/index.html";

const WORKER_ENTRYPOINT = "./src/features/testbed/runner/worker.ts";

let workerCache: { mtimeMs: number; code: string } | null = null;

async function buildWorker(): Promise<Response> {
  const workerFile = Bun.file(WORKER_ENTRYPOINT);
  const { mtimeMs } = await workerFile.stat();

  if (workerCache && workerCache.mtimeMs === mtimeMs) {
    return new Response(workerCache.code, {
      headers: { "Content-Type": "text/javascript" },
    });
  }

  const result = await Bun.build({
    entrypoints: [WORKER_ENTRYPOINT],
    target: "browser",
    splitting: false,
  });

  if (!result.success) {
    const logs = result.logs.map((log) => String(log)).join("\n");
    return new Response(logs, { status: 500 });
  }

  const code = await result.outputs[0].text();
  workerCache = { mtimeMs, code };

  return new Response(code, {
    headers: { "Content-Type": "text/javascript" },
  });
}

const server = serve({
  routes: {
    "/testbed-worker.js": () => buildWorker(),
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production",
});

console.log(`🚀 Server running at ${server.url}`);

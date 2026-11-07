export const DEFAULT_PORT = 6890;
/** Ports the Studio dev server and preview use; the relay must not take them. */
const RESERVED_PORTS = [6876, 6877];

export interface RelayConfig {
  port: number;
  allowOrigins: string[];
}

function parsePort(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid port "${raw}": must be an integer.`);
  const port = Number(raw);
  if (port < 1 || port > 65535) throw new Error(`Invalid port ${port}: must be between 1 and 65535.`);
  if (RESERVED_PORTS.includes(port)) throw new Error(`Port ${port} is reserved; choose another one.`);
  return port;
}

export function parseConfig(argv: string[], env: Record<string, string | undefined>): RelayConfig {
  let flagPort: string | undefined;
  const allowOrigins: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [name, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (name !== "--port" && name !== "--allow-origin") continue;
    const value = inline ?? argv[++i];
    if (value === undefined || value === "") throw new Error(`${name} needs a value.`);
    if (name === "--port") flagPort = value;
    else allowOrigins.push(value);
  }
  const raw = flagPort ?? env.SMARTC_STUDIO_PORT;
  return { port: raw === undefined ? DEFAULT_PORT : parsePort(raw), allowOrigins };
}

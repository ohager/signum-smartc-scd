/**
 * Live debug memory (variable name → current value) per editor model URI.
 * Written by an active debug session on each step; read by the hover provider
 * to show a variable's current value on hover. Empty for non-debug models.
 */
const memoryByModel = new Map<string, Record<string, string>>();

export function setDebugMemory(modelUri: string, memory: Record<string, string>): void {
  memoryByModel.set(modelUri, memory);
}

export function getDebugMemory(modelUri: string): Record<string, string> | undefined {
  return memoryByModel.get(modelUri);
}

export function clearDebugMemory(modelUri: string): void {
  memoryByModel.delete(modelUri);
}

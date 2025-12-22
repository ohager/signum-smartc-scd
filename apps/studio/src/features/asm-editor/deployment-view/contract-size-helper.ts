import type { MachineData } from "@/features/asm-editor/machine-data.ts";

// HTTP GET URLs have a practical limit of ~8KiB
// Contracts larger than this need to use Form POST method
const MAX_CONTRACT_SIZE_FOR_GET = 8192; // 8KiB in bytes

/**
 * Calculate the total size of the contract in bytes
 * Size is based on the hex-encoded ByteCode and ByteData
 */
export function calculateContractSize(data: MachineData): number {
  const byteCodeSize = data.ByteCode.length / 2; // hex string, 2 chars = 1 byte
  const byteDataSize = data.ByteData.length / 2;
  return byteCodeSize + byteDataSize;
}

/**
 * Check if the contract is too large for standard deployment
 * and requires the Form POST method
 */
export function isLargeContract(data: MachineData): boolean {
  return calculateContractSize(data) > MAX_CONTRACT_SIZE_FOR_GET;
}

/**
 * Format size in bytes to human-readable format
 */
export function formatContractSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  }
  return `${(sizeInBytes / 1024).toFixed(2)} KiB`;
}

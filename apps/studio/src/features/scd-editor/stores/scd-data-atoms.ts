
// File editing state atoms
import { atom } from "jotai";
import type { SCDType } from "@signum-smartc-scd/core/parser";
import type { FileId } from "@/stores/project-atoms.ts";


export const scdFileIdAtom = atom<FileId|null>(null);


export const scdDataAtom = atom<{ data: SCDType | null; originalData: SCDType | null }>({
  data: null,
  originalData: null,
});

// Track validation state
export const scdValidationAtom = atom<{
  isValid: boolean;
  errorMessage?: string;
  lastValidData?: SCDType;
}>({
  isValid: false,
});

// // Track save state
// export const scdSaveStateAtom = atom((get) => {
//   const { data, originalData } = get(scdDataAtom);
//
//   // If we have no data, we're not in a dirty state
//   if (!data || !originalData) return { isDirty: false };
//
//   // Compare the current data with the original data
//   return {
//     isDirty: JSON.stringify(data) !== JSON.stringify(originalData),
//   };
// });

import { atom } from "jotai";

export interface SCDValidationState {
  isValid: boolean;
  errorMessage?: string;
}

export const scdValidationStateAtom = atom<SCDValidationState>({
  isValid: false
});

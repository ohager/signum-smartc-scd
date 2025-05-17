import { useAtom } from "jotai";
import {
  scdDataAtom, scdFileIdAtom,
  scdValidationAtom
} from "../stores/scd-data-atoms.ts";
import { useCallback, useState } from "react";
import { SCD, type SCDType } from "@signum-smartc-scd/core/parser";
import { useFile } from "@/hooks/use-file.ts";
import debounce from "lodash.debounce";

export function useScdFileManager() {
  const [scdData, setSCDData] = useAtom(scdDataAtom);
  const [validation, setValidation] = useAtom(scdValidationAtom);
  const [currentFileId, setCurrentFileId] = useAtom(scdFileIdAtom)
  const { getFile, saveFile } = useFile();

  // Update data (from either editor)
  const updateData = useCallback(
    async (dataStr: string|object|SCDType) => {
      try {
        const json = typeof dataStr === "string" ? JSON.parse(dataStr) : dataStr;
        const scd = SCD.parse(json);
        const newData = scd.raw;
        setSCDData((prev) => ({ ...prev, data: newData }));
        setValidation({ isValid: true, lastValidData: newData });
        if(!currentFileId) {
          throw new Error("FileId is not provided yet - use setCurrentFileId()");
        }
        const file = await getFile(currentFileId);
        // Auto-save if valid
        if (file) {
          await saveFile({ ...file, data: newData });
          // Update originalData after save
          setSCDData((prev) => ({ ...prev, originalData: newData }));
        }
      } catch (e) {
        console.error(e);
        setValidation({
          isValid: false,
          errorMessage: e.message,
        });
      }
    },
    [setSCDData, setValidation, saveFile, currentFileId],
  );

  const requestUpdateData: (data: string|object|SCDType, onUpdated?: () => void) => void = useCallback(debounce(
    (data: string, onUpdated = () => {}) => {
    updateData(data).then(onUpdated)
  }, 2_000), [updateData]);

  return {
    scdData: scdData.data,
    isValid: validation.isValid,
    errorMessage: validation.errorMessage,
    setCurrentFileId,
    requestUpdateData,
    updateData
  };
}

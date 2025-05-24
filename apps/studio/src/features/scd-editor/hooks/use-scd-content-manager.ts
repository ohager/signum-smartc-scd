import { useAtom } from "jotai";
import {
  scdDataAtom, scdFileIdAtom,
  scdValidationAtom
} from "../stores/scd-data-atoms.ts";
import { useCallback } from "react";
import { SCD, type SCDType } from "@signum-smartc-scd/core/parser";
import debounce from "lodash.debounce";
import { useFileSystem } from "@/hooks/use-file-system.ts";

export function useScdContentManager() {
  const [scdData, setSCDData] = useAtom(scdDataAtom);
  const [validation, setValidation] = useAtom(scdValidationAtom);
  const [currentFileId, setCurrentFileId] = useAtom(scdFileIdAtom)
  const fs = useFileSystem();

  const updateScdData = useCallback(
    async (dataStr: string|object|SCDType) => {
      try {
        console.debug("Updating SCD Data", dataStr);
        const json = typeof dataStr === "string" ? JSON.parse(dataStr) : dataStr;


        const scd = SCD.parse(json);
        const newData = scd.raw;
        setSCDData((prev) => ({ ...prev, data: newData }));
        setValidation({ isValid: true, lastValidData: newData });
        if(!currentFileId) {
          console.debug("FileId is not provided yet - use setCurrentFileId()");
          return;
        }
        const file = await fs.loadFile<SCDType>(currentFileId);
        // Auto-save if valid
        if (file) {
          await fs.saveFile(currentFileId, newData);
          // Update originalData after save
          setSCDData((prev) => ({ ...prev, originalData: newData }));
        }
      } catch (e) {
        console.error("Cannot save SCD:",  e.message);
        setValidation({
          isValid: false,
          errorMessage: e.message,
        });
        throw e;
      }
    },
    [setSCDData, setValidation, fs],
  );

  const requestUpdateScdData: (data: string|object|SCDType, onUpdated?: () => void) => void = useCallback(debounce(
    (data: string, onUpdated = () => {}) => {
    updateScdData(data).then(onUpdated)
  }, 2_000), [updateScdData]);

  return {
    scdData: scdData.data,
    isValid: validation.isValid,
    errorMessage: validation.errorMessage,
    setCurrentFileId,
    requestUpdateScdData,
    updateScdData
  };
}

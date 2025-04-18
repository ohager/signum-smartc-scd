import {
  deleteFileAtom,
  getFileAtom,
  saveFileAtom,
} from "@/stores/project-atoms";
import { useAtomValue, useSetAtom } from "jotai";

export function useFile() {
  const deleteFile = useSetAtom(deleteFileAtom);
  const getFile = useAtomValue(getFileAtom);
  const saveFile = useSetAtom(saveFileAtom);

  return {
    deleteFile,
    getFile,
    saveFile,
  };
}

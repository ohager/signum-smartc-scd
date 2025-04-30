import { useAtomValue, useSetAtom } from "jotai";
import {
  addPageHeaderActionAtom,
  pageHeaderActionsAtom,
  removePageHeaderActionAtom,
  updatePageHeaderActionAtom,
} from "@/stores/page-header-actions-atoms.ts";

export const usePageHeaderActions = () => {
  const addAction = useSetAtom(addPageHeaderActionAtom);
  const updateAction = useSetAtom(updatePageHeaderActionAtom);
  const removeAction = useSetAtom(removePageHeaderActionAtom);
  const actions = useAtomValue(pageHeaderActionsAtom);

  return {
    actions,
    addAction,
    updateAction,
    removeAction,
  };
};

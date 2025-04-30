import { atom } from 'jotai';
import { type ReactNode } from 'react';

export type PageHeaderActionType = {
  id: string;
  label?: string;
  tooltip?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'accent' | 'link';
};

export const pageHeaderActionsAtom = atom<PageHeaderActionType[]>([]);

// Helper functions as atoms
export const addPageHeaderActionAtom = atom(
  null,
  (get, set, action: PageHeaderActionType) => {
    const currentActions = get(pageHeaderActionsAtom);

    // Don't add if action with same ID already exists
    if (currentActions.some(a => a.id === action.id)) {
      return;
    }

    set(pageHeaderActionsAtom, [...currentActions, action]);
  }
);

export const removePageHeaderActionAtom = atom(
  null,
  (get, set, id: string) => {
    const currentActions = get(pageHeaderActionsAtom);
    set(pageHeaderActionsAtom, currentActions.filter(action => action.id !== id));
  }
);

export const updatePageHeaderActionAtom = atom(
  null,
  (get, set, { id, updates }: { id: string, updates: Partial<PageHeaderActionType> }) => {
    const currentActions = get(pageHeaderActionsAtom);
    set(pageHeaderActionsAtom, currentActions.map(action =>
      action.id === id ? { ...action, ...updates } : action
    ));
  }
);

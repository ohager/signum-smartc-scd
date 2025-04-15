import React, { useEffect, type PropsWithChildren } from "react";

interface SubmitOnEnterProps {
  onSubmit: () => void;
  isEnabled?: boolean;
  preventPropagation?: boolean;
  excludeElements?: string[]; // Elements to exclude (textareas, etc.)
}

export function SubmitOnEnter({
  children,
  onSubmit,
  isEnabled = true,
  preventPropagation = true,
  excludeElements = ["textarea"],
}: PropsWithChildren<SubmitOnEnterProps>) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if disabled or if modifier keys are pressed
      if (!isEnabled || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      // Check if the active element is in the excluded list
      const activeElement = document.activeElement;
      if (
        activeElement &&
        excludeElements.some(
          (tag) =>
            activeElement.tagName.toLowerCase() === tag ||
            activeElement.getAttribute("role")?.toLowerCase() === tag,
        )
      ) {
        return;
      }

      if (event.key === "Enter") {
        if (preventPropagation) {
          event.preventDefault();
          event.stopPropagation();
        }
        onSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onSubmit, isEnabled, preventPropagation, excludeElements]);

  return <>{children}</>;
}

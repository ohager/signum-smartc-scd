import { useCallback, useState } from "react";
import set from "lodash.set";
import type { PropertyPath } from "lodash";

export function useFormWizard<T extends object, V = any>(
  initialState: T,
  stepCount: number,
) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<T>(initialState);
  const [canProceed, _setCanProceed] = useState(true);
  const reset = useCallback(() => {
    setStep(0);
    setData(initialState);
  }, [initialState]);

  const updateData = useCallback((path: PropertyPath, value: V) => {
    setData((prev) => {
      const newData = { ...prev };
      set(newData, path, value);
      return newData;
    });
  }, []);

  const nextStep = useCallback(
    () => setStep((prev) => Math.min(prev + 1, stepCount)),
    [stepCount],
  );
  const previousStep = useCallback(
    () => setStep((prev) => Math.max(prev - 1, 0)),
    [],
  );
  const setCanProceed = useCallback(
    (canProceed: boolean) => _setCanProceed(canProceed),
    [],
  );

  return {
    step,
    nextStep,
    previousStep,
    updateData,
    reset,
    canProceed,
    setCanProceed,
    data,
  };
}

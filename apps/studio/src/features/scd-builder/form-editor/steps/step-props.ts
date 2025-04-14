import type { WizardStepProps } from "@/components/ui/wizard";
import type { SCDType } from "@signum-smartc-abi/core/parser";

export interface StepProps extends WizardStepProps<SCDType, unknown> {}

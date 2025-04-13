import type { WizardStepProps } from "@/components/ui/wizard";
import type { ABIType } from "@signum-smartc-abi/core/parser";

export interface StepProps extends WizardStepProps<ABIType, unknown> {}

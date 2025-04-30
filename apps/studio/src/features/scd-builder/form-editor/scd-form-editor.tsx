import { StepContractInfo } from "./steps/step-contract-info";
import { type SCDType } from "@signum-smartc-abi/core/parser";
import { Wizard, type WizardStepProps } from "@/components/ui/wizard";
import { StepPragmas } from "./steps/step-pragmas";
import { StepMethods } from "./steps/step-methods";
import { StepMaps } from "./steps/step-maps";
import { StepTransactions } from "./steps/step-transactions";
import { StepVariables } from "./steps/step-variables";
import { useSetAtom } from "jotai";
import { scdValidationStateAtom } from "@/features/scd-builder/stores/scd-builder-atoms.ts";
import { useEffect } from "react";
import { SCD } from "@signum-smartc-scd/core/parser";

const steps = [
  {
    title: "Contract Info",
    description: "Define here the contracts basic information",
    component: StepContractInfo,
  },
  {
    title: "Pragmas",
    description: "Allows to configure some of the compiler features (Pragmas)",
    component: StepPragmas,
  },
  {
    title: "Callable Methods",
    description: "Define your public/callable methods here",
    component: StepMethods,
  },
  {
    title: "Variables",
    description:
      "Describe your global variables, which represent the (public) state of your contract",
    component: StepVariables,
  },
  {
    title: "Maps",
    description: "Configure optional kkv-Maps (Storage)",
    component: StepMaps,
  },
  {
    title: "Transactions",
    description: "Describe what transactions your contract will dispatch",
    component: StepTransactions,
  },
];

const StepComponents = steps.map((step) => step.component);

const WizardStepRenderer = (props: WizardStepProps<SCDType, unknown>) => {
  const setSCDIsValid = useSetAtom(scdValidationStateAtom);
  useEffect(() => {
    try{
      SCD.parse(props.data)
      setSCDIsValid({isValid: true})
    }catch(e){
      setSCDIsValid({isValid: false, errorMessage: e.message})
    }
  }, [props.data]);

  const StepComponent = StepComponents[props.step - 1];
  return StepComponent ? <StepComponent {...props} /> : null;
};

interface Props {
  data: SCDType;
  onSave: (data: SCDType) => void;
}

export function SCDFormEditor({ data, onSave }: Props) {
  return (
    <Wizard<SCDType>
      steps={steps}
      initialState={data}
      onFinish={onSave}
      finishButtonLabel="Save"
    >
      {(props) => (
        <div className="min-h-[200px] w-full py-2">
          <WizardStepRenderer {...props} />
        </div>
      )}
    </Wizard>
  );
}

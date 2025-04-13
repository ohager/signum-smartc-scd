import { StepABIContractInfo } from "./steps/step-abi-contract-info";
import { type ABIType } from "@signum-smartc-abi/core/parser";
import { Wizard, type WizardStepProps } from "@/components/ui/wizard";
import { StepABIPragmas } from "./steps/step-abi-pragmas";
import { StepABIMethods } from "./steps/step-abi-methods";
import { Component } from "react";
import { StepABIMaps } from "./steps/step-abi-maps";
import { StepABITransactions } from "./steps/step-abi-transactions";
import { StepABIStateLayout } from "./steps/step-abi-state-layout";

const InitialState: ABIType = {
  activationAmount: "0.5",
  contractName: "",
  description: "",
  pragmas: {
    optimizationLevel: 3,
    verboseAssembly: false,
    maxAuxVars: 3,
    version: "2.2.1",
  },
  methods: [],
  transactions: [],
  maps: [],
  stateLayout: [],
};

const steps = [
  {
    title: "Contract Info",
    description: "Define here the contracts basic information",
    component: StepABIContractInfo,
  },
  {
    title: "Pragmas",
    description: "Allows to configure some of the compiler features (Pragmas)",
    component: StepABIPragmas,
  },
  {
    title: "Callable Methods",
    description: "Define your public/callable methods here",
    component: StepABIMethods,
  },
  {
    title: "State Layout",
    description: "Describe your publicly accessible state (variables)",
    component: StepABIStateLayout,
  },
  {
    title: "Maps",
    description: "Configure optional kkv-Maps (Storage)",
    component: StepABIMaps,
  },
  {
    title: "Transactions",
    description: "Describe what transactions your contract will dispatch",
    component: StepABITransactions,
  },
];

const StepComponents = steps.map((step) => step.component);

const WizardStepRenderer = (props: WizardStepProps<ABIType, unknown>) => {
  const StepComponent = StepComponents[props.step - 1];
  return StepComponent ? <StepComponent {...props} /> : null;
};

export function ABIFormEditor() {
  const handleOnFinish = (data: ABIType) => {
    console.log(data);
  };

  return (
    <Wizard
      steps={steps}
      initialState={{ ...InitialState }}
      onFinish={handleOnFinish}
    >
      {(props) => (
        <div className="min-h-[200px] w-full py-2">
          <WizardStepRenderer {...props} />
        </div>
      )}
    </Wizard>
  );
}

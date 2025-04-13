import { Button } from "@/components/ui/button";
import { ABIContractInfoSection } from "./sections/abi-contract-info-section";
import { Accordion } from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { ABI, type ABIType } from "@signum-smartc-abi/core/parser";
import { useForm } from "react-hook-form";

const InitialState = {
  activationAmount: "0.5",
  contractName: "",
  description: "",
  pragmas: {
    optimizationLevel: 3,
    verboseAssembly: false,
    maxAuxVars: 3,
    version: "2.2.1",
  },
  functions: [],
  transactions: [],
  maps: [],
  stateLayout: [],
};

export function ABIFormEditor() {
  const form = useForm<ABIType>({
    defaultValues: { ...InitialState },
  });

  return (
    <Card className="w-full p-4 lg:w-1/2 mx-auto">
      <CardHeader>
        <CardTitle>ABI Form Editor</CardTitle>
        <CardDescription>
          Here you can edit the contracts interface using forms.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <Accordion type="single" collapsible className="w-full">
            <ABIContractInfoSection />
            {/* Other sections with Suspense */}
          </Accordion>
        </Form>
      </CardContent>
      <CardFooter>
        <Button type="submit" form="abi-form">
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

import Ajv from "ajv";
import schema from "./abi-schema.json";
import type {
  FunctionDefinition,
  ABIType,
  MapDefinition,
  VariableDefinition,
  TransactionDefinition,
} from "./types";

/**
 * This is the ABI class which provides convenience functions for further tooling.
 */
export class ABI {
  private static ajv = new Ajv();
  private static validate = ABI.ajv.compile<ABIType>(schema);

  private constructor(private abi: ABIType) {}

  static parse(input: string | object) {
    const valid = this.validate(input);

    if (!valid) {
      const errors = this.validate.errors;
      throw new Error(`Invalid ABI: ${JSON.stringify(errors)}`);
    }
    return new ABI(input);
  }

  getStateLayout() {
    let currentIndex = this.abi.pragmas.maxAuxVars + 1;
    const layout: (VariableDefinition & { index: number })[] = [];
    for (const variable of this.abi.stateLayout) {
      if (variable.type === "struct") {
        // Handle struct fields
        const fields =
          variable.fields?.map((field) => ({
            ...field,
            name: `${variable.name}.${field.name}`,
            index: currentIndex++,
          })) || [];

        layout.push(...fields);
      } else {
        layout.push({
          ...variable,
          index: currentIndex++,
        });
      }
    }

    return layout;
  }

  getFunctions(): FunctionDefinition[] {
    return this.abi.functions.map((f) => ({
      ...f,
      code: BigInt(f.code),
    }));
  }

  getMaps(): MapDefinition[] {
    return this.abi.maps;
  }

  getStateVariables(): VariableDefinition[] {
    return this.abi.stateLayout.filter(
      (variable) => variable.type !== "struct",
    );
  }

  getStructs(): VariableDefinition[] {
    return this.abi.stateLayout.filter(
      (variable) => variable.type === "struct",
    );
  }

  getTransactions(): TransactionDefinition[] {
    return this.abi.transactions;
  }

  getContractInfo() {
    return {
      name: this.abi.contractName,
      description: this.abi.description,
      activationAmount: BigInt(this.abi.activationAmount),
      pragmas: this.abi.pragmas,
    };
  }
}

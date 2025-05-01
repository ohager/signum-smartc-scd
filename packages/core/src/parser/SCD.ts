import Ajv from "ajv";
import schema from "./scd-schema.json";
import type {
  MethodDefinition,
  SCDType,
  MapDefinition,
  VariableDefinition,
  TransactionDefinition,
} from "./types";

/**
 * This is the ABI class which provides convenience functions for further tooling.
 */
export class SCD {
  private static ajv = new Ajv();
  private static validate = SCD.ajv.compile<SCDType>(schema);

  private constructor(private scd: SCDType) {}

  static parse(input: string | object) {
    const valid = this.validate(input);

    if (!valid) {
      const errors = this.validate.errors;
      throw new Error(`Invalid SCD: ${JSON.stringify(errors)}`);
    }
    return new SCD(input);
  }

  get raw(): SCDType { return this.scd}

  getVariablesLayout() {
    let currentIndex = this.scd.pragmas.maxAuxVars + 1;
    const layout: (VariableDefinition & { index: number })[] = [];
    for (const variable of this.scd.variables) {
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

  getMethods(): Readonly<MethodDefinition[]> {
    return this.scd.methods;
  }

  getMaps(): Readonly<MapDefinition[]> {
    return this.scd.maps;
  }

  getVariables(): Readonly<VariableDefinition[]> {
    return this.scd.variables.filter((variable) => variable.type !== "struct");
  }

  getStructs(): Readonly<VariableDefinition[]> {
    return this.scd.variables.filter((variable) => variable.type === "struct");
  }

  getTransactions(): Readonly<TransactionDefinition[]> {
    return this.scd.transactions;
  }

  getContractInfo() {
    return {
      name: this.scd.contractName,
      description: this.scd.description,
      activationAmount: this.scd.activationAmount,
      pragmas: this.scd.pragmas,
    };
  }
}

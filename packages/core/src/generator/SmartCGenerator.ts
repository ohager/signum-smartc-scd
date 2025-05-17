import { Eta } from "eta";
import type { SCD } from "../parser";
import {SmartCTemplate} from "./templates/smartc.eta"

/**
 * SmartCGenerator is responsible for generating contract code based on provided structured data (SCD).
 * It uses a template engine, Eta, to render the contract code dynamically using the provided data.
 */
export class SmartCGenerator {
  private eta: Eta;

  constructor(private scd: SCD) {
    this.eta = new Eta();
  }

  generateContract(): string {
    const templateData = {
      contractName: this.scd.getContractInfo().name,
      description: this.scd.getContractInfo().description,
      activationAmount: this.scd.getContractInfo().activationAmount,
      pragmas: this.scd.getContractInfo().pragmas,
      methods: this.scd.getMethods(),
      variables: this.scd.getVariables(),
      structs: this.scd.getStructs(),
      maps: this.scd.getMaps(),
    };

    return this.eta.renderString(SmartCTemplate, templateData);
  }
}

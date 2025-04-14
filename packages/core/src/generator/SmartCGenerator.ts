import { Eta } from "eta";
import type { SCD } from "../parser";

export class SmartCGenerator {
  private eta: Eta;

  constructor(private scd: SCD) {
    this.eta = new Eta({ views: import.meta.dir + "/templates" });
  }

  async generateContract(): Promise<string> {
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

    return this.eta.render("./smartc.eta", templateData);
  }
}

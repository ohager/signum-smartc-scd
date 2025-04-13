import { Eta } from "eta";
import type { ABI } from "../parser";

export class SmartCGenerator {
  private eta: Eta;

  constructor(private abi: ABI) {
    this.eta = new Eta({ views: import.meta.dir + "/templates" });
  }

  async generateContract(): Promise<string> {
    const templateData = {
      contractName: this.abi.getContractInfo().name,
      description: this.abi.getContractInfo().description,
      activationAmount: this.abi.getContractInfo().activationAmount,
      pragmas: this.abi.getContractInfo().pragmas,
      methods: this.abi.getMethods(),
      stateVars: this.abi.getStateVariables(),
      structs: this.abi.getStructs(),
      maps: this.abi.getMaps(),
    };

    return this.eta.render("./smartc.eta", templateData);
  }
}

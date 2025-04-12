import { ABI, type ABIType } from "../../parser";
import { SmartCGenerator } from "../SmartCGenerator";
import { describe, expect, it } from "bun:test";

const mockABI = {
  contractName: "TestContract",
  contractHash: "0x1234567890abcdef",
  description: "A test contract",
  activationAmount: "1000000",
  pragmas: {
    maxAuxVars: 3,
    verboseAssembly: true,
    optimizationLevel: 3,
    version: "2.2.1",
    codeStackPages: 0,
    userStackPages: 0,
  },
  functions: [
    {
      name: "testFunction",
      code: "100",
      args: [
        { name: "param1", type: "number" },
        { name: "param2", type: "address" },
      ],
    },
  ],
  stateLayout: [
    {
      name: "owner",
      type: "address",
      initializable: true,
      constant: true,
    },
    {
      name: "stats",
      type: "struct",
      fields: [
        { name: "counter", type: "number" },
        { name: "balance", type: "amount" },
      ],
    },
  ],
  maps: [
    {
      name: "testMap",
      key1: {
        name: "key1",
        type: "number",
        description: "Main Key",
        constant: true,
        value: "1",
      },
      key2: {
        name: "addr",
        description: "Address",
        type: "address",
        constant: false,
      },
      value: {
        name: "value",
        description: "Value",
        constant: false,
        oneOf: [
          {
            name: "SOME_CONSTANT_1",
            value: "1",
          },
          {
            name: "SOME_CONSTANT_2",
            value: "2",
          },
        ],
      },
    },
  ],
};

describe("SmartCGenerator", () => {
  it("should generate SmartC code", async () => {
    const generator = new SmartCGenerator(ABI.parse(mockABI));
    const smartCCode = await generator.generateContract();
    expect(smartCCode).toMatchSnapshot();
  });
});

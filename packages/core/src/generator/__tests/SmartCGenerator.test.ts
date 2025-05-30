import { SCD, type SCDType } from "../../parser";
import { SmartCGenerator } from "../SmartCGenerator";
import { describe, expect, it } from "bun:test";

const mockSCD: SCDType = {
  contractName: "TestContract",
  description: "A test contract",
  activationAmount: "1000000",
  pragmas: {
    maxAuxVars: 3,
    verboseAssembly: true,
    optimizationLevel: 3,
    version: "2.3.0",
    codeStackPages: 0,
    userStackPages: 0,
  },
  methods: [
    {
      name: "testMethod",
      code: "100",
      args: [
        { name: "param1", type: "long" },
        { name: "param2", type: "address" },
      ],
    },
    {
      name: "testMethod2",
      code: "101",
      args: [
        { name: "param1", type: "long" },
      ],
    },
  ],
  variables: [
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
        { name: "counter", type: "long" },
        { name: "balance", type: "amount" },
      ],
    },
  ],
  maps: [
    {
      name: "testMap",
      key1: {
        name: "key1",
        type: "long",
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
  transactions: [
    {
      name: "Some name",
      kind: "sendAmount",
    },
    {
      name: "Another one",
      kind: "sendAmountAndMessage",
    },
  ],
};

describe("SmartCGenerator", () => {
  it("should generate SmartC code", () => {
    const generator = new SmartCGenerator(SCD.parse(mockSCD));
    const smartCCode = generator.generateContract();
    expect(smartCCode).toMatchSnapshot();
  });
});

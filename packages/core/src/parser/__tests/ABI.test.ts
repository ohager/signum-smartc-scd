import { describe, expect, it } from "bun:test";
import { ABI } from "../ABI";

const mockABI = {
  contractName: "TestContract",
  description: "A test contract",
  activationAmount: "100000000",
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
      code: "1",
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

describe("ABI", () => {
  describe("parse", () => {
    it("should parse ABI", () => {
      const abi = ABI.parse(mockABI);
      expect(abi.getStateLayout()).toEqual([
        {
          name: "owner",
          type: "address",
          initializable: true,
          constant: true,
          index: 4,
        },
        { name: "stats.counter", type: "number", index: 5 },
        { name: "stats.balance", type: "amount", index: 6 },
      ]);
      expect(abi.getMaps()).toEqual([
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
      ]);
      expect(abi.getFunctions()).toEqual([
        {
          name: "testFunction",
          code: 1n,
          args: [
            { name: "param1", type: "number" },
            { name: "param2", type: "address" },
          ],
        },
      ]);
      expect(abi.getContractInfo()).toEqual({
        name: "TestContract",
        description: "A test contract",
        activationAmount: 100000000n,
        pragmas: {
          maxAuxVars: 3,
          verboseAssembly: true,
          optimizationLevel: 3,
          version: "2.2.1",
          codeStackPages: 0,
          userStackPages: 0,
        },
      });
    });

    it("should throw on invalid ABI", () => {
      expect(() => ABI.parse({})).toThrow();
    });
  });
});

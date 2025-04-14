import { describe, expect, it } from "bun:test";
import { SCD } from "../SCD";
import type { SCDType } from "../types";

const mockSCD = {
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
  methods: [
    {
      name: "testFunction",
      code: "1",
      args: [
        { name: "param1", type: "long" },
        { name: "param2", type: "address" },
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
        { name: "counter", type: "boolean" },
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
} as SCDType;

describe("SCD", () => {
  describe("parse", () => {
    it("should parse SCD", () => {
      const abi = SCD.parse(mockSCD);
      expect(abi.getVariablesLayout()).toEqual([
        {
          name: "owner",
          type: "address",
          initializable: true,
          constant: true,
          index: 4,
        },
        { name: "stats.counter", type: "boolean", index: 5 },
        { name: "stats.balance", type: "amount", index: 6 },
      ]);
      expect(abi.getMaps()).toEqual([
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
      ]);
      expect(abi.getMethods()).toEqual([
        {
          name: "testFunction",
          code: "1",
          args: [
            { name: "param1", type: "long" },
            { name: "param2", type: "address" },
          ],
        },
      ]);
      expect(abi.getContractInfo()).toEqual({
        name: "TestContract",
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
      });
    });

    it("should throw on invalid SCD", () => {
      expect(() => SCD.parse({})).toThrow();
    });
  });
});

import {
  chai,
  JestChaiExpect,
  JestExtend,
  JestAsymmetricMatchers,
  type ExpectStatic,
} from "@vitest/expect";

// vitest's own matcher stack, so bigint comparison and the expected/actual
// payload on failures behave exactly as they do under vitest.
chai.use(JestExtend);
chai.use(JestChaiExpect);
chai.use(JestAsymmetricMatchers);

export const expect = chai.expect as unknown as ExpectStatic;

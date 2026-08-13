import type { AsmOpcodeDeclaration } from "./types.ts";

/** Shared tail for every instruction that reads an operand out of memory. */
const UNSET_READS_ZERO = "Reading a variable that was never written yields 0.";

/** `BOR`/`AND`/`XOR` share one implementation and differ only in the operator. */
function bitwiseBinary(
  mnemonic: "BOR" | "AND" | "XOR",
  title: string,
  jsOperator: string,
  opCode: number,
  extra: string,
): AsmOpcodeDeclaration {
  return {
    title,
    group: "Arithmetic",
    stepFee: 1,
    forms: [
      {
        syntax: `${mnemonic} @dest $var`,
        name: `${mnemonic}_DAT`,
        opCode,
        size: 9,
      },
    ],
    documentation:
      `\`@dest = $dest ${jsOperator} $var\`, bit by bit over the full 64-bit word.\n\n` +
      `Purely bitwise — there is no notion of sign, and no value can overflow. ${extra}\n\n` +
      `${UNSET_READS_ZERO}`,
  };
}

export const AsmArithmeticOpcodes: Record<string, AsmOpcodeDeclaration> = {
  ADD: {
    title: "Add",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "ADD @dest $var", name: "ADD_DAT", opCode: 0x06, size: 9 }],
    documentation:
      "`@dest = $dest + $var`, as **signed** 64-bit integers.\n\n" +
      "Overflow wraps around silently — it does not trap and does not route to the `ERR` handler. If a sum can exceed " +
      "`9223372036854775807` you have to range-check it yourself.\n\n" +
      "Because `fixed` values are plain integers scaled by 1e8, the same instruction adds them; only multiplication and " +
      "division need rescaling.\n\n" +
      `${UNSET_READS_ZERO}`,
  },

  SUB: {
    title: "Subtract",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "SUB @dest $var", name: "SUB_DAT", opCode: 0x07, size: 9 }],
    documentation:
      "`@dest = $dest - $var`, as **signed** 64-bit integers.\n\n" +
      "Underflow wraps around silently. This bites when a balance is treated as unsigned: `0 - 1` becomes " +
      "`0xffffffffffffffff`, which compares as `-1` under the signed branch instructions but reads as a huge number if you " +
      "later feed it to an API function.\n\n" +
      "As with `ADD`, `fixed` operands need no rescaling.\n\n" +
      `${UNSET_READS_ZERO}`,
  },

  MUL: {
    title: "Multiply",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "MUL @dest $var", name: "MUL_DAT", opCode: 0x08, size: 9 }],
    documentation:
      "`@dest = $dest * $var`, as **signed** 64-bit integers, truncated to 64 bits on overflow.\n\n" +
      "Overflow is silent, and it is easy to hit: two values around 4e9 already exceed the range. When you need the wide " +
      "intermediate, use `MDV` instead — it multiplies in 128 bits before dividing.\n\n" +
      "For `fixed` operands the result has to be scaled back down by 1e8, so SmartC follows the `MUL` with " +
      "`DIV @dest $f100000000`.\n\n" +
      `${UNSET_READS_ZERO}`,
  },

  DIV: {
    title: "Divide",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "DIV @dest $var", name: "DIV_DAT", opCode: 0x09, size: 9 }],
    documentation:
      "`@dest = $dest / $var`, as **signed** 64-bit integers, truncated toward zero.\n\n" +
      "**Dividing by zero is fatal.** With no error handler the contract is marked dead with *Division by zero* and its " +
      "balance is stuck for good; with an `ERR :label` handler installed, execution jumps to the handler instead. Guard the " +
      "divisor, or install a handler.\n\n" +
      "A divisor that was never written also counts as zero and triggers the same fault.\n\n" +
      "For `fixed` operands the numerator must be scaled up by 1e8 first, so SmartC emits `MUL @dest $f100000000` before the " +
      "`DIV` — or a single `MDV` when it can.",
  },

  MOD: {
    title: "Modulo",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "MOD @dest $var", name: "MOD_DAT", opCode: 0x16, size: 9 }],
    documentation:
      "`@dest = $dest % $var`, the remainder of the **signed** division, truncated toward zero. The result takes the sign of " +
      "the dividend: `-7 % 3` is `-1`, not `2`.\n\n" +
      "**Modulo by zero is fatal**, exactly like `DIV`: the contract dies with *Division by zero ( mod 0 )* unless an " +
      "`ERR :label` handler is installed. A divisor that was never written counts as zero.\n\n" +
      `${UNSET_READS_ZERO}`,
  },

  POW: {
    title: "Power",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "POW @dest $var", name: "POW_DAT", opCode: 0x19, size: 9 }],
    documentation:
      "`@dest = $dest ^ ($var / 1e8)`, truncated to an integer.\n\n" +
      "The exponent is **fixed-point**, not an integer: to square a value the exponent operand must hold `200000000` " +
      "(that is `2.0`). This is what makes fractional powers — roots — possible: an exponent of `50000000` (`0.5`) takes the " +
      "square root.\n\n" +
      "The base is read as a signed integer. If it is zero or negative the result is `0`. The result is also forced to `0` " +
      "when it is not a number or when it overflows the positive 64-bit range, so a failed `POW` is silent — check for a " +
      "zero result if that matters.\n\n" +
      "Unlike the other arithmetic instructions this one is evaluated in floating point internally, so very large results " +
      "lose precision before they are truncated.\n\n" +
      `${UNSET_READS_ZERO}`,
  },

  MDV: {
    title: "Multiply then divide",
    group: "Arithmetic",
    stepFee: 1,
    forms: [
      { syntax: "MDV @dest $var1 $var2", name: "MDV_DAT", opCode: 0x2c, size: 13 },
    ],
    documentation:
      "`@dest = ($dest * $var1) / $var2`, with the intermediate product computed in **128-bit** precision and only the final " +
      "quotient truncated back to 64 bits.\n\n" +
      "This is the reason `MDV` exists: `MUL` followed by `DIV` would overflow on the intermediate, while `MDV` does not. It " +
      "is the right instruction for percentages, ratios and `fixed` multiplication — SmartC emits it for `fixed * fixed` " +
      "with `$f100000000` as the divisor.\n\n" +
      "Unlike `DIV`, **a zero divisor is not fatal**: the result is simply `0` and execution continues. That makes it safe by " +
      "default, but it also means a bad divisor fails silently rather than reaching your `ERR` handler.\n\n" +
      "At 13 bytes it is one of the larger instructions, but still smaller and more accurate than the `MUL`/`DIV` pair it " +
      "replaces.\n\n" +
      `${UNSET_READS_ZERO}`,
  },

  INC: {
    title: "Increment",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "INC @dest", name: "INC_DAT", opCode: 0x04, size: 5 }],
    documentation:
      "`@dest = $dest + 1`, wrapping silently on overflow.\n\n" +
      "At 5 bytes this is 4 bytes smaller than `ADD @dest $one`, and it needs no constant variable to hold the 1.\n\n" +
      "SmartC emits it for `++` on a `long`. Careful: `++` on a `fixed` is *not* an `INC` — incrementing a fixed value means " +
      "adding 1.0, so the compiler emits `ADD @dest $f100000000` instead.",
  },

  DEC: {
    title: "Decrement",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "DEC @dest", name: "DEC_DAT", opCode: 0x05, size: 5 }],
    documentation:
      "`@dest = $dest - 1`, wrapping silently on underflow — decrementing a zero gives `0xffffffffffffffff`.\n\n" +
      "At 5 bytes this is 4 bytes smaller than `SUB @dest $one`, and it needs no constant variable to hold the 1.\n\n" +
      "SmartC emits it for `--` on a `long`. On a `fixed` the compiler emits `SUB @dest $f100000000` instead, since " +
      "decrementing a fixed value means subtracting 1.0.",
  },

  NOT: {
    title: "Bitwise NOT",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "NOT @dest", name: "NOT_DAT", opCode: 0x0d, size: 5 }],
    documentation:
      "`@dest = ~$dest` — every one of the 64 bits is flipped in place.\n\n" +
      "This is the bitwise complement, not a logical negation: `NOT` on `0` gives `0xffffffffffffffff` (signed `-1`), not " +
      "`1`. It is what SmartC emits for `~`, on both `long` and `fixed` operands; the logical `!` compiles into a branch " +
      "instead.\n\n" +
      "Two's complement negation is `NOT` followed by `INC`.",
  },

  CLR: {
    title: "Clear",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "CLR @dest", name: "CLR_DAT", opCode: 0x03, size: 5 }],
    documentation:
      "Sets `@dest` to zero.\n\n" +
      "At 5 bytes this is the cheapest way to zero a variable: `SET @dest #0000000000000000` costs 13 bytes, and " +
      "`SET @dest $zero` costs 9 plus a variable to hold the zero.\n\n" +
      "The code generator special-cases an assignment of the literal `0` straight into a `CLR`, so `x = 0;` never goes " +
      "through `SET`.",
  },

  SHL: {
    title: "Shift left",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "SHL @dest $var", name: "SHL_DAT", opCode: 0x17, size: 9 }],
    documentation:
      "`@dest = $dest << $var`, on the raw 64-bit word, with bits shifted out of the top discarded.\n\n" +
      "The shift count is read as **signed** and then clamped into `0..63`: a negative count becomes `0` (no shift) and " +
      "anything above 63 becomes `63`. So unlike C, an over-wide shift here is well defined rather than undefined.\n\n" +
      "Shifting left by *n* multiplies by 2ⁿ as long as nothing falls off the top.\n\n" +
      `${UNSET_READS_ZERO}`,
  },

  SHR: {
    title: "Shift right",
    group: "Arithmetic",
    stepFee: 1,
    forms: [{ syntax: "SHR @dest $var", name: "SHR_DAT", opCode: 0x18, size: 9 }],
    documentation:
      "`@dest = $dest >> $var`, a **logical** shift on the raw 64-bit word: zeros come in at the top and the sign bit is not " +
      "preserved.\n\n" +
      "The shift count is read as signed and clamped into `0..63`, exactly as for `SHL`.\n\n" +
      "Because the shift is logical rather than arithmetic, this divides by 2ⁿ only for values you intend as unsigned. " +
      "Right-shifting a negative number turns it into a large positive one — use `DIV` if you want signed division.\n\n" +
      `${UNSET_READS_ZERO}`,
  },

  BOR: bitwiseBinary(
    "BOR",
    "Bitwise OR",
    "|",
    0x0a,
    "Note the mnemonic is `BOR`, not `OR` — the assembler does not accept `OR`.",
  ),
  AND: bitwiseBinary(
    "AND",
    "Bitwise AND",
    "&",
    0x0b,
    "The usual way to mask bits out of a packed word; SmartC emits it for `&` and for bit-field reads.",
  ),
  XOR: bitwiseBinary(
    "XOR",
    "Bitwise XOR",
    "^",
    0x0c,
    "`XOR` of a value with itself is a 9-byte way to zero it, but `CLR` does the same in 5.",
  ),
};

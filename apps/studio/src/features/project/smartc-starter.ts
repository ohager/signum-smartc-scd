/**
 * Starter template for a new `.smart.c` file.
 *
 * It is a stripped-down version of the dispatch pattern used by production
 * Signum contracts: drain the transaction queue with `getNextTx()`, read the
 * message, and route on `message[0]` through a `switch`.
 */

/**
 * Derive a `#program name` from a file base name.
 *
 * The compiler accepts only `[a-zA-Z0-9]`, 1–30 chars, so words are split on
 * everything else and PascalCased: `my-contract` → `MyContract`.
 */
export function contractNameFrom(baseName: string): string {
  const pascal = baseName
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
  return pascal.slice(0, 30) || "MyContract";
}

/** Full contents of a new `.smart.c` file, named after `baseName`. */
export function smartcStarter(baseName: string): string {
  const name = contractNameFrom(baseName);
  return `#program name ${name}
#program description ${name} - a Signum smart contract
#program activationAmount 1_0000_0000

#pragma maxAuxVars 2
#pragma optimizationLevel 3

// ---------------------------------------------------------------------------
// METHOD CODES
// The first word of an incoming message picks the function to run.
// ---------------------------------------------------------------------------
#define METHOD_SET_FEE      1
#define METHOD_DEPOSIT      2
#define METHOD_WITHDRAW     3

// ---------------------------------------------------------------------------
// MAP KEYS
// The contract's key/key/value storage. Readable from off-chain at any time.
// ---------------------------------------------------------------------------
#define MAP_KEY_BALANCE     1
#define MAP_KEY_ERRORS     99

// ---------------------------------------------------------------------------
// ERROR CODES
// Errors are recorded, never thrown - the contract has to keep running.
// ---------------------------------------------------------------------------
#define ERROR_NO_PERMISSION 1
#define ERROR_NO_BALANCE    2

// ---- STATE ----------------------------------------------------------------

long fee;

struct TXINFO {
    long txId;
    long sender;
    long amount;
    long message[4];
} currentTx;

// Runs once, when the contract is deployed.
fee = 1000_0000;

// ---- MAIN -----------------------------------------------------------------
// Runs on every activation. The loop drains ALL pending transactions - never
// break out early, or unprocessed messages carry over to the next activation.

void main() {
    while ((currentTx.txId = getNextTx()) != 0) {
        currentTx.sender = getSender(currentTx.txId);
        currentTx.amount = getAmount(currentTx.txId);
        readMessage(currentTx.txId, 0, currentTx.message);

        // message[0] = method code, message[1..3] = arguments
        switch (currentTx.message[0]) {
            case METHOD_SET_FEE:
                setFee(currentTx.message[1]);
                break;
            case METHOD_DEPOSIT:
                deposit();
                break;
            case METHOD_WITHDRAW:
                withdraw();
                break;
        }
    }
}

// ---- HANDLERS -------------------------------------------------------------
// One function per method code. Guard anything privileged with a sender check.

void setFee(long newFee) {
    if (currentTx.sender != getCreator()) {
        registerError(ERROR_NO_PERMISSION);
        return;
    }
    fee = newFee;
}

void deposit() {
    long balance = getMapValue(MAP_KEY_BALANCE, currentTx.sender);
    setMapValue(MAP_KEY_BALANCE, currentTx.sender, balance + currentTx.amount);
}

void withdraw() {
    long balance = getMapValue(MAP_KEY_BALANCE, currentTx.sender);
    if (balance <= fee) {
        registerError(ERROR_NO_BALANCE);
        return;
    }
    setMapValue(MAP_KEY_BALANCE, currentTx.sender, 0);
    sendAmount(balance - fee, currentTx.sender);
}

// ---- HELPERS --------------------------------------------------------------

// Errors are stored per transaction id, so a caller can look up what went wrong.
void registerError(long errorCode) {
    setMapValue(MAP_KEY_ERRORS, currentTx.txId, errorCode);
}
`;
}

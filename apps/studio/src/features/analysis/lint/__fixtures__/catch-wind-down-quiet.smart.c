#pragma version 2.3
#pragma optimizationLevel 2

long total, divisor;
struct TXINFO { long txId, sender, amount, method; } currentTX;

void catch() {
    sendBalance(getCreator());
    exit;
}

void main(void) {
    while ((currentTX.txId = getNextTx()) != 0) {
        total += currentTX.amount;
    }
    total = total / divisor;
}

#pragma version 2.3
#pragma optimizationLevel 2

long total;
struct TXINFO { long txId, sender, amount, method; } currentTX;

void main(void) {
    while ((currentTX.txId = getNextTx()) != 0) {
        total += currentTX.amount;
    }
}

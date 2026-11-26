#pragma version 2.3
#pragma optimizationLevel 2

long owner, count, total;
struct TXINFO { long txId, sender, amount, method; } currentTX;

void main(void) {
    long i;
    for (i = 0; i < 10; i++) {
        total += i;
    }
    long j = 5;
    while (j > 0) {
        j--;
    }
    while ((currentTX.txId = getNextTx()) != 0) {
        count++;
    }
}

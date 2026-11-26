#pragma version 2.3
#pragma optimizationLevel 2

long owner, count, total;
struct TXINFO { long txId, sender, amount, method; } currentTX;

void main(void) {
    long i = 0;
    while (i < 10) {
        total++;
    }
    for (;;) {
        count++;
        if (count > 5) {
            break;
        }
    }
    do {
        count--;
    } while (total != 0);
    while ((currentTX.txId = getNextTx()) != 0) {
        count++;
    }
}

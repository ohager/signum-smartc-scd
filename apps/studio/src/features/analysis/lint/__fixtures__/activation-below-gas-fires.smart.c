#pragma version 2.3
#pragma optimizationLevel 2
#program activationAmount 100_000

long owner, total;
struct TXINFO { long txId, sender, amount, method; } currentTX;

void heavy(void) {
    long i;
    for (i = 0; i < 20; i++) {
        total += i;
    }
}

void main(void) {
    while ((currentTX.txId = getNextTx()) != 0) {
        switch (currentTX.method) {
            case 1:
                heavy();
                break;
            default:
                break;
        }
    }
}

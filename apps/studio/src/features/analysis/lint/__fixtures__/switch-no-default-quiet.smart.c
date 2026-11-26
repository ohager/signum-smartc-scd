#pragma version 2.3
#pragma optimizationLevel 2

long owner, count, total;
struct TXINFO { long txId, sender, amount, method; } currentTX;

void main(void) {
    while ((currentTX.txId = getNextTx()) != 0) {
        switch (currentTX.method) {
            case 1:
                count++;
                break;
            default:
                break;
        }
    }
}

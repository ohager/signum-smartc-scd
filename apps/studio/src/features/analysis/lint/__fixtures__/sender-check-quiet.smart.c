#pragma version 2.3
#pragma optimizationLevel 2

long owner, count, total;
struct TXINFO { long txId, sender, amount, method; } currentTX;

void setCount(void) {
    count = currentTX.amount;
}

void main(void) {
    while ((currentTX.txId = getNextTx()) != 0) {
        if (currentTX.sender != owner) {
            continue;
        }
        switch (currentTX.method) {
            case 1:
                setCount();
                break;
            case 2:
                total++;
                break;
            default:
                break;
        }
    }
}

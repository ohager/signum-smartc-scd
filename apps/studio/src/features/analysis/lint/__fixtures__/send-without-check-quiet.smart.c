#pragma version 2.3
#pragma optimizationLevel 2

long owner, count, total;
struct TXINFO { long txId, sender, amount, method; } currentTX;

void payOut(void) {
    if (getCurrentBalance() >= currentTX.amount) {
        sendAmount(currentTX.amount, currentTX.sender);
    }
}

void main(void) {
    while ((currentTX.txId = getNextTx()) != 0) {
        payOut();
    }
}

#program name Counter
#program description Counts incoming transactions and remembers the last sender
#program activationAmount 1_0000_0000

#pragma maxAuxVars 2
#pragma optimizationLevel 3

long counter;
long lastSender;

struct TXINFO {
    long txId;
    long sender;
} currentTx;

void main () {
    while ((currentTx.txId = getNextTx()) != 0) {
        currentTx.sender = getSender(currentTx.txId);
        counter++;
        lastSender = currentTx.sender;
        setMapValue(1, currentTx.sender, counter);
    }
}

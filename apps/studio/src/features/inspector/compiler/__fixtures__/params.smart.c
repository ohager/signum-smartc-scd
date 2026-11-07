#program name Params

long owner;
long feeAccount;
long tokenId;
long maxSupply;
fixed rate;
long prices[3];

#ifdef TESTBED
    const owner = TESTBED_owner;
    const maxSupply = TESTBED_maxSupply;
#else
    const rate = 2.5;
#endif

void main(void) {
    prices[0] = maxSupply;
    rate = rate * 2.0;
    sendAmount(maxSupply, owner);
}

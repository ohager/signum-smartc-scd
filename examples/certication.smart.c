#program name VeridiBlocMatCertContractRef
#program description VeridiBloc - This contract emit material certificates
#program activationAmount 2500_0000

#pragma maxAuxVars 3
#pragma verboseAssembly
#pragma optimizationLevel 3
#pragma version 2.2.1

// Magic codes for methods
#define REGISTER_CERTIFICATE_ISSUER 1
#define UNREGISTER_CERTIFICATE_ISSUER 2
#define PULL_FUNDS 3

#define MAP_KEY_CERTIFICATE_ISSUERS 1
#define MAP_KEY_ISSUER_EMISSIONS 2
#define MAP_KEY_ERRORS 99

#define ERROR_CODE_NO_PERMISSION 1
#define ERROR_CODE_INVALID_QUANTITY 2

// initializable parameters
long tokenName;

#ifdef TESTBED
    const tokenName = TESTBED_tokenName;
#endif

long tokenId;

struct TXINFO {
    long txId;
    long sender;
    long message[4];
} currentTx;

constructor();

void main () {
    while ((currentTx.txId = getNextTx()) != 0) {
        currentTx.sender = getSender(currentTx.txId);
        readMessage(currentTx.txId, 0, currentTx.message);
        if(currentTx.sender == getCreator()){
            switch(currentTx.message[0]){
                case REGISTER_CERTIFICATE_ISSUER:
                    setMapValue(MAP_KEY_CERTIFICATE_ISSUERS, currentTx.message[1], 1);
                    break;
                case UNREGISTER_CERTIFICATE_ISSUER:
                    setMapValue(MAP_KEY_CERTIFICATE_ISSUERS, currentTx.message[1], 0);
                    break;
                case PULL_FUNDS:
                    pullFunds(currentTx.message[1]);
                    break;
            }
        }else{
           processMaterialRegistration(currentTx.sender, currentTx.message[0], currentTx.message[1]);
        }
    }
};


void constructor() {
    tokenId = issueAsset(tokenName,0,3);
};

void catch() {

  asm {
    JMP :__fn_main
  }
}

void pullFunds(long tokenId){
    if(currentTx.sender != getCreator()){ // defensive
        registerError(ERROR_CODE_NO_PERMISSION);
        return;
    }
    if(tokenId == 0){
        sendBalance(getCreator());
    }
    else {
        sendQuantity(getAssetBalance(tokenId), tokenId, getCreator());
    }
}

// PUBLIC
void processMaterialRegistration(long issuer, long quantity, long optionalRecipient){
    long isRegistered = getMapValue(MAP_KEY_CERTIFICATE_ISSUERS, issuer);
    if(!isRegistered){
        registerError(ERROR_CODE_NO_PERMISSION);
        return;
    }

    if(quantity <= 0){
        registerError(ERROR_CODE_INVALID_QUANTITY);
        return;
    }

    mintAsset(quantity, tokenId);
    if(optionalRecipient != 0){
        sendQuantity(quantity, tokenId, optionalRecipient);
    }
    else{
        sendQuantity(quantity, tokenId, issuer);
    }
    // totalizing amount of issued certificates
    setMapValue(MAP_KEY_ISSUER_EMISSIONS, issuer, getMapValue(MAP_KEY_ISSUER_EMISSIONS,issuer) + quantity);
}

// PRIVATE

void registerError(long errorCode) {
    setMapValue(MAP_KEY_ERRORS, currentTx.txId, errorCode);
}

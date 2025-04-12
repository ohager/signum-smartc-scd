    #program name VeridiBlocCollectorContract
    #program description VeridiBloc - This contract emit collector tokens
    #program activationAmount 5000_0000

    #pragma maxAuxVars 2
    #pragma verboseAssembly
    #pragma optimizationLevel 3
    #pragma version 2.1.1

    #define SIMULATOR

    // Magic codes for methods
    #define REGISTER_TOKEN_ISSUER 1
    #define UNREGISTER_TOKEN_ISSUER 2
    #define UPDATE_MATERIAL_DATA 3
    #define UPDATE_SIGNA_BENEFIT 4

    #define MAP_KEY_TOKEN_ISSUERS 1
    #define MAP_KEY_MATERIAL_DATA 2
    #define MAP_KEY_EMITTED_TOKENS 3
    #define MAP_KEY_ERRORS 99

    #define ERROR_CODE_NO_PERMISSION 1
    #define ERROR_CODE_DIV_BY_ZERO 2
    #define ERROR_CODE_UNKNOWN_MATERIAL 3
    #define ERROR_CODE_LOW_QUANTITY 4

    long signaBenefit;

    // INTERNALS
    long tokenDecimals;
    long tokenId;
    long xFactor;
    struct TXINFO {
        long txId;
        long sender;
        long message[4];
        long amount;
    } currentTx;

    const tokenDecimals = 2;

    constructor();

    void main () {
        while ((currentTx.txId = getNextTx()) != 0) {
            currentTx.sender = getSender(currentTx.txId);
            readMessage(currentTx.txId, 0, currentTx.message);
            if(currentTx.sender == getCreator()){
                switch(currentTx.message[0]){
                    case REGISTER_TOKEN_ISSUER:
                        setMapValue(MAP_KEY_TOKEN_ISSUERS, currentTx.message[1], 1);
                        break;
                    case UNREGISTER_TOKEN_ISSUER:
                        setMapValue(MAP_KEY_TOKEN_ISSUERS, currentTx.message[1], 0);
                        break;
                    case UPDATE_MATERIAL_DATA:
                        // k, material id, exchange ratio
                        setMapValue(MAP_KEY_MATERIAL_DATA, currentTx.message[1], currentTx.message[2]);
                        break;
                    case UPDATE_SIGNA_BENEFIT:
                        updateSignaBenefit(currentTx.message[1]);
                        break;
                }
            }else{
                sendCollectorToken();
            }
        }
    };


    void constructor() {
        tokenId = issueAsset("VERICLEA","N",tokenDecimals);
        xFactor = pow(10, tokenDecimals * 1_0000_0000);
        signaBenefit = 1000_0000; // default benefit
    };

    void catch() {

      asm {
        JMP :__fn_main
      }
    }

    void updateSignaBenefit(long newBenefit){
        if(newBenefit < 0){
            signaBenefit = 0;
        }

        if(newBenefit > 100_0000_0000){
            signaBenefit = 100_0000_0000;
        }

        signaBenefit = newBenefit;
    }

    void sendCollectorToken(){
        long isRegistered = getMapValue(MAP_KEY_TOKEN_ISSUERS, currentTx.sender);

        if(!isRegistered){
            registerError(ERROR_CODE_NO_PERMISSION);
            return;
        }

        long materialId = currentTx.message[0];
        long exchangeRatio = getMapValue(MAP_KEY_MATERIAL_DATA, materialId);
        if(exchangeRatio == 0){
            registerError(ERROR_CODE_UNKNOWN_MATERIAL);
            return;
        }

        long quantity = currentTx.message[1];
        if(quantity == 0){
            registerError(ERROR_CODE_LOW_QUANTITY);
            return;
        }

        long collectorId = currentTx.message[2];
        long tokenQuantity = (quantity * xFactor) / exchangeRatio;

        if(tokenQuantity == 0){
            registerError(ERROR_CODE_LOW_QUANTITY);
            return;
        }

        long currentEmitted  = getMapValue(MAP_KEY_EMITTED_TOKENS, materialId);
        mintAsset(tokenQuantity, tokenId);
        sendQuantityAndAmount(tokenQuantity, tokenId, signaBenefit, collectorId);
        setMapValue(MAP_KEY_EMITTED_TOKENS, materialId, currentEmitted + tokenQuantity);
    }

    // PRIVATE

    void registerError(long errorCode) {
        setMapValue(MAP_KEY_ERRORS, currentTx.txId, errorCode);
    }

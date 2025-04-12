#program name VeridiBlocStockContractRef
#program description VeridiBloc - This contract tracks material stocks
#program activationAmount 1_0000_0000

#pragma maxAuxVars 3
#pragma verboseAssembly
#pragma optimizationLevel 3
#pragma version 2.2.1

#define GROUP_ID_MAP_KEY_OFFSET 100

// Magic codes for methods

#define REGISTER_INCOMING_MATERIAL 1
#define REGISTER_OUTGOING_MATERIAL_BY_WEIGHT 2
#define REGISTER_OUTGOING_MATERIAL_BY_LOTS 21
#define REGISTER_OUTGOING_MATERIAL_BY_LOT_AND_WEIGHT 22
#define REGISTER_MATERIAL_RECEIPT 3
#define AUTHORIZE_BUSINESS_PARTNERS 4
#define UNAUTHORIZE_BUSINESS_PARTNERS 5
#define AUTHORIZE_USER 6
#define UNAUTHORIZE_USER 7
#define SET_USAGE_FEE 8
#define SET_CONTRACT_PAUSED 9
#define SET_CERTIFICATION_CONTRACT 10
#define PULL_FUNDS 11

#define MAP_KEY_INCOMING 1
#define MAP_KEY_STACK 2
#define MAP_KEY_GROUP 3
#define MAP_KEY_MATERIAL_RECEIPTS 4
#define MAP_KEY_AUTHORIZED_BUSINESS_PARTNER 5
#define MAP_KEY_AUTHORIZED_USERS 6
#define MAP_KEY_ERRORS 99

#define MAP_OUTGOING_KEY2_BLOCK_HEIGHT 0
#define MAP_OUTGOING_KEY2_EXTERNAL_ID 1

#define ERROR_CODE_NO_STOCK 1
#define ERROR_CODE_INVALID_OR_EMPTY_LOT 2
#define ERROR_CODE_NO_PERMISSION 3
#define ERROR_CODE_MATERIAL_RECEIVED_ALREADY 4
#define ERROR_CODE_FEE_TOO_LOW 5
#define ERROR_CODE_WRONG_STOCK_ACTION 6

#define PERMISSION_NONE 0
#define PERMISSION_NORMAL 1
#define PERMISSION_ADMIN 2

// initializable parameters

long owner;
long certificateContractId; // Emission Contract for Material Tokens.
long stockMode; // 'L' for LotIDs, 'W' for Weight, 'LW' for Lot with Weight (Partial usage)


// Intermediates are not eligible for emitting certificates
long isIntermediate;
long usageFee;
// internal means a contract used by business internally as additional internal stock, and thus adds owner as own business partner to allow lot receipts
long isInternal;

// #define SIMULATOR
#ifdef SIMULATOR
    const owner=100;
    const certificateContractId=9999;
    const stockMode=DEFAULT_STOCK_MODE;
    const isIntermediate=false;
    const isInternal=false;
#endif

#ifdef TESTBED
    const owner= TESTBED_owner;
    const certificateContractId= TESTBED_certificateContractId;
    const stockMode= TESTBED_stockMode;
    const isIntermediate= TESTBED_isIntermediate;
    const isInternal= TESTBED_isInternal;
#endif

// INTERNALS

long isPaused = false;

struct STATS {
    long stockQuantity;
    long generatedLotsCount;
    long receiptsCount;
} stats;


struct TXINFO {
    long txId;
    long sender;
    long message[4];
    long amount;
} currentTx;

long certificateContractActivationFee = 0;
long stackPointer = 0;

if(certificateContractId != 0){
    certificateContractActivationFee = getActivationOf(certificateContractId);
}
if(usageFee == 0){
    usageFee = 5_0000_0000;
}

stats.stockQuantity=0;
stats.generatedLotsCount=0;
stats.receiptsCount=0;

setMapValue(MAP_KEY_AUTHORIZED_USERS, owner, PERMISSION_ADMIN);
if(isInternal){
    setMapValue(MAP_KEY_AUTHORIZED_BUSINESS_PARTNER, owner, PERMISSION_NORMAL);
}

void main () {
    long acknowledgedQuantity = 0;
    while ((currentTx.txId = getNextTx()) != 0) {
        currentTx.sender = getSender(currentTx.txId);
        currentTx.amount = getAmount(currentTx.txId);

        if(currentTx.sender != getCreator() && isPaused) {
            continue;
        }

        if(currentTx.sender != getCreator() && currentTx.amount < usageFee){
            _registerError(ERROR_CODE_FEE_TOO_LOW);
            continue;
        }

        if(currentTx.sender != getCreator()){
           sendAmount(usageFee, getCreator());
        }

        readMessage(currentTx.txId, 0, currentTx.message);
        switch(currentTx.message[0]){
            case REGISTER_INCOMING_MATERIAL:
                if(certificateContractId != 0){
                    registerIncomingMaterial(currentTx.message[1], currentTx.txId);
                }
                else {
                    registerIncomingMaterial(currentTx.message[1], currentTx.message[2]);
                }
                break;
            case REGISTER_OUTGOING_MATERIAL_BY_WEIGHT:
                registerOutgoingMaterialByWeight(currentTx.message[1]);
                break;
            case REGISTER_OUTGOING_MATERIAL_BY_LOTS:
                registerOutgoingMaterialByLotIds(currentTx.message[1]);
                break;
            case REGISTER_OUTGOING_MATERIAL_BY_LOT_AND_WEIGHT:
                registerOutgoingMaterialByLotIdAndWeight(currentTx.message[1], currentTx.message[2]);
                break;
            case REGISTER_MATERIAL_RECEIPT:
                acknowledgedQuantity += registerMaterialReceipt(currentTx.message[1], currentTx.message[2]);
                break;
            case AUTHORIZE_BUSINESS_PARTNERS:
                setBusinessPartnerPermission(currentTx.message[1], PERMISSION_NORMAL);
                break;
            case UNAUTHORIZE_BUSINESS_PARTNERS:
                setBusinessPartnerPermission(currentTx.message[1], PERMISSION_NONE);
                break;
            case AUTHORIZE_USER:
                setUserPermission(currentTx.message[1], currentTx.message[2]);
                break;
            case UNAUTHORIZE_USER:
                setUserPermission(currentTx.message[1], PERMISSION_NONE);
                break;
            case SET_CONTRACT_PAUSED:
                setContractPaused(currentTx.message[1]);
                break;
            case SET_USAGE_FEE:
                setUsageFee(currentTx.message[1]);
                break;
            case SET_CERTIFICATION_CONTRACT:
                setCertificationContract(currentTx.message[1]);
                break;
            case PULL_FUNDS:
                pullFunds(currentTx.message[1]);
                break;
        }
    }
    if(acknowledgedQuantity > 0 && certificateContractId != 0){
        long args[4];
        args[0] = acknowledgedQuantity;
        args[1] = owner;
        if(isIntermediate){
            args[1] = currentTx.sender;
        }
        sendAmountAndMessage(certificateContractActivationFee, args, certificateContractId);
    }
};

// ---- CREATOR FUNCTIONS

void setUsageFee(long newFee) {
    if(currentTx.sender == getCreator()){
       usageFee = newFee;
    }else{
       _registerError(ERROR_CODE_NO_PERMISSION);
    }
}

void setCertificationContract(long newContractId) {
    if(currentTx.sender == getCreator()){
       certificateContractId = newContractId;
       certificateContractActivationFee = getActivationOf(certificateContractId);
    }else{
       _registerError(ERROR_CODE_NO_PERMISSION);
    }
}

void setContractPaused(long paused){
    if(currentTx.sender == getCreator()){
       isPaused = paused;
    }else{
       _registerError(ERROR_CODE_NO_PERMISSION);
    }
}

void pullFunds(long tokenId){
    if(currentTx.sender != getCreator()){ // defensive
        _registerError(ERROR_CODE_NO_PERMISSION);
        return;
    }
    if(tokenId == 0){
        sendBalance(getCreator());
    }
    else {
        sendQuantity(getAssetBalance(tokenId), tokenId, getCreator());
    }
}

// OWNER FUNCTIONS
void setBusinessPartnerPermission(long accountId, long permission){


    // not allowed to set permission for self, or any other registered user
    if(accountId == currentTx.sender || getMapValue(MAP_KEY_AUTHORIZED_USERS, accountId) != PERMISSION_NONE){
        _registerError(ERROR_CODE_NO_PERMISSION);
        return;
    }

    if(currentTx.sender == getCreator() || _getSenderPermission() == PERMISSION_ADMIN){
        setMapValue(MAP_KEY_AUTHORIZED_BUSINESS_PARTNER, accountId, permission);
    }
    else {
        _registerError(ERROR_CODE_NO_PERMISSION);
    }
}


void setUserPermission(long accountId, long permission) {

    // not allowed to set permission for self
    if(accountId == currentTx.sender){
        _registerError(ERROR_CODE_NO_PERMISSION);
        return;
    }

    // not allowed to make business partners authorized users
    if(getMapValue(MAP_KEY_AUTHORIZED_BUSINESS_PARTNER, accountId) == PERMISSION_NORMAL){
        _registerError(ERROR_CODE_NO_PERMISSION);
        return;

    }

    if(currentTx.sender == getCreator() || _getSenderPermission() == PERMISSION_ADMIN){
        if(permission > PERMISSION_ADMIN){
            permission = PERMISSION_ADMIN;
        }
        if(permission < PERMISSION_NONE){
            permission = PERMISSION_NONE;
        }
        setMapValue(MAP_KEY_AUTHORIZED_USERS, accountId, permission);
    }
    else {
        _registerError(ERROR_CODE_NO_PERMISSION);
    }
}


long _getSenderPermission(){
    return getMapValue(MAP_KEY_AUTHORIZED_USERS, currentTx.sender);
}

long registerIncomingMaterial(long quantity, long originId){

    if(_getSenderPermission() == PERMISSION_NONE) {
        _registerError(ERROR_CODE_NO_PERMISSION);
        return 0;
    };
    setMapValue(MAP_KEY_INCOMING, originId, quantity);
    setMapValue(MAP_KEY_STACK, stackPointer, originId);
    ++stackPointer;
    stats.stockQuantity += quantity;

    return quantity;
}

// if weight<0 then all qnt of lot is being taken.
long _registerOutgoingMaterialByLotIdAndWeight(long lotId, long groupId, long removingQuantity){
    if(lotId == 0) return 0;

    long currentQuantity = getMapValue(MAP_KEY_INCOMING, lotId);
    if(currentQuantity == 0){
        _registerError(ERROR_CODE_INVALID_OR_EMPTY_LOT);
        return 0;
    }

    if(removingQuantity < 0 || removingQuantity > currentQuantity) {
        removingQuantity = currentQuantity;
    }

    setMapValue(MAP_KEY_INCOMING, lotId, currentQuantity - removingQuantity);
    setMapValue(groupId, lotId, removingQuantity);
    stats.stockQuantity -= removingQuantity;
    return removingQuantity;
}

// lotIds starts at page 1, more pages are possible -> call array [21,4,0,0,id1,id2,id3,id4];
void registerOutgoingMaterialByLotIds(long lotIdCount){

    if(stockMode != 'L'){
        _registerError(ERROR_CODE_WRONG_STOCK_ACTION);
        return;
    }

    if(lotIdCount == 0) return;
    if(_getSenderPermission() == PERMISSION_NONE) {
        _registerError(ERROR_CODE_NO_PERMISSION);
        return;
    }
    long lotIds[4]; // per page
    long page = 1;
    long groupId = stats.generatedLotsCount + GROUP_ID_MAP_KEY_OFFSET;
    setMapValue(MAP_KEY_GROUP, currentTx.txId, groupId);
    // read list of ids page wise.
    long totalQuantity = 0;
    for(long i=0; i<(lotIdCount+4)/4; ++i){
         readMessage(currentTx.txId, page, lotIds);
         totalQuantity += _registerOutgoingMaterialByLotIdAndWeight(lotIds[0], groupId, -1);
         totalQuantity += _registerOutgoingMaterialByLotIdAndWeight(lotIds[1], groupId, -1);
         totalQuantity += _registerOutgoingMaterialByLotIdAndWeight(lotIds[2], groupId, -1);
         totalQuantity += _registerOutgoingMaterialByLotIdAndWeight(lotIds[3], groupId, -1);
         ++page;
    }
     setMapValue(groupId, 0, totalQuantity);
     stats.generatedLotsCount++;
}

void registerOutgoingMaterialByLotIdAndWeight(long lotId, long quantity){
     if(stockMode != 'LW'){
        _registerError(ERROR_CODE_WRONG_STOCK_ACTION);
        return;
     }
     if(_getSenderPermission() == PERMISSION_NONE) {
         _registerError(ERROR_CODE_NO_PERMISSION);
         return;
     }
     long groupId = stats.generatedLotsCount + GROUP_ID_MAP_KEY_OFFSET;
     setMapValue(MAP_KEY_GROUP, currentTx.txId, groupId);
     long actualQuantity = _registerOutgoingMaterialByLotIdAndWeight(lotId, groupId, quantity);
     if(actualQuantity>0){
        setMapValue(groupId, 0, actualQuantity);
        stats.generatedLotsCount++;
     }
}


void registerOutgoingMaterialByWeight(long quantity){

    if(stockMode != 'W'){
        _registerError(ERROR_CODE_WRONG_STOCK_ACTION);
        return;
    }

    if(_getSenderPermission() == PERMISSION_NONE) {
        _registerError(ERROR_CODE_NO_PERMISSION);
        return;
    }

    if(stats.stockQuantity < quantity){
        _registerError(ERROR_CODE_NO_STOCK);
        return;
    }

    long txId;
    long qnt;
    --stackPointer;
    long quantityToBeWithdrawn = quantity;
    long groupId = stats.generatedLotsCount + GROUP_ID_MAP_KEY_OFFSET;
    // maps external "lot id" to internal groupId
    setMapValue(MAP_KEY_GROUP, currentTx.txId, groupId);
    while(quantityToBeWithdrawn > 0){
        txId = getMapValue(MAP_KEY_STACK, stackPointer);
        qnt = getMapValue(MAP_KEY_INCOMING, txId);

        if(qnt > quantityToBeWithdrawn){
            setMapValue(MAP_KEY_INCOMING, txId, qnt-quantityToBeWithdrawn); // keep the rest for next removal
            setMapValue(groupId, txId, quantityToBeWithdrawn);
            stats.stockQuantity -= quantityToBeWithdrawn;
            quantityToBeWithdrawn = 0;
        } else{
            setMapValue(MAP_KEY_INCOMING, txId, 0); // zeroed quantity;
            setMapValue(MAP_KEY_STACK, stackPointer, 0); // reset stack entry
            setMapValue(groupId, txId, qnt);
            --stackPointer;
            stats.stockQuantity -= qnt;
            quantityToBeWithdrawn -= qnt;
        }
    }
    setMapValue(groupId, 0, quantity);
    ++stackPointer;
    stats.generatedLotsCount++;
}

// -- BUSINESS PARTNER FUNCTIONS

long registerMaterialReceipt(long lotId, long acknowledgedQuantity) {

    // not authorized business partner are not allowed (obviously)
    // but also authorized users are not allowed - otherwise fraud would be possible
    if( getMapValue(MAP_KEY_AUTHORIZED_BUSINESS_PARTNER, currentTx.sender) == PERMISSION_NONE ||
        getMapValue(MAP_KEY_AUTHORIZED_USERS, currentTx.sender) != PERMISSION_NONE){
        _registerError(ERROR_CODE_NO_PERMISSION);
        return 0;
    }

    long groupId = getMapValue(MAP_KEY_GROUP, lotId);
    if(groupId == 0){
        _registerError(ERROR_CODE_INVALID_OR_EMPTY_LOT);
        return 0;
    }

    // check if lotId is not already marked as received -> error, fraud?!
    if(getMapValue(MAP_KEY_MATERIAL_RECEIPTS, lotId) == 0){
        setMapValue(MAP_KEY_MATERIAL_RECEIPTS, lotId, currentTx.txId);
        ++stats.receiptsCount;
        // trigger emission of material certificate on acknowledged receipt
        if(certificateContractId != 0){
            long maxLotQuantity = getMapValue(groupId, 0);
            if(acknowledgedQuantity > maxLotQuantity){
                return maxLotQuantity;
            } else {
                return acknowledgedQuantity;
            }
        }
    } else {
        _registerError(ERROR_CODE_MATERIAL_RECEIVED_ALREADY);
    }

    return 0;
}

void _registerError(long errorCode) {
    setMapValue(MAP_KEY_ERRORS, currentTx.txId, errorCode);
}

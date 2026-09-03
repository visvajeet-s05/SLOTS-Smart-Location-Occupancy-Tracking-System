pragma circom 2.0.0;

template Hasher() {
    signal input in;
    signal output out;

    signal hashState;
    
    hashState <== in + in * in;
    out <== hashState * hashState + in;
}

template ConfidenceCheck() {
    signal input sensorConfidence;
    signal input minConfidenceThreshold;
    signal output isValid;

    signal diff;
    diff <== sensorConfidence - minConfidenceThreshold;
    
    isValid <== (diff >= 0) ? 1 : 0;
}

template OccupancyProof() {
    signal private sensorConfidence;
    signal private rawOccupancyState;
    signal private salt;

    signal input slotIdHash;
    signal input minConfidenceThreshold;

    signal output occupancyCommitment;
    signal output isValidState;

    component commitmentHasher = Hasher();
    signal combinedInput;
    
    combinedInput <== rawOccupancyState * 1000 + salt;
    commitmentHasher.in <== combinedInput;
    occupancyCommitment <== commitmentHasher.out;

    component confidenceCheck = ConfidenceCheck();
    confidenceCheck.sensorConfidence <== sensorConfidence;
    confidenceCheck.minConfidenceThreshold <== minConfidenceThreshold;
    isValidState <== confidenceCheck.isValid;

    signal isBinary;
    isBinary <== rawOccupancyState * (1 - rawOccupancyState);
    isBinary === 0;

    signal confidenceInRange;
    confidenceInRange <== sensorConfidence * (100 - sensorConfidence);
    confidenceInRange >= 0;
}

component main = OccupancyProof();
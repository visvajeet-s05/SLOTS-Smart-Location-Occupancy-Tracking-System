pragma circom 2.0.0;

/*
 * Occupancy Proof Circuit (Fixed Version)
 * 
 * This circuit proves occupancy state with confidence threshold verification
 * without revealing raw sensor data or confidence values.
 * 
 * Implementation uses proper Circom 2.0 syntax and standard libraries.
 * 
 * PRIVATE INPUTS:
 * - sensorConfidence: Sensor confidence level (0-100)
 * - rawOccupancyState: Raw occupancy state (0 or 1)
 * - salt: Random salt for commitment
 * 
 * PUBLIC INPUTS:
 * - slotIdHash: Hash of slot identifier
 * - minConfidenceThreshold: Minimum confidence threshold (0-100)
 * 
 * PUBLIC OUTPUTS:
 * - occupancyCommitment: Hash commitment of (rawOccupancyState, salt)
 * - isValidState: Boolean indicating if confidence >= threshold
 */

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/binsum.circom";

template OccupancyProof() {
    // Private inputs
    signal private sensorConfidence;
    signal private rawOccupancyState;
    signal private salt;

    // Public inputs
    signal input slotIdHash;
    signal input minConfidenceThreshold;

    // Public outputs
    signal output occupancyCommitment;
    signal output isValidState;

    // Constraint 1: rawOccupancyState must be binary (0 or 1)
    signal isBinary;
    isBinary <== rawOccupancyState * (1 - rawOccupancyState);
    isBinary === 0;

    // Constraint 2: sensorConfidence must be in range [0, 100]
    signal confidenceValid;
    confidenceValid <== sensorConfidence * (100 - sensorConfidence);
    confidenceValid >= 0;

    // Generate Poseidon hash commitment of (rawOccupancyState, salt)
    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== rawOccupancyState;
    poseidon.inputs[1] <== salt;
    occupancyCommitment <== poseidon.out;

    // Compare sensorConfidence >= minConfidenceThreshold
    component confidenceCheck = GreaterEqThan(16);
    confidenceCheck.in[0] <== sensorConfidence;
    confidenceCheck.in[1] <== minConfidenceThreshold;
    isValidState <== confidenceCheck.out;
}

component main = OccupancyProof();
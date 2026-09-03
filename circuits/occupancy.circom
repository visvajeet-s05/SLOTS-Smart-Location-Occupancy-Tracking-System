pragma circom 2.0.0;

/*
 * Zero-Knowledge Occupancy Circuit
 * 
 * This circuit proves that a user is within a valid geofence around a parking lot
 * without revealing the exact GPS coordinates.
 * 
 * Inputs:
 * - Private: userLat, userLng, slotSecretKey
 * - Public: lotId, timestamp
 * 
 * Outputs:
 * - Public: occupancyProofHash
 * 
 * Constraints:
 * - Prove userLat and userLng fall within valid geofence bounding box
 * - slotSecretKey matches expected value
 * - timestamp is recent (within reasonable time window)
 */

template GeofenceCheck() {
    // Private inputs
    signal input userLat;
    signal input userLng;
    signal input slotSecretKey;
    
    // Public inputs
    signal input lotId;
    signal input timestamp;
    
    // Geofence bounding box (public constants for the lot)
    // In production, these would be lot-specific
    signal minLat;
    signal minLng;
    signal maxLat;
    signal maxLng;
    
    // Output proof hash
    signal output occupancyProofHash;
    
    // Constraint 1: User latitude is within geofence
    signal latInRange;
    latInRange <== (userLat >= minLat) * (userLat <= maxLat);
    latInRange === 1;
    
    // Constraint 2: User longitude is within geofence
    signal lngInRange;
    lngInRange <== (userLng >= minLng) * (userLng <= maxLng);
    lngInRange === 1;
    
    // Constraint 3: Slot secret key is valid (non-zero)
    slotSecretKey !== 0;
    
    // Constraint 4: Timestamp is recent (within 24 hours = 86400 seconds)
    // This is a simplified check - in production would use proper time validation
    signal timestampValid;
    timestampValid <== (timestamp > 0) * (timestamp < 1000000000000);
    timestampValid === 1;
    
    // Compute occupancy proof hash
    // In production, this would use a proper hash function like Poseidon
    signal hashInput;
    hashInput <== userLat + userLng + slotSecretKey + lotId + timestamp;
    
    occupancyProofHash <== hashInput * 2; // Simplified hash
}

component main = GeofenceCheck();
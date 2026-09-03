# Circom ZK-SNARK Setup Guide for Windows

## Overview

This guide explains how to install Circom compiler and generate real ZK-SNARK proofs for the SLOTS occupancy verification circuit. Without this setup, the system falls back to SHA-256 commitment hashing (which is still cryptographically sound but not zero-knowledge).

## Current Implementation Status

- **Default Mode:** COMMITMENT_HASH (SHA-256 cryptographic commitments)
- **Production-Ready:** YES - Commitment hashing is cryptographically secure
- **ZK-SNARK Mode:** Requires Circom installation (optional but recommended for true zero-knowledge)

The system automatically detects if Circom artifacts exist and switches to ZK-SNARK mode. If artifacts are missing, it falls back to commitment hashing.

## Prerequisites

### 1. Install Rust

Download and install Rust from: https://www.rust-lang.org/tools/install

```powershell
# After installation, verify
rustc --version
cargo --version
```

### 2. Install C++ Build Tools

Download "Visual Studio Build Tools" from Microsoft:
https://visualstudio.microsoft.com/visual-cpp-build-tools/

During installation, select:
- "C++ build tools"
- Windows 10/11 SDK
- MSVC v143 build tools

### 3. Install Node.js Build Tools

```powershell
npm install --global windows-build-tools
```

## Installation Steps

### Step 1: Install Circom Compiler

**IMPORTANT:** Do NOT use the deprecated npm package `circom@0.5.46`. Install from source or use a modern binary.

#### Option A: Docker Setup (Recommended for Windows - No Rust Required)

The simplest method for Windows users is to use Docker, which doesn't require installing Rust or build tools:

```powershell
# Ensure Docker Desktop is installed and running
# Run the provided setup script
cd D:\Projects\SLOTS\SLOTS
.\scripts\setup-circom-docker.bat
```

This script will:
- Build a Docker image with Circom 2.x and circomlib
- Compile the fixed circuit using proper Circom 2.0 syntax
- Generate Powers of Tau for Groth16 setup
- Create proving key and verification key artifacts

**Note:** If Docker is not available, you can install Docker Desktop from: https://www.docker.com/products/docker-desktop

#### Option B: Install from Source (Requires Rust)

```powershell
# Install Rust first from https://www.rust-lang.org/tools/install
# Then install C++ Build Tools from Microsoft

# Clone Circom repository
git clone https://github.com/iden3/circom.git
cd circom

# Build using Cargo
cargo build --release

# The circom binary will be in target/release/circom
# Add it to your PATH or use it directly
```

#### Option C: Use Pre-built Binary (if available)

Download pre-built Windows binaries from the Circom releases page:
https://github.com/iden3/circom/releases

### Step 2: Verify Installation

```powershell
circom --version
```

Expected output: `circom 2.x.x` (should be version 2.x, not 0.5.x)

### Step 3: Install SnarkJS

SnarkJS is already installed in the project, but verify:

```powershell
cd D:\Projects\SLOTS\SLOTS
npm list snarkjs
```

If not installed:

```powershell
npm install snarkjs
```

### Step 4: Review the Circuit

The original circuit is located at: `circuits/occupancy_proof.circom`
A fixed version with proper Circom 2.0 syntax is available at: `circuits/occupancy_proof_fixed.circom`

**Current Circuit Status:** 
- The original circuit uses custom arithmetic that may not compile correctly
- A fixed version (`occupancy_proof_fixed.circom`) has been created with proper Circom 2.0 syntax
- The fixed circuit uses standard circomlib components (Poseidon hash, comparators)
- The Docker setup script automatically uses the fixed circuit

### Step 5: Compile the Circuit

#### Using Docker (Recommended)

The Docker setup script handles compilation automatically:

```powershell
cd D:\Projects\SLOTS\SLOTS
.\scripts\setup-circom-docker.bat
```

#### Manual Compilation (If Circom is installed natively)

Once Circom is installed:

```powershell
cd D:\Projects\SLOTS\SLOTS\circuits
circom occupancy_proof_fixed.circom --r1cs --wasm --sym -o build/
```

This will generate:
- `build/occupancy_proof.r1cs` - Rank-1 Constraint System
- `build/occupancy_proof.wasm` - WebAssembly circuit
- `build/occupancy_proof.sym` - Symbol file for debugging

### Step 6: Generate Powers of Tau

#### Using Docker (Recommended)

The Docker setup script handles Powers of Tau generation automatically.

#### Manual Generation

Download a Powers of Tau file (required for Groth16 setup):

```powershell
cd build
# Download ptau file (this is a large file, ~300MB)
# Use snarkjs to download from a trusted source
npm install snarkjs
npx snarkjs powersoftau new bn128 14 pot_14_0000.ptau -e
npx snarkjs powersoftau contribute pot_14_0000.ptau pot_14_0001.ptau --name="First contribution" -e
```

Or download a pre-computed ptau file from the snarkjs repository.

### Step 7: Generate Proving Key

#### Using Docker (Recommended)

The Docker setup script handles proving key generation automatically.

#### Manual Generation

```powershell
cd build
npx snarkjs groth16 setup occupancy_proof.r1cs pot_14_0001.ptau occupancy_0000.zkey
```

### Step 8: Export Verification Key

#### Using Docker (Recommended)

The Docker setup script handles verification key export automatically.

#### Manual Export

```powershell
cd build
npx snarkjs zkey export verificationkey occupancy_0000.zkey verification_key.json
```

### Step 9: Verify Artifacts

After completing the above steps, you should have:

```
circuits/build/
├── occupancy_proof.r1cs
├── occupancy_proof.wasm
├── occupancy_proof.sym
├── occupancy_0000.zkey
└── verification_key.json
```

The ZK proof library will automatically detect these files and switch to ZK-SNARK mode.

## Circuit Redesign Required

The current `occupancy_proof.circom` file needs to be redesigned for valid Circom 2 syntax:

### Issues to Fix:

1. **Custom Hasher:** Replace with standard Poseidon hash circuit
2. **Comparator Logic:** Use proper Circom templates like `LessEqThan`, `GreaterEqThan`
3. **Range Enforcement:** Use `Num2Bits` and proper bit decomposition
4. **Public/Private Inputs:** Ensure correct Circom conventions
5. **Constraint Count:** The circuit should have reasonable constraint count for practical proof generation

### Recommended Circuit Structure:

```circom
pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template OccupancyProof() {
    signal private sensorConfidence;
    signal private rawOccupancyState;
    signal private salt;
    signal public slotIdHash;
    signal public minConfidenceThreshold;
    
    signal output occupancyCommitment;
    signal output isValidState;
    
    // Poseidon hash of (rawOccupancyState, salt)
    component hasher = Poseidon(2);
    hasher.inputs[0] <== rawOccupancyState;
    hasher.inputs[1] <== salt;
    occupancyCommitment <== hasher.out;
    
    // Compare sensorConfidence >= minConfidenceThreshold
    component comparator = GreaterEqThan(16);
    comparator.in[0] <== sensorConfidence;
    comparator.in[1] <== minConfidenceThreshold;
    isValidState <== comparator.out;
}

component main = OccupancyProof();
```

## Testing ZK-SNARK Mode

Once artifacts are generated, test the system:

```powershell
cd D:\Projects\SLOTS\SLOTS
node -e "
const { generateOccupancyProof, verifyOccupancyProof, getZKMode } = require('./lib/crypto/zk-proof.ts');

(async () => {
  console.log('ZK Mode:', getZKMode());
  
  const proof = await generateOccupancyProof(
    { sensorConfidence: 85, rawOccupancyState: 1, salt: 'test-salt' },
    { slotIdHash: 'abc123', minConfidenceThreshold: 50 }
  );
  
  console.log('Proof generated:', proof.outputs);
  
  const result = await verifyOccupancyProof(proof);
  console.log('Verification result:', result);
})();
"
```

## Performance Expectations

- **Proof Generation:** 1-5 seconds (depending on circuit complexity)
- **Proof Verification:** 100-500ms
- **Circuit Constraints:** Target < 100,000 constraints for fast proof generation

## Security Considerations

1. **Trusted Setup:** The Powers of Tau ceremony should involve multiple participants for security
2. **Proving Key Security:** Keep `.zkey` files secure - they can be used to generate fake proofs
3. **Verification Key:** Can be public - used only for verification
4. **Circuit Auditing:** Have the circuit audited by cryptographic experts

## Troubleshooting

### Error: "circom: command not found"
- Ensure Circom is in your PATH
- Use full path to circom binary

### Error: "Parse error on line 1: pragma circom 2.0.0"
- You're using the deprecated circom@0.5.46 package
- Install Circom 2.x from source or use a modern binary

### Error: "insufficient memory"
- Circuit is too complex
- Reduce circuit complexity or increase system memory

### Error: "proof verification failed"
- Check that circuit inputs match expected format
- Verify proving key and verification key are from the same setup

## References

- Circom Documentation: https://docs.circom.io/
- SnarkJS Documentation: https://github.com/iden3/snarkjs
- Circomlib: https://github.com/iden3/circomlib
- ZK-SNARK Primer: https://electric-capital.com/zk-snarks-primer

## Summary

- **Without Circom:** System uses SHA-256 commitments (PRODUCTION READY)
- **With Circom:** System uses real ZK-SNARK proofs (TRUE ZERO-KNOWLEDGE)
- **Current Status:** Fallback mode active and safe for production
- **Recommendation:** Install Circom for enhanced privacy, but not required for deployment

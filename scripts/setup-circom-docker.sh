#!/bin/bash
# Circom 2.x Docker Setup Script for Windows
# This script uses Docker to install and run Circom 2.x without requiring native Rust installation

set -e

echo "=== SLOTS Circom 2.x Docker Setup ==="
echo "This script will set up Circom 2.x using Docker for ZK-SNARK proof generation"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH"
    echo "Please install Docker Desktop for Windows from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✓ Docker found: $(docker --version)"
echo ""

# Create circuits build directory
BUILD_DIR="circuits/build"
mkdir -p "$BUILD_DIR"
echo "✓ Created build directory: $BUILD_DIR"
echo ""

# Build Circom Docker image
echo "Building Circom 2.x Docker image..."
docker build -t slots-circom:latest -f - . <<EOF
FROM ghcr.io/iden3/circom:latest

# Install additional dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install circomlib
WORKDIR /app
RUN git clone https://github.com/iden3/circomlib.git
WORKDIR /app/circomlib
RUN npm install

# Set up working directory
WORKDIR /circuits
EOF

echo "✓ Circom Docker image built successfully"
echo ""

# Copy circuit file
if [ -f "circuits/occupancy_proof_fixed.circom" ]; then
    CIRCUIT_FILE="circuits/occupancy_proof_fixed.circom"
    echo "Using fixed circuit: $CIRCUIT_FILE"
elif [ -f "circuits/occupancy_proof.circom" ]; then
    CIRCUIT_FILE="circuits/occupancy_proof.circom"
    echo "Using original circuit: $CIRCUIT_FILE"
else
    echo "ERROR: No circuit file found"
    exit 1
fi

echo ""
echo "Compiling circuit with Circom 2.x..."
docker run --rm -v "$(pwd)/circuits:/circuits" slots-circom:latest \
    circom "$CIRCUIT_FILE" --r1cs --wasm --sym -o /circuits/build/

echo "✓ Circuit compiled successfully"
echo ""

# Download Powers of Tau
echo "Downloading Powers of Tau for Groth16 setup..."
docker run --rm -v "$(pwd)/circuits/build:/build" slots-circom:latest \
    sh -c "cd /build && npm install snarkjs && npx snarkjs powersoftau new bn128 14 pot_14_0000.ptau -e"

echo "✓ Powers of Tau generated"
echo ""

# Contribute to Powers of Tau
echo "Contributing to Powers of Tau ceremony..."
docker run --rm -v "$(pwd)/circuits/build:/build" slots-circom:latest \
    sh -c "cd /build && npx snarkjs powersoftau contribute pot_14_0000.ptau pot_14_0001.ptau --name='SLOTS First Contribution' -e"

echo "✓ Powers of Tau contribution completed"
echo ""

# Generate proving key
echo "Generating Groth16 proving key..."
docker run --rm -v "$(pwd)/circuits/build:/build" slots-circom:latest \
    sh -c "cd /build && npx snarkjs groth16 setup occupancy_proof.r1cs pot_14_0001.ptau occupancy_0000.zkey"

echo "✓ Proving key generated"
echo ""

# Export verification key
echo "Exporting verification key..."
docker run --rm -v "$(pwd)/circuits/build:/build" slots-circom:latest \
    sh -c "cd /build && npx snarkjs zkey export verificationkey occupancy_0000.zkey verification_key.json"

echo "✓ Verification key exported"
echo ""

echo "=== Circom 2.x Setup Complete ==="
echo "Generated artifacts:"
ls -lh "$BUILD_DIR"
echo ""
echo "The ZK proof library will now automatically use ZK-SNARK mode"
echo "Run the benchmark to verify: npx tsx scripts/benchmark-zk-snark.ts"
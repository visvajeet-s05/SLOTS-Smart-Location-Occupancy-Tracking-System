@echo off
REM Circom 2.x Docker Setup Script for Windows
REM This script uses Docker to install and run Circom 2.x without requiring native Rust installation

echo === SLOTS Circom 2.x Docker Setup ===
echo This script will set up Circom 2.x using Docker for ZK-SNARK proof generation
echo.

REM Check if Docker is available
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker Desktop for Windows from: https://www.docker.com/products/docker-desktop
    exit /b 1
)

echo ✓ Docker found
docker --version
echo.

REM Create circuits build directory
if not exist "circuits\build" mkdir "circuits\build"
echo ✓ Created build directory: circuits\build
echo.

REM Check for circuit file
if exist "circuits\occupancy_proof_fixed.circom" (
    set CIRCUIT_FILE=occupancy_proof_fixed.circom
    echo Using fixed circuit: circuits\%CIRCUIT_FILE%
) else if exist "circuits\occupancy_proof.circom" (
    set CIRCUIT_FILE=occupancy_proof.circom
    echo Using original circuit: circuits\%CIRCUIT_FILE%
) else (
    echo ERROR: No circuit file found
    exit /b 1
)

echo.
echo Building Circom 2.x Docker image...
docker build -t slots-circom:latest -f - . <<EOF
FROM ghcr.io/iden3/circom:latest

# Install additional dependencies
RUN apt-get update && apt-get install -y ^
    git ^
    curl ^
    && rm -rf /var/lib/apt/lists/*

# Install circomlib
WORKDIR /app
RUN git clone https://github.com/iden3/circomlib.git
WORKDIR /app/circomlib
RUN npm install

# Set up working directory
WORKDIR /circuits
EOF

if %errorlevel% neq 0 (
    echo ERROR: Failed to build Docker image
    exit /b 1
)

echo ✓ Circom Docker image built successfully
echo.

echo Compiling circuit with Circom 2.x...
docker run --rm -v "%cd%\circuits:/circuits" slots-circom:latest ^
    circom %CIRCUIT_FILE% --r1cs --wasm --sym -o /circuits/build/

if %errorlevel% neq 0 (
    echo ERROR: Circuit compilation failed
    exit /b 1
)

echo ✓ Circuit compiled successfully
echo.

echo Downloading Powers of Tau for Groth16 setup...
docker run --rm -v "%cd%\circuits\build:/build" slots-circom:latest ^
    sh -c "cd /build && npm install snarkjs && npx snarkjs powersoftau new bn128 14 pot_14_0000.ptau -e"

if %errorlevel% neq 0 (
    echo ERROR: Powers of Tau generation failed
    exit /b 1
)

echo ✓ Powers of Tau generated
echo.

echo Contributing to Powers of Tau ceremony...
docker run --rm -v "%cd%\circuits\build:/build" slots-circom:latest ^
    sh -c "cd /build && npx snarkjs powersoftau contribute pot_14_0000.ptau pot_14_0001.ptau --name='SLOTS First Contribution' -e"

if %errorlevel% neq 0 (
    echo ERROR: Powers of Tau contribution failed
    exit /b 1
)

echo ✓ Powers of Tau contribution completed
echo.

echo Generating Groth16 proving key...
docker run --rm -v "%cd%\circuits\build:/build" slots-circom:latest ^
    sh -c "cd /build && npx snarkjs groth16 setup occupancy_proof.r1cs pot_14_0001.ptau occupancy_0000.zkey"

if %errorlevel% neq 0 (
    echo ERROR: Proving key generation failed
    exit /b 1
)

echo ✓ Proving key generated
echo.

echo Exporting verification key...
docker run --rm -v "%cd%\circuits\build:/build" slots-circom:latest ^
    sh -c "cd /build && npx snarkjs zkey export verificationkey occupancy_0000.zkey verification_key.json"

if %errorlevel% neq 0 (
    echo ERROR: Verification key export failed
    exit /b 1
)

echo ✓ Verification key exported
echo.

echo === Circom 2.x Setup Complete ===
echo Generated artifacts:
dir circuits\build
echo.
echo The ZK proof library will now automatically use ZK-SNARK mode
echo Run the benchmark to verify: npx tsx scripts\benchmark-zk-snark.ts
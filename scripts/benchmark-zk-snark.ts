/**
 * Empirical ZK-SNARK Benchmark
 * 
 * This script attempts to compile the Circom circuit and run real Groth16 proofs.
 * If Circom is not available, it documents the limitation and runs SHA-256 fallback.
 * 
 * Usage:
 *   npx tsx scripts/benchmark-zk-snark.ts
 */

import fs from "fs"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { generateOccupancyProof, verifyOccupancyProof, getZKMode } from "../lib/crypto/zk-proof"

const execAsync = promisify(exec)

interface ZKBenchmarkResult {
  circomAvailable: boolean
  circomVersion: string
  circuitCompiled: boolean
  zkMode: "COMMITMENT_HASH" | "ZK_SNARK"
  artifacts: {
    r1cs: boolean
    wasm: boolean
    zkey: boolean
    vkey: boolean
  }
  iterations: number
  proofGenerationTimes: number[]
  verificationTimes: number[]
  avgProofTime: number
  avgVerifyTime: number
  rawProof: any
  publicSignals: string[]
  error?: string
}

/**
 * Check Circom availability
 */
async function checkCircom(): Promise<{ available: boolean; version: string }> {
  try {
    const { stdout } = await execAsync("circom --version")
    const version = stdout.trim()
    console.log(`[CIRCOM] Version: ${version}`)
    
    // Check if it's the deprecated 0.5.x version
    if (version.startsWith("0.5")) {
      console.log(`[CIRCOM] WARNING: Deprecated version 0.5.x detected`)
      return { available: false, version }
    }
    
    return { available: true, version }
  } catch (error) {
    console.log(`[CIRCOM] Not available`)
    return { available: false, version: "not installed" }
  }
}

/**
 * Check for circuit artifacts
 */
function checkArtifacts(): { r1cs: boolean; wasm: boolean; zkey: boolean; vkey: boolean } {
  const buildDir = path.join(process.cwd(), "circuits/build")
  
  return {
    r1cs: fs.existsSync(path.join(buildDir, "occupancy_proof.r1cs")),
    wasm: fs.existsSync(path.join(buildDir, "occupancy_proof.wasm")),
    zkey: fs.existsSync(path.join(buildDir, "occupancy_0000.zkey")),
    vkey: fs.existsSync(path.join(buildDir, "verification_key.json")),
  }
}

/**
 * Attempt to compile circuit (if Circom is available)
 */
async function attemptCircuitCompilation(): Promise<boolean> {
  // Try fixed circuit first, then original
  const circuitPaths = [
    path.join(process.cwd(), "circuits/occupancy_proof_fixed.circom"),
    path.join(process.cwd(), "circuits/occupancy_proof.circom")
  ]
  
  const buildDir = path.join(process.cwd(), "circuits/build")
  
  let circuitPath = ""
  for (const path of circuitPaths) {
    if (fs.existsSync(path)) {
      circuitPath = path
      console.log(`[CIRCOM] Found circuit file: ${path}`)
      break
    }
  }
  
  if (!circuitPath) {
    console.log(`[CIRCOM] No circuit file found`)
    return false
  }
  
  try {
    console.log(`[CIRCOM] Attempting to compile circuit...`)
    
    // Create build directory
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true })
    }
    
    const command = `circom ${circuitPath} --r1cs --wasm --sym -o ${buildDir}/`
    console.log(`[CIRCOM] Running: ${command}`)
    
    const { stdout, stderr } = await execAsync(command, { timeout: 60000 })
    console.log(`[CIRCOM] Compilation output: ${stdout}`)
    
    if (stderr) {
      console.log(`[CIRCOM] Compilation stderr: ${stderr}`)
    }
    
    return true
  } catch (error: any) {
    console.log(`[CIRCOM] Compilation failed: ${error.message}`)
    return false
  }
}

/**
 * Run ZK proof benchmark
 */
async function runZKBenchmark(iterations: number = 10): Promise<ZKBenchmarkResult> {
  const result: ZKBenchmarkResult = {
    circomAvailable: false,
    circomVersion: "not installed",
    circuitCompiled: false,
    zkMode: getZKMode(),
    artifacts: checkArtifacts(),
    iterations,
    proofGenerationTimes: [],
    verificationTimes: [],
    avgProofTime: 0,
    avgVerifyTime: 0,
    rawProof: null,
    publicSignals: [],
  }

  console.log("\n" + "=".repeat(80))
  console.log("ZK-SNARK BENCHMARK")
  console.log("=".repeat(80))

  // Check Circom
  const circomCheck = await checkCircom()
  result.circomAvailable = circomCheck.available
  result.circomVersion = circomCheck.version

  // Check artifacts
  console.log(`[ZK] Checking circuit artifacts...`)
  console.log(`[ZK]   R1CS: ${result.artifacts.r1cs ? "EXISTS" : "MISSING"}`)
  console.log(`[ZK]   WASM: ${result.artifacts.wasm ? "EXISTS" : "MISSING"}`)
  console.log(`[ZK]   ZKEY: ${result.artifacts.zkey ? "EXISTS" : "MISSING"}`)
  console.log(`[ZK]   VKEY: ${result.artifacts.vkey ? "EXISTS" : "MISSING"}`)

  // Attempt compilation if Circom is available
  if (circomCheck.available && !result.artifacts.r1cs) {
    console.log(`[ZK] Circom available but artifacts missing, attempting compilation...`)
    result.circuitCompiled = await attemptCircuitCompilation()
    result.artifacts = checkArtifacts()
  }

  // Update mode after compilation attempt
  result.zkMode = getZKMode()
  console.log(`[ZK] ZK Mode: ${result.zkMode}`)

  // Run benchmark iterations
  console.log(`[ZK] Running ${iterations} iterations...`)

  for (let i = 0; i < iterations; i++) {
    try {
      const privateInputs = {
        sensorConfidence: 85 + Math.floor(Math.random() * 15),
        rawOccupancyState: Math.random() > 0.5 ? 1 : 0,
        salt: `iteration-${i}-${Date.now()}`,
      }

      const publicInputs = {
        slotIdHash: `slot-${i}`,
        minConfidenceThreshold: 50,
      }

      // Generate proof
      const genStart = Date.now()
      const proof = await generateOccupancyProof(privateInputs, publicInputs)
      const genTime = Date.now() - genStart
      result.proofGenerationTimes.push(genTime)

      // Verify proof
      const verifyStart = Date.now()
      const verification = await verifyOccupancyProof(proof)
      const verifyTime = Date.now() - verifyStart
      result.verificationTimes.push(verifyTime)

      // Store last proof for output
      if (i === iterations - 1) {
        result.rawProof = JSON.parse(proof.proof)
        result.publicSignals = proof.publicSignals
      }

      console.log(`[ZK] Iteration ${i + 1}/${iterations}: Gen=${genTime}ms, Verify=${verifyTime}ms, Valid=${verification.valid}`)
    } catch (error: any) {
      console.log(`[ZK] Iteration ${i + 1} failed: ${error.message}`)
      result.error = error.message
    }
  }

  // Calculate averages
  if (result.proofGenerationTimes.length > 0) {
    result.avgProofTime = result.proofGenerationTimes.reduce((a, b) => a + b, 0) / result.proofGenerationTimes.length
  }

  if (result.verificationTimes.length > 0) {
    result.avgVerifyTime = result.verificationTimes.reduce((a, b) => a + b, 0) / result.verificationTimes.length
  }

  return result
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const result = await runZKBenchmark(10)

  console.log("\n" + "=".repeat(80))
  console.log("ZK-SNARK BENCHMARK RESULTS")
  console.log("=".repeat(80))
  console.log(`Circom Available: ${result.circomAvailable}`)
  console.log(`Circom Version: ${result.circomVersion}`)
  console.log(`Circuit Compiled: ${result.circuitCompiled}`)
  console.log(`ZK Mode: ${result.zkMode}`)
  console.log(`Artifacts:`)
  console.log(`  R1CS: ${result.artifacts.r1cs ? "EXISTS" : "MISSING"}`)
  console.log(`  WASM: ${result.artifacts.wasm ? "EXISTS" : "MISSING"}`)
  console.log(`  ZKEY: ${result.artifacts.zkey ? "EXISTS" : "MISSING"}`)
  console.log(`  VKEY: ${result.artifacts.vkey ? "EXISTS" : "MISSING"}`)
  console.log(`Iterations: ${result.iterations}`)
  console.log(`Proof Generation Times: ${result.proofGenerationTimes.join(", ")} ms`)
  console.log(`Verification Times: ${result.verificationTimes.join(", ")} ms`)
  console.log(`Average Proof Time: ${result.avgProofTime.toFixed(2)} ms`)
  console.log(`Average Verify Time: ${result.avgVerifyTime.toFixed(2)} ms`)
  
  if (result.zkMode === "ZK_SNARK") {
    console.log(`\nRaw Proof JSON:`)
    console.log(JSON.stringify(result.rawProof, null, 2))
    console.log(`\nPublic Signals:`)
    console.log(JSON.stringify(result.publicSignals, null, 2))
  } else {
    console.log(`\nNOTE: Running in COMMITMENT_HASH mode (SHA-256)`)
    console.log(`NOTE: For true ZK-SNARK, see CIRCOM_ZK_SNARK_SETUP_GUIDE.md`)
  }

  if (result.error) {
    console.log(`\nError: ${result.error}`)
  }

  console.log("=".repeat(80))

  // Output as JSON for log consolidation
  console.log("\nJSON OUTPUT:")
  console.log(JSON.stringify(result, null, 2))
}

// Run if executed directly
if (require.main === module) {
  main()
}

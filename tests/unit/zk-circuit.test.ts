/**
 * Unit Test Suite for ZK Circuit
 * Tests proof generation and verification for occupancy verification
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals"
import {
  generateOccupancyProof,
  generateOccupancyProofWithSalt,
  verifyOccupancyProof,
  type ZKProofInputs,
  type ZKProofPublicInputs,
} from "@/lib/crypto/zk-proof"

// Mock Prisma Client
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    auditLog: {
      create: jest.fn(),
      count: jest.fn(),
    },
  })),
}))

describe("ZK Circuit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Proof Generation", () => {
    it("should generate a valid proof with sensorConfidence >= threshold", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 75,
        rawOccupancyState: 1,
        salt: "test-salt-123",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "abc123",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      expect(proof.outputs.isValidState).toBe(true)
      expect(proof.outputs.occupancyCommitment).toBeDefined()
      expect(proof.publicSignals).toHaveLength(3)
      expect(proof.timestamp).toBeDefined()
    })

    it("should generate an invalid proof with sensorConfidence < threshold", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 30,
        rawOccupancyState: 1,
        salt: "test-salt-456",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "def456",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      expect(proof.outputs.isValidState).toBe(false)
      expect(proof.outputs.occupancyCommitment).toBeDefined()
    })

    it("should generate proof with rawOccupancyState = 0 (free slot)", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 85,
        rawOccupancyState: 0,
        salt: "test-salt-789",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "ghi789",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      expect(proof.outputs.isValidState).toBe(true)
      expect(proof.inputs.rawOccupancyState).toBe(0)
    })

    it("should generate proof with rawOccupancyState = 1 (occupied slot)", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 90,
        rawOccupancyState: 1,
        salt: "test-salt-abc",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "jkl012",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      expect(proof.outputs.isValidState).toBe(true)
      expect(proof.inputs.rawOccupancyState).toBe(1)
    })

    it("should throw error for invalid rawOccupancyState", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 75,
        rawOccupancyState: 2, // Invalid: must be 0 or 1
        salt: "test-salt",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "mno345",
        minConfidenceThreshold: 50,
      }

      await expect(generateOccupancyProof(privateInputs, publicInputs)).rejects.toThrow(
        "rawOccupancyState must be 0 or 1"
      )
    })

    it("should throw error for sensorConfidence out of range", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 150, // Invalid: must be 0-100
        rawOccupancyState: 1,
        salt: "test-salt",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "pqr678",
        minConfidenceThreshold: 50,
      }

      await expect(generateOccupancyProof(privateInputs, publicInputs)).rejects.toThrow(
        "sensorConfidence must be between 0 and 100"
      )
    })

    it("should generate proof with automatic salt generation", async () => {
      const proof = await generateOccupancyProofWithSalt(
        1,
        75,
        "slot-123",
        50
      )

      expect(proof.outputs.isValidState).toBe(true)
      expect(proof.inputs.salt).toBeDefined()
      expect(proof.inputs.salt.length).toBeGreaterThan(0)
    })
  })

  describe("Proof Verification", () => {
    it("should verify a valid proof as true", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 75,
        rawOccupancyState: 1,
        salt: "test-salt-verify",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "xyz789",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)
      const verification = await verifyOccupancyProof(proof)

      expect(verification.valid).toBe(true)
      expect(verification.error).toBeUndefined()
    })

    it("should verify an invalid proof as false", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 30,
        rawOccupancyState: 1,
        salt: "test-salt-invalid",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "stu012",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)
      const verification = await verifyOccupancyProof(proof)

      expect(verification.valid).toBe(false)
    })

    it("should detect tampered commitment", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 75,
        rawOccupancyState: 1,
        salt: "test-salt-tamper",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "vwx345",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      // Tamper with the commitment
      proof.outputs.occupancyCommitment = "tampered-commitment"

      const verification = await verifyOccupancyProof(proof)

      expect(verification.valid).toBe(false)
      expect(verification.error).toBe("Commitment mismatch")
    })

    it("should detect tampered confidence check", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 75,
        rawOccupancyState: 1,
        salt: "test-salt-tamper2",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "yza678",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      // Tamper with the validity state
      proof.outputs.isValidState = false

      const verification = await verifyOccupancyProof(proof)

      expect(verification.valid).toBe(false)
      expect(verification.error).toBe("Confidence check failed")
    })
  })

  describe("Edge Cases", () => {
    it("should handle confidence at threshold boundary (exactly threshold)", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 50,
        rawOccupancyState: 1,
        salt: "test-salt-boundary",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "bcd012",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      expect(proof.outputs.isValidState).toBe(true)
    })

    it("should handle confidence just below threshold", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 49,
        rawOccupancyState: 1,
        salt: "test-salt-below",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "efg345",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      expect(proof.outputs.isValidState).toBe(false)
    })

    it("should handle minimum confidence (0)", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 0,
        rawOccupancyState: 1,
        salt: "test-salt-min",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "hij678",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      expect(proof.outputs.isValidState).toBe(false)
    })

    it("should handle maximum confidence (100)", async () => {
      const privateInputs: ZKProofInputs = {
        sensorConfidence: 100,
        rawOccupancyState: 1,
        salt: "test-salt-max",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "klm901",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      expect(proof.outputs.isValidState).toBe(true)
    })

    it("should handle different salt values for same inputs", async () => {
      const privateInputs1: ZKProofInputs = {
        sensorConfidence: 75,
        rawOccupancyState: 1,
        salt: "salt-1",
      }

      const privateInputs2: ZKProofInputs = {
        sensorConfidence: 75,
        rawOccupancyState: 1,
        salt: "salt-2",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "nop234",
        minConfidenceThreshold: 50,
      }

      const proof1 = await generateOccupancyProof(privateInputs1, publicInputs)
      const proof2 = await generateOccupancyProof(privateInputs2, publicInputs)

      // Different salts should produce different commitments
      expect(proof1.outputs.occupancyCommitment).not.toBe(proof2.outputs.occupancyCommitment)
    })
  })

  describe("Proof Persistence", () => {
    it("should persist valid proof to database", async () => {
      const { PrismaClient } = require("@prisma/client")
      const prisma = new PrismaClient()

      // @ts-ignore
      prisma.auditLog.create.mockResolvedValue({ id: "audit-1" })

      const privateInputs: ZKProofInputs = {
        sensorConfidence: 75,
        rawOccupancyState: 1,
        salt: "test-salt-persist",
      }

      const publicInputs: ZKProofPublicInputs = {
        slotIdHash: "qrs567",
        minConfidenceThreshold: 50,
      }

      const proof = await generateOccupancyProof(privateInputs, publicInputs)

      // Import and call persistZKProof
      const { persistZKProof } = require("@/lib/crypto/zk-proof")
      await persistZKProof("slot-123", proof)

      // @ts-ignore
      expect(prisma.auditLog.create).toHaveBeenCalled()
    })
  })
})
import { ethers } from "ethers"

// Contract ABI (simplified for key methods)
const ESCROW_ABI = [
  "function depositHold(bytes32 bookingId) external payable",
  "function confirmEntry(bytes32 bookingId) external",
  "function releasePayment(bytes32 bookingId) external",
  "function refundOvercharge(bytes32 bookingId, uint256 refundAmount) external",
  "function cancelHold(bytes32 bookingId) external",
  "function getHold(bytes32 bookingId) external view returns (address customer, uint256 amount, uint256 createdAt, bool isActive, bool entryConfirmed, bool paymentReleased)",
  "event HoldDeposited(bytes32 indexed bookingId, address indexed customer, uint256 amount)",
  "event EntryConfirmed(bytes32 indexed bookingId)",
  "event PaymentReleased(bytes32 indexed bookingId, uint256 amount)",
  "event OverchargeRefunded(bytes32 indexed bookingId, uint256 refundAmount)",
]

interface DepositHoldParams {
  bookingId: string
  amount: string // In wei
}

interface ConfirmEntryParams {
  bookingId: string
}

interface ReleasePaymentParams {
  bookingId: string
}

interface RefundOverchargeParams {
  bookingId: string
  refundAmount: string // In wei
}

interface HoldDetails {
  customer: string
  amount: bigint
  createdAt: bigint
  isActive: boolean
  entryConfirmed: boolean
  paymentReleased: boolean
}

/**
 * Web3 Escrow Client
 * Manages Polygon smart contract interactions for booking escrow
 */
class EscrowClient {
  private provider: ethers.JsonRpcProvider | null = null
  private wallet: ethers.Wallet | null = null
  private contract: ethers.Contract | null = null
  private contractAddress: string
  private chainId: number

  constructor(contractAddress: string, chainId: number = 80002) {
    // Polygon Amoy Testnet chain ID
    this.contractAddress = contractAddress
    this.chainId = chainId
  }

  /**
   * Initialize the client with provider and wallet
   */
  async initialize(): Promise<void> {
    try {
      // Use Polygon Amoy Testnet RPC
      const rpcUrl = process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology"
      this.provider = new ethers.JsonRpcProvider(rpcUrl)

      // Create wallet from private key
      const privateKey = process.env.OPERATOR_PRIVATE_KEY
      if (!privateKey) {
        console.warn("[ESCROW_CLIENT] No private key provided, read-only mode")
        return
      }

      this.wallet = new ethers.Wallet(privateKey, this.provider)

      // Create contract instance
      this.contract = new ethers.Contract(
        this.contractAddress,
        ESCROW_ABI,
        this.wallet
      )

      console.log("[ESCROW_CLIENT] Initialized successfully")
    } catch (error) {
      console.error("[ESCROW_CLIENT] Initialization failed:", error)
      throw error
    }
  }

  /**
   * Deposit hold for booking
   */
  async depositHold(params: DepositHoldParams): Promise<string> {
    if (!this.contract || !this.wallet) {
      throw new Error("Client not initialized with wallet")
    }

    try {
      const bookingIdBytes32 = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(params.bookingId)))
      
      const tx = await this.contract.depositHold(bookingIdBytes32, {
        value: params.amount,
      })

      console.log(`[ESCROW_CLIENT] Deposit hold tx: ${tx.hash}`)

      // Wait for transaction receipt
      const receipt = await tx.wait()

      if (!receipt) {
        throw new Error("Transaction receipt not found")
      }

      console.log(`[ESCROW_CLIENT] Deposit confirmed in block ${receipt.blockNumber}`)

      return tx.hash
    } catch (error: any) {
      console.error("[ESCROW_CLIENT] Deposit hold failed:", error)
      throw new Error(`Deposit failed: ${error.message}`)
    }
  }

  /**
   * Confirm vehicle entry
   */
  async confirmEntry(params: ConfirmEntryParams): Promise<string> {
    if (!this.contract || !this.wallet) {
      throw new Error("Client not initialized with wallet")
    }

    try {
      const bookingIdBytes32 = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(params.bookingId)))
      
      const tx = await this.contract.confirmEntry(bookingIdBytes32)

      console.log(`[ESCROW_CLIENT] Confirm entry tx: ${tx.hash}`)

      const receipt = await tx.wait()

      if (!receipt) {
        throw new Error("Transaction receipt not found")
      }

      console.log(`[ESCROW_CLIENT] Entry confirmed in block ${receipt.blockNumber}`)

      return tx.hash
    } catch (error: any) {
      console.error("[ESCROW_CLIENT] Confirm entry failed:", error)
      throw new Error(`Confirm entry failed: ${error.message}`)
    }
  }

  /**
   * Release payment upon exit
   */
  async releasePayment(params: ReleasePaymentParams): Promise<string> {
    if (!this.contract || !this.wallet) {
      throw new Error("Client not initialized with wallet")
    }

    try {
      const bookingIdBytes32 = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(params.bookingId)))
      
      const tx = await this.contract.releasePayment(bookingIdBytes32)

      console.log(`[ESCROW_CLIENT] Release payment tx: ${tx.hash}`)

      const receipt = await tx.wait()

      if (!receipt) {
        throw new Error("Transaction receipt not found")
      }

      console.log(`[ESCROW_CLIENT] Payment released in block ${receipt.blockNumber}`)

      return tx.hash
    } catch (error: any) {
      console.error("[ESCROW_CLIENT] Release payment failed:", error)
      throw new Error(`Release payment failed: ${error.message}`)
    }
  }

  /**
   * Refund overcharge to customer
   */
  async refundOvercharge(params: RefundOverchargeParams): Promise<string> {
    if (!this.contract || !this.wallet) {
      throw new Error("Client not initialized with wallet")
    }

    try {
      const bookingIdBytes32 = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(params.bookingId)))
      
      const tx = await this.contract.refundOvercharge(
        bookingIdBytes32,
        params.refundAmount
      )

      console.log(`[ESCROW_CLIENT] Refund overcharge tx: ${tx.hash}`)

      const receipt = await tx.wait()

      if (!receipt) {
        throw new Error("Transaction receipt not found")
      }

      console.log(`[ESCROW_CLIENT] Refund completed in block ${receipt.blockNumber}`)

      return tx.hash
    } catch (error: any) {
      console.error("[ESCROW_CLIENT] Refund overcharge failed:", error)
      throw new Error(`Refund failed: ${error.message}`)
    }
  }

  /**
   * Cancel hold and refund customer
   */
  async cancelHold(bookingId: string): Promise<string> {
    if (!this.contract || !this.wallet) {
      throw new Error("Client not initialized with wallet")
    }

    try {
      const bookingIdBytes32 = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(bookingId)))
      
      const tx = await this.contract.cancelHold(bookingIdBytes32)

      console.log(`[ESCROW_CLIENT] Cancel hold tx: ${tx.hash}`)

      const receipt = await tx.wait()

      if (!receipt) {
        throw new Error("Transaction receipt not found")
      }

      console.log(`[ESCROW_CLIENT] Hold cancelled in block ${receipt.blockNumber}`)

      return tx.hash
    } catch (error: any) {
      console.error("[ESCROW_CLIENT] Cancel hold failed:", error)
      throw new Error(`Cancel hold failed: ${error.message}`)
    }
  }

  /**
   * Get hold details
   */
  async getHold(bookingId: string): Promise<HoldDetails | null> {
    if (!this.contract) {
      throw new Error("Client not initialized")
    }

    try {
      const bookingIdBytes32 = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(bookingId)))
      
      const details = await this.contract.getHold(bookingIdBytes32)

      return {
        customer: details[0],
        amount: details[1],
        createdAt: details[2],
        isActive: details[3],
        entryConfirmed: details[4],
        paymentReleased: details[5],
      }
    } catch (error: any) {
      console.error("[ESCROW_CLIENT] Get hold failed:", error)
      return null
    }
  }

  /**
   * Estimate gas for transaction
   */
  async estimateGas(methodName: string, params: any[]): Promise<bigint> {
    if (!this.contract) {
      throw new Error("Client not initialized")
    }

    try {
      const gasEstimate = await this.contract[methodName].estimateGas(...params)
      return gasEstimate
    } catch (error: any) {
      console.error(`[ESCROW_CLIENT] Gas estimation failed for ${methodName}:`, error)
      throw new Error(`Gas estimation failed: ${error.message}`)
    }
  }

  /**
   * Get contract address
   */
  getContractAddress(): string {
    return this.contractAddress
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.contract !== null
  }
}

// Singleton instance (for mainnet/testnet specific addresses)
let escrowClient: EscrowClient | null = null

/**
 * Get or create escrow client
 */
export function getEscrowClient(contractAddress?: string): EscrowClient {
  if (!escrowClient) {
    const address = contractAddress || process.env.ESCROW_CONTRACT_ADDRESS || ""
    escrowClient = new EscrowClient(address)
  }
  return escrowClient
}

/**
 * Initialize escrow client
 */
export async function initializeEscrowClient(contractAddress?: string): Promise<void> {
  const client = getEscrowClient(contractAddress)
  await client.initialize()
}

export { EscrowClient }
export type { DepositHoldParams, ConfirmEntryParams, ReleasePaymentParams, RefundOverchargeParams, HoldDetails }
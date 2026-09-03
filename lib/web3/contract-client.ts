/**
 * Web3 Contract Client Wrapper
 * Ethers.js client for Polygon smart contract interaction
 * Handles transaction signing, gas estimation, and contract state queries
 */

import { ethers, Contract, Wallet, Provider, Signer } from "ethers"

export interface BookingReceipt {
  bookingId: bigint
  slotId: string
  userAddress: string
  amountPaid: bigint
  startTime: bigint
  endTime: bigint
  verified: boolean
  refunded: boolean
  createdAt: bigint
}

export interface BookingResult {
  success: boolean
  bookingId?: bigint
  txHash?: string
  blockNumber?: bigint
  error?: string
}

export interface CheckInResult {
  success: boolean
  txHash?: string
  blockNumber?: bigint
  error?: string
}

export interface RefundResult {
  success: boolean
  txHash?: string
  blockNumber?: bigint
  refundAmount?: bigint
  error?: string
}

export interface ContractConfig {
  contractAddress: string
  rpcUrl: string
  privateKey?: string
  polygonScanApiKey?: string
}

// Contract ABI (extracted from ParkingBooking.sol)
const CONTRACT_ABI = [
  // Read functions
  "function owner() view returns (address)",
  "function bookingCounter() view returns (uint256)",
  "function hourlyRate() view returns (uint256)",
  "function authorizedDevices(address) view returns (bool)",
  "function authorizedOperators(address) view returns (bool)",
  "function bookings(uint256) view returns (uint256 bookingId, string slotId, address userAddress, uint256 amountPaid, uint256 startTime, uint256 endTime, bool verified, bool refunded, uint256 createdAt)",
  "function userBookings(address) view returns (uint256[])",
  "function slotBookings(string) view returns (uint256)",
  "function getBooking(uint256) view returns (uint256 id, string slotId, address user, uint256 amount, uint256 startTime, uint256 endTime, bool verified, bool refunded, uint256 createdAt)",
  "function getContractBalance() view returns (uint256)",
  "function getTotalBookings() view returns (uint256)",
  
  // Write functions
  "function createBooking(string slotId, uint256 startTime, uint256 endTime) payable",
  "function confirmCheckIn(uint256 bookingId, string verificationHash)",
  "function refundBooking(uint256 bookingId)",
  "function setHourlyRate(uint256 newRate)",
  "function setDeviceAuthorization(address device, bool authorized)",
  "function setOperatorAuthorization(address operator, bool authorized)",
  "function withdraw()",
  "function transferOwnership(address newOwner)",
  
  // Events
  "event BookingCreated(uint256 indexed bookingId, address indexed user, string slotId, uint256 amount, uint256 startTime, uint256 endTime)",
  "event CheckInConfirmed(uint256 indexed bookingId, string verificationHash, uint256 timestamp)",
  "event BookingRefunded(uint256 indexed bookingId, address indexed user, uint256 refundAmount, uint256 timestamp)",
]

/**
 * Web3 Contract Client
 * Handles all Polygon smart contract interactions
 */
class ParkingBookingClient {
  private contract: Contract
  private provider: Provider
  private signer: Signer | null
  private contractAddress: string
  private polygonScanApiKey?: string

  constructor(config: ContractConfig) {
    this.contractAddress = config.contractAddress
    this.polygonScanApiKey = config.polygonScanApiKey
    
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl)
    
    // Initialize signer if private key provided
    this.signer = config.privateKey
      ? new Wallet(config.privateKey, this.provider)
      : null
    
    // Initialize contract
    this.contract = new Contract(
      this.contractAddress,
      CONTRACT_ABI,
      this.signer || this.provider
    )
  }

  /**
   * Create a new booking with MATIC payment
   */
  async createBooking(
    slotId: string,
    startTime: number,
    endTime: number,
    amountInMatic: number
  ): Promise<BookingResult> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: "No signer configured - private key required for transactions",
        }
      }

      // Convert MATIC to wei
      const amountInWei = ethers.parseEther(amountInMatic.toString())

      // Estimate gas
      const gasEstimate = await this.contract.createBooking.estimateGas(
        slotId,
        startTime,
        endTime,
        { value: amountInWei }
      )

      // Execute transaction
      const tx = await this.contract.createBooking(
        slotId,
        startTime,
        endTime,
        { value: amountInWei, gasLimit: gasEstimate * 120n / 100n } // 20% buffer
      )

      // Wait for confirmation
      const receipt = await tx.wait()

      // Extract booking ID from event logs
      const bookingId = this.extractBookingIdFromReceipt(receipt)

      return {
        success: true,
        bookingId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      }
    } catch (error: any) {
      console.error("Create booking error:", error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Confirm check-in with verification hash
   */
  async confirmCheckIn(
    bookingId: number,
    verificationHash: string
  ): Promise<CheckInResult> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: "No signer configured - private key required for transactions",
        }
      }

      // Estimate gas
      const gasEstimate = await this.contract.confirmCheckIn.estimateGas(
        bookingId,
        verificationHash
      )

      // Execute transaction
      const tx = await this.contract.confirmCheckIn(
        bookingId,
        verificationHash,
        { gasLimit: gasEstimate * 120n / 100n }
      )

      // Wait for confirmation
      const receipt = await tx.wait()

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      }
    } catch (error: any) {
      console.error("Confirm check-in error:", error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Refund booking
   */
  async refundBooking(bookingId: number): Promise<RefundResult> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: "No signer configured - private key required for transactions",
        }
      }

      // Get refund amount first
      const booking = await this.getBooking(bookingId)
      if (!booking) {
        return {
          success: false,
          error: "Booking not found",
        }
      }

      // Estimate gas
      const gasEstimate = await this.contract.refundBooking.estimateGas(bookingId)

      // Execute transaction
      const tx = await this.contract.refundBooking(bookingId, {
        gasLimit: gasEstimate * 120n / 100n,
      })

      // Wait for confirmation
      const receipt = await tx.wait()

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        refundAmount: booking.amountPaid,
      }
    } catch (error: any) {
      console.error("Refund booking error:", error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Get booking details (read-only, no gas)
   */
  async getBooking(bookingId: number): Promise<BookingReceipt | null> {
    try {
      const booking = await this.contract.getBooking(bookingId)
      
      return {
        bookingId: booking[0],
        slotId: booking[1],
        userAddress: booking[2],
        amountPaid: booking[3],
        startTime: booking[4],
        endTime: booking[5],
        verified: booking[6],
        refunded: booking[7],
        createdAt: booking[8],
      }
    } catch (error: any) {
      console.error("Get booking error:", error)
      return null
    }
  }

  /**
   * Get all bookings for a user (read-only)
   */
  async getUserBookings(userAddress: string): Promise<bigint[]> {
    try {
      const bookingIds = await this.contract.userBookings(userAddress)
      return bookingIds
    } catch (error: any) {
      console.error("Get user bookings error:", error)
      return []
    }
  }

  /**
   * Get active booking for a slot (read-only)
   */
  async getSlotBooking(slotId: string): Promise<bigint> {
    try {
      const bookingId = await this.contract.slotBookings(slotId)
      return bookingId
    } catch (error: any) {
      console.error("Get slot booking error:", error)
      return 0n
    }
  }

  /**
   * Get contract statistics (read-only)
   */
  async getContractStats() {
    try {
      const [owner, bookingCounter, hourlyRate, contractBalance, totalBookings] =
        await Promise.all([
          this.contract.owner(),
          this.contract.bookingCounter(),
          this.contract.hourlyRate(),
          this.contract.getContractBalance(),
          this.contract.getTotalBookings(),
        ])

      return {
        owner,
        bookingCounter,
        hourlyRate,
        contractBalance,
        totalBookings,
      }
    } catch (error: any) {
      console.error("Get contract stats error:", error)
      return null
    }
  }

  /**
   * Calculate verification hash (off-chain)
   */
  calculateVerificationHash(
    slotId: string,
    timestamp: number,
    additionalData: string = ""
  ): string {
    const hash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "uint256", "string"],
        [slotId, timestamp, additionalData]
      )
    )
    return hash
  }

  /**
   * Extract booking ID from transaction receipt
   */
  private extractBookingIdFromReceipt(receipt: any): bigint {
    for (const log of receipt.logs) {
      try {
        // Parse the log using the contract interface
        const parsed = this.contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        })
        if (parsed && parsed.name === "BookingCreated") {
          return parsed.args.bookingId
        }
      } catch (e) {
        // Log not related to our contract
      }
    }
    return 0n
  }

  /**
   * Get PolygonScan URL for transaction
   */
  async getPolygonScanUrl(txHash: string): Promise<string> {
    const network = await this.provider.getNetwork()
    const chainId = Number(network.chainId)
    
    // Polygon mainnet: 137, Amoy testnet: 80002
    const subdomain = chainId === 137 ? "polygonscan" : "amoy.polygonscan"
    return `https://${subdomain}.com/tx/${txHash}`
  }

  /**
   * Get current hourly rate
   */
  async getHourlyRate(): Promise<bigint> {
    try {
      return await this.contract.hourlyRate()
    } catch (error: any) {
      console.error("Get hourly rate error:", error)
      return 0n
    }
  }

  /**
   * Check if address is authorized device
   */
  async isAuthorizedDevice(address: string): Promise<boolean> {
    try {
      return await this.contract.authorizedDevices(address)
    } catch (error: any) {
      console.error("Check device authorization error:", error)
      return false
    }
  }

  /**
   * Check if address is authorized operator
   */
  async isAuthorizedOperator(address: string): Promise<boolean> {
    try {
      return await this.contract.authorizedOperators(address)
    } catch (error: any) {
      console.error("Check operator authorization error:", error)
      return false
    }
  }

  /**
   * Get signer address
   */
  async getSignerAddress(): Promise<string | null> {
    return this.signer ? await this.signer.getAddress() : null
  }

  /**
   * Switch to a different signer
   */
  setSigner(privateKey: string): void {
    this.signer = new Wallet(privateKey, this.provider)
    this.contract = new Contract(
      this.contractAddress,
      CONTRACT_ABI,
      this.signer
    )
  }

  /**
   * Get contract address
   */
  getContractAddress(): string {
    return this.contractAddress
  }
}

// Singleton instance
let parkingBookingClient: ParkingBookingClient | null = null

/**
 * Get or create parking booking client instance
 */
export function getParkingBookingClient(config: ContractConfig): ParkingBookingClient {
  if (!parkingBookingClient) {
    parkingBookingClient = new ParkingBookingClient(config)
  }
  return parkingBookingClient
}

/**
 * Reset parking booking client instance
 */
export function resetParkingBookingClient(): void {
  parkingBookingClient = null
}

export { ParkingBookingClient }
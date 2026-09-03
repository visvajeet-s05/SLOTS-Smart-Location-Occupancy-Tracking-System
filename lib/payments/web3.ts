import { createPublicClient, parseAbiItem, formatUnits, isAddress } from "viem"
import { polygon, polygonAmoy } from "viem/chains"

// USDC Contract ABI (Transfer event)
const USDC_ABI = [
  parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
]

// USDC Contract Addresses
const USDC_POLYGON_MAINNET = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
const USDC_POLYGON_AMOY = "0x001B3B4233685AdD18d994F435f672e92Db347882"

// Platform wallet address (replace with actual platform wallet)
const PLATFORM_WALLET_ADDRESS = process.env.PLATFORM_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"

/**
 * Verify Polygon USDC transaction
 */
export async function verifyPolygonUSDCTransaction({
  txHash,
  expectedAmount,
  userWalletAddress,
  isTestnet = false,
}: {
  txHash: string
  expectedAmount: number
  userWalletAddress: string
  isTestnet?: boolean
}) {
  try {
    // Validate inputs
    if (!txHash || !userWalletAddress || !expectedAmount) {
      throw new Error("Missing required parameters")
    }

    if (!isAddress(userWalletAddress)) {
      throw new Error("Invalid wallet address")
    }

    // Select chain based on environment
    const chain = isTestnet ? polygonAmoy : polygon
    const usdcAddress = isTestnet ? USDC_POLYGON_AMOY : USDC_POLYGON_MAINNET

    // Create public client
    const client = createPublicClient({
      chain,
      transport: isTestnet
        ? // Use public RPC for testnet
          "https://rpc-amoy.polygon.technology"
        : // Use public RPC for mainnet
          "https://polygon-rpc.com",
    })

    // Get transaction receipt
    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    })

    if (!receipt) {
      throw new Error("Transaction not found")
    }

    // Check transaction status
    if (receipt.status !== "success") {
      throw new Error("Transaction failed")
    }

    // Get transaction details
    const tx = await client.getTransaction({
      hash: txHash as `0x${string}`,
    })

    // Verify transaction is to USDC contract
    if (tx.to.toLowerCase() !== usdcAddress.toLowerCase()) {
      throw new Error("Transaction is not a USDC transfer")
    }

    // Get block to check confirmations
    const currentBlock = await client.getBlockNumber()
    const confirmations = Number(currentBlock) - Number(receipt.blockNumber)

    if (confirmations < 2) {
      throw new Error("Insufficient block confirmations")
    }

    // Parse logs to find Transfer event
    const transferLogs = receipt.logs.filter(
      (log: any) => log.address.toLowerCase() === usdcAddress.toLowerCase()
    )

    if (transferLogs.length === 0) {
      throw new Error("No USDC transfer event found")
    }

    // Decode Transfer event
    let transferAmount = BigInt(0)
    let fromAddress: string | null = null
    let toAddress: string | null = null

    for (const log of transferLogs) {
      try {
        const decoded = client.decodeEventLog({
          abi: USDC_ABI,
          eventName: "Transfer",
          topics: log.topics as any,
          data: log.data,
        })

        if (decoded) {
          fromAddress = decoded.args.from
          toAddress = decoded.args.to
          transferAmount = decoded.args.value

          // Verify recipient is platform wallet
          if (!toAddress || toAddress.toLowerCase() !== PLATFORM_WALLET_ADDRESS.toLowerCase()) {
            throw new Error("Transfer is not to platform wallet")
          }

          // Verify sender is user wallet
          if (!fromAddress || fromAddress.toLowerCase() !== userWalletAddress.toLowerCase()) {
            throw new Error("Transfer is not from user wallet")
          }

          // Verify amount (USDC has 6 decimals)
          const amountInUSDC = Number(formatUnits(transferAmount, 6))
          const tolerance = 0.01 // 1% tolerance

          if (Math.abs(amountInUSDC - expectedAmount) > expectedAmount * tolerance) {
            throw new Error(
              `Amount mismatch: expected ${expectedAmount}, received ${amountInUSDC}`
            )
          }

          // All checks passed
          return {
            valid: true,
            amount: amountInUSDC,
            from: fromAddress,
            to: toAddress,
            confirmations,
            blockNumber: receipt.blockNumber,
            transactionHash: txHash,
          }
        }
      } catch (error) {
        console.error("Error decoding log:", error)
        continue
      }
    }

    throw new Error("Could not verify transfer details")
  } catch (error: any) {
    console.error("Polygon USDC verification error:", error)
    throw new Error(error.message || "Transaction verification failed")
  }
}

/**
 * Get USDC balance for an address
 */
export async function getUSDCBalance(
  walletAddress: string,
  isTestnet = false
): Promise<number> {
  try {
    if (!isAddress(walletAddress)) {
      throw new Error("Invalid wallet address")
    }

    const chain = isTestnet ? polygonAmoy : polygon
    const usdcAddress = isTestnet ? USDC_POLYGON_AMOY : USDC_POLYGON_MAINNET

    const client = createPublicClient({
      chain,
      transport: isTestnet
        ? "https://rpc-amoy.polygon.technology"
        : "https://polygon-rpc.com",
    })

    const balance = await client.readContract({
      address: usdcAddress,
      abi: [
        {
          constant: true,
          inputs: [{ name: "_owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "balance", type: "uint256" }],
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    })

    return Number(formatUnits(balance as bigint, 6))
  } catch (error) {
    console.error("Error getting USDC balance:", error)
    throw new Error("Failed to get USDC balance")
  }
}
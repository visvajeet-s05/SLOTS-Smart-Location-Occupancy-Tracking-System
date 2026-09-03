import { PrismaClient } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit"

const prisma = new PrismaClient()

/**
 * VLM API Configuration
 * Supports OpenAI GPT-4o-mini or local Ollama
 */
interface VLMConfig {
  provider: "openai" | "ollama" | "mock"
  endpoint: string
  apiKey?: string
  model: string
}

function getVLMConfig(): VLMConfig {
  const provider = (process.env.VLM_PROVIDER || "ollama") as "openai" | "ollama" | "mock"
  
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[VLM] OpenAI provider selected but OPENAI_API_KEY not set, falling back to mock")
      return { provider: "mock", endpoint: "", model: "" }
    }
    return {
      provider: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    }
  } else if (provider === "ollama") {
    return {
      provider: "ollama",
      endpoint: process.env.OLLAMA_ENDPOINT || "http://localhost:11434/api/generate",
      model: process.env.OLLAMA_MODEL || "llava:latest",
    }
  } else {
    return { provider: "mock", endpoint: "", model: "" }
  }
}

interface VlmTask {
  id: string
  frameBuffer: Buffer
  bbox: { x: number; y: number; width: number; height: number }
  currentConfidence: number
  cameraId: string
  siteId: string
  timestamp: number
  createdAt: Date
}

interface VlmResult {
  licensePlateNumber: string
  vehicleType: "2-wheeler" | "3-wheeler" | "4-wheeler" | "EV"
  confidenceScore: number
  tamperFlags: string[]
}

interface VlmFallbackResponse {
  success: boolean
  plateNumber?: string
  confidence?: number
  vehicleType?: string
  tamperFlags?: string[]
  message: string
}

/**
 * VLM Fallback Circuit
 * Handles low-confidence ANPR results by routing to Vision-Language Model
 */
class VlmTaskQueue {
  private queue: Map<string, VlmTask> = new Map()
  private processing: Set<string> = new Set()
  private readonly MAX_QUEUE_SIZE = 100
  private readonly CONCURRENCY_LIMIT = 3
  private readonly CONFIDENCE_MIN = 0.15
  private readonly CONFIDENCE_MAX = 0.40

  /**
   * Add task to queue
   */
  enqueue(task: VlmTask): boolean {
    if (this.queue.size >= this.MAX_QUEUE_SIZE) {
      console.warn("[VLM_QUEUE] Queue full, dropping task:", task.id)
      return false
    }

    this.queue.set(task.id, task)
    console.log(`[VLM_QUEUE] Enqueued task ${task.id} (queue size: ${this.queue.size})`)
    return true
  }

  /**
   * Process next task in queue
   */
  private async processNext(): Promise<void> {
    if (this.processing.size >= this.CONCURRENCY_LIMIT) {
      return
    }

    const entries = Array.from(this.queue.entries())
    if (entries.length === 0) {
      return
    }

    const [taskId, task] = entries[0]
    this.queue.delete(taskId)
    this.processing.add(taskId)

    try {
      await this.processVlmTask(task)
    } catch (error) {
      console.error(`[VLM_QUEUE] Error processing task ${taskId}:`, error)
    } finally {
      this.processing.delete(taskId)
      // Process next task
      this.processNext()
    }
  }

  /**
   * Process VLM task
   */
  private async processVlmTask(task: VlmTask): Promise<void> {
    console.log(`[VLM_QUEUE] Processing task ${task.id}`)

    const result = await this.callVlmApi(task)

    if (result.success && result.plateNumber) {
      // Update booking or trigger gate actuation
      await this.handleVlmResult(task, result)
    }

    // Log VLM resolution event
    await logAuditEvent({
      userId: "SYSTEM",
      action: "VLM_FALLBACK_RESOLVED",
      resource: `Camera:${task.cameraId}`,
      ipAddress: "vision-pipeline",
      userAgent: "vlm-fallback",
      details: {
        taskId: task.id,
        originalConfidence: task.currentConfidence,
        resolvedPlate: result.plateNumber,
        vlmConfidence: result.confidence,
        vehicleType: result.vehicleType,
        tamperFlags: result.tamperFlags,
      },
    })
  }

  /**
   * Call VLM API (GPT-4o-mini or local Ollama)
   */
  private async callVlmApi(task: VlmTask): Promise<VlmFallbackResponse> {
    const startTime = Date.now()
    const config = getVLMConfig()
    
    try {
      // Crop the bounding box from the frame
      const croppedImage = this.cropBoundingBox(task.frameBuffer, task.bbox)
      const base64Image = croppedImage.toString("base64")

      // Prepare VLM prompt
      const prompt = `
        Analyze this license plate image and provide the following information in JSON format:
        {
          "license_plate_number": "string (Indian format: XX00XX0000)",
          "vehicle_type": "2-wheeler" | "3-wheeler" | "4-wheeler" | "EV",
          "confidence_score": number between 0 and 1,
          "tamper_flags": ["array of potential tampering indicators"]
        }
        
        Focus on:
        1. Extract the license plate number accurately
        2. Identify vehicle type
        3. Assess confidence level
        4. Detect any signs of tampering (spray, cover, damage)
        
        Return ONLY valid JSON, no additional text.
      `

      let result: VlmResult

      if (config.provider === "openai") {
        console.log(`[VLM_API] Calling OpenAI GPT-4o-mini for task ${task.id}`)
        result = await this.callOpenAI(config, prompt, base64Image)
      } else if (config.provider === "ollama") {
        console.log(`[VLM_API] Calling Ollama ${config.model} for task ${task.id}`)
        result = await this.callOllama(config, prompt, base64Image)
      } else {
        console.log(`[VLM_API] Using mock mode for task ${task.id}`)
        result = this.simulatePlateExtraction(task.cameraId)
      }

      const processingTime = Date.now() - startTime
      console.log(`[VLM_API] Task ${task.id} processed in ${processingTime}ms - Result: ${result.licensePlateNumber} (confidence: ${result.confidenceScore})`)

      return {
        success: true,
        plateNumber: result.licensePlateNumber,
        confidence: result.confidenceScore,
        vehicleType: result.vehicleType,
        tamperFlags: result.tamperFlags,
        message: "VLM resolution successful",
      }
    } catch (error: any) {
      const processingTime = Date.now() - startTime
      console.error(`[VLM_API] Error calling VLM API for task ${task.id} after ${processingTime}ms:`, error)
      return {
        success: false,
        message: error.message || "VLM API call failed",
      }
    }
  }

  /**
   * Call OpenAI GPT-4o-mini Vision API
   */
  private async callOpenAI(config: VLMConfig, prompt: string, base64Image: string): Promise<VlmResult> {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const content = data.choices[0].message.content
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error("Failed to parse JSON from OpenAI response")
    }

    const parsed = JSON.parse(jsonMatch[0])
    
    return {
      licensePlateNumber: parsed.license_plate_number || "UNKNOWN",
      vehicleType: parsed.vehicle_type || "4-wheeler",
      confidenceScore: parsed.confidence_score || 0.5,
      tamperFlags: parsed.tamper_flags || [],
    }
  }

  /**
   * Call Ollama Vision API
   */
  private async callOllama(config: VLMConfig, prompt: string, base64Image: string): Promise<VlmResult> {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        prompt: prompt,
        images: [base64Image],
        stream: false,
        format: "json",
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    // Parse JSON response from Ollama
    let parsed: any
    try {
      parsed = JSON.parse(data.response)
    } catch {
      // If Ollama returns plain text, try to extract JSON
      const jsonMatch = data.response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error("Failed to parse JSON from Ollama response")
      }
    }
    
    return {
      licensePlateNumber: parsed.license_plate_number || "UNKNOWN",
      vehicleType: parsed.vehicle_type || "4-wheeler",
      confidenceScore: parsed.confidence_score || 0.5,
      tamperFlags: parsed.tamper_flags || [],
    }
  }

  /**
   * Simulate plate extraction (fallback when no API is configured)
   */
  private simulatePlateExtraction(cameraId: string): VlmResult {
    // Generate deterministic plate based on camera ID
    const hash = cameraId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const plateNumbers = ["TN01AB1234", "KA05CD5678", "MH02EF9012", "DL03GH3456"]
    return {
      licensePlateNumber: plateNumbers[hash % plateNumbers.length],
      vehicleType: "4-wheeler",
      confidenceScore: 0.92,
      tamperFlags: [],
    }
  }

  /**
   * Crop bounding box from frame
   */
  private cropBoundingBox(frame: Buffer, bbox: { x: number; y: number; width: number; height: number }): Buffer {
    // In production, this would use image processing library (sharp, jimp)
    // For now, return the full frame as a placeholder
    return frame
  }

  /**
   * Handle VLM result
   */
  private async handleVlmResult(task: VlmTask, result: VlmFallbackResponse): Promise<void> {
    if (!result.plateNumber || !result.confidence || result.confidence < 0.85) {
      console.log(`[VLM_QUEUE] Low confidence result for task ${task.id}, skipping`)
      return
    }

    // Check for active booking
    const activeBooking = await prisma.booking.findFirst({
      where: {
        vehicleNumber: result.plateNumber,
        status: {
          in: ["CONFIRMED", "ACTIVE"],
        },
        startTime: { lte: new Date() },
        endTime: { gte: new Date() },
      },
    })

    if (activeBooking && result.confidence >= 0.85) {
      // Trigger gate actuation
      const { triggerBarrierOpen } = await import("@/lib/hardware/gate-controller")
      await triggerBarrierOpen({
        siteId: task.siteId,
        gateId: task.cameraId,
        triggerReason: "ALPR",
        vehicleNumber: result.plateNumber,
      })

      console.log(`[VLM_QUEUE] Gate triggered for plate ${result.plateNumber}`)
    }
  }

  /**
   * Start queue processor
   */
  start(): void {
    console.log("[VLM_QUEUE] Starting queue processor")
    setInterval(() => {
      this.processNext()
    }, 1000) // Process every second
  }

  /**
   * Get queue status
   */
  getStatus(): { queueSize: number; processing: number } {
    return {
      queueSize: this.queue.size,
      processing: this.processing.size,
    }
  }
}

// Singleton instance
const vlmQueue = new VlmTaskQueue()

/**
 * Trigger VLM fallback for low-confidence frames
 */
export async function triggerVlmFallback({
  frameBuffer,
  bbox,
  currentConfidence,
  cameraId,
  siteId,
}: {
  frameBuffer: Buffer
  bbox: { x: number; y: number; width: number; height: number }
  currentConfidence: number
  cameraId: string
  siteId: string
}): Promise<{ enqueued: boolean; taskId?: string }> {
  const CONFIDENCE_MIN = 0.15
  const CONFIDENCE_MAX = 0.40

  // Check if confidence is in fallback range
  if (currentConfidence < CONFIDENCE_MIN || currentConfidence > CONFIDENCE_MAX) {
    return {
      enqueued: false,
    }
  }

  const taskId = `vlm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  const task: VlmTask = {
    id: taskId,
    frameBuffer,
    bbox,
    currentConfidence,
    cameraId,
    siteId,
    timestamp: Date.now(),
    createdAt: new Date(),
  }

  const enqueued = vlmQueue.enqueue(task)

  return {
    enqueued,
    taskId: enqueued ? taskId : undefined,
  }
}

/**
 * Get VLM queue status
 */
export function getVlmQueueStatus(): { queueSize: number; processing: number } {
  return vlmQueue.getStatus()
}

/**
 * Start VLM queue processor
 */
export function startVlmQueue(): void {
  vlmQueue.start()
}

export { vlmQueue }
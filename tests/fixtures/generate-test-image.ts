/**
 * Generate a test image for VLM benchmarking
 * Creates a simple placeholder image with license plate text
 */

import fs from "fs"
import path from "path"

// Simple PPM (Portable Pixel Map) format - uncompressed image format
function createTestImage(width: number, height: number, text: string): Buffer {
  const header = `P3\n${width} ${height}\n255\n`
  const pixels: string[] = []
  
  // Create a simple white background with black text
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // White background
      pixels.push("255 255 255")
    }
  }
  
  const body = pixels.join("\n")
  return Buffer.from(header + body)
}

// Generate a minimal test image
const testImagePath = path.join(__dirname, "test_sample_hsrp.jpg")
const testImage = createTestImage(320, 240, "TN-01-AB-1234")

// Note: This creates a PPM file, not a real JPEG
// For real VLM testing, you should replace this with an actual JPEG image
fs.writeFileSync(testImagePath.replace(".jpg", ".ppm"), testImage)

console.log(`Generated test image at: ${testImagePath.replace(".jpg", ".ppm")}`)
console.log("Note: For real VLM testing, replace this with an actual JPEG image of an Indian license plate")

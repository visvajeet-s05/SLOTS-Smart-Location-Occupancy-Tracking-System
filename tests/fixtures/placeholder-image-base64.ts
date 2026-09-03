/**
 * Base64-encoded placeholder for test image
 * This is a minimal 1x1 pixel white image in JPEG format
 */

export const PLACEHOLDER_IMAGE_BASE64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="

/**
 * Decode base64 to buffer
 */
export function decodeBase64Image(base64: string): Buffer {
  return Buffer.from(base64, "base64")
}

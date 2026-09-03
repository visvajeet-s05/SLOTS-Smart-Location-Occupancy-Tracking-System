/**
 * B39: Timezone Handling Utilities
 * All timestamps are stored in UTC and converted to lot timezone for display
 */

import { format, addHours, addMinutes, differenceInMinutes, differenceInHours } from 'date-fns'

export const DEFAULT_TIMEZONE = 'Asia/Kolkata' // IST
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // IST is UTC+5:30

/**
 * Convert UTC DateTime to lot's local timezone (IST by default)
 * For IST specifically, we add the offset since we don't have timezone libraries
 */
export function toLotTime(utcDate: Date | string, timezone: string = DEFAULT_TIMEZONE): Date {
  const date = new Date(utcDate)
  if (timezone === DEFAULT_TIMEZONE) {
    return new Date(date.getTime() + IST_OFFSET_MS)
  }
  // For other timezones, return UTC for now (can be extended with timezone library)
  return date
}

/**
 * Convert local time in lot timezone to UTC
 */
export function fromLotTime(localDate: Date | string, timezone: string = DEFAULT_TIMEZONE): Date {
  const date = new Date(localDate)
  if (timezone === DEFAULT_TIMEZONE) {
    return new Date(date.getTime() - IST_OFFSET_MS)
  }
  // For other timezones, return as-is for now
  return date
}

/**
 * Get current time in lot timezone
 */
export function getLotCurrentTime(timezone: string = DEFAULT_TIMEZONE): Date {
  return toLotTime(new Date(), timezone)
}

/**
 * Format DateTime for display in lot timezone
 */
export function formatInLotTime(
  utcDate: Date | string, 
  formatStr: string = 'yyyy-MM-dd HH:mm:ss',
  timezone: string = DEFAULT_TIMEZONE
): string {
  const localDate = toLotTime(utcDate, timezone)
  return format(localDate, formatStr)
}

/**
 * Check if a time is within business hours in lot timezone
 */
export function isWithinBusinessHours(
  utcDate: Date | string,
  timezone: string = DEFAULT_TIMEZONE,
  startHour: number = 6,
  endHour: number = 22
): boolean {
  const localTime = toLotTime(utcDate, timezone)
  const hour = localTime.getHours()
  return hour >= startHour && hour < endHour
}

/**
 * Add business hours to a date, skipping non-business hours
 */
export function addBusinessHours(
  utcDate: Date | string,
  hours: number,
  timezone: string = DEFAULT_TIMEZONE,
  startHour: number = 6,
  endHour: number = 22
): Date {
  let result = toLotTime(utcDate, timezone)
  let remainingHours = hours

  while (remainingHours > 0) {
    result = addHours(result, 1)
    const hour = result.getHours()
    
    // Skip non-business hours
    if (hour >= startHour && hour < endHour) {
      remainingHours--
    }
  }

  return fromLotTime(result, timezone)
}

/**
 * Validate that a time range is valid (end > start)
 */
export function isValidTimeRange(startTime: Date | string, endTime: Date | string): boolean {
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  return end > start
}

/**
 * Calculate duration in minutes between two UTC timestamps
 */
export function durationMinutes(startTime: Date | string, endTime: Date | string): number {
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  return Math.floor((end - start) / (1000 * 60))
}

/**
 * Calculate duration in hours between two UTC timestamps
 */
export function durationHours(startTime: Date | string, endTime: Date | string): number {
  return durationMinutes(startTime, endTime) / 60
}

/**
 * Get IST offset from UTC in hours
 */
export function getISTOffset(): number {
  return 5.5 // IST is UTC+5:30
}

/**
 * Convert UTC timestamp to IST time string
 */
export function toISTString(utcDate: Date | string, formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
  return formatInLotTime(utcDate, formatStr, DEFAULT_TIMEZONE)
}

/**
 * Check if two time ranges overlap
 * B3: Time-Overlap Rule
 * RequestedStart < ExistingEnd AND RequestedEnd > ExistingStart
 */
export function timeRangesOverlap(
  requestedStart: Date | string,
  requestedEnd: Date | string,
  existingStart: Date | string,
  existingEnd: Date | string
): boolean {
  const reqStart = new Date(requestedStart).getTime()
  const reqEnd = new Date(requestedEnd).getTime()
  const existStart = new Date(existingStart).getTime()
  const existEnd = new Date(existingEnd).getTime()

  return reqStart < existEnd && reqEnd > existStart
}

/**
 * Check if a time range is valid for booking
 * B2: Advance Booking Window
 * B29a: Minimum Booking Lead Time
 */
export function isValidBookingWindow(
  requestedStart: Date | string,
  currentTime: Date = new Date(),
  advanceBookingHours: number = 12,
  minBookingLeadMinutes: number = 15
): { valid: boolean; reason?: string } {
  const reqStart = new Date(requestedStart).getTime()
  const now = currentTime.getTime()
  
  const advanceWindowMs = advanceBookingHours * 60 * 60 * 1000
  const minLeadMs = minBookingLeadMinutes * 60 * 1000
  
  const bookingOpenTime = reqStart - advanceWindowMs
  const minLeadTime = reqStart - minLeadMs
  
  // Check if booking is too far in advance
  if (now < bookingOpenTime) {
    return { 
      valid: false, 
      reason: `Booking opens ${advanceBookingHours} hours before start time` 
    }
  }
  
  // Check if booking is too close to start time (B29a)
  if (now > minLeadTime) {
    return { 
      valid: false, 
      reason: `Bookings must be made at least ${minBookingLeadMinutes} minutes before start time` 
    }
  }
  
  // Check if booking is in the past
  if (reqStart < now) {
    return { 
      valid: false, 
      reason: 'Booking start time cannot be in the past' 
    }
  }
  
  return { valid: true }
}
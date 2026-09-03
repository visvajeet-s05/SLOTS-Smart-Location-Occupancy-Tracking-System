/**
 * Unit Test Suite for Staleness Badge
 * Verifies status transition from LIVE -> STALE -> OFFLINE based on time decay
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals"
import { renderHook, act } from "@testing-library/react"
import { useLotConnection, ConnectionStatus, TelemetryPulse } from "@/hooks/use-lot-connection"

describe("useLotConnection Hook", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe("Initial State", () => {
    it("should start in OFFLINE state with no pulses", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
        })
      )

      expect(result.current.status).toBe(ConnectionStatus.OFFLINE)
      expect(result.current.lastPulse).toBeNull()
      expect(result.current.stalenessSeconds).toBe(0)
    })
  })

  describe("LIVE State", () => {
    it("should transition to LIVE when pulse received within threshold", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      expect(result.current.status).toBe(ConnectionStatus.LIVE)
      expect(result.current.lastPulse).not.toBeNull()
    })

    it("should remain LIVE when staleness is below threshold", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      // Advance time by 10 seconds (still within 15s threshold)
      // Advance in 100ms increments to trigger interval callbacks
      for (let i = 0; i < 100; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      expect(result.current.status).toBe(ConnectionStatus.LIVE)
      expect(result.current.stalenessSeconds).toBe(10)
    })
  })

  describe("STALE State Transition", () => {
    it("should transition to STALE when staleness exceeds live threshold", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          staleThreshold: 60,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      expect(result.current.status).toBe(ConnectionStatus.LIVE)

      // Advance time by 20 seconds (exceeds 15s threshold)
      // Advance check intervals to trigger state updates
      for (let i = 0; i < 200; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      expect(result.current.status).toBe(ConnectionStatus.STALE)
      expect(result.current.stalenessSeconds).toBeGreaterThanOrEqual(15)
    })

    it("should remain STALE when staleness is between thresholds", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          staleThreshold: 60,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      // Advance time by 30 seconds (between 15s and 60s)
      for (let i = 0; i < 300; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      expect(result.current.status).toBe(ConnectionStatus.STALE)
      expect(result.current.stalenessSeconds).toBe(30)
    })

    it("should return to LIVE when new pulse received during STALE state", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          staleThreshold: 60,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      // Advance to STALE state
      act(() => {
        jest.advanceTimersByTime(20000)
      })

      expect(result.current.status).toBe(ConnectionStatus.STALE)

      // Receive new pulse
      const newPulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(newPulse)
      })

      expect(result.current.status).toBe(ConnectionStatus.LIVE)
      expect(result.current.stalenessSeconds).toBe(0)
    })
  })

  describe("OFFLINE State Transition", () => {
    it("should transition to OFFLINE when staleness exceeds stale threshold", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          staleThreshold: 60,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      expect(result.current.status).toBe(ConnectionStatus.LIVE)

      // Advance time by 70 seconds (exceeds 60s threshold)
      for (let i = 0; i < 700; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      expect(result.current.status).toBe(ConnectionStatus.OFFLINE)
      expect(result.current.stalenessSeconds).toBe(70)
    })

    it("should remain OFFLINE when staleness exceeds threshold", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          staleThreshold: 60,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      // Advance to OFFLINE state
      for (let i = 0; i < 700; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      expect(result.current.status).toBe(ConnectionStatus.OFFLINE)

      // Advance further
      for (let i = 0; i < 300; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      expect(result.current.status).toBe(ConnectionStatus.OFFLINE)
      expect(result.current.stalenessSeconds).toBe(100)
    })

    it("should return to LIVE when new pulse received during OFFLINE state", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          staleThreshold: 60,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      // Advance to OFFLINE state
      act(() => {
        jest.advanceTimersByTime(70000)
      })

      expect(result.current.status).toBe(ConnectionStatus.OFFLINE)

      // Receive new pulse
      const newPulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(newPulse)
      })

      expect(result.current.status).toBe(ConnectionStatus.LIVE)
      expect(result.current.stalenessSeconds).toBe(0)
    })
  })

  describe("Full State Transition Cycle", () => {
    it("should transition LIVE -> STALE -> OFFLINE based on time decay", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          staleThreshold: 60,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      // Initial pulse - LIVE
      act(() => {
        result.current.receivePulse(pulse)
      })
      expect(result.current.status).toBe(ConnectionStatus.LIVE)

      // Advance to STALE (20s)
      for (let i = 0; i < 200; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }
      expect(result.current.status).toBe(ConnectionStatus.STALE)

      // Advance to OFFLINE (70s total)
      for (let i = 0; i < 500; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }
      expect(result.current.status).toBe(ConnectionStatus.OFFLINE)
    })
  })

  describe("Slot-Specific Tracking", () => {
    it("should only accept pulses for matching slot ID", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          slotId: "slot-1",
          liveThreshold: 15,
        })
      )

      const wrongSlotPulse: TelemetryPulse = {
        lotId: "lot-1",
        slotId: "slot-2",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(wrongSlotPulse)
      })

      expect(result.current.status).toBe(ConnectionStatus.OFFLINE)

      const correctSlotPulse: TelemetryPulse = {
        lotId: "lot-1",
        slotId: "slot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(correctSlotPulse)
      })

      expect(result.current.status).toBe(ConnectionStatus.LIVE)
    })

    it("should track sensor ID from pulse", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          slotId: "slot-1",
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        slotId: "slot-1",
        timestamp: new Date(),
        sensorId: "sensor-123",
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      expect(result.current.sensorId).toBe("sensor-123")
    })
  })

  describe("Manual Pulse Update", () => {
    it("should allow manual pulse timestamp update", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
        })
      )

      const manualTimestamp = new Date()

      act(() => {
        result.current.updateLastPulse(manualTimestamp, "sensor-456")
      })

      expect(result.current.status).toBe(ConnectionStatus.LIVE)
      expect(result.current.lastPulse).toEqual(manualTimestamp)
      expect(result.current.sensorId).toBe("sensor-456")
    })
  })

  describe("Reset Functionality", () => {
    it("should reset connection state to initial values", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      expect(result.current.status).toBe(ConnectionStatus.LIVE)

      act(() => {
        result.current.reset()
      })

      expect(result.current.status).toBe(ConnectionStatus.OFFLINE)
      expect(result.current.lastPulse).toBeNull()
      expect(result.current.stalenessSeconds).toBe(0)
    })
  })

  describe("Monitoring Control", () => {
    it("should start and stop monitoring", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      // Stop monitoring
      act(() => {
        result.current.stopMonitoring()
      })

      // Advance time - should not update state
      for (let i = 0; i < 200; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      // State should still be LIVE (not updated)
      expect(result.current.status).toBe(ConnectionStatus.LIVE)

      // Start monitoring again
      act(() => {
        result.current.startMonitoring()
      })

      // Advance time - should update state
      for (let i = 0; i < 200; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      expect(result.current.status).toBe(ConnectionStatus.STALE)
    })
  })

  describe("Custom Thresholds", () => {
    it("should use custom live and stale thresholds", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 10,
          staleThreshold: 30,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      // Advance to 15s (exceeds 10s live threshold)
      for (let i = 0; i < 150; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      expect(result.current.status).toBe(ConnectionStatus.STALE)

      // Advance to 40s total (exceeds 30s stale threshold)
      for (let i = 0; i < 250; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      expect(result.current.status).toBe(ConnectionStatus.OFFLINE)
    })
  })

  describe("100ms Threshold Breach Detection", () => {
    it("should detect threshold breach within 100ms check interval", () => {
      const { result } = renderHook(() =>
        useLotConnection({
          lotId: "lot-1",
          liveThreshold: 15,
          checkInterval: 100,
        })
      )

      const pulse: TelemetryPulse = {
        lotId: "lot-1",
        timestamp: new Date(),
      }

      act(() => {
        result.current.receivePulse(pulse)
      })

      expect(result.current.status).toBe(ConnectionStatus.LIVE)

      // Advance to exactly 15s threshold
      for (let i = 0; i < 150; i++) {
        act(() => {
          jest.advanceTimersByTime(100)
        })
      }

      // Advance one more check interval (100ms)
      act(() => {
        jest.advanceTimersByTime(100)
      })

      expect(result.current.status).toBe(ConnectionStatus.STALE)
    })
  })
})
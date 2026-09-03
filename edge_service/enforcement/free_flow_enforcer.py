"""
Barrier-Free Free-Flow Enforcement Engine

Manages barrier-free entry/exit for parking lots without physical gates.
Key features:
  - ANPR-based entry logging (no stopping required)
  - Grace period enforcement (e.g., 5-minute free drop-off)
  - Stay duration computation
  - FASTag debit integration for exits
  - Violation flagging for unpaid exits
  - Violation reconciliation on payment

This engine integrates with:
  - Module 5: ANPR engine (IndianANPREngine) for plate capture
  - Module 5: NETCFastagGateway for auto-debit on exit
  - Module 5: AutoSettlementEngine for session tracking
  - WhatsApp bot for violation notices
"""

import time
import uuid
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ──────────────────────────────────────────────────────────────────────────────
#   CONSTANTS
# ──────────────────────────────────────────────────────────────────────────────

GRACE_PERIOD_DEFAULT_SEC = 300.0       # 5 minutes
VIOLATION_PENALTY_DEFAULT_INR = 100.0  # ₹100 standard penalty
SHORT_STAY_MAX_SEC = 900.0             # 15 minutes — qualifies as "short stay"

# In-memory stores
_ACTIVE_ENTRIES: Dict[str, Dict[str, Any]] = {}
_VIOLATION_REGISTRY: Dict[str, Dict[str, Any]] = {}


class FreeFlowEnforcementEngine:
    """
    Manages barrier-free entry/exit enforcement.

    Handles the complete free-flow lifecycle:
      Entry capture → Active session → Grace period check →
      Exit with payment → Violation or Clearance

    Args:
        grace_period_sec: Free drop-off window in seconds (default 300 = 5 min).
        penalty_fee_inr: Standard penalty for unpaid exits (default ₹100).
    """

    def __init__(
        self,
        grace_period_sec: float = GRACE_PERIOD_DEFAULT_SEC,
        penalty_fee_inr: float = VIOLATION_PENALTY_DEFAULT_INR,
    ):
        self.grace_period_sec = grace_period_sec
        self.penalty_fee_inr = penalty_fee_inr
        logging.info(
            f"FreeFlowEnforcementEngine initialized "
            f"(grace={grace_period_sec}s, penalty=₹{penalty_fee_inr})"
        )

    # ──────────────────────────────────────────────────────────────────────────
    #   ENTRY — Log vehicle arrival
    # ──────────────────────────────────────────────────────────────────────────

    def process_entry(
        self,
        vehicle_number: str,
        camera_id: str,
        lot_id: str = "UNKNOWN_LOT",
        plate_confidence: float = 0.0,
        epc_tag_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Log a vehicle entry from the free-flow camera feed.

        In barrier-free mode, the vehicle does not stop — the ANPR camera
        captures the plate as it drives through the gate lane.

        Args:
            vehicle_number: Sanitized plate number (e.g., 'TN01AB1234').
            camera_id: Camera/gate identifier.
            lot_id: Parking lot identifier.
            plate_confidence: ANPR confidence score.
            epc_tag_id: Optional RFID EPC tag ID.

        Returns:
            Entry session dict with session ID and timestamp.
        """
        session_id = f"FF_SES_{uuid.uuid4().hex[:8].upper()}"
        entry_time = time.time()

        session = {
            "sessionId": session_id,
            "vehicleNumber": vehicle_number,
            "cameraId": camera_id,
            "lotId": lot_id,
            "epcTagId": epc_tag_id,
            "plateConfidence": round(plate_confidence, 4),
            "entryTimestamp": entry_time,
            "entryTimeISO": datetime.fromtimestamp(entry_time, tz=timezone.utc).isoformat(),
            "status": "ACTIVE",
            "exitTimestamp": None,
            "stayDurationSec": None,
            "gracePeriodApplied": False,
            "amountDue": 0.0,
        }

        _ACTIVE_ENTRIES[vehicle_number] = session
        logging.info(
            f"FREE-FLOW ENTRY: {vehicle_number} @ cam={camera_id} "
            f"(session={session_id})"
        )

        return dict(session)

    # ──────────────────────────────────────────────────────────────────────────
    #   EXIT — Process vehicle departure
    # ──────────────────────────────────────────────────────────────────────────

    def process_exit(
        self,
        vehicle_number: str,
        payment_status: str = "UNPAID",
        amount_due: float = 0.0,
        lot_id: str = "UNKNOWN_LOT",
    ) -> Dict[str, Any]:
        """
        Process a free-flow exit event.

        Evaluates stay duration and applies one of:
          1. GRACE_EXEMPT  — Stay within free drop-off window (no charge)
          2. CLEARED       — Payment verified, exit cleared
          3. VIOLATION_ISSUED — Unpaid exit → penalty + violation notice

        Args:
            vehicle_number: Sanitized plate number.
            payment_status: 'SETTLED', 'FASTAG_AUTODEV_SUCCESS', 'UNPAID', etc.
            amount_due: Amount due for parking stay.
            lot_id: Parking lot identifier for cross-verification.

        Returns:
            Exit result dict with status, stay duration, and optional violation.
        """
        session = _ACTIVE_ENTRIES.pop(vehicle_number, None)
        exit_time = time.time()

        if session is None:
            return {
                "status": "ERROR",
                "errorCode": "NO_ENTRY_RECORD",
                "message": f"No active free-flow entry for {vehicle_number}.",
                "vehicleNumber": vehicle_number,
                "exitTimestamp": int(exit_time),
            }

        # Verify lot
        if lot_id != "UNKNOWN_LOT" and session["lotId"] != lot_id:
            logging.warning(
                f"Lot mismatch for {vehicle_number}: "
                f"entry={session['lotId']}, exit={lot_id}"
            )

        # Compute stay duration
        stay_duration = exit_time - session["entryTimestamp"]
        session["exitTimestamp"] = exit_time
        session["stayDurationSec"] = round(stay_duration, 2)

        # Check 1: Grace period (free drop-off)
        if stay_duration <= self.grace_period_sec:
            session["status"] = "GRACE_EXEMPT"
            session["gracePeriodApplied"] = True
            session["amountDue"] = 0.0

            logging.info(
                f"FREE-FLOW GRACE: {vehicle_number} — "
                f"stay={stay_duration:.1f}s (≤{self.grace_period_sec}s)"
            )

            return {
                "status": "GRACE_EXEMPT",
                "vehicleNumber": vehicle_number,
                "sessionId": session["sessionId"],
                "entryTimestamp": session["entryTimestamp"],
                "exitTimestamp": int(exit_time),
                "stayDurationSec": round(stay_duration, 1),
                "amountCharged": 0.0,
                "message": "Exit within free grace period. No charge.",
            }

        # Check 2: Payment verified
        if payment_status in ("SETTLED", "FASTAG_AUTODEV_SUCCESS", "PAID"):
            session["status"] = "CLEARED"
            session["amountDue"] = amount_due

            logging.info(
                f"FREE-FLOW CLEARED: {vehicle_number} — "
                f"stay={stay_duration:.1f}s, charged=₹{amount_due}"
            )

            return {
                "status": "CLEARED",
                "vehicleNumber": vehicle_number,
                "sessionId": session["sessionId"],
                "entryTimestamp": session["entryTimestamp"],
                "exitTimestamp": int(exit_time),
                "stayDurationSec": round(stay_duration, 1),
                "amountCharged": round(amount_due, 2),
                "message": "Payment verified. Exit cleared.",
            }

        # Check 3: Unpaid exit — issue violation
        violation_id = f"VIOL_{uuid.uuid4().hex[:8].upper()}"
        total_owed = round(amount_due + self.penalty_fee_inr, 2)

        violation_record = {
            "violationId": violation_id,
            "vehicleNumber": vehicle_number,
            "sessionId": session["sessionId"],
            "lotId": session["lotId"],
            "entryTimestamp": session["entryTimestamp"],
            "exitTimestamp": int(exit_time),
            "stayDurationSec": round(stay_duration, 1),
            "amountOwed": round(amount_due, 2),
            "penaltyFee": self.penalty_fee_inr,
            "totalOwed": total_owed,
            "issuedAt": int(exit_time * 1000),
            "status": "PENDING_NOTICE",
            "notifiedVia": None,
        }

        _VIOLATION_REGISTRY[violation_id] = violation_record
        session["status"] = "VIOLATION_ISSUED"
        session["violationId"] = violation_id

        logging.warning(
            f"FREE-FLOW VIOLATION: {vehicle_number} — "
            f"stay={stay_duration:.1f}s, owed=₹{total_owed} "
            f"(notice={violation_id})"
        )

        return {
            "status": "VIOLATION_ISSUED",
            "vehicleNumber": vehicle_number,
            "sessionId": session["sessionId"],
            "stayDurationSec": round(stay_duration, 1),
            "violation": violation_record,
        }

    # ──────────────────────────────────────────────────────────────────────────
    #   GRACE PERIOD CHECK
    # ──────────────────────────────────────────────────────────────────────────

    def check_grace_period(self, vehicle_number: str) -> Dict[str, Any]:
        """
        Check if a vehicle's current stay is within the grace period.

        Useful for displaying "free drop-off remaining" time to drivers.

        Args:
            vehicle_number: Sanitized plate number.

        Returns:
            Dict with remaining grace time and whether free.
        """
        session = _ACTIVE_ENTRIES.get(vehicle_number)
        if session is None:
            return {"isActive": False, "isFree": False, "remainingGraceSec": 0}

        elapsed = time.time() - session["entryTimestamp"]
        remaining = max(0.0, self.grace_period_sec - elapsed)

        return {
            "isActive": True,
            "isFree": elapsed <= self.grace_period_sec,
            "elapsedSec": round(elapsed, 1),
            "remainingGraceSec": round(remaining, 1),
            "gracePeriodSec": self.grace_period_sec,
        }

    # ──────────────────────────────────────────────────────────────────────────
    #   VIOLATION MANAGEMENT
    # ──────────────────────────────────────────────────────────────────────────

    def get_violation(self, violation_id: str) -> Optional[Dict[str, Any]]:
        """Get violation record by ID."""
        record = _VIOLATION_REGISTRY.get(violation_id)
        return dict(record) if record else None

    def get_vehicle_violations(
        self,
        vehicle_number: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Get all violations for a specific vehicle."""
        matches = [
            v for v in _VIOLATION_REGISTRY.values()
            if v["vehicleNumber"] == vehicle_number
        ]
        return [dict(m) for m in matches[-limit:]]

    def get_all_pending_violations(self) -> List[Dict[str, Any]]:
        """Get all violations with PENDING_NOTICE status."""
        return [
            dict(v) for v in _VIOLATION_REGISTRY.values()
            if v["status"] == "PENDING_NOTICE"
        ]

    def mark_violation_notified(
        self,
        violation_id: str,
        channel: str = "WHATSAPP",
    ) -> Dict[str, Any]:
        """
        Mark a violation as having been notified to the vehicle owner.

        Args:
            violation_id: Violation identifier.
            channel: Notification channel used (WHATSAPP, SMS, EMAIL).

        Returns:
            Updated violation record, or error if not found.
        """
        record = _VIOLATION_REGISTRY.get(violation_id)
        if record is None:
            return {"status": "ERROR", "message": f"Violation {violation_id} not found."}

        record["status"] = "NOTIFIED"
        record["notifiedVia"] = channel
        record["notifiedAt"] = int(time.time() * 1000)

        return dict(record)

    def resolve_violation(
        self,
        violation_id: str,
        payment_txn_id: str,
    ) -> Dict[str, Any]:
        """
        Resolve a violation after payment is received.

        Args:
            violation_id: Violation identifier.
            payment_txn_id: Transaction ID of the payment.

        Returns:
            Updated violation record with resolved status.
        """
        record = _VIOLATION_REGISTRY.get(violation_id)
        if record is None:
            return {"status": "ERROR", "message": f"Violation {violation_id} not found."}

        record["status"] = "RESOLVED"
        record["paymentTxnId"] = payment_txn_id
        record["resolvedAt"] = int(time.time() * 1000)

        return dict(record)

    # ──────────────────────────────────────────────────────────────────────────
    #   QUERIES
    # ──────────────────────────────────────────────────────────────────────────

    def get_active_entry(self, vehicle_number: str) -> Optional[Dict[str, Any]]:
        """Get active free-flow entry for a vehicle."""
        session = _ACTIVE_ENTRIES.get(vehicle_number)
        return dict(session) if session else None

    def get_all_active_entries(self) -> List[Dict[str, Any]]:
        """Get all currently active free-flow entries."""
        return [dict(s) for s in _ACTIVE_ENTRIES.values()]

    def get_active_entry_count(self) -> int:
        """Return the number of active entries."""
        return len(_ACTIVE_ENTRIES)

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST UTILITIES
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def clear_state():
        """Clear all sessions and violations (for test isolation)."""
        _ACTIVE_ENTRIES.clear()
        _VIOLATION_REGISTRY.clear()

    @staticmethod
    def state_summary() -> Dict[str, int]:
        """Return summary counts of the current state."""
        return {
            "activeEntries": len(_ACTIVE_ENTRIES),
            "pendingViolations": len(
                [v for v in _VIOLATION_REGISTRY.values()
                 if v["status"] == "PENDING_NOTICE"]
            ),
            "resolvedViolations": len(
                [v for v in _VIOLATION_REGISTRY.values()
                 if v["status"] == "RESOLVED"]
            ),
        }
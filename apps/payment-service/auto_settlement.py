"""
Auto-Settlement Engine — Links ANPR Entry/Exit with MARL Dynamic Pricing & FASTag Debit

Pipeline:
  1. Vehicle enters lot → ANPR captures plate + timestamp → stored as active session
  2. Vehicle parks → slot occupancy duration tracked
  3. Vehicle exits → ANPR captures plate → lookup session → compute fee
  4. Fee = (Exit_Time - Entry_Time) * MARL_Dynamic_Rate
  5. Execute FASTag auto-debit via NPCI gateway
  6. Mark session as settled

This module bridges Module 3 (MARL Pricing), Module 4 (Safety Guardrails),
and Module 5 (ANPR + FASTag) into a unified exit settlement pipeline.
"""

import time
import uuid
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ──────────────────────────────────────────────────────────────────────────────
#   IN-MEMORY SESSION STORE
# ──────────────────────────────────────────────────────────────────────────────

# Active parking sessions keyed by vehicle number
# Each session: { vehicleNumber, plateSanitized, lotId, entryTimestamp, slotId, ... }
_ACTIVE_SESSIONS: Dict[str, Dict[str, Any]] = {}

# Settled/completed sessions
_SETTLED_SESSIONS: List[Dict[str, Any]] = []


class AutoSettlementEngine:
    """
    Links vehicle plate entry/exit timestamps with MARL dynamic pricing rates
    to trigger instant FASTag debits upon gate exit.

    Args:
        fastag_gateway: Instance of NETCFastagGateway for debit execution.
        default_rate_inr: Fallback hourly rate if MARL pricing unavailable.
        min_fee_inr: Minimum parking fee (default ₹10).
    """

    def __init__(
        self,
        fastag_gateway: Any,  # NETCFastagGateway instance
        default_rate_inr: float = 40.0,
        min_fee_inr: float = 10.0,
    ):
        self.gateway = fastag_gateway
        self.default_rate_inr = default_rate_inr
        self.min_fee_inr = min_fee_inr
        logging.info(
            f"AutoSettlementEngine initialized (default_rate=₹{default_rate_inr}/hr, "
            f"min_fee=₹{min_fee_inr})"
        )

    # ──────────────────────────────────────────────────────────────────────────
    #   ENTRY: Register Vehicle at Gate
    # ──────────────────────────────────────────────────────────────────────────

    def register_entry(
        self,
        vehicle_number: str,
        lot_id: str,
        slot_id: Optional[str] = None,
        epc_tag_id: Optional[str] = None,
        plate_confidence: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Register a vehicle entry at the parking gate.

        Called by the ANPR pipeline when a vehicle is detected entering.

        Args:
            vehicle_number: Sanitized plate number (e.g., 'TN01AB1234').
            lot_id: Parking lot identifier.
            slot_id: Specific slot identifier (optional).
            epc_tag_id: RFID EPC Tag ID if read at entry (optional).
            plate_confidence: ANPR confidence score.

        Returns:
            Session dict with entry details.
        """
        entry_time = int(time.time())
        session_id = f"SES_{uuid.uuid4().hex[:10].upper()}"

        session = {
            "sessionId": session_id,
            "vehicleNumber": vehicle_number,
            "lotId": lot_id,
            "slotId": slot_id,
            "epcTagId": epc_tag_id,
            "entryTimestamp": entry_time,
            "entryTimeISO": datetime.fromtimestamp(entry_time, tz=timezone.utc).isoformat(),
            "plateConfidence": round(plate_confidence, 4),
            "status": "ACTIVE",
            "exitTimestamp": None,
            "durationHours": 0.0,
            "rateApplied": None,
            "feeINR": None,
            "transactionId": None,
        }

        _ACTIVE_SESSIONS[vehicle_number] = session
        logging.info(
            f"ENTRY: {vehicle_number} @ {lot_id} "
            f"(session={session_id}, conf={plate_confidence:.2f})"
        )

        return dict(session)

    # ──────────────────────────────────────────────────────────────────────────
    #   EXIT: Process Vehicle at Gate & Compute Fee
    # ──────────────────────────────────────────────────────────────────────────

    def process_exit(
        self,
        vehicle_number: str,
        lot_id: str,
        dynamic_rate_inr: Optional[float] = None,
        epc_tag_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Process vehicle exit: compute fee from MARL rate, execute FASTag debit.

        Args:
            vehicle_number: Sanitized plate number.
            lot_id: Parking lot identifier.
            dynamic_rate_inr: Current MARL dynamic rate (₹/hr). Falls back to default.
            epc_tag_id: RFID EPC Tag ID (optional, for debit).

        Returns:
            Settlement result with fee, transaction details.

        Raises:
            ValueError: If no active session found for vehicle.
        """
        # Lookup active session
        session = _ACTIVE_SESSIONS.get(vehicle_number)
        if session is None:
            raise ValueError(
                f"No active session found for vehicle {vehicle_number} in lot {lot_id}."
            )

        if session["lotId"] != lot_id:
            raise ValueError(
                f"Vehicle {vehicle_number} is in lot {session['lotId']}, "
                f"not {lot_id}."
            )

        # Compute duration
        exit_time = int(time.time())
        entry_time = session["entryTimestamp"]
        duration_seconds = max(0, exit_time - entry_time)
        duration_hours = duration_seconds / 3600.0

        # Get rate: use MARL dynamic rate if provided, else default
        rate = dynamic_rate_inr if dynamic_rate_inr is not None else self.default_rate_inr
        rate = max(10.0, rate)  # Floor rate at ₹10/hr

        # Compute fee: duration * rate, with minimum fee
        fee = max(self.min_fee_inr, round(duration_hours * rate, 2))

        # Use provided EPC tag or fall back to session's stored tag
        tag_id = epc_tag_id or session.get("epcTagId")

        # Execute FASTag debit
        if tag_id:
            debit_result = self.gateway.execute_auto_debit(
                epc_tag_id=tag_id,
                vehicle_number=vehicle_number,
                amount_inr=fee,
                parking_lot_id=lot_id,
                entry_timestamp=entry_time,
                exit_timestamp=exit_time,
            )
        else:
            # No RFID tag — return fee info without debit
            debit_result = {
                "status": "NO_TAG",
                "message": "No FASTag EPC ID available. Manual payment required.",
                "transactionId": None,
                "amountDebitedINR": 0.0,
            }

        # Update session record
        session["exitTimestamp"] = exit_time
        session["exitTimeISO"] = datetime.fromtimestamp(exit_time, tz=timezone.utc).isoformat()
        session["durationHours"] = round(duration_hours, 4)
        session["rateApplied"] = round(rate, 2)
        session["feeINR"] = fee
        session["status"] = "SETTLED" if debit_result.get("status") == "SUCCESS" else "PENDING"
        session["transactionId"] = debit_result.get("transactionId")
        session["debitStatus"] = debit_result.get("status")

        # Move to settled sessions
        _SETTLED_SESSIONS.append(dict(session))
        del _ACTIVE_SESSIONS[vehicle_number]

        logging.info(
            f"EXIT: {vehicle_number} @ {lot_id} | "
            f"duration={duration_hours:.2f}h, rate=₹{rate:.2f}/hr, "
            f"fee=₹{fee}, debit={debit_result.get('status')}"
        )

        return {
            "sessionId": session["sessionId"],
            "vehicleNumber": vehicle_number,
            "lotId": lot_id,
            "entryTimestamp": entry_time,
            "exitTimestamp": exit_time,
            "durationHours": round(duration_hours, 4),
            "rateAppliedINR": round(rate, 2),
            "feeINR": fee,
            "debitResult": debit_result,
            "settlementStatus": session["status"],
        }

    # ──────────────────────────────────────────────────────────────────────────
    #   QUERY ACTIVE SESSIONS
    # ──────────────────────────────────────────────────────────────────────────

    def get_active_session(self, vehicle_number: str) -> Optional[Dict[str, Any]]:
        """Get active session for a vehicle, or None if not parked."""
        session = _ACTIVE_SESSIONS.get(vehicle_number)
        return dict(session) if session else None

    def get_all_active_sessions(self) -> List[Dict[str, Any]]:
        """Get all currently active parking sessions."""
        return [dict(s) for s in _ACTIVE_SESSIONS.values()]

    def get_settled_sessions(
        self,
        limit: int = 50,
        lot_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get recently settled sessions, optionally filtered by lot."""
        sessions = _SETTLED_SESSIONS
        if lot_id:
            sessions = [s for s in sessions if s["lotId"] == lot_id]
        return sessions[-limit:]

    # ──────────────────────────────────────────────────────────────────────────
    #   UTILITY: Compute Fee Without Processing Exit
    # ──────────────────────────────────────────────────────────────────────────

    def estimate_fee(
        self,
        vehicle_number: str,
        dynamic_rate_inr: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Estimate parking fee for an active session without processing exit.

        Useful for displaying fee to driver before gate opens.

        Args:
            vehicle_number: Sanitized plate number.
            dynamic_rate_inr: Current MARL dynamic rate (₹/hr).

        Returns:
            Fee estimate with duration and rate info.
        """
        session = _ACTIVE_SESSIONS.get(vehicle_number)
        if session is None:
            return {"error": "No active session found.", "feeINR": 0.0}

        now = int(time.time())
        duration_hours = max(0, now - session["entryTimestamp"]) / 3600.0
        rate = dynamic_rate_inr if dynamic_rate_inr is not None else self.default_rate_inr
        rate = max(10.0, rate)
        fee = max(self.min_fee_inr, round(duration_hours * rate, 2))

        return {
            "vehicleNumber": vehicle_number,
            "lotId": session["lotId"],
            "entryTimestamp": session["entryTimestamp"],
            "durationHours": round(duration_hours, 4),
            "rateAppliedINR": round(rate, 2),
            "estimatedFeeINR": fee,
        }

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST UTILITIES
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def clear_sessions():
        """Clear all sessions (for test isolation)."""
        _ACTIVE_SESSIONS.clear()
        _SETTLED_SESSIONS.clear()

    @staticmethod
    def session_count() -> Dict[str, int]:
        """Return count of active and settled sessions."""
        return {
            "active": len(_ACTIVE_SESSIONS),
            "settled": len(_SETTLED_SESSIONS),
        }
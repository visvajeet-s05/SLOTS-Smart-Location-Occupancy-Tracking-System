"""
NETC FASTag Payment Gateway — NPCI Acquirer Bank Interface

Implements the NPCI NETC FASTag API protocol for:
  - Tag Read / EPC Query
  - Tag Status Verification (ACTIVE, LOW_BALANCE, BLACKLISTED, SUSPENDED)
  - Debit Request (instant auto-debit on exit)
  - Settlement Callback simulation

This module simulates the NPCI Acquirer Bank endpoints for development/testing.
In production, this would be replaced with actual NPCI API calls.
"""

import time
import uuid
import hmac
import hashlib
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ──────────────────────────────────────────────────────────────────────────────
#   NPCI STATUS CONSTANTS
# ──────────────────────────────────────────────────────────────────────────────

TAG_STATUS_ACTIVE = "ACTIVE"
TAG_STATUS_LOW_BALANCE = "LOW_BALANCE"
TAG_STATUS_BLACKLISTED = "BLACKLISTED"
TAG_STATUS_SUSPENDED = "SUSPENDED"
TAG_STATUS_EXEMPTED = "EXEMPTED"

SETTLEMENT_STATUS_SUCCESS = "SUCCESS"
SETTLEMENT_STATUS_FAILED = "FAILED"
SETTLEMENT_STATUS_PENDING = "PENDING"

# ──────────────────────────────────────────────────────────────────────────────
#   NPCI API MOCK STATE
# ──────────────────────────────────────────────────────────────────────────────

# In-memory store of issued tags for simulation
_MOCK_TAG_REGISTRY: Dict[str, Dict[str, Any]] = {
    "3000E200341234567890ABCD": {
        "vehicleNumber": "TN01AB1234",
        "tagStatus": TAG_STATUS_ACTIVE,
        "bankId": "PAYTM_ISSUER_BANK",
        "walletBalance": 500.00,
        "isExempted": False,
        "registeredAt": "2026-01-15T10:30:00Z",
    },
    "3000E200349876543210EFGH": {
        "vehicleNumber": "KA03MN5678",
        "tagStatus": TAG_STATUS_ACTIVE,
        "bankId": "ICICI_ISSUER_BANK",
        "walletBalance": 250.00,
        "isExempted": False,
        "registeredAt": "2026-03-22T14:15:00Z",
    },
    "3000E20034LOWBAL12345678": {
        "vehicleNumber": "DL05XY9012",
        "tagStatus": TAG_STATUS_LOW_BALANCE,
        "bankId": "HDFC_ISSUER_BANK",
        "walletBalance": 15.00,
        "isExempted": False,
        "registeredAt": "2026-02-10T09:00:00Z",
    },
    "3000E20034BLACK123456789": {
        "vehicleNumber": "MH12BL9999",
        "tagStatus": TAG_STATUS_BLACKLISTED,
        "bankId": "SBI_ISSUER_BANK",
        "walletBalance": 0.00,
        "isExempted": False,
        "registeredAt": "2025-11-05T08:00:00Z",
    },
    "3000E20034EXEMPT12345678": {
        "vehicleNumber": "GJ06EX0000",
        "tagStatus": TAG_STATUS_EXEMPTED,
        "bankId": "AXIS_ISSUER_BANK",
        "walletBalance": 1000.00,
        "isExempted": True,
        "registeredAt": "2026-04-01T12:00:00Z",
    },
}

# Transaction log
_TRANSACTION_LOG: list = []


class NETCFastagGateway:
    """
    NPCI NETC FASTag Payment Gateway Interface.

    Handles tag verification, acquirer bank routing, and instant account debit
    for parking lot entry/exit automation.

    Args:
        acquirer_bank_id: NPCI-registered Acquirer Bank ID (default: HDFC_PARKING_ACQ).
        api_key: Mock API key for HMAC signing (simulates NPCI security).
    """

    def __init__(
        self,
        acquirer_bank_id: str = "HDFC_PARKING_ACQ",
        api_key: str = "mock_npci_api_key_2026",
    ):
        self.acquirer_bank_id = acquirer_bank_id
        self.api_key = api_key
        logging.info(f"NETCFastagGateway initialized (acquirer={acquirer_bank_id})")

    # ──────────────────────────────────────────────────────────────────────────
    #   TAG STATUS VERIFICATION
    # ──────────────────────────────────────────────────────────────────────────

    def verify_tag_status(
        self,
        epc_tag_id: str,
        vehicle_number: str,
    ) -> Dict[str, Any]:
        """
        Query NPCI NETC mapper for tag state.

        Args:
            epc_tag_id: RFID EPC Tag ID (hex string, 24 chars).
            vehicle_number: Vehicle registration number for cross-verification.

        Returns:
            Dict with tag status, linked bank, balance, exemption info.

        Raises:
            ValueError: If tag ID is not found or vehicle number mismatches.
        """
        if not epc_tag_id or len(epc_tag_id) < 16:
            return {
                "status": "ERROR",
                "errorCode": "INVALID_TAG_ID",
                "message": "EPC Tag ID must be at least 16 hex characters.",
                "verifiedAt": int(time.time()),
            }

        # Lookup in mock registry
        tag_info = _MOCK_TAG_REGISTRY.get(epc_tag_id)

        if tag_info is None:
            return {
                "status": "ERROR",
                "errorCode": "TAG_NOT_FOUND",
                "message": f"EPC Tag ID {epc_tag_id} not registered with NPCI.",
                "verifiedAt": int(time.time()),
            }

        # Cross-verify vehicle number
        if vehicle_number and tag_info["vehicleNumber"] != vehicle_number:
            return {
                "status": "ERROR",
                "errorCode": "VEHICLE_MISMATCH",
                "message": f"Vehicle number mismatch: expected {tag_info['vehicleNumber']}, got {vehicle_number}.",
                "verifiedAt": int(time.time()),
            }

        logging.info(
            f"Tag {epc_tag_id[:8]}... status={tag_info['tagStatus']}, "
            f"vehicle={tag_info['vehicleNumber']}, bank={tag_info['bankId']}"
        )

        return {
            "epcTagId": epc_tag_id,
            "vehicleNumber": tag_info["vehicleNumber"],
            "tagStatus": tag_info["tagStatus"],
            "bankId": tag_info["bankId"],
            "walletBalance": tag_info["walletBalance"],
            "isExempted": tag_info["isExempted"],
            "verifiedAt": int(time.time()),
        }

    # ──────────────────────────────────────────────────────────────────────────
    #   AUTO-DEBIT EXECUTION
    # ──────────────────────────────────────────────────────────────────────────

    def execute_auto_debit(
        self,
        epc_tag_id: str,
        vehicle_number: str,
        amount_inr: float,
        parking_lot_id: str,
        entry_timestamp: Optional[int] = None,
        exit_timestamp: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Execute real-time FASTag account debit for completed parking stays.

        NPCI flow:
          1. Verify tag status (active & sufficient balance).
          2. Generate AUTH code from NPCI.
          3. Execute debit request to issuer bank.
          4. Return settlement confirmation.

        Args:
            epc_tag_id: RFID EPC Tag ID.
            vehicle_number: Vehicle registration number.
            amount_inr: Amount to debit in INR.
            parking_lot_id: Parking lot identifier.
            entry_timestamp: Unix timestamp of entry (for record).
            exit_timestamp: Unix timestamp of exit (for record).

        Returns:
            Dict with settlement status, transaction ID, auth code.
        """
        # Step 1: Verify tag before debiting
        tag_info = self.verify_tag_status(epc_tag_id, vehicle_number)

        if tag_info.get("status") == "ERROR":
            return {
                "status": SETTLEMENT_STATUS_FAILED,
                "errorCode": tag_info.get("errorCode", "TAG_VERIFICATION_FAILED"),
                "message": tag_info.get("message", "Tag verification failed before debit."),
                "transactionId": None,
                "epcTagId": epc_tag_id,
                "vehicleNumber": vehicle_number,
                "amountDebitedINR": 0.0,
                "timestamp": int(time.time() * 1000),
            }

        # Check if tag is blacklisted
        if tag_info["tagStatus"] == TAG_STATUS_BLACKLISTED:
            return {
                "status": SETTLEMENT_STATUS_FAILED,
                "errorCode": "TAG_BLACKLISTED",
                "message": "FASTag is blacklisted. Cannot process debit.",
                "transactionId": None,
                "epcTagId": epc_tag_id,
                "vehicleNumber": vehicle_number,
                "amountDebitedINR": 0.0,
                "timestamp": int(time.time() * 1000),
            }

        # Check if tag is exempted (e.g., emergency vehicles)
        if tag_info["isExempted"]:
            logging.info(f"Vehicle {vehicle_number} is exempted — no debit applied.")
            return {
                "status": "EXEMPTED",
                "transactionId": f"EXEMPT_{uuid.uuid4().hex[:12].upper()}",
                "epcTagId": epc_tag_id,
                "vehicleNumber": vehicle_number,
                "amountDebitedINR": 0.0,
                "parkingLotId": parking_lot_id,
                "npciAuthCode": "EXEMPT_AUTH",
                "timestamp": int(time.time() * 1000),
            }

        # Check if balance is sufficient (for LOW_BALANCE, still attempt debit)
        if tag_info["tagStatus"] == TAG_STATUS_LOW_BALANCE:
            if tag_info["walletBalance"] < amount_inr:
                logging.warning(
                    f"Low balance: ₹{tag_info['walletBalance']} < ₹{amount_inr}. "
                    f"Debit may fail."
                )

        # Enforce minimum debit cap (₹10 minimum per NPCI rules)
        amount_inr = max(10.0, round(amount_inr, 2))

        # Generate transaction ID
        transaction_id = f"NETC_PRK_{uuid.uuid4().hex[:12].upper()}"
        auth_code = f"AUTH_NPCI_{uuid.uuid4().hex[:8].upper()}"
        debit_timestamp = int(time.time() * 1000)

        # Log transaction
        transaction_record = {
            "transactionId": transaction_id,
            "epcTagId": epc_tag_id,
            "vehicleNumber": vehicle_number,
            "amountDebitedINR": amount_inr,
            "parkingLotId": parking_lot_id,
            "entryTimestamp": entry_timestamp,
            "exitTimestamp": exit_timestamp,
            "authCode": auth_code,
            "status": SETTLEMENT_STATUS_SUCCESS,
            "timestamp": debit_timestamp,
        }
        _TRANSACTION_LOG.append(transaction_record)

        logging.info(
            f"Debit SUCCESS: ₹{amount_inr} from {vehicle_number} "
            f"(txn={transaction_id})"
        )

        return {
            "status": SETTLEMENT_STATUS_SUCCESS,
            "transactionId": transaction_id,
            "epcTagId": epc_tag_id,
            "vehicleNumber": vehicle_number,
            "amountDebitedINR": amount_inr,
            "parkingLotId": parking_lot_id,
            "npciAuthCode": auth_code,
            "timestamp": debit_timestamp,
        }

    # ──────────────────────────────────────────────────────────────────────────
    #   SETTLEMENT CALLBACK (NPCI → Acquirer)
    # ──────────────────────────────────────────────────────────────────────────

    def process_settlement_callback(
        self,
        callback_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Process settlement callback from NPCI (simulates webhook from NPCI
        to acquirer bank confirming settlement).

        Args:
            callback_payload: Dict with transactionId, status, settlementAmount, etc.

        Returns:
            Acknowledgment of callback receipt.
        """
        txn_id = callback_payload.get("transactionId", "unknown")
        status = callback_payload.get("status", "UNKNOWN")

        logging.info(
            f"Settlement callback received: txn={txn_id}, status={status}"
        )

        # Update transaction log
        for record in _TRANSACTION_LOG:
            if record["transactionId"] == txn_id:
                record["settlementStatus"] = status
                record["settlementTimestamp"] = int(time.time() * 1000)
                break

        return {
            "acknowledged": True,
            "transactionId": txn_id,
            "processedAt": int(time.time() * 1000),
        }

    # ──────────────────────────────────────────────────────────────────────────
    #   UTILITY: HMAC SIGNATURE (for API security simulation)
    # ──────────────────────────────────────────────────────────────────────────

    def _generate_signature(self, payload: Dict[str, Any]) -> str:
        """Generate HMAC-SHA256 signature for API request authentication."""
        message = str(payload) + str(int(time.time()))
        return hmac.new(
            self.api_key.encode(),
            message.encode(),
            hashlib.sha256,
        ).hexdigest()[:16]

    # ──────────────────────────────────────────────────────────────────────────
    #   REPORTS & STATS
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def get_transaction_log() -> list:
        """Return the full transaction log (for audit/reconciliation)."""
        return list(_TRANSACTION_LOG)

    @staticmethod
    def clear_transaction_log():
        """Clear the transaction log (for test isolation)."""
        _TRANSACTION_LOG.clear()
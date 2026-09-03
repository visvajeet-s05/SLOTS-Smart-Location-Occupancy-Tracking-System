#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 5: Native ANPR/ALPR & NETC FASTag Auto-Pay Benchmark    ║
║                                                                        ║
║   Validates:                                                            ║
║   - ANPR plate sanitization (Indian MoRTH formats)                     ║
║   - PaddleOCR character standardization (O→0, I→1 confusion fixes)     ║
║   - NETC FASTag tag status verification (ACTIVE, BLACKLISTED, etc.)    ║
║   - NPCI auto-debit execution with minimum debit cap                   ║
║   - Auto-settlement pipeline (entry → exit → fee → debit)              ║
║   - MARL dynamic rate integration in fee computation                   ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import os
import sys
import time
import json
import argparse
from typing import Dict, Any, List

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Ensure apps package is importable
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_APPS_DIR = os.path.join(_BASE_DIR, "apps")
if _APPS_DIR not in sys.path:
    sys.path.insert(0, _APPS_DIR)

IMPORT_OK = False
err_msg = ""

# ──────────────────────────────────────────────────────────────────────────────
#   MODULE LOADER (handles hyphenated directory names)
# ──────────────────────────────────────────────────────────────────────────────

import importlib.util


def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


try:
    # Load ANPR engine from edge_service (underscore = valid package)
    from edge_service.anpr.anpr_engine import IndianANPREngine

    # Load FASTag gateway from apps/payment-service (hyphen = need file loader)
    _FG_PATH = os.path.join(_APPS_DIR, "payment-service", "fastag_gateway.py")
    _fg = _load_module("payment_service.fastag_gateway", _FG_PATH)
    NETCFastagGateway = _fg.NETCFastagGateway

    # Load Auto-Settlement engine
    _AS_PATH = os.path.join(_APPS_DIR, "payment-service", "auto_settlement.py")
    _as_mod = _load_module("payment_service.auto_settlement", _AS_PATH)
    AutoSettlementEngine = _as_mod.AutoSettlementEngine

    IMPORT_OK = True
except Exception as e:
    err_msg = str(e)

if not IMPORT_OK:
    print("[ERROR] Failed to import ANPR/FASTag modules: " + err_msg)
    print("[ERROR] Ensure edge_service/ and apps/payment-service/ are in your Python path")


# ══════════════════════════════════════════════════════════════════════════════
#   BENCHMARK SUITE
# ══════════════════════════════════════════════════════════════════════════════

class FastagANPRBenchmarkSuite:
    """Comprehensive benchmark suite for ANPR & FASTag Payment Engine."""

    def __init__(self):
        self.results: Dict[str, Any] = {}
        self.passed = 0
        self.total = 0

    def _check(self, name: str, condition: bool, detail: str = ""):
        """Record a pass/fail check."""
        self.total += 1
        status = "PASS" if condition else "FAIL"
        if condition:
            self.passed += 1
        print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
        return condition

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 1: ANPR Plate Sanitization & Format Validation
    # ──────────────────────────────────────────────────────────────────────────

    def test_anpr_sanitization(self) -> Dict[str, Any]:
        """Test Indian plate sanitization with OCR confusion correction."""
        print("\n  -- Test 1: ANPR Plate Sanitization & Format Validation --")

        results = {}
        anpr = IndianANPREngine()

        # Test cases: (raw_ocr_input, expected_sanitized, expected_valid)
        test_plates = [
            # Standard format: TN-01-AB-1234
            ("tn 01 ab 1234", "TN01AB1234", True),
            ("TN01AB1234", "TN01AB1234", True),
            ("tn01ab1234", "TN01AB1234", True),
            ("T N 0 1 A B 1 2 3 4", "TN01AB1234", True),
            ("TN-01-AB-1234", "TN01AB1234", True),
            # BH series: 22-BH-1234-AA
            ("22 bh 9999 x", "22BH9999X", True),
            ("22BH9999X", "22BH9999X", True),
            ("22-BH-9999-X", "22BH9999X", True),
            # OCR confusion: O→0, I→1, etc.
            ("TN0IAB1234", "TN01AB1234", True),  # O→0 in state? No, I→1 in district
            ("TN-O1-AB-1234", "TN01AB1234", True),
            # Invalid plates
            ("INVALID_PLATE_99", "INV4LIDPLATE99", False),
            ("ABC", "ABC", False),
            ("", "", False),
        ]

        for raw, expected_sanitized, expected_valid in test_plates:
            sanitized = anpr.sanitize_plate_text(raw)
            is_valid = anpr.validate_plate(sanitized)
            ok = (sanitized == expected_sanitized and is_valid == expected_valid)
            detail = f"raw='{raw}' → sanitized='{sanitized}' (valid={is_valid})"
            self._check(f"Plate '{raw[:15]}...'", ok, detail)

        results["test_cases"] = len(test_plates)
        results["pass"] = True
        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 2: ANPR Plate Validation Patterns
    # ──────────────────────────────────────────────────────────────────────────

    def test_anpr_validation(self) -> Dict[str, Any]:
        """Test regex validation patterns for Indian plates."""
        print("\n  -- Test 2: ANPR Plate Validation Patterns --")

        results = {}
        anpr = IndianANPREngine()

        # Valid plates
        valid_plates = [
            "TN01AB1234", "KA03MN5678", "MH12XY9012", "DL05PQ3456",
            "GJ06RS7890", "UP14AB1234", "RJ27CD5678", "HR26EF9012",
            "22BH1234AA", "12BH5678XY", "01BH9999AB",
        ]
        for plate in valid_plates:
            is_valid = anpr.validate_plate(plate)
            self._check(f"  Valid: {plate}", is_valid)

        # Invalid plates
        invalid_plates = [
            "TNO1AB1234",    # O instead of 0 in district
            "TN01AB123",     # Too short
            "TN01AB12345",   # Too long
            "1234AB1234",    # Starts with digits
            "ABCDEFGHIJ",    # All letters
        ]
        for plate in invalid_plates:
            is_valid = anpr.validate_plate(plate)
            self._check(f"  Invalid: {plate}", not is_valid)

        results["valid_count"] = len(valid_plates)
        results["invalid_count"] = len(invalid_plates)
        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 3: FASTag Tag Status Verification
    # ──────────────────────────────────────────────────────────────────────────

    def test_fastag_verification(self) -> Dict[str, Any]:
        """Test NPCI FASTag tag status verification."""
        print("\n  -- Test 3: FASTag NPCI Tag Status Verification --")

        results = {}
        gateway = NETCFastagGateway()

        # Test 3a: Active tag verification
        tag_info = gateway.verify_tag_status(
            epc_tag_id="3000E200341234567890ABCD",
            vehicle_number="TN01AB1234",
        )
        active_ok = tag_info.get("tagStatus") == "ACTIVE"
        self._check("Active tag status verified", active_ok,
                     f"status={tag_info.get('tagStatus')}, bank={tag_info.get('bankId')}")
        results["active_tag_status"] = tag_info.get("tagStatus")

        # Test 3b: Blacklisted tag
        black_tag = gateway.verify_tag_status(
            epc_tag_id="3000E20034BLACK123456789",
            vehicle_number="MH12BL9999",
        )
        black_ok = black_tag.get("tagStatus") == "BLACKLISTED"
        self._check("Blacklisted tag detected", black_ok,
                     f"status={black_tag.get('tagStatus')}")
        results["blacklisted_tag_status"] = black_tag.get("tagStatus")

        # Test 3c: Low balance tag
        low_bal_tag = gateway.verify_tag_status(
            epc_tag_id="3000E20034LOWBAL12345678",
            vehicle_number="DL05XY9012",
        )
        low_bal_ok = low_bal_tag.get("tagStatus") == "LOW_BALANCE"
        self._check("Low balance tag detected", low_bal_ok,
                     f"status={low_bal_tag.get('tagStatus')}, "
                     f"balance=₹{low_bal_tag.get('walletBalance')}")
        results["low_balance_tag_status"] = low_bal_tag.get("tagStatus")

        # Test 3d: Exempted tag
        exempt_tag = gateway.verify_tag_status(
            epc_tag_id="3000E20034EXEMPT12345678",
            vehicle_number="GJ06EX0000",
        )
        exempt_ok = exempt_tag.get("isExempted") is True
        self._check("Exempted tag identified", exempt_ok,
                     f"exempted={exempt_tag.get('isExempted')}")
        results["exempted_tag"] = exempt_tag.get("isExempted")

        # Test 3e: Vehicle number mismatch
        mismatch = gateway.verify_tag_status(
            epc_tag_id="3000E200341234567890ABCD",
            vehicle_number="WRONG_VEHICLE",
        )
        mismatch_ok = mismatch.get("status") == "ERROR"
        self._check("Vehicle mismatch detected", mismatch_ok,
                     f"error={mismatch.get('errorCode')}")
        results["vehicle_mismatch_detected"] = mismatch_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 4: FASTag Auto-Debit Execution
    # ──────────────────────────────────────────────────────────────────────────

    def test_fastag_auto_debit(self) -> Dict[str, Any]:
        """Test NPCI FASTag auto-debit execution."""
        print("\n  -- Test 4: FASTag NPCI Auto-Debit Execution --")

        results = {}
        gateway = NETCFastagGateway()
        gateway.clear_transaction_log()

        # Test 4a: Successful debit
        debit = gateway.execute_auto_debit(
            epc_tag_id="3000E200341234567890ABCD",
            vehicle_number="TN01AB1234",
            amount_inr=75.50,
            parking_lot_id="LOT_CHENNAI_CENTRAL",
        )
        debit_ok = debit.get("status") == "SUCCESS" and debit.get("amountDebitedINR") == 75.50
        self._check("Successful auto-debit", debit_ok,
                     f"txn={debit.get('transactionId')}, "
                     f"amount=₹{debit.get('amountDebitedINR')}")
        results["debit_success"] = debit.get("status")
        results["debit_amount"] = debit.get("amountDebitedINR")

        # Test 4b: Minimum debit cap enforced
        small_debit = gateway.execute_auto_debit(
            epc_tag_id="3000E200341234567890ABCD",
            vehicle_number="TN01AB1234",
            amount_inr=3.00,  # Below minimum
            parking_lot_id="LOT_CHENNAI_CENTRAL",
        )
        cap_ok = small_debit.get("amountDebitedINR") == 10.0
        self._check("Minimum debit cap enforced (₹3 → ₹10)", cap_ok,
                     f"debited=₹{small_debit.get('amountDebitedINR')}")
        results["min_cap_enforced"] = cap_ok

        # Test 4c: Blacklisted tag debit rejected
        black_debit = gateway.execute_auto_debit(
            epc_tag_id="3000E20034BLACK123456789",
            vehicle_number="MH12BL9999",
            amount_inr=50.00,
            parking_lot_id="LOT_MUMBAI_WEST",
        )
        black_ok = black_debit.get("status") == "FAILED" and black_debit.get("errorCode") == "TAG_BLACKLISTED"
        self._check("Blacklisted debit rejected", black_ok,
                     f"status={black_debit.get('status')}, "
                     f"error={black_debit.get('errorCode')}")
        results["blacklisted_rejected"] = black_ok

        # Test 4d: Exempted vehicle (no debit)
        exempt_debit = gateway.execute_auto_debit(
            epc_tag_id="3000E20034EXEMPT12345678",
            vehicle_number="GJ06EX0000",
            amount_inr=100.00,
            parking_lot_id="LOT_AHMEDABAD",
        )
        exempt_ok = exempt_debit.get("status") == "EXEMPTED"
        self._check("Exempted vehicle — no debit applied", exempt_ok,
                     f"status={exempt_debit.get('status')}")
        results["exempted_no_debit"] = exempt_ok

        # Test 4e: Transaction log integrity
        txn_log = gateway.get_transaction_log()
        log_ok = len(txn_log) >= 2
        self._check("Transaction log populated", log_ok,
                     f"entries={len(txn_log)}")
        results["txn_log_count"] = len(txn_log)

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 5: Auto-Settlement Pipeline (Entry → Exit → Fee → Debit)
    # ──────────────────────────────────────────────────────────────────────────

    def test_auto_settlement_pipeline(self) -> Dict[str, Any]:
        """Test end-to-end auto-settlement pipeline."""
        print("\n  -- Test 5: Auto-Settlement Pipeline (Entry → Exit → Fee → Debit) --")

        results = {}
        gateway = NETCFastagGateway()
        gateway.clear_transaction_log()
        AutoSettlementEngine.clear_sessions()

        settlement = AutoSettlementEngine(fastag_gateway=gateway)

        # Test 5a: Register entry
        entry = settlement.register_entry(
            vehicle_number="TN01AB1234",
            lot_id="LOT_CHENNAI_CENTRAL",
            slot_id="A-12",
            epc_tag_id="3000E200341234567890ABCD",
            plate_confidence=0.95,
        )
        entry_ok = entry.get("status") == "ACTIVE" and entry.get("vehicleNumber") == "TN01AB1234"
        self._check("Entry registered successfully", entry_ok,
                     f"session={entry.get('sessionId')}")
        results["entry_registered"] = entry_ok

        # Test 5b: Check active session
        active = settlement.get_active_session("TN01AB1234")
        active_ok = active is not None and active["status"] == "ACTIVE"
        self._check("Active session query works", active_ok)
        results["active_session_found"] = active_ok

        # Test 5c: Estimate fee before exit
        estimate = settlement.estimate_fee(
            vehicle_number="TN01AB1234",
            dynamic_rate_inr=50.0,
        )
        estimate_ok = estimate.get("estimatedFeeINR", 0) > 0
        self._check("Fee estimation works", estimate_ok,
                     f"estimated_fee=₹{estimate.get('estimatedFeeINR')}")
        results["fee_estimated"] = estimate_ok

        # Test 5d: Process exit with MARL dynamic rate
        exit_result = settlement.process_exit(
            vehicle_number="TN01AB1234",
            lot_id="LOT_CHENNAI_CENTRAL",
            dynamic_rate_inr=50.0,  # MARL dynamic rate
        )
        exit_ok = exit_result.get("settlementStatus") == "SETTLED" and exit_result.get("feeINR", 0) > 0
        self._check("Exit processed with MARL rate", exit_ok,
                     f"fee=₹{exit_result.get('feeINR')}, "
                     f"rate=₹{exit_result.get('rateAppliedINR')}/hr, "
                     f"duration={exit_result.get('durationHours'):.2f}h")
        results["exit_processed"] = exit_ok
        results["fee_computed"] = exit_result.get("feeINR")
        results["rate_applied"] = exit_result.get("rateAppliedINR")

        # Test 5e: No active session after exit
        active_after = settlement.get_active_session("TN01AB1234")
        no_active_ok = active_after is None
        self._check("No active session after exit", no_active_ok)
        results["session_cleared"] = no_active_ok

        # Test 5f: Settled session stored
        settled = settlement.get_settled_sessions()
        settled_ok = len(settled) == 1
        self._check("Settled session stored", settled_ok,
                     f"settled_count={len(settled)}")
        results["settled_stored"] = settled_ok

        # Test 5g: Entry without RFID tag (manual payment fallback)
        settlement2 = AutoSettlementEngine(fastag_gateway=gateway, default_rate_inr=40.0)
        entry2 = settlement2.register_entry(
            vehicle_number="KA03MN5678",
            lot_id="LOT_BANGALORE_EAST",
            slot_id="B-05",
            epc_tag_id=None,  # No RFID tag
            plate_confidence=0.88,
        )
        exit2 = settlement2.process_exit(
            vehicle_number="KA03MN5678",
            lot_id="LOT_BANGALORE_EAST",
            dynamic_rate_inr=45.0,
        )
        no_tag_ok = exit2.get("debitResult", {}).get("status") == "NO_TAG"
        self._check("No-tag fallback (manual payment)", no_tag_ok,
                     f"status={exit2.get('debitResult', {}).get('status')}")
        results["no_tag_fallback"] = no_tag_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 6: Settlement Callback Processing
    # ──────────────────────────────────────────────────────────────────────────

    def test_settlement_callback(self) -> Dict[str, Any]:
        """Test NPCI settlement callback processing."""
        print("\n  -- Test 6: NPCI Settlement Callback Processing --")

        results = {}
        gateway = NETCFastagGateway()
        gateway.clear_transaction_log()

        # First create a transaction
        debit = gateway.execute_auto_debit(
            epc_tag_id="3000E200341234567890ABCD",
            vehicle_number="TN01AB1234",
            amount_inr=100.00,
            parking_lot_id="LOT_TEST",
        )
        txn_id = debit.get("transactionId")

        # Process settlement callback
        callback = gateway.process_settlement_callback({
            "transactionId": txn_id,
            "status": "SETTLED",
            "settlementAmount": 100.00,
            "settlementTimestamp": int(time.time() * 1000),
        })
        callback_ok = callback.get("acknowledged") is True
        self._check("Settlement callback acknowledged", callback_ok,
                     f"txn={txn_id}")
        results["callback_acknowledged"] = callback_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 7: Edge Cases & Error Handling
    # ──────────────────────────────────────────────────────────────────────────

    def test_edge_cases(self) -> Dict[str, Any]:
        """Test edge cases and error handling."""
        print("\n  -- Test 7: Edge Cases & Error Handling --")

        results = {}
        gateway = NETCFastagGateway()
        AutoSettlementEngine.clear_sessions()
        settlement = AutoSettlementEngine(fastag_gateway=gateway)

        # Test 7a: Invalid tag ID
        invalid_tag = gateway.verify_tag_status(
            epc_tag_id="SHORT",
            vehicle_number="TN01AB1234",
        )
        invalid_ok = invalid_tag.get("status") == "ERROR"
        self._check("Invalid tag ID rejected", invalid_ok,
                     f"error={invalid_tag.get('errorCode')}")
        results["invalid_tag_rejected"] = invalid_ok

        # Test 7b: Exit for non-existent session
        try:
            settlement.process_exit(
                vehicle_number="NONEXISTENT",
                lot_id="LOT_TEST",
            )
            nonexistent_ok = False
        except ValueError:
            nonexistent_ok = True
        self._check("Non-existent session raises error", nonexistent_ok)
        results["nonexistent_session_error"] = nonexistent_ok

        # Test 7c: Empty crop handling
        anpr = IndianANPREngine()
        import numpy as np
        empty_result = anpr.extract_license_plate(np.array([]))
        empty_ok = empty_result["is_valid"] is False and empty_result["confidence"] == 0.0
        self._check("Empty crop handled gracefully", empty_ok,
                     f"valid={empty_result['is_valid']}, conf={empty_result['confidence']}")
        results["empty_crop_handled"] = empty_ok

        # Test 7d: None crop handling
        none_result = anpr.extract_license_plate(None)
        none_ok = none_result["is_valid"] is False
        self._check("None crop handled gracefully", none_ok)
        results["none_crop_handled"] = none_ok

        # Test 7e: Sanitize empty string
        empty_sanitized = anpr.sanitize_plate_text("")
        empty_san_ok = empty_sanitized == ""
        self._check("Empty sanitize returns empty string", empty_san_ok)
        results["empty_sanitize"] = empty_san_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   RUN ALL TESTS
    # ──────────────────────────────────────────────────────────────────────────

    def run_all(self) -> Dict[str, Any]:
        """Run all ANPR & FASTag benchmark tests."""
        print("=" * 70)
        print("  SLOTS Module 5: ANPR/ALPR & FASTag Auto-Pay Benchmark")
        print("=" * 70)

        if not IMPORT_OK:
            print("\n[FAIL] Import error — skipping benchmarks")
            return {"status": "failed", "error": "ImportError"}

        all_results = {}

        all_results["anpr_sanitization"] = self.test_anpr_sanitization()
        all_results["anpr_validation"] = self.test_anpr_validation()
        all_results["fastag_verification"] = self.test_fastag_verification()
        all_results["fastag_auto_debit"] = self.test_fastag_auto_debit()
        all_results["auto_settlement"] = self.test_auto_settlement_pipeline()
        all_results["settlement_callback"] = self.test_settlement_callback()
        all_results["edge_cases"] = self.test_edge_cases()

        all_results["summary"] = {
            "passed": self.passed,
            "total": self.total,
            "pass_rate": f"{self.passed}/{self.total}",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "overall": "PASS" if self.passed == self.total else "PARTIAL",
        }

        print("-" * 70)
        print(f"  Results: {self.passed}/{self.total} checks passed")
        print(f"  Overall: {'PASS' if self.passed == self.total else 'PARTIAL'}")
        print("=" * 70)

        return all_results


# ══════════════════════════════════════════════════════════════════════════════
#   MAIN ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="SLOTS Module 5: ANPR/ALPR & FASTag Auto-Pay Benchmark"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output JSON file for benchmark results"
    )
    args = parser.parse_args()

    suite = FastagANPRBenchmarkSuite()
    results = suite.run_all()

    if args.output:
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to: {args.output}")

    summary = results.get("summary", {})
    if summary.get("passed", 0) == summary.get("total", 1):
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
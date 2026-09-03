#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 6: Barrier-Free Free-Flow, Two-Wheeler AI & WhatsApp    ║
║                                                                        ║
║   Validates:                                                            ║
║   - Two-wheeler spatial density calculation (fractional occupancy)     ║
║   - Multi-vehicle count within single zone                             ║
║   - Zone status detection (AVAILABLE, FULL, OVERFLOW)                  ║
║   - Barrier-free free-flow entry/exit lifecycle                        ║
║   - Grace period enforcement (5-minute free drop-off)                  ║
║   - Unpaid exit violation flagging with penalty                        ║
║   - Violation resolution on payment                                    ║
║   - WhatsApp Business API QR pass generation                           ║
║   - WhatsApp violation notice delivery                                 ║
║   - Webhook event processing (booking, payment, help intents)          ║
║   - UPI payment link generation                                        ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import os
import sys
import time
import json
import argparse
import numpy as np
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
    # Load Two-Wheeler Tracker (underscore package = direct import)
    from edge_service.vision.two_wheeler_tracker import TwoWheelerSpatialTracker

    # Load Free-Flow Enforcer (underscore package = direct import)
    from edge_service.enforcement.free_flow_enforcer import FreeFlowEnforcementEngine

    # Load WhatsApp Bot from apps/notification-service (hyphen = file loader)
    _WA_PATH = os.path.join(_APPS_DIR, "notification-service", "whatsapp_bot.py")
    _wa_mod = _load_module("notification_service.whatsapp_bot", _WA_PATH)
    WhatsAppParkingBot = _wa_mod.WhatsAppParkingBot

    IMPORT_OK = True
except Exception as e:
    err_msg = str(e)

if not IMPORT_OK:
    print("[ERROR] Failed to import Module 6 modules: " + err_msg)
    print("[ERROR] Ensure edge_service/ and apps/notification-service/ are in path")


# ══════════════════════════════════════════════════════════════════════════════
#   BENCHMARK SUITE
# ══════════════════════════════════════════════════════════════════════════════

class Module6BenchmarkSuite:
    """Comprehensive benchmark suite for Module 6 components."""

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
    #   TEST 1: Two-Wheeler Spatial Density
    # ──────────────────────────────────────────────────────────────────────────

    def test_two_wheeler_density(self) -> Dict[str, Any]:
        """Test two-wheeler spatial density calculation."""
        print("\n  -- Test 1: Two-Wheeler Spatial Density Calculation --")

        results = {}
        tracker = TwoWheelerSpatialTracker(
            max_capacity_per_zone=5,
            frame_width=1920,
            frame_height=1080,
        )

        # Define a parking zone (400x400 px square)
        zone_poly = [[100, 100], [500, 100], [500, 500], [100, 500]]

        # Test 1a: 3 mock scooters inside zone
        mock_detections = [
            {"bbox": [150, 150, 220, 280], "confidence": 0.92},
            {"bbox": [250, 150, 320, 280], "confidence": 0.88},
            {"bbox": [350, 150, 420, 280], "confidence": 0.85},
        ]
        density = tracker.calculate_zone_density(mock_detections, zone_poly)
        density_ok = density["vehicleCount"] == 3 and density["status"] == "AVAILABLE"
        self._check("3 vehicles detected in zone", density_ok,
                     f"count={density['vehicleCount']}, "
                     f"density={density['densityRatio']:.3f}, "
                     f"status={density['status']}")
        results["three_vehicles"] = density_ok
        results["density_ratio"] = density["densityRatio"]

        # Test 1b: Full zone (5 vehicles = max capacity)
        full_detections = [
            {"bbox": [120, 120, 190, 260], "confidence": 0.91},
            {"bbox": [200, 120, 270, 260], "confidence": 0.89},
            {"bbox": [280, 120, 350, 260], "confidence": 0.87},
            {"bbox": [360, 120, 430, 260], "confidence": 0.86},
            {"bbox": [440, 120, 490, 260], "confidence": 0.84},
        ]
        full_density = tracker.calculate_zone_density(full_detections, zone_poly)
        full_ok = full_density["vehicleCount"] == 5 and full_density["remainingCapacity"] == 0
        self._check("Full zone (5 vehicles, 0 remaining)", full_ok,
                     f"count={full_density['vehicleCount']}, "
                     f"remaining={full_density['remainingCapacity']}, "
                     f"status={full_density['status']}")
        results["full_zone"] = full_ok

        # Test 1c: Empty zone
        empty_density = tracker.calculate_zone_density([], zone_poly)
        empty_ok = empty_density["vehicleCount"] == 0 and empty_density["status"] == "AVAILABLE"
        self._check("Empty zone (0 vehicles)", empty_ok,
                     f"count={empty_density['vehicleCount']}")
        results["empty_zone"] = empty_ok

        # Test 1d: Vehicle outside zone (should not be counted)
        outside_detections = [
            {"bbox": [10, 10, 50, 50], "confidence": 0.95},  # Outside zone
            {"bbox": [150, 150, 220, 280], "confidence": 0.90},  # Inside zone
        ]
        outside_density = tracker.calculate_zone_density(outside_detections, zone_poly)
        outside_ok = outside_density["vehicleCount"] == 1
        self._check("Outside vehicle excluded", outside_ok,
                     f"count={outside_density['vehicleCount']} (expected 1)")
        results["outside_excluded"] = outside_ok

        # Test 1e: Low confidence detection filtered
        low_conf = [
            {"bbox": [150, 150, 220, 280], "confidence": 0.05},  # Below threshold
        ]
        low_conf_density = tracker.calculate_zone_density(low_conf, zone_poly)
        low_conf_ok = low_conf_density["vehicleCount"] == 0
        self._check("Low confidence detection filtered", low_conf_ok,
                     f"count={low_conf_density['vehicleCount']}")
        results["low_conf_filtered"] = low_conf_ok

        # Test 1f: Multi-zone density
        zones = {
            "ZONE_A": np.array([[100, 100], [300, 100], [300, 300], [100, 300]]),
            "ZONE_B": np.array([[350, 100], [550, 100], [550, 300], [350, 300]]),
        }
        multi_detections = [
            {"bbox": [150, 150, 220, 250], "confidence": 0.90},  # Zone A
            {"bbox": [400, 150, 470, 250], "confidence": 0.85},  # Zone B
        ]
        multi_results = tracker.calculate_multi_zone_density(multi_detections, zones)
        multi_ok = (
            multi_results.get("ZONE_A", {}).get("vehicleCount") == 1 and
            multi_results.get("ZONE_B", {}).get("vehicleCount") == 1
        )
        self._check("Multi-zone density calculation", multi_ok,
                     f"ZONE_A={multi_results.get('ZONE_A', {}).get('vehicleCount')}, "
                     f"ZONE_B={multi_results.get('ZONE_B', {}).get('vehicleCount')}")
        results["multi_zone"] = multi_ok

        # Test 1g: Zone utility methods
        center = tracker.get_zone_center(zone_poly)
        center_ok = abs(center[0] - 300.0) < 1.0 and abs(center[1] - 300.0) < 1.0
        self._check("Zone center calculation", center_ok,
                     f"center=({center[0]:.1f}, {center[1]:.1f})")
        results["zone_center"] = center_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 2: Free-Flow Entry Processing
    # ──────────────────────────────────────────────────────────────────────────

    def test_free_flow_entry(self) -> Dict[str, Any]:
        """Test barrier-free free-flow entry processing."""
        print("\n  -- Test 2: Free-Flow Entry Processing --")

        results = {}
        enforcer = FreeFlowEnforcementEngine(grace_period_sec=300.0)
        enforcer.clear_state()

        # Test 2a: Basic entry
        entry = enforcer.process_entry(
            vehicle_number="TN01AB1234",
            camera_id="CAM_GATE_NORTH",
            lot_id="LOT_CHENNAI_CENTRAL",
            plate_confidence=0.95,
        )
        entry_ok = entry["status"] == "ACTIVE" and entry["sessionId"].startswith("FF_SES_")
        self._check("Basic entry logged", entry_ok,
                     f"session={entry.get('sessionId')}")
        results["entry_created"] = entry_ok

        # Test 2b: Entry count
        count = enforcer.get_active_entry_count()
        count_ok = count == 1
        self._check("Active entry count = 1", count_ok, f"count={count}")
        results["entry_count"] = count_ok

        # Test 2c: Query active entry
        active = enforcer.get_active_entry("TN01AB1234")
        active_ok = active is not None and active["status"] == "ACTIVE"
        self._check("Active entry query works", active_ok)
        results["active_query"] = active_ok

        # Test 2d: Grace period check (within 5 min)
        grace = enforcer.check_grace_period("TN01AB1234")
        grace_ok = grace["isActive"] and grace["isFree"]
        self._check("Grace period active (within 5 min)", grace_ok,
                     f"remaining={grace['remainingGraceSec']:.1f}s")
        results["grace_active"] = grace_ok

        # Test 2e: Entry with RFID tag
        entry_rfid = enforcer.process_entry(
            vehicle_number="KA03MN5678",
            camera_id="CAM_GATE_SOUTH",
            lot_id="LOT_BANGALORE_EAST",
            epc_tag_id="3000E200349876543210EFGH",
        )
        rfid_ok = entry_rfid["epcTagId"] == "3000E200349876543210EFGH"
        self._check("Entry with RFID tag", rfid_ok)
        results["entry_rfid"] = rfid_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 3: Free-Flow Exit & Grace Period
    # ──────────────────────────────────────────────────────────────────────────

    def test_free_flow_exit_grace(self) -> Dict[str, Any]:
        """Test grace period exit (free drop-off)."""
        print("\n  -- Test 3: Free-Flow Grace Period Exit --")

        results = {}
        enforcer = FreeFlowEnforcementEngine(grace_period_sec=300.0)
        enforcer.clear_state()

        # Register entry
        enforcer.process_entry(
            vehicle_number="TN01AB1234",
            camera_id="CAM_GATE_NORTH",
        )

        # Exit immediately (within grace period)
        exit_result = enforcer.process_exit(
            vehicle_number="TN01AB1234",
            payment_status="UNPAID",
            amount_due=80.0,
        )
        grace_ok = exit_result["status"] == "GRACE_EXEMPT" and exit_result["amountCharged"] == 0.0
        self._check("Grace period exit (free, no charge)", grace_ok,
                     f"status={exit_result['status']}, "
                     f"stay={exit_result['stayDurationSec']}s")
        results["grace_exit"] = grace_ok

        # Verify no active session after exit
        active = enforcer.get_active_entry("TN01AB1234")
        no_active_ok = active is None
        self._check("No active session after grace exit", no_active_ok)
        results["no_active_after_grace"] = no_active_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 4: Free-Flow Paid Exit
    # ──────────────────────────────────────────────────────────────────────────

    def test_free_flow_paid_exit(self) -> Dict[str, Any]:
        """Test paid exit clearance."""
        print("\n  -- Test 4: Free-Flow Paid Exit --")

        results = {}
        enforcer = FreeFlowEnforcementEngine(grace_period_sec=0.001)
        enforcer.clear_state()

        # Register entry
        enforcer.process_entry(vehicle_number="MH12XY9012", camera_id="CAM_GATE_WEST")

        # Wait enough to exceed the tiny grace period (0.001s)
        time.sleep(0.05)

        # Exit with payment
        exit_result = enforcer.process_exit(
            vehicle_number="MH12XY9012",
            payment_status="FASTAG_AUTODEV_SUCCESS",
            amount_due=80.0,
        )
        paid_ok = exit_result["status"] == "CLEARED" and exit_result["amountCharged"] == 80.0
        self._check("Paid exit cleared", paid_ok,
                     f"status={exit_result['status']}, "
                     f"charged=₹{exit_result['amountCharged']}")
        results["paid_exit"] = paid_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 5: Free-Flow Violation & Resolution
    # ──────────────────────────────────────────────────────────────────────────

    def test_free_flow_violation(self) -> Dict[str, Any]:
        """Test unpaid exit violation and resolution."""
        print("\n  -- Test 5: Free-Flow Violation & Resolution --")

        results = {}
        enforcer = FreeFlowEnforcementEngine(
            grace_period_sec=0.001,
            penalty_fee_inr=100.0,
        )
        enforcer.clear_state()

        # Register entry
        enforcer.process_entry(
            vehicle_number="DL05XY9012",
            camera_id="CAM_GATE_EAST",
            lot_id="LOT_DELHI_NORTH",
        )

        # Wait enough to exceed the tiny grace period (0.001s)
        time.sleep(0.05)

        # Exit unpaid
        exit_result = enforcer.process_exit(
            vehicle_number="DL05XY9012",
            payment_status="UNPAID",
            amount_due=80.0,
            lot_id="LOT_DELHI_NORTH",
        )
        viol_ok = exit_result["status"] == "VIOLATION_ISSUED"
        self._check("Unpaid exit violation issued", viol_ok,
                     f"status={exit_result['status']}")
        results["violation_issued"] = viol_ok

        if viol_ok:
            viol = exit_result["violation"]
            viol_details_ok = (
                viol["amountOwed"] == 80.0 and
                viol["penaltyFee"] == 100.0 and
                viol["totalOwed"] == 180.0
            )
            self._check("Violation contains correct amounts", viol_details_ok,
                         f"owed=₹{viol['amountOwed']}, "
                         f"penalty=₹{viol['penaltyFee']}, "
                         f"total=₹{viol['totalOwed']}")
            results["violation_amounts"] = viol_details_ok

            # Test violation query
            viol_id = viol["violationId"]
            queried = enforcer.get_violation(viol_id)
            query_ok = queried is not None and queried["status"] == "PENDING_NOTICE"
            self._check("Violation query by ID", query_ok)
            results["violation_query"] = query_ok

            # Test pending violations list
            pending = enforcer.get_all_pending_violations()
            pending_ok = len(pending) == 1
            self._check("Pending violations list", pending_ok,
                         f"count={len(pending)}")
            results["pending_list"] = pending_ok

            # Test vehicle violations query
            vehicle_viols = enforcer.get_vehicle_violations("DL05XY9012")
            vehicle_viol_ok = len(vehicle_viols) == 1
            self._check("Vehicle violations query", vehicle_viol_ok)
            results["vehicle_violations"] = vehicle_viol_ok

            # Test mark as notified
            notified = enforcer.mark_violation_notified(viol_id, channel="WHATSAPP")
            notified_ok = notified["status"] == "NOTIFIED" and notified["notifiedVia"] == "WHATSAPP"
            self._check("Violation marked as notified", notified_ok,
                         f"status={notified['status']}, via={notified['notifiedVia']}")
            results["violation_notified"] = notified_ok

            # Test violation resolution
            resolved = enforcer.resolve_violation(
                viol_id,
                payment_txn_id="TXN_FASTAG_123456",
            )
            resolved_ok = resolved["status"] == "RESOLVED"
            self._check("Violation resolved after payment", resolved_ok,
                         f"status={resolved['status']}")
            results["violation_resolved"] = resolved_ok

        # Test state summary
        summary = enforcer.state_summary()
        summary_ok = summary.get("activeEntries", -1) == 0 and summary.get("resolvedViolations", -1) >= 1
        self._check("State summary correct", summary_ok,
                     f"active={summary.get('activeEntries')}, "
                     f"resolved={summary.get('resolvedViolations')}")
        results["state_summary"] = summary_ok

        # Test non-existent entry exit
        no_entry = enforcer.process_exit(
            vehicle_number="NONEXISTENT",
            payment_status="UNPAID",
            amount_due=0,
        )
        no_entry_ok = no_entry["status"] == "ERROR" and no_entry["errorCode"] == "NO_ENTRY_RECORD"
        self._check("Non-existent entry returns error", no_entry_ok,
                     f"error={no_entry.get('errorCode')}")
        results["no_entry_error"] = no_entry_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 6: WhatsApp QR Pass & Booking
    # ──────────────────────────────────────────────────────────────────────────

    def test_whatsapp_qr_pass(self) -> Dict[str, Any]:
        """Test WhatsApp QR pass generation and booking confirmation."""
        print("\n  -- Test 6: WhatsApp QR Pass & Booking --")

        results = {}
        bot = WhatsAppParkingBot()
        bot.clear_message_log()

        # Test 6a: Interactive QR pass
        qr = bot.send_interactive_qr_pass(
            phone_number="+919876543210",
            vehicle_number="TN01AB1234",
            slot_id="A-12",
            lot_name="Chennai Central",
        )
        qr_ok = qr["status"] == "SENT" and qr["messageType"] == "QR_PASS"
        self._check("QR entry pass sent via WhatsApp", qr_ok,
                     f"msg_id={qr.get('messageId')}")
        results["qr_pass_sent"] = qr_ok

        # Test 6b: Booking confirmation
        booking = bot.send_booking_confirmation(
            phone_number="+919876543210",
            vehicle_number="KA03MN5678",
            lot_name="Bangalore East",
            slot_id="B-05",
            booking_time="2026-07-31T14:30:00Z",
            amount_inr=50.0,
        )
        booking_ok = booking["status"] == "SENT" and booking["messageType"] == "BOOKING_CONFIRM"
        self._check("Booking confirmation sent", booking_ok,
                     f"msg_id={booking.get('messageId')}")
        results["booking_sent"] = booking_ok

        # Test 6c: Message log
        log = bot.get_message_log()
        log_ok = len(log) == 2
        self._check("Message log has 2 entries", log_ok, f"count={len(log)}")
        results["message_log"] = log_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 7: WhatsApp Violation Notice & Receipt
    # ──────────────────────────────────────────────────────────────────────────

    def test_whatsapp_violation(self) -> Dict[str, Any]:
        """Test WhatsApp violation notice and payment receipt."""
        print("\n  -- Test 7: WhatsApp Violation Notice & Receipt --")

        results = {}
        bot = WhatsAppParkingBot()
        bot.clear_message_log()

        # Test 7a: Violation notice
        viol = bot.send_violation_notice(
            phone_number="+919876543210",
            vehicle_number="DL05XY9012",
            amount_owed=80.0,
            payment_link="https://upi.slots.ai/pay/VIOL_1234",
            penalty_fee=100.0,
            lot_name="Delhi North",
            violation_id="VIOL_1234ABCD",
        )
        viol_ok = viol["status"] == "DELIVERED" and viol["messageType"] == "VIOLATION_NOTICE"
        self._check("Violation notice delivered", viol_ok,
                     f"status={viol['status']}")
        results["violation_notice"] = viol_ok

        # Check that the message text contains the expected details
        text_ok = "₹80.00" in viol["text"] and "₹100.00" in viol["text"] and "VIOL_1234ABCD" in viol["text"]
        self._check("Violation notice contains correct details", text_ok)
        results["violation_text_details"] = text_ok

        # Test 7b: Payment receipt
        receipt = bot.send_payment_receipt(
            phone_number="+919876543210",
            vehicle_number="TN01AB1234",
            amount_paid=180.0,
            transaction_id="TXN_FASTAG_123456",
            lot_name="Chennai Central",
            payment_method="FASTag",
        )
        receipt_ok = receipt["status"] == "SENT" and receipt["messageType"] == "PAYMENT_RECEIPT"
        self._check("Payment receipt sent", receipt_ok,
                     f"status={receipt['status']}")
        results["payment_receipt"] = receipt_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 8: WhatsApp Webhook Processing
    # ──────────────────────────────────────────────────────────────────────────

    def test_whatsapp_webhook(self) -> Dict[str, Any]:
        """Test WhatsApp webhook event processing."""
        print("\n  -- Test 8: WhatsApp Webhook Processing --")

        results = {}
        bot = WhatsAppParkingBot()

        # Test 8a: Booking request intent
        booking_webhook = {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "+919876543210",
                            "id": "wamid.booking_request",
                            "type": "text",
                            "text": {"body": "I want to book a parking slot"}
                        }]
                    }
                }]
            }]
        }
        booking_event = bot.process_webhook_event(booking_webhook)
        booking_intent_ok = booking_event["intent"] == "BOOKING_REQUEST"
        self._check("Booking request intent detected", booking_intent_ok,
                     f"intent={booking_event['intent']}")
        results["booking_intent"] = booking_intent_ok

        # Test 8b: Payment request intent
        pay_webhook = {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "+919876543210",
                            "id": "wamid.pay_request",
                            "type": "text",
                            "text": {"body": "I need to pay my parking fee"}
                        }]
                    }
                }]
            }]
        }
        pay_event = bot.process_webhook_event(pay_webhook)
        pay_intent_ok = pay_event["intent"] == "PAYMENT_REQUEST"
        self._check("Payment request intent detected", pay_intent_ok,
                     f"intent={pay_event['intent']}")
        results["payment_intent"] = pay_intent_ok

        # Test 8c: Help intent
        help_webhook = {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "+919876543210",
                            "id": "wamid.help_request",
                            "type": "text",
                            "text": {"body": "Can you help me?"}
                        }]
                    }
                }]
            }]
        }
        help_event = bot.process_webhook_event(help_webhook)
        help_intent_ok = help_event["intent"] == "HELP"
        self._check("Help intent detected", help_intent_ok,
                     f"intent={help_event['intent']}")
        results["help_intent"] = help_intent_ok

        # Test 8d: Interactive button reply
        interactive_webhook = {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "+919876543210",
                            "id": "wamid.interactive_reply",
                            "type": "interactive",
                            "interactive": {
                                "type": "button_reply",
                                "button_reply": {"id": "CONFIRM_BOOKING"}
                            }
                        }]
                    }
                }]
            }]
        }
        interactive_event = bot.process_webhook_event(interactive_webhook)
        interactive_ok = interactive_event["intent"] == "BOOKING_CONFIRMED"
        self._check("Interactive booking confirm processed", interactive_ok,
                     f"intent={interactive_event['intent']}")
        results["interactive_confirm"] = interactive_ok

        # Test 8e: Empty webhook (no entries)
        empty_webhook = {}
        empty_event = bot.process_webhook_event(empty_webhook)
        empty_ok = empty_event["status"] == "IGNORED"
        self._check("Empty webhook ignored", empty_ok,
                     f"status={empty_event['status']}")
        results["empty_webhook"] = empty_ok

        # Test 8f: General query fallback
        general_webhook = {
            "entry": [{
                "changes": [{
                    "value": {
                        "messages": [{
                            "from": "+919876543210",
                            "id": "wamid.general_query",
                            "type": "text",
                            "text": {"body": "Hello"}
                        }]
                    }
                }]
            }]
        }
        general_event = bot.process_webhook_event(general_webhook)
        general_ok = general_event["intent"] == "GENERAL_QUERY"
        self._check("General query fallback handles unknown text", general_ok,
                     f"intent={general_event['intent']}")
        results["general_query"] = general_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   TEST 9: UPI Payment Link Generation
    # ──────────────────────────────────────────────────────────────────────────

    def test_upi_link_generation(self) -> Dict[str, Any]:
        """Test UPI payment link generation."""
        print("\n  -- Test 9: UPI Payment Link Generation --")

        results = {}

        # Test 9a: Basic UPI link
        link = WhatsAppParkingBot.generate_upi_payment_link(
            amount_inr=180.0,
            reference_id="VIOL_1234ABCD",
        )
        link_ok = link.startswith("upi://pay?") and "pa=slots%40upi" in link
        self._check("UPI link generated with correct format", link_ok,
                     f"link={link[:60]}...")
        results["upi_format"] = link_ok

        # Test 9b: Amount in link
        amt_ok = "am=180.00" in link
        self._check("Correct amount in UPI link", amt_ok)
        results["upi_amount"] = amt_ok

        # Test 9c: Reference in link
        ref_ok = "tr=VIOL_1234ABCD" in link
        self._check("Reference ID in UPI link", ref_ok)
        results["upi_reference"] = ref_ok

        # Test 9d: Custom VPA
        custom_link = WhatsAppParkingBot.generate_upi_payment_link(
            amount_inr=50.0,
            reference_id="BOOK_1234",
            payee_vpa="slots.parking@icici",
        )
        custom_ok = "pa=slots.parking%40icici" in custom_link
        self._check("Custom VPA in UPI link", custom_ok)
        results["upi_custom_vpa"] = custom_ok

        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   RUN ALL TESTS
    # ──────────────────────────────────────────────────────────────────────────

    def run_all(self) -> Dict[str, Any]:
        """Run all Module 6 benchmark tests."""
        print("=" * 70)
        print("  SLOTS Module 6: Barrier-Free, Two-Wheeler AI & WhatsApp Bot")
        print("=" * 70)

        if not IMPORT_OK:
            print("\n[FAIL] Import error — skipping benchmarks")
            return {"status": "failed", "error": "ImportError"}

        all_results = {}

        all_results["two_wheeler_density"] = self.test_two_wheeler_density()
        all_results["free_flow_entry"] = self.test_free_flow_entry()
        all_results["free_flow_grace_exit"] = self.test_free_flow_exit_grace()
        all_results["free_flow_paid_exit"] = self.test_free_flow_paid_exit()
        all_results["free_flow_violation"] = self.test_free_flow_violation()
        all_results["whatsapp_qr_pass"] = self.test_whatsapp_qr_pass()
        all_results["whatsapp_violation"] = self.test_whatsapp_violation()
        all_results["whatsapp_webhook"] = self.test_whatsapp_webhook()
        all_results["upi_link"] = self.test_upi_link_generation()

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
        description="SLOTS Module 6: Barrier-Free, Two-Wheeler AI & WhatsApp Bot"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output JSON file for benchmark results"
    )
    args = parser.parse_args()

    suite = Module6BenchmarkSuite()
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
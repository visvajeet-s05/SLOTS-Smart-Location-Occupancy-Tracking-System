"""
Smoke test for Slotify Pilot Step 1 pipeline logic.
Validates slot loading, raw occupancy matching, anti-flicker persistence buffer,
and all 4 reconciliation cases WITHOUT requiring a live camera or display window.
"""
import os
import sys
import json
import time
from collections import deque
from datetime import datetime, timedelta
from shapely.geometry import Polygon, box
import numpy as np
import supervision as sv

# Ensure we can import pilot modules
sys.path.insert(0, os.path.dirname(__file__))

import config
import mock_bookings
from pilot_step1 import SlotifyPilotPipeline

PASS = 0
FAIL = 0

def check(name, condition, detail=""):
    global PASS, FAIL
    status = "PASS" if condition else "FAIL"
    if condition:
        PASS += 1
    else:
        FAIL += 1
    print(f"[{status}] {name}" + (f" - {detail}" if detail else ""))
    return condition

def main():
    print("=" * 60)
    print("SLOTIFY PILOT STEP 1 - SMOKE TEST")
    print("=" * 60)

    # --- 1. Verify slots.json loads correctly ---
    print("\n--- 1. Slot Loading ---")
    pipeline = SlotifyPilotPipeline()
    check("Slots loaded", len(pipeline.slots) > 0, f"{len(pipeline.slots)} slots")
    check("Slot IDs unique", len({s['slot_id'] for s in pipeline.slots}) == len(pipeline.slots))
    check("All polygons valid", all(s['polygon'].is_valid for s in pipeline.slots))
    check("All polygons have area > 0", all(s['area'] > 0 for s in pipeline.slots))

    # --- 2. Raw Occupancy Matching ---
    print("\n--- 2. Raw Occupancy Matching ---")
    # Create a synthetic detection that fully covers SLOT_A1
    slot_a1 = next(s for s in pipeline.slots if s['slot_id'] == 'SLOT_A1')
    bounds = slot_a1['polygon'].bounds  # (minx, miny, maxx, maxy)
    # Expand slightly to ensure full coverage
    car_box = box(bounds[0] - 5, bounds[1] - 5, bounds[2] + 5, bounds[3] + 5)
    xyxy = [car_box.bounds[0], car_box.bounds[1], car_box.bounds[2], car_box.bounds[3]]
    
    # Detection format: (xyxy, confidence, class_id, tracker_id)
    detections = [(xyxy, 0.95, 2, 1)]  # Car class, high confidence
    raw = pipeline._get_raw_occupancy(detections)
    check("SLOT_A1 detected occupied", raw['SLOT_A1'] is True)
    check("Other slots not occupied", all(not raw[sid] for sid in raw if sid != 'SLOT_A1'))

    # Test empty detections
    raw_empty = pipeline._get_raw_occupancy([])
    check("Empty detections -> all available", all(not v for v in raw_empty.values()))

    # Test low confidence detection is ignored
    detections_low_conf = [(xyxy, 0.5, 2, 1)]  # Below 0.85 threshold
    raw_low = pipeline._get_raw_occupancy(detections_low_conf)
    check("Low confidence ignored", all(not v for v in raw_low.values()))

    # Test non-vehicle class ignored
    detections_person = [(xyxy, 0.95, 0, 1)]  # Person class (0)
    raw_person = pipeline._get_raw_occupancy(detections_person)
    check("Non-vehicle class ignored", all(not v for v in raw_person.values()))

    # Build a proper sv.Detections object for ByteTrack (matches real pipeline)
    def make_sv_detections(det_list):
        if not det_list:
            return sv.Detections.empty()
        xyxy_arr = np.array([d[0] for d in det_list], dtype=np.float32)
        conf_arr = np.array([d[1] for d in det_list], dtype=np.float32)
        cls_arr = np.array([d[2] for d in det_list], dtype=int)
        return sv.Detections(xyxy=xyxy_arr, confidence=conf_arr, class_id=cls_arr)

    sv_detections = make_sv_detections(detections)

    # --- 3. Anti-Flicker Persistence Buffer ---
    print("\n--- 3. Anti-Flicker Persistence Buffer ---")
    # Simulate 3 consecutive occupied readings -> state change confirmed
    now_sec = time.time()
    states = pipeline._update_anti_flicker_states(
        {sid: (sid == 'SLOT_A1') for sid in raw}, now_sec, sv_detections
    )
    check("No state change on 1st reading", 'SLOT_A1' not in states)
    check("Persistence buffer size 1", len(pipeline.persistence_buffers['SLOT_A1']) == 1)

    # 2nd reading
    states = pipeline._update_anti_flicker_states(
        {sid: (sid == 'SLOT_A1') for sid in raw}, now_sec, sv_detections
    )
    check("No state change on 2nd reading", 'SLOT_A1' not in states)

    # 3rd reading -> confirmed
    states = pipeline._update_anti_flicker_states(
        {sid: (sid == 'SLOT_A1') for sid in raw}, now_sec, sv_detections
    )
    check("State change confirmed on 3rd reading", 'SLOT_A1' in states)
    check("Trigger reason is PERSISTENCE_BUFFER", states.get('SLOT_A1') == 'PERSISTENCE_BUFFER')
    check("Confirmed vision state updated", pipeline.confirmed_vision_state['SLOT_A1'] is True)
    check("Burst mode activated", pipeline.burst_mode_active['SLOT_A1'] is True)

    # --- 3b. ByteTrack Validation during active Burst Window ---
    print("\n--- 3b. ByteTrack Burst Window Validation ---")
    # Force an active burst window and re-evaluate a POST-state-change reading
    # to exercise the ByteTrack secondary mechanism for a DIFFERENT slot (SLOT_A2)
    # so the PERSISTENCE_BUFFER trigger isn't re-firing for the same slot.
    slot_a2 = next(s for s in pipeline.slots if s['slot_id'] == 'SLOT_A2')
    a2_bounds = slot_a2['polygon'].bounds
    a2_xyxy = [a2_bounds[0] - 5, a2_bounds[1] - 5, a2_bounds[2] + 5, a2_bounds[3] + 5]
    a2_det = [(a2_xyxy, 0.95, 2, 1)]
    sv_a2 = make_sv_detections(a2_det)
    a2_raw = pipeline._get_raw_occupancy(a2_det)
    check("SLOT_A2 detected occupied", a2_raw['SLOT_A2'] is True)

    # Force burst window active for SLOT_A2 (within duration)
    burst_now = time.time()
    pipeline.burst_mode_active['SLOT_A2'] = True
    pipeline.burst_end_time['SLOT_A2'] = burst_now + 5.0
    # Fill persistence buffer with identical readings so no persistence trigger fires
    pipeline.persistence_buffers['SLOT_A2'] = deque([True, True, True])
    pipeline.confirmed_vision_state['SLOT_A2'] = True  # already confirmed

    # During burst, ByteTrack should report activity for the slot
    states_burst = pipeline._update_anti_flicker_states(
        {sid: (sid == 'SLOT_A2') for sid in a2_raw}, burst_now, sv_a2
    )
    check("ByteTrack active during burst window", states_burst.get('SLOT_A2') == 'BURST_BYTETRACK_ACTIVE', str(states_burst))

    # After burst window expires, ByteTrack no longer reports
    pipeline.burst_mode_active['SLOT_A2'] = False
    pipeline.burst_end_time['SLOT_A2'] = 0
    states_after = pipeline._update_anti_flicker_states(
        {sid: (sid == 'SLOT_A2') for sid in a2_raw}, burst_now + 100, sv_a2
    )
    check("ByteTrack inactive after burst window", 'SLOT_A2' not in states_after, str(states_after))

    # --- 4. Reconciliation Cases ---
    print("\n--- 4. Reconciliation Cases ---")
    # CASE 1: Normal/Sync - occupied with active booking
    booking_active = {
        "booking_id": "BK-TEST1",
        "status": "ACTIVE",
        "start_time": datetime.now() - timedelta(minutes=10),
        "end_time": datetime.now() + timedelta(minutes=30)
    }
    res = pipeline.reconcile_slot_state("SLOT_A1", True, booking_active)
    check("CASE 1: Sync occupied", res['action'] == 'SYNC' and res['status'] == 'OCCUPIED', str(res))

    # CASE 1b: Sync available
    res = pipeline.reconcile_slot_state("SLOT_A1", False, booking_active)
    check("CASE 1: Sync available", res['action'] == 'SYNC' and res['status'] == 'AVAILABLE', str(res))

    # CASE 2: Unpaid occupancy - occupied, no booking
    res = pipeline.reconcile_slot_state("SLOT_A4", True, None)
    check("CASE 2: Unpaid occupancy alert", res['action'] == 'UNPAID_OCCUPANCY_ALERT', str(res))

    # CASE 3: Overstay - occupied past end time
    booking_expired = {
        "booking_id": "BK-TEST2",
        "status": "ACTIVE",
        "start_time": datetime.now() - timedelta(hours=2),
        "end_time": datetime.now() - timedelta(minutes=5)
    }
    res = pipeline.reconcile_slot_state("SLOT_A2", True, booking_expired)
    check("CASE 3: Grace period started", res['action'] == 'GRACE_PERIOD_STARTED', str(res))

    # Simulate grace period expiry
    pipeline.grace_timers['SLOT_A2'] = datetime.now() - timedelta(minutes=config.OVERSTAY_GRACE_MINUTES + 1)
    res = pipeline.reconcile_slot_state("SLOT_A2", True, booking_expired)
    check("CASE 3: Pending surcharge after grace", res['action'] == 'PENDING_SURCHARGE', str(res))

    # Clear grace timer
    del pipeline.grace_timers['SLOT_A2']

    # CASE 4: No-show - available, upcoming booking past threshold
    booking_upcoming = {
        "booking_id": "BK-TEST3",
        "status": "UPCOMING",
        "start_time": datetime.now() - timedelta(minutes=config.NO_SHOW_THRESHOLD_MINUTES + 1),
        "end_time": datetime.now() + timedelta(hours=1)
    }
    res = pipeline.reconcile_slot_state("SLOT_A3", False, booking_upcoming)
    check("CASE 4: Auto-release no-show", res['action'] == 'AUTO_RELEASE_SLOT', str(res))

    # CASE 4b: No-show not yet triggered (within threshold)
    booking_upcoming_recent = {
        "booking_id": "BK-TEST4",
        "status": "UPCOMING",
        "start_time": datetime.now() - timedelta(minutes=5),
        "end_time": datetime.now() + timedelta(hours=1)
    }
    res = pipeline.reconcile_slot_state("SLOT_A3", False, booking_upcoming_recent)
    check("CASE 4: No-show not yet (within threshold)", res['action'] == 'SYNC', str(res))

    # --- 5. Mock Bookings Fixtures ---
    print("\n--- 5. Mock Bookings Fixtures ---")
    bookings = mock_bookings.get_mock_bookings()
    check("SLOT_A1 has ACTIVE booking", bookings['SLOT_A1']['status'] == 'ACTIVE')
    check("SLOT_A2 has expired booking", bookings['SLOT_A2']['end_time'] < datetime.now())
    check("SLOT_A3 has UPCOMING booking", bookings['SLOT_A3']['status'] == 'UPCOMING')
    check("SLOT_A4 has no booking", bookings['SLOT_A4'] is None)
    check("get_booking returns None for unknown", mock_bookings.get_booking("UNKNOWN_SLOT") is None)

    # --- 6. YOLO Model Load ---
    print("\n--- 6. YOLO Model Load ---")
    check("YOLO model loaded", pipeline.model is not None, config.YOLO_MODEL_PATH)

    print("\n" + "=" * 60)
    print(f"SMOKE TEST RESULTS: {PASS} passed, {FAIL} failed")
    print("=" * 60)
    return 0 if FAIL == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
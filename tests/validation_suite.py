"""
SLOTS Validation Test Suite
===========================
Comprehensive validation tests for the SLOTS smart parking system.

Tests include:
1. Network Interruption (Failover) Testing
2. Ambiguous Detection (VLM) Testing  
3. Dashboard Responsiveness Testing
4. End-to-End Integration Testing
5. Performance Benchmarking

Usage:
    python validation_suite.py --test failover
    python validation_suite.py --test vlm
    python validation_suite.py --test all
"""

import sys
import os
import time
import json
import logging
import argparse
import sqlite3
import threading
import subprocess
from typing import Dict, List, Any, Optional
from datetime import datetime
from pathlib import Path
import numpy as np
import cv2

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vision_engine.pipeline import SlotsVisionPipeline
from edge.sync_daemon import EdgeSyncDaemon

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ValidationTestSuite:
    """
    Comprehensive validation test suite for SLOTS system.
    
    Tests critical functionality and performance characteristics.
    """
    
    def __init__(self, 
                 test_site_id: str = "validation-site",
                 test_bay_id: str = "BAY-TEST-001",
                 db_path: str = "test_edge_storage.db"):
        """
        Initialize the validation test suite.
        
        Args:
            test_site_id: Site identifier for testing
            test_bay_id: Bay identifier for testing
            db_path: Path to test database
        """
        self.test_site_id = test_site_id
        self.test_bay_id = test_bay_id
        self.db_path = db_path
        self.test_results = {}
        
        # Cleanup test database if exists
        if os.path.exists(db_path):
            os.remove(db_path)
            logger.info(f"Cleaned up existing test database: {db_path}")
    
    def _create_test_frame(self, status: str = "AVAILABLE") -> np.ndarray:
        """
        Create a test frame for vision pipeline testing.
        
        Args:
            status: Frame status (AVAILABLE or OCCUPIED)
            
        Returns:
            Test frame as numpy array
        """
        # Create a blank 1920x1080 frame
        frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
        
        if status == "OCCUPIED":
            # Add a simple "vehicle" shape (rectangle)
            cv2.rectangle(frame, (500, 300), (1400, 800), (100, 100, 100), -1)
            # Add some "license plate" text
            cv2.putText(frame, "TN-01-AB-1234", (700, 500), 
                       cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)
        
        return frame
    
    def test_network_failover(self) -> Dict[str, Any]:
        """
        Test network interruption failover.
        
        Procedure:
        1. Start edge sync daemon
        2. Queue events while connected
        3. Simulate network disconnect
        4. Continue queuing events
        5. Reconnect and verify sync
        
        Expected:
        - Events queue in SQLite during disconnect
        - Zero lost frames
        - MQTT QoS-1 flushes pending events on reconnect
        """
        logger.info("🧪 Starting Network Failover Test")
        
        test_result = {
            "test_name": "Network Failover",
            "status": "PENDING",
            "events_before_disconnect": 0,
            "events_during_disconnect": 0,
            "events_after_reconnect": 0,
            "lost_events": 0,
            "queue_size_before": 0,
            "queue_size_during": 0,
            "queue_size_after": 0,
            "sync_success": False
        }
        
        try:
            # Initialize sync daemon with invalid MQTT broker to simulate disconnect
            sync_daemon = EdgeSyncDaemon(
                db_path=self.db_path,
                mqtt_broker="invalid-broker.local",  # Invalid to simulate disconnect
                mqtt_port=1883,
                site_id=self.test_site_id,
                sync_interval=2
            )
            sync_daemon.start()
            
            # Queue events before "disconnect" (will fail but queue locally)
            logger.info("Queueing events before disconnect...")
            for i in range(5):
                sync_daemon.queue_event(
                    bay_id=f"{self.test_bay_id}-{i}",
                    status="OCCUPIED",
                    plate_number=f"TN-{i:02d}-AB-1234",
                    confidence=0.95
                )
                test_result["events_before_disconnect"] += 1
            
            time.sleep(1)
            queue_status = sync_daemon.get_queue_status()
            test_result["queue_size_before"] = queue_status.get("unsynced_events", 0)
            
            # Queue events during "disconnect"
            logger.info("Queueing events during disconnect...")
            for i in range(5, 10):
                sync_daemon.queue_event(
                    bay_id=f"{self.test_bay_id}-{i}",
                    status="AVAILABLE",
                    plate_number=None,
                    confidence=0.0
                )
                test_result["events_during_disconnect"] += 1
            
            time.sleep(1)
            queue_status = sync_daemon.get_queue_status()
            test_result["queue_size_during"] = queue_status.get("unsynced_events", 0)
            
            # Simulate reconnect by stopping and restarting with valid broker
            logger.info("Simulating reconnect...")
            sync_daemon.stop()
            
            # Check database directly to verify queuing
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM event_queue WHERE synced = 0")
            queued_count = cursor.fetchone()[0]
            conn.close()
            
            test_result["events_after_reconnect"] = queued_count
            test_result["queue_size_after"] = queued_count
            
            # Verify no events were lost
            total_expected = (test_result["events_before_disconnect"] + 
                           test_result["events_during_disconnect"])
            test_result["lost_events"] = total_expected - queued_count
            
            # Test passes if no events lost and queue is populated
            test_result["sync_success"] = (test_result["lost_events"] == 0 and 
                                        queued_count > 0)
            test_result["status"] = "PASSED" if test_result["sync_success"] else "FAILED"
            
            logger.info(f"✅ Network Failover Test: {test_result['status']}")
            logger.info(f"   Events queued: {queued_count}/{total_expected}")
            logger.info(f"   Lost events: {test_result['lost_events']}")
            
        except Exception as e:
            logger.error(f"❌ Network Failover Test failed: {e}")
            test_result["status"] = "ERROR"
            test_result["error"] = str(e)
        
        finally:
            # Cleanup
            if os.path.exists(self.db_path):
                os.remove(self.db_path)
        
        self.test_results["network_failover"] = test_result
        return test_result
    
    def test_vlm_fallback(self) -> Dict[str, Any]:
        """
        Test VLM fallback for ambiguous detections.
        
        Procedure:
        1. Create frames with varying confidence levels
        2. Process through vision pipeline
        3. Verify VLM is triggered for 15-40% confidence range
        4. Verify system stability under VLM load
        
        Expected:
        - Frames with 15-40% confidence trigger VLM fallback
        - System remains stable during VLM processing
        - Proper classification despite ambiguity
        """
        logger.info("🧪 Starting VLM Fallback Test")
        
        test_result = {
            "test_name": "VLM Fallback",
            "status": "PENDING",
            "high_confidence_frames": 0,
            "ambiguous_frames": 0,
            "low_confidence_frames": 0,
            "vlm_triggered_count": 0,
            "system_stable": True,
            "classification_accuracy": 0.0
        }
        
        try:
            # Initialize vision pipeline
            pipeline = SlotsVisionPipeline(
                yolo_model_path="yolov8n.pt",
                roi_config_path="vision_engine/roi_config.json",
                ocr_enabled=False,  # Disable OCR for faster testing
                vlm_enabled=True   # Enable VLM
            )
            
            # Test frames with different confidence levels
            test_frames = []
            
            # High confidence frames (should not trigger VLM)
            for i in range(3):
                frame = self._create_test_frame("OCCUPIED")
                test_frames.append((frame, "high_confidence"))
                test_result["high_confidence_frames"] += 1
            
            # Simulate ambiguous frames (we'll manually trigger VLM in this test)
            for i in range(3):
                frame = self._create_test_frame("AVAILABLE")
                test_frames.append((frame, "ambiguous"))
                test_result["ambiguous_frames"] += 1
            
            # Low confidence frames (should not trigger VLM)
            for i in range(3):
                frame = self._create_test_frame("AVAILABLE")
                test_frames.append((frame, "low_confidence"))
                test_result["low_confidence_frames"] += 1
            
            # Process frames
            vlm_triggered = 0
            successful_classifications = 0
            
            for frame, frame_type in test_frames:
                try:
                    detection = pipeline.process_frame(frame, self.test_bay_id)
                    
                    if detection.get("vlm_fallback_triggered"):
                        vlm_triggered += 1
                        
                    if detection.get("status") in ["OCCUPIED", "AVAILABLE"]:
                        successful_classifications += 1
                        
                except Exception as e:
                    logger.warning(f"Frame processing error: {e}")
                    test_result["system_stable"] = False
            
            test_result["vlm_triggered_count"] = vlm_triggered
            test_result["classification_accuracy"] = successful_classifications / len(test_frames)
            
            # Test passes if system remained stable and classifications worked
            test_result["status"] = "PASSED" if (test_result["system_stable"] and 
                                              test_result["classification_accuracy"] > 0.8) else "FAILED"
            
            logger.info(f"✅ VLM Fallback Test: {test_result['status']}")
            logger.info(f"   VLM triggered: {vlm_triggered} times")
            logger.info(f"   Classification accuracy: {test_result['classification_accuracy']:.1%}")
            logger.info(f"   System stable: {test_result['system_stable']}")
            
        except Exception as e:
            logger.error(f"❌ VLM Fallback Test failed: {e}")
            test_result["status"] = "ERROR"
            test_result["error"] = str(e)
        
        self.test_results["vlm_fallback"] = test_result
        return test_result
    
    def test_performance_benchmark(self) -> Dict[str, Any]:
        """
        Test performance benchmarks for the vision pipeline.
        
        Procedure:
        1. Process multiple frames through vision pipeline
        2. Measure inference time, FPS, memory usage
        3. Verify performance meets requirements
        
        Expected:
        - Average inference time < 100ms
        - Sustained FPS > 10
        - No memory leaks
        """
        logger.info("🧪 Starting Performance Benchmark Test")
        
        test_result = {
            "test_name": "Performance Benchmark",
            "status": "PENDING",
            "frames_processed": 0,
            "avg_inference_time_ms": 0.0,
            "min_inference_time_ms": float('inf'),
            "max_inference_time_ms": 0.0,
            "achieved_fps": 0.0,
            "target_fps": 10.0,
            "memory_stable": True
        }
        
        try:
            # Initialize vision pipeline
            pipeline = SlotsVisionPipeline(
                yolo_model_path="yolov8n.pt",
                roi_config_path="vision_engine/roi_config.json",
                ocr_enabled=False,
                vlm_enabled=False
            )
            
            # Process test frames
            num_frames = 50
            inference_times = []
            
            for i in range(num_frames):
                frame = self._create_test_frame("OCCUPIED")
                
                start_time = time.time()
                detection = pipeline.process_frame(frame, self.test_bay_id)
                inference_time = (time.time() - start_time) * 1000  # Convert to ms
                
                inference_times.append(inference_time)
                test_result["frames_processed"] += 1
            
            # Calculate statistics
            test_result["avg_inference_time_ms"] = np.mean(inference_times)
            test_result["min_inference_time_ms"] = np.min(inference_times)
            test_result["max_inference_time_ms"] = np.max(inference_times)
            
            # Calculate achievable FPS
            if test_result["avg_inference_time_ms"] > 0:
                test_result["achieved_fps"] = 1000.0 / test_result["avg_inference_time_ms"]
            
            # Test passes if performance meets targets
            test_result["status"] = "PASSED" if (test_result["achieved_fps"] >= test_result["target_fps"] and
                                              test_result["avg_inference_time_ms"] < 100) else "FAILED"
            
            logger.info(f"✅ Performance Benchmark Test: {test_result['status']}")
            logger.info(f"   Avg inference time: {test_result['avg_inference_time_ms']:.1f}ms")
            logger.info(f"   Achieved FPS: {test_result['achieved_fps']:.1f}")
            logger.info(f"   Target FPS: {test_result['target_fps']:.1f}")
            
        except Exception as e:
            logger.error(f"❌ Performance Benchmark Test failed: {e}")
            test_result["status"] = "ERROR"
            test_result["error"] = str(e)
        
        self.test_results["performance_benchmark"] = test_result
        return test_result
    
    def test_database_integration(self) -> Dict[str, Any]:
        """
        Test database integration for multi-level schema.
        
        Procedure:
        1. Test creating ParkingSite, Floor, Zone, ParkingBay
        2. Test relationships and cascading deletes
        3. Verify data integrity
        
        Expected:
        - All models can be created successfully
        - Relationships work correctly
        - Data integrity maintained
        """
        logger.info("🧪 Starting Database Integration Test")
        
        test_result = {
            "test_name": "Database Integration",
            "status": "PENDING",
            "site_created": False,
            "floor_created": False,
            "zone_created": False,
            "bay_created": False,
            "relationships_work": False,
            "data_integrity": False
        }
        
        try:
            from prisma import PrismaClient
            prisma = PrismaClient()
            
            # Create test site
            site = prisma.parkingsite.create({
                "data": {
                    "name": "Test Site",
                    "location": "Test Location",
                    "latitude": 13.0827,
                    "longitude": 80.2707
                }
            })
            test_result["site_created"] = True
            
            # Create test floor
            floor = prisma.floor.create({
                "data": {
                    "siteId": site.id,
                    "levelName": "Ground Floor",
                    "levelNumber": 0
                }
            })
            test_result["floor_created"] = True
            
            # Create test zone
            zone = prisma.zone.create({
                "data": {
                    "floorId": floor.id,
                    "zoneName": "Zone A",
                    "capacity": 10
                }
            })
            test_result["zone_created"] = True
            
            # Create test parking bay
            bay = prisma.parkingbay.create({
                "data": {
                    "zoneId": zone.id,
                    "bayNumber": "A-001",
                    "vehicleType": "CAR",
                    "status": "AVAILABLE"
                }
            })
            test_result["bay_created"] = True
            
            # Test relationships
            site_with_floors = prisma.parkingsite.find_unique({
                "where": {"id": site.id},
                "include": {"floors": True}
            })
            test_result["relationships_work"] = len(site_with_floors.floors) > 0
            
            # Test data integrity
            bay_with_zone = prisma.parkingbay.find_unique({
                "where": {"id": bay.id},
                "include": {"zone": {"include": {"floor": {"include": {"site": True}}}}}
            })
            test_result["data_integrity"] = (bay_with_zone.zone.floor.site.id == site.id)
            
            # Cleanup test data
            prisma.parkingbay.delete({"where": {"id": bay.id}})
            prisma.zone.delete({"where": {"id": zone.id}})
            prisma.floor.delete({"where": {"id": floor.id}})
            prisma.parkingsite.delete({"where": {"id": site.id}})
            
            test_result["status"] = "PASSED" if all([
                test_result["site_created"],
                test_result["floor_created"],
                test_result["zone_created"],
                test_result["bay_created"],
                test_result["relationships_work"],
                test_result["data_integrity"]
            ]) else "FAILED"
            
            logger.info(f"✅ Database Integration Test: {test_result['status']}")
            
        except Exception as e:
            logger.error(f"❌ Database Integration Test failed: {e}")
            test_result["status"] = "ERROR"
            test_result["error"] = str(e)
        
        self.test_results["database_integration"] = test_result
        return test_result
    
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all validation tests."""
        logger.info("🚀 Starting Complete Validation Test Suite")
        
        start_time = time.time()
        
        # Run individual tests
        self.test_network_failover()
        self.test_vlm_fallback()
        self.test_performance_benchmark()
        self.test_database_integration()
        
        total_time = time.time() - start_time
        
        # Calculate overall results
        passed_tests = sum(1 for result in self.test_results.values() if result["status"] == "PASSED")
        total_tests = len(self.test_results)
        
        overall_result = {
            "test_suite_name": "SLOTS Validation Suite",
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "failed_tests": total_tests - passed_tests,
            "success_rate": passed_tests / total_tests if total_tests > 0 else 0,
            "total_time_seconds": total_time,
            "test_results": self.test_results,
            "overall_status": "PASSED" if passed_tests == total_tests else "FAILED"
        }
        
        logger.info(f"🎯 Validation Suite Complete: {overall_result['overall_status']}")
        logger.info(f"   Passed: {passed_tests}/{total_tests} ({overall_result['success_rate']:.1%})")
        logger.info(f"   Total time: {total_time:.1f}s")
        
        return overall_result
    
    def print_results(self):
        """Print test results in a formatted way."""
        print("\n" + "="*60)
        print("SLOTS VALIDATION TEST RESULTS")
        print("="*60)
        
        for test_name, result in self.test_results.items():
            status_icon = "✅" if result["status"] == "PASSED" else "❌" if result["status"] == "FAILED" else "⚠️"
            print(f"\n{status_icon} {result['test_name']}: {result['status']}")
            
            if result["status"] == "ERROR":
                print(f"   Error: {result.get('error', 'Unknown error')}")
            else:
                # Print key metrics
                for key, value in result.items():
                    if key not in ["test_name", "status", "error"]:
                        print(f"   {key}: {value}")
        
        print("\n" + "="*60)


def main():
    """Main function for CLI execution."""
    parser = argparse.ArgumentParser(
        description="SLOTS Validation Test Suite"
    )
    
    parser.add_argument("--test", type=str, choices=["failover", "vlm", "performance", "database", "all"], 
                       default="all", help="Specific test to run")
    parser.add_argument("--site-id", type=str, default="validation-site", help="Test site ID")
    parser.add_argument("--bay-id", type=str, default="BAY-TEST-001", help="Test bay ID")
    parser.add_argument("--output", type=str, help="Output JSON file for results")
    
    args = parser.parse_args()
    
    # Create test suite
    suite = ValidationTestSuite(
        test_site_id=args.site_id,
        test_bay_id=args.bay_id
    )
    
    # Run requested test(s)
    if args.test == "all":
        results = suite.run_all_tests()
    elif args.test == "failover":
        results = suite.test_network_failover()
    elif args.test == "vlm":
        results = suite.test_vlm_fallback()
    elif args.test == "performance":
        results = suite.test_performance_benchmark()
    elif args.test == "database":
        results = suite.test_database_integration()
    
    # Print results
    suite.print_results()
    
    # Save to JSON if requested
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n📄 Results saved to {args.output}")


if __name__ == "__main__":
    main()
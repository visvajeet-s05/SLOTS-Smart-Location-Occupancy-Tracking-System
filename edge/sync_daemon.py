"""
SLOTS Edge Sync Daemon - Offline Storage & MQTT Synchronization
==================================================================
This module implements an edge synchronization layer for offline operation:
- SQLite local storage for events during internet outages
- MQTT QoS-1 for reliable message delivery
- Exponential backoff for connection failures
- Non-blocking queue writes to maintain real-time vision loop performance

Requirements:
- SQLite3 for local storage
- MQTT client for IoT communication
- Network monitoring for connectivity detection
"""

import sqlite3
import json
import time
import logging
import threading
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
import queue
import socket
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class OccupancyEvent:
    """Data class for occupancy events."""
    bay_id: str
    status: str  # OCCUPIED, AVAILABLE, RESERVED, TAMPER_ALERT
    plate_number: Optional[str]
    confidence: float
    timestamp: str
    synced: bool = False


class EdgeSyncDaemon:
    """
    Edge synchronization daemon for offline operation and MQTT sync.
    
    Features:
    - Local SQLite storage for event queuing
    - Network connectivity monitoring
    - MQTT QoS-1 for reliable message delivery
    - Exponential backoff retry mechanism
    - Non-blocking event queueing
    """
    
    def __init__(self, 
                 db_path: str = "edge_storage.db",
                 mqtt_broker: str = "localhost",
                 mqtt_port: int = 1883,
                 mqtt_topic: str = "slots/edge/{site_id}/occupancy",
                 site_id: str = "default-site",
                 sync_interval: int = 5,
                 max_retries: int = 10):
        """
        Initialize the edge sync daemon.
        
        Args:
            db_path: Path to SQLite database file
            mqtt_broker: MQTT broker address
            mqtt_port: MQTT broker port
            mqtt_topic: MQTT topic template (use {site_id} placeholder)
            site_id: Site identifier for topic generation
            sync_interval: Sync interval in seconds
            max_retries: Maximum retry attempts for failed connections
        """
        self.db_path = db_path
        self.mqtt_broker = mqtt_broker
        self.mqtt_port = mqtt_port
        self.mqtt_topic = mqtt_topic.format(site_id=site_id)
        self.site_id = site_id
        self.sync_interval = sync_interval
        self.max_retries = max_retries
        
        # Event queue for non-blocking writes
        self.event_queue = queue.Queue(maxsize=1000)
        
        # MQTT client (initialized when needed)
        self.mqtt_client = None
        
        # Thread control
        self.running = False
        self.sync_thread = None
        self.queue_thread = None
        
        # Initialize database
        self._initialize_database()
        
    def _initialize_database(self):
        """Initialize SQLite database with event queue table."""
        try:
            db_dir = Path(self.db_path).parent
            db_dir.mkdir(parents=True, exist_ok=True)
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Create event queue table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS event_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bay_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    plate_number TEXT,
                    confidence REAL,
                    timestamp TEXT NOT NULL,
                    synced INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    retry_count INTEGER DEFAULT 0
                )
            """)
            
            # Create indexes for performance
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_synced ON event_queue(synced)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_bay_id ON event_queue(bay_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON event_queue(timestamp)")
            
            conn.commit()
            conn.close()
            
            logger.info(f"Database initialized at {self.db_path}")
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise
    
    def _check_network_connectivity(self, host: str = "8.8.8.8", port: int = 53, timeout: int = 3) -> bool:
        """
        Check network connectivity by attempting to connect to a host.
        
        Args:
            host: Host to connect to (default: Google DNS)
            port: Port to connect to (default: DNS port)
            timeout: Connection timeout in seconds
            
        Returns:
            True if connection successful, False otherwise
        """
        try:
            socket.setdefaulttimeout(timeout)
            socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect((host, port))
            return True
        except socket.error:
            return False
        finally:
            socket.setdefaulttimeout(None)
    
    def _initialize_mqtt_client(self):
        """Initialize MQTT client with QoS-1 configuration."""
        try:
            import paho.mqtt.client as mqtt
            
            client = mqtt.Client(client_id=f"slots-edge-{self.site_id}")
            client.on_connect = self._on_mqtt_connect
            client.on_publish = self._on_mqtt_publish
            client.on_disconnect = self._on_mqtt_disconnect
            
            # Set QoS to 1 for at-least-once delivery
            self.mqtt_qos = 1
            
            self.mqtt_client = client
            logger.info("MQTT client initialized")
            
        except ImportError:
            logger.error("paho-mqtt not installed. Run: pip install paho-mqtt")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize MQTT client: {e}")
            raise
    
    def _on_mqtt_connect(self, client, userdata, flags, rc):
        """MQTT connection callback."""
        if rc == 0:
            logger.info("MQTT client connected successfully")
        else:
            logger.error(f"MQTT connection failed with code {rc}")
    
    def _on_mqtt_publish(self, client, userdata, mid):
        """MQTT publish callback."""
        logger.debug(f"Message {mid} published successfully")
    
    def _on_mqtt_disconnect(self, client, userdata, rc):
        """MQTT disconnect callback."""
        if rc != 0:
            logger.warning(f"MQTT client disconnected unexpectedly (code {rc})")
    
    def _connect_mqtt_with_retry(self) -> bool:
        """
        Connect to MQTT broker with exponential backoff retry.
        
        Returns:
            True if connection successful, False otherwise
        """
        if self.mqtt_client is None:
            self._initialize_mqtt_client()
        
        for attempt in range(self.max_retries):
            try:
                self.mqtt_client.connect(self.mqtt_broker, self.mqtt_port, keepalive=60)
                self.mqtt_client.loop_start()
                logger.info(f"MQTT connection established on attempt {attempt + 1}")
                return True
                
            except Exception as e:
                wait_time = min(2 ** attempt, 60)  # Exponential backoff, max 60s
                logger.warning(f"MQTT connection attempt {attempt + 1} failed: {e}. Retrying in {wait_time}s...")
                time.sleep(wait_time)
        
        logger.error("Failed to connect to MQTT broker after maximum retries")
        return False
    
    def _publish_event(self, event: OccupancyEvent) -> bool:
        """
        Publish single event to MQTT broker.
        
        Args:
            event: OccupancyEvent to publish
            
        Returns:
            True if publish successful, False otherwise
        """
        try:
            if self.mqtt_client is None or not self.mqtt_client.is_connected():
                if not self._connect_mqtt_with_retry():
                    return False
            
            # Convert event to JSON
            payload = json.dumps(asdict(event))
            
            # Publish with QoS-1
            result = self.mqtt_client.publish(
                self.mqtt_topic,
                payload,
                qos=self.mqtt_qos,
                retain=False
            )
            
            if result[0] == 0:  # MQTT_ERR_SUCCESS
                logger.debug(f"Event published for bay {event.bay_id}")
                return True
            else:
                logger.error(f"Failed to publish event for bay {event.bay_id}: {result[0]}")
                return False
                
        except Exception as e:
            logger.error(f"Error publishing event: {e}")
            return False
    
    def _sync_pending_events(self):
        """Sync all unsynced events to MQTT broker."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get unsynced events
            cursor.execute("""
                SELECT id, bay_id, status, plate_number, confidence, timestamp, retry_count
                FROM event_queue
                WHERE synced = 0
                ORDER BY created_at ASC
                LIMIT 100
            """)
            
            unsynced_events = cursor.fetchall()
            
            if not unsynced_events:
                logger.debug("No unsynced events to sync")
                conn.close()
                return
            
            logger.info(f"Syncing {len(unsynced_events)} unsynced events")
            
            synced_count = 0
            failed_count = 0
            
            for event_data in unsynced_events:
                event_id, bay_id, status, plate_number, confidence, timestamp, retry_count = event_data
                
                # Create event object
                event = OccupancyEvent(
                    bay_id=bay_id,
                    status=status,
                    plate_number=plate_number,
                    confidence=confidence,
                    timestamp=timestamp
                )
                
                # Try to publish
                if self._publish_event(event):
                    # Mark as synced
                    cursor.execute("UPDATE event_queue SET synced = 1 WHERE id = ?", (event_id,))
                    synced_count += 1
                else:
                    # Increment retry count
                    cursor.execute(
                        "UPDATE event_queue SET retry_count = retry_count + 1 WHERE id = ?",
                        (event_id,)
                    )
                    failed_count += 1
            
            conn.commit()
            conn.close()
            
            logger.info(f"Sync completed: {synced_count} synced, {failed_count} failed")
            
            # Clean up old synced events (older than 7 days)
            self._cleanup_old_events()
            
        except Exception as e:
            logger.error(f"Error during sync: {e}")
    
    def _cleanup_old_events(self, days: int = 7):
        """Remove old synced events from database."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                DELETE FROM event_queue
                WHERE synced = 1
                AND datetime(created_at) < datetime('now', '-' || ? || ' days')
            """, (days,))
            
            deleted_count = cursor.rowcount
            conn.commit()
            conn.close()
            
            if deleted_count > 0:
                logger.info(f"Cleaned up {deleted_count} old synced events")
                
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
    
    def _queue_processor(self):
        """Background thread to process events from the queue."""
        logger.info("Queue processor thread started")
        
        while self.running:
            try:
                # Get event from queue (blocking with timeout)
                event = self.event_queue.get(timeout=1.0)
                
                # Write to database
                self._write_event_to_db(event)
                
                # Mark task as done
                self.event_queue.task_done()
                
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Error processing queued event: {e}")
        
        logger.info("Queue processor thread stopped")
    
    def _write_event_to_db(self, event: OccupancyEvent):
        """Write event to local SQLite database."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO event_queue (bay_id, status, plate_number, confidence, timestamp, synced)
                VALUES (?, ?, ?, ?, ?, 0)
            """, (
                event.bay_id,
                event.status,
                event.plate_number,
                event.confidence,
                event.timestamp
            ))
            
            conn.commit()
            conn.close()
            
            logger.debug(f"Event queued for bay {event.bay_id}")
            
        except Exception as e:
            logger.error(f"Failed to write event to database: {e}")
    
    def _sync_loop(self):
        """Background thread to sync pending events."""
        logger.info("Sync loop thread started")
        
        while self.running:
            try:
                # Check network connectivity
                if self._check_network_connectivity():
                    # Sync pending events
                    self._sync_pending_events()
                else:
                    logger.debug("Network connectivity check failed - will retry")
                
                # Wait for next sync interval
                time.sleep(self.sync_interval)
                
            except Exception as e:
                logger.error(f"Error in sync loop: {e}")
                time.sleep(self.sync_interval)
        
        logger.info("Sync loop thread stopped")
    
    def queue_event(self, bay_id: str, status: str, plate_number: Optional[str] = None, 
                    confidence: float = 0.0) -> bool:
        """
        Queue an occupancy event for processing and sync.
        
        This method is non-blocking and returns immediately after adding to queue.
        
        Args:
            bay_id: Parking bay identifier
            status: Occupancy status (OCCUPIED, AVAILABLE, RESERVED, TAMPER_ALERT)
            plate_number: Detected license plate number (optional)
            confidence: Detection confidence score
            
        Returns:
            True if event queued successfully, False if queue is full
        """
        try:
            event = OccupancyEvent(
                bay_id=bay_id,
                status=status,
                plate_number=plate_number,
                confidence=confidence,
                timestamp=datetime.now().isoformat()
            )
            
            # Add to queue (non-blocking)
            self.event_queue.put_nowait(event)
            
            logger.debug(f"Event queued for bay {bay_id}")
            return True
            
        except queue.Full:
            logger.error(f"Event queue is full - cannot queue event for bay {bay_id}")
            return False
        except Exception as e:
            logger.error(f"Failed to queue event: {e}")
            return False
    
    def start(self):
        """Start the sync daemon background threads."""
        if self.running:
            logger.warning("Sync daemon is already running")
            return
        
        self.running = True
        
        # Start queue processor thread
        self.queue_thread = threading.Thread(target=self._queue_processor, daemon=True)
        self.queue_thread.start()
        
        # Start sync loop thread
        self.sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        self.sync_thread.start()
        
        logger.info("Edge sync daemon started")
    
    def stop(self):
        """Stop the sync daemon background threads."""
        if not self.running:
            logger.warning("Sync daemon is not running")
            return
        
        self.running = False
        
        # Wait for threads to finish
        if self.queue_thread:
            self.queue_thread.join(timeout=5)
        if self.sync_thread:
            self.sync_thread.join(timeout=5)
        
        # Stop MQTT client
        if self.mqtt_client and self.mqtt_client.is_connected():
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
        
        logger.info("Edge sync daemon stopped")
    
    def get_queue_status(self) -> Dict[str, Any]:
        """Get current queue status information."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get queue statistics
            cursor.execute("SELECT COUNT(*) FROM event_queue WHERE synced = 0")
            unsynced_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM event_queue WHERE synced = 1")
            synced_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM event_queue")
            total_count = cursor.fetchone()[0]
            
            conn.close()
            
            return {
                "unsynced_events": unsynced_count,
                "synced_events": synced_count,
                "total_events": total_count,
                "queue_size": self.event_queue.qsize(),
                "running": self.running,
                "mqtt_connected": self.mqtt_client.is_connected() if self.mqtt_client else False
            }
            
        except Exception as e:
            logger.error(f"Failed to get queue status: {e}")
            return {
                "error": str(e)
            }


def main():
    """Main function for testing the sync daemon."""
    import argparse
    
    parser = argparse.ArgumentParser(description="SLOTS Edge Sync Daemon")
    parser.add_argument("--db-path", type=str, default="edge_storage.db", help="SQLite database path")
    parser.add_argument("--mqtt-broker", type=str, default="localhost", help="MQTT broker address")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--site-id", type=str, default="default-site", help="Site identifier")
    parser.add_argument("--sync-interval", type=int, default=5, help="Sync interval in seconds")
    parser.add_argument("--status-check", action="store_true", help="Check sync daemon status and exit")
    
    args = parser.parse_args()
    
    # Handle status check mode
    if args.status_check:
        daemon = EdgeSyncDaemon(
            db_path=args.db_path,
            mqtt_broker=args.mqtt_broker,
            mqtt_port=args.mqtt_port,
            site_id=args.site_id,
            sync_interval=args.sync_interval
        )
        status = daemon.get_queue_status()
        print(json.dumps(status, indent=2))
        return 0 if status.get("running", False) else 1
    
    # Normal daemon mode
    daemon = EdgeSyncDaemon(
    daemon = EdgeSyncDaemon(
        db_path=args.db_path,
        mqtt_broker=args.mqtt_broker,
        mqtt_port=args.mqtt_port,
        site_id=args.site_id,
        sync_interval=args.sync_interval
    )
    
    # Start daemon
    daemon.start()
    
    try:
        # Simulate some events
        logger.info("Simulating occupancy events...")
        
        test_statuses = ["OCCUPIED", "AVAILABLE", "RESERVED", "OCCUPIED", "AVAILABLE"]
        test_plates = ["TN-01-AB-1234", "TN-02-CD-5678", None, "TN-03-EF-9012", None]
        
        for i, (status, plate) in enumerate(zip(test_statuses, test_plates)):
            bay_id = f"BAY-A-{101 + i}"
            daemon.queue_event(
                bay_id=bay_id,
                status=status,
                plate_number=plate,
                confidence=0.95
            )
            time.sleep(1)
        
        # Print queue status
        time.sleep(2)
        status = daemon.get_queue_status()
        logger.info(f"Queue status: {json.dumps(status, indent=2)}")
        
        # Keep running for demonstration
        logger.info("Daemon running. Press Ctrl+C to stop...")
        while True:
            time.sleep(10)
            status = daemon.get_queue_status()
            logger.info(f"Queue status: {json.dumps(status, indent=2)}")
            
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        daemon.stop()


if __name__ == "__main__":
    main()
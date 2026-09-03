"""
OCPP 2.0.1 Smart EV Charging Gateway

Implements OCPP 2.0.1 JSON-over-WebSocket server for EV charger management.
Handles BootNotification, StatusNotification, MeterValues, and TransactionEvent messages.
Integrates with MARL pricing engine for dynamic parking + charging tariffs.
Calculates overstay penalties when vehicles remain after charging completes.
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime
from typing import Dict, Any, Optional
import websockets
import redis.asyncio as redis
from dataclasses import dataclass, field

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
#   Configuration & Constants
# ──────────────────────────────────────────────────────────────────────────────

OCPP_PROTOCOL_VERSION = "2.0.1"
REDIS_STREAM_EV_STATUS = "slots:stream:ev_status"
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# Charging tariff configuration
BASE_CHARGING_RATE = 8.0  # ₹ per kWh
BASE_PARKING_RATE = 5.0   # ₹ per hour
OVERSTAY_PENALTY_RATE = 5.0  # ₹ per minute after charging completes
OVERSTAY_GRACE_PERIOD_MINUTES = 15  # Grace period before penalty kicks in
GRID_LOAD_FACTOR_DEFAULT = 1.0  # Multiplier based on grid load

# EV states
EV_STATE_CHARGING = "CHARGING"
EV_STATE_FINISHED_CHARGING_OCCUPIED = "FINISHED_CHARGING_OCCUPIED"
EV_STATE_AVAILABLE = "AVAILABLE"
EV_STATE_UNAVAILABLE = "UNAVAILABLE"


@dataclass
class ChargingSession:
    """Active charging session data."""
    transaction_id: str
    charger_id: str
    evse_id: str
    start_time: datetime
    current_state: str = EV_STATE_CHARGING
    energy_kwh: float = 0.0
    parking_duration_seconds: float = 0.0
    charging_complete_time: Optional[datetime] = None
    overstay_penalty: float = 0.0
    total_cost: float = 0.0


# ──────────────────────────────────────────────────────────────────────────────
#   OCPP 2.0.1 Message Handler
# ──────────────────────────────────────────────────────────────────────────────

class OCPPGateway:
    """
    OCPP 2.0.1 WebSocket Gateway for EV Charger Management.
    
    Handles charger connections, message routing, tariff calculation,
    and overstay penalty enforcement.
    """
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.active_sessions: Dict[str, ChargingSession] = {}
        self.charger_states: Dict[str, Dict[str, Any]] = {}
        
    async def handle_boot_notification(
        self, 
        charger_id: str, 
        payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Handle BootNotification from charger.
        
        Args:
            charger_id: Unique charger identifier
            payload: BootNotification payload with reason, chargingStation, etc.
            
        Returns:
            OCPP 2.0.1 BootNotification response
        """
        reason = payload.get("reason", "PowerUp")
        model = payload.get("chargingStation", {}).get("model", "Unknown")
        serial_number = payload.get("chargingStation", {}).get("serialNumber", "Unknown")
        
        logger.info(f"🔌 BootNotification from {charger_id}: {reason} | Model: {model} | SN: {serial_number}")
        
        # Initialize charger state
        self.charger_states[charger_id] = {
            "charger_id": charger_id,
            "model": model,
            "serial_number": serial_number,
            "status": EV_STATE_AVAILABLE,
            "last_boot": datetime.utcnow().isoformat(),
            "current_transaction_id": None
        }
        
        # Publish to Redis
        await self._publish_ev_status(charger_id, {
            "event": "BOOT_NOTIFICATION",
            "reason": reason,
            "model": model,
            "status": EV_STATE_AVAILABLE
        })
        
        return {
            "currentTime": datetime.utcnow().isoformat() + "Z",
            "interval": 60,
            "status": "Accepted"
        }
    
    async def handle_status_notification(
        self, 
        charger_id: str, 
        payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Handle StatusNotification from charger.
        
        Args:
            charger_id: Unique charger identifier
            payload: StatusNotification with timestamp, connectorStatus, etc.
            
        Returns:
            OCPP 2.0.1 StatusNotification response
        """
        timestamp = payload.get("timestamp", datetime.utcnow().isoformat())
        connector_status = payload.get("connectorStatus", "Available")
        evse_id = payload.get("evseId", "1")
        error_code = payload.get("errorCode", "NoError")
        
        logger.info(f"📊 StatusNotification from {charger_id}: {connector_status} | EVSE: {evse_id} | Error: {error_code}")
        
        # Update charger state
        if charger_id in self.charger_states:
            self.charger_states[charger_id]["status"] = connector_status
            self.charger_states[charger_id]["last_status_update"] = timestamp
        
        # Check for transition to FINISHED_CHARGING_OCCUPIED
        if connector_status == "Occupied" and charger_id in self.active_sessions:
            session = self.active_sessions[charger_id]
            if session.current_state == EV_STATE_CHARGING:
                session.current_state = EV_STATE_FINISHED_CHARGING_OCCUPIED
                session.charging_complete_time = datetime.utcnow()
                logger.warning(f"⚠️ Charger {charger_id} transitioned to FINISHED_CHARGING_OCCUPIED - Overstay monitoring started")
        
        # Publish to Redis
        await self._publish_ev_status(charger_id, {
            "event": "STATUS_NOTIFICATION",
            "connectorStatus": connector_status,
            "evseId": evse_id,
            "errorCode": error_code,
            "timestamp": timestamp
        })
        
        return {}
    
    async def handle_meter_values(
        self, 
        charger_id: str, 
        payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Handle MeterValues from charger.
        
        Args:
            charger_id: Unique charger identifier
            payload: MeterValues with meter value samples
            
        Returns:
            OCPP 2.0.1 MeterValues response
        """
        evse_id = payload.get("evseId", "1")
        meter_values = payload.get("meterValue", [])
        
        # Extract energy reading (kWh)
        energy_kwh = 0.0
        for meter_value in meter_values:
            for sample in meter_value.get("sampledValue", []):
                if sample.get("measurand") == "Energy.Active.Import.Register":
                    energy_kwh = float(sample.get("value", 0))
                    if sample.get("unit") == "Wh":
                        energy_kwh /= 1000.0
        
        # Update session if active
        if charger_id in self.active_sessions:
            session = self.active_sessions[charger_id]
            session.energy_kwh = energy_kwh
            session.parking_duration_seconds = (
                datetime.utcnow() - session.start_time
            ).total_seconds()
            
            # Calculate overstay penalty if in FINISHED_CHARGING_OCCUPIED state
            if session.current_state == EV_STATE_FINISHED_CHARGING_OCCUPIED:
                overstay_duration_minutes = (
                    datetime.utcnow() - session.charging_complete_time
                ).total_seconds() / 60.0
                
                if overstay_duration_minutes > OVERSTAY_GRACE_PERIOD_MINUTES:
                    penalty_minutes = overstay_duration_minutes - OVERSTAY_GRACE_PERIOD_MINUTES
                    session.overstay_penalty = penalty_minutes * OVERSTAY_PENALTY_RATE
                    logger.warning(f"💰 Overstay penalty for {charger_id}: ₹{session.overstay_penalty:.2f} ({penalty_minutes:.1f} min)")
        
        logger.info(f"⚡ MeterValues from {charger_id}: {energy_kwh:.3f} kWh")
        
        # Publish to Redis
        await self._publish_ev_status(charger_id, {
            "event": "METER_VALUES",
            "evseId": evse_id,
            "energy_kwh": energy_kwh,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return {}
    
    async def handle_transaction_event(
        self, 
        charger_id: str, 
        payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Handle TransactionEvent from charger.
        
        Args:
            charger_id: Unique charger identifier
            payload: TransactionEvent with eventType, transactionInfo, etc.
            
        Returns:
            OCPP 2.0.1 TransactionEvent response with total cost
        """
        event_type = payload.get("eventType", "Started")
        transaction_info = payload.get("transactionInfo", {})
        transaction_id = transaction_info.get("transactionId", "")
        evse_id = payload.get("evseId", "1")
        
        logger.info(f"🔄 TransactionEvent from {charger_id}: {event_type} | TX: {transaction_id}")
        
        if event_type == "Started":
            # Start new charging session
            session = ChargingSession(
                transaction_id=transaction_id,
                charger_id=charger_id,
                evse_id=evse_id,
                start_time=datetime.utcnow()
            )
            self.active_sessions[charger_id] = session
            self.charger_states[charger_id]["current_transaction_id"] = transaction_id
            
            await self._publish_ev_status(charger_id, {
                "event": "TRANSACTION_STARTED",
                "transactionId": transaction_id,
                "evseId": evse_id,
                "startTime": session.start_time.isoformat()
            })
            
        elif event_type == "Updated":
            # Update existing session
            if charger_id in self.active_sessions:
                session = self.active_sessions[charger_id]
                session.current_state = EV_STATE_CHARGING
                
                await self._publish_ev_status(charger_id, {
                    "event": "TRANSACTION_UPDATED",
                    "transactionId": transaction_id,
                    "energy_kwh": session.energy_kwh
                })
                
        elif event_type == "Ended":
            # End session and calculate final cost
            if charger_id in self.active_sessions:
                session = self.active_sessions[charger_id]
                
                # Calculate dynamic tariff
                grid_load_factor = await self._get_grid_load_factor()
                tou_multiplier = self._get_tou_multiplier()
                
                # Charging cost
                charging_cost = (
                    session.energy_kwh * BASE_CHARGING_RATE * 
                    grid_load_factor * tou_multiplier
                )
                
                # Parking cost
                parking_hours = session.parking_duration_seconds / 3600.0
                parking_cost = parking_hours * BASE_PARKING_RATE
                
                # Total cost
                session.total_cost = charging_cost + parking_cost + session.overstay_penalty
                
                logger.info(f"💰 Session ended for {charger_id}:")
                logger.info(f"   Energy: {session.energy_kwh:.3f} kWh")
                logger.info(f"   Charging Cost: ₹{charging_cost:.2f}")
                logger.info(f"   Parking Cost: ₹{parking_cost:.2f}")
                logger.info(f"   Overstay Penalty: ₹{session.overstay_penalty:.2f}")
                logger.info(f"   Total: ₹{session.total_cost:.2f}")
                
                # Publish final status
                await self._publish_ev_status(charger_id, {
                    "event": "TRANSACTION_ENDED",
                    "transactionId": transaction_id,
                    "energy_kwh": session.energy_kwh,
                    "charging_cost": charging_cost,
                    "parking_cost": parking_cost,
                    "overstay_penalty": session.overstay_penalty,
                    "total_cost": session.total_cost,
                    "grid_load_factor": grid_load_factor,
                    "tou_multiplier": tou_multiplier
                })
                
                # Clean up session
                del self.active_sessions[charger_id]
                self.charger_states[charger_id]["current_transaction_id"] = None
                
                return {
                    "totalCost": session.total_cost,
                    "currency": "INR"
                }
        
        return {}
    
    async def _get_grid_load_factor(self) -> float:
        """
        Get current grid load factor from pricing service or use default.
        
        Returns:
            Grid load factor multiplier (1.0 = normal, >1.0 = high load)
        """
        try:
            # In production, call pricing-service API
            # For now, return default
            return GRID_LOAD_FACTOR_DEFAULT
        except Exception as e:
            logger.warning(f"Failed to get grid load factor: {e}")
            return GRID_LOAD_FACTOR_DEFAULT
    
    def _get_tou_multiplier(self) -> float:
        """
        Get Time-of-Use (ToU) multiplier based on current hour.
        
        Returns:
            ToU multiplier (higher during peak hours)
        """
        hour = datetime.utcnow().hour
        # Peak hours: 6-9 AM and 6-9 PM IST
        if (6 <= hour <= 9) or (18 <= hour <= 21):
            return 1.5  # 50% premium during peak
        elif (10 <= hour <= 17) or (22 <= hour <= 23):
            return 1.0  # Normal rate
        else:
            return 0.8  # 20% discount off-peak
    
    async def _publish_ev_status(self, charger_id: str, status_data: Dict[str, Any]):
        """Publish EV status to Redis Streams."""
        try:
            message = {
                "charger_id": charger_id,
                "timestamp": datetime.utcnow().isoformat(),
                **status_data
            }
            await self.redis.xadd(REDIS_STREAM_EV_STATUS, message)
            logger.debug(f"Published EV status for {charger_id} to Redis")
        except Exception as e:
            logger.error(f"Failed to publish EV status: {e}")


# ──────────────────────────────────────────────────────────────────────────────
#   WebSocket Server
# ──────────────────────────────────────────────────────────────────────────────

async def handle_websocket_connection(websocket, path):
    """Handle individual WebSocket connection from EV charger."""
    charger_id = None
    gateway = None
    
    try:
        # Connect to Redis
        redis_client = await redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True
        )
        gateway = OCPPGateway(redis_client)
        
        logger.info("🔗 New WebSocket connection established")
        
        async for message in websocket:
            try:
                # Parse OCPP 2.0.1 message
                data = json.loads(message)
                
                # OCPP 2.0.1 format: [messageTypeId, messageId, action, payload]
                if len(data) >= 4:
                    message_type_id = data[0]
                    message_id = data[1]
                    action = data[2]
                    payload = data[3]
                    
                    logger.info(f"📨 Received OCPP message: {action} (ID: {message_id})")
                    
                    # Extract charger_id from payload or use connection info
                    if "chargingStation" in payload:
                        charger_id = payload["chargingStation"].get("serialNumber", "unknown")
                    elif "evseId" in payload:
                        charger_id = f"charger_{payload['evseId']}"
                    
                    # Route to appropriate handler
                    response_payload = {}
                    
                    if action == "BootNotification":
                        response_payload = await gateway.handle_boot_notification(charger_id, payload)
                    elif action == "StatusNotification":
                        response_payload = await gateway.handle_status_notification(charger_id, payload)
                    elif action == "MeterValues":
                        response_payload = await gateway.handle_meter_values(charger_id, payload)
                    elif action == "TransactionEvent":
                        response_payload = await gateway.handle_transaction_event(charger_id, payload)
                    else:
                        logger.warning(f"⚠️ Unknown OCPP action: {action}")
                        response_payload = {}
                    
                    # Send OCPP response: [3, messageId, payload]
                    response = [3, message_id, response_payload]
                    await websocket.send(json.dumps(response))
                    
                else:
                    logger.error(f"Invalid OCPP message format: {data}")
                    
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error: {e}")
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"🔌 WebSocket connection closed for charger {charger_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        if gateway and gateway.redis:
            await gateway.redis.close()


async def start_ocpp_server(host: str = "0.0.0.0", port: int = 8003):
    """Start the OCPP 2.0.1 WebSocket server."""
    logger.info(f"🚀 Starting OCPP 2.0.1 Gateway on {host}:{port}")
    
    async with websockets.serve(handle_websocket_connection, host, port):
        logger.info(f"✅ OCPP 2.0.1 Gateway server listening on ws://{host}:{port}")
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    import os
    
    # Run the server
    asyncio.run(start_ocpp_server())

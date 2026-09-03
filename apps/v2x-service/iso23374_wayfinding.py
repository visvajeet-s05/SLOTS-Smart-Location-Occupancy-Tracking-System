"""
ISO 23374 Type 2 Automated Valet Parking (AVP) Wayfinding Service

Implements pathfinding and V2X trajectory telemetry for autonomous vehicles.
Uses A* algorithm for shortest path calculation on parking lot grid.
Streams waypoint coordinates (X, Y, Heading, MaxVelocity) to connected vehicles.
"""

import asyncio
import json
import logging
import os
import math
from typing import Dict, Any, List, Tuple, Optional
import heapq
import networkx as nx
from dataclasses import dataclass
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import redis.asyncio as redis
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s");
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
#   Configuration & Constants
# ──────────────────────────────────────────────────────────────────────────────

REDIS_STREAM_V2X_NAV = "slots:stream:v2x_nav"
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
V2X_SERVICE_PORT = int(os.getenv("V2X_SERVICE_PORT", 8004))

# Waypoint update frequency (Hz)
TRAJECTORY_UPDATE_HZ = 10
TRAJECTORY_UPDATE_INTERVAL = 1.0 / TRAJECTORY_UPDATE_HZ

# Parking layout configuration
GRID_RESOLUTION = 0.5  # meters per grid cell
MAX_VELOCITY_DEFAULT = 5.0  # km/h (safe speed in garage aisles)
HEADING_TOLERANCE = 0.1  # radians

# ISO 23374 waypoint schema: [X, Y, θ, v_max]
@dataclass
class Waypoint:
    """ISO 23374 Waypoint for AVP navigation."""
    x: float  # X coordinate in meters
    y: float  # Y coordinate in meters
    heading: float  # Heading angle in radians (-π to π)
    velocity_max: float  # Maximum velocity in km/h
    
    def to_dict(self) -> Dict[str, float]:
        return {
            "x": round(self.x, 3),
            "y": round(self.y, 3),
            "heading": round(self.heading, 4),
            "velocity_max": round(self.velocity_max, 2)
        }


# ──────────────────────────────────────────────────────────────────────────────
#   Pathfinding Engine (A* Algorithm)
# ──────────────────────────────────────────────────────────────────────────────

class PathfindingEngine:
    """
    A* pathfinding engine for parking lot navigation.
    
    Computes shortest path from entry zone to target slot on 2D grid.
    Handles obstacles and lane constraints.
    """
    
    def __init__(self, grid_width: int, grid_height: int, obstacles: List[Tuple[int, int]]):
        self.grid_width = grid_width
        self.grid_height = grid_height
        self.obstacles = set(obstacles)
        self.graph = self._build_graph()
    
    def _build_graph(self) -> nx.Graph:
        """Build navigation graph from grid."""
        G = nx.Graph()
        
        # Add nodes for all non-obstacle cells
        for x in range(self.grid_width):
            for y in range(self.grid_height):
                if (x, y) not in self.obstacles:
                    G.add_node((x, y), pos=(x * GRID_RESOLUTION, y * GRID_RESOLUTION))
        
        # Add edges between adjacent cells (4-directional movement)
        directions = [(0, 1), (1, 0), (0, -1), (-1, 0)]  # N, E, S, W
        
        for x in range(self.grid_width):
            for y in range(self.grid_height):
                if (x, y) not in self.obstacles:
                    for dx, dy in directions:
                        nx_, ny_ = x + dx, y + dy
                        if 0 <= nx_ < self.grid_width and 0 <= ny_ < self.grid_height:
                            if (nx_, ny_) not in self.obstacles:
                                # Edge weight = Euclidean distance
                                weight = math.sqrt(dx**2 + dy**2) * GRID_RESOLUTION
                                G.add_edge((x, y), (nx_, ny_), weight=weight)
        
        return G
    
    def find_path(
        self, 
        start: Tuple[int, int], 
        goal: Tuple[int, int]
    ) -> Optional[List[Tuple[int, int]]]:
        """
        Find shortest path using A* algorithm.
        
        Args:
            start: Starting grid coordinates (x, y)
            goal: Target grid coordinates (x, y)
            
        Returns:
            List of grid coordinates representing the path, or None if no path exists
        """
        try:
            path = nx.shortest_path(
                self.graph, 
                source=start, 
                target=goal, 
                weight='weight'
            )
            return path
        except nx.NetworkXNoPath:
            logger.warning(f"No path found from {start} to {goal}")
            return None
    
    def grid_to_world(self, grid_coords: Tuple[int, int]) -> Tuple[float, float]:
        """Convert grid coordinates to world coordinates (meters)."""
        x, y = grid_coords
        return (x * GRID_RESOLUTION, y * GRID_RESOLUTION)
    
    def world_to_grid(self, world_coords: Tuple[float, float]) -> Tuple[int, int]:
        """Convert world coordinates (meters) to grid coordinates."""
        x, y = world_coords
        return (int(x / GRID_RESOLUTION), int(y / GRID_RESOLUTION))


# ──────────────────────────────────────────────────────────────────────────────
#   Trajectory Generator
# ──────────────────────────────────────────────────────────────────────────────

class TrajectoryGenerator:
    """
    Generates ISO 23374 compliant trajectory waypoints from path.
    
    Converts grid path to smooth trajectory with heading angles and velocity profiles.
    """
    
    def generate_trajectory(
        self, 
        path: List[Tuple[int, int]],
        max_velocity: float = MAX_VELOCITY_DEFAULT
    ) -> List[Waypoint]:
        """
        Generate trajectory waypoints from grid path.
        
        Args:
            path: List of grid coordinates
            max_velocity: Maximum velocity in km/h
            
        Returns:
            List of Waypoint objects with X, Y, heading, and velocity
        """
        if len(path) < 2:
            return []
        
        waypoints = []
        
        for i, (grid_x, grid_y) in enumerate(path):
            # Convert to world coordinates
            world_x, world_y = (grid_x * GRID_RESOLUTION, grid_y * GRID_RESOLUTION)
            
            # Calculate heading angle
            if i < len(path) - 1:
                next_grid_x, next_grid_y = path[i + 1]
                dx = (next_grid_x - grid_x) * GRID_RESOLUTION
                dy = (next_grid_y - grid_y) * GRID_RESOLUTION
                heading = math.atan2(dy, dx)
            else:
                # Keep last heading for final waypoint
                heading = waypoints[-1].heading if waypoints else 0.0
            
            # Adjust velocity based on path curvature (simple heuristic)
            if i > 0 and i < len(path) - 1:
                # Check for sharp turns
                prev_waypoint = waypoints[-1]
                heading_change = abs(heading - prev_waypoint.heading)
                if heading_change > math.pi / 4:  # 45 degree turn
                    velocity = max_velocity * 0.5  # Slow down for turns
                else:
                    velocity = max_velocity
            else:
                velocity = max_velocity * 0.3  # Slow at start/end
            
            waypoints.append(Waypoint(
                x=world_x,
                y=world_y,
                heading=heading,
                velocity_max=velocity
            ))
        
        return waypoints


# ──────────────────────────────────────────────────────────────────────────────
#   V2X Wayfinding Service
# ──────────────────────────────────────────────────────────────────────────────

class V2XWayfindingService:
    """
    ISO 23374 V2X Wayfinding Service for Automated Valet Parking.
    
    Manages parking lot layout, pathfinding, and trajectory broadcasting.
    """
    
    def __init__(self, redis_client: redis.Redis, layout_config: Dict[str, Any]):
        self.redis = redis_client
        self.layout_config = layout_config
        self.pathfinding_engine = self._initialize_pathfinding()
        self.trajectory_generator = TrajectoryGenerator()
        self.active_trajectories: Dict[str, List[Waypoint]] = {}
        self.trajectory_tasks: Dict[str, asyncio.Task] = {}
    
    def _initialize_pathfinding(self) -> PathfindingEngine:
        """Initialize pathfinding engine from layout configuration."""
        grid_config = self.layout_config.get("grid", {})
        grid_width = grid_config.get("width", 100)
        grid_height = grid_config.get("height", 100)
        
        # Extract obstacles from layout
        obstacles = []
        for obstacle in self.layout_config.get("obstacles", []):
            obstacles.append((obstacle["x"], obstacle["y"]))
        
        logger.info(f"Initializing pathfinding engine: {grid_width}x{grid_height} grid, {len(obstacles)} obstacles")
        return PathfindingEngine(grid_width, grid_height, obstacles)
    
    async def calculate_route(
        self, 
        vehicle_id: str, 
        target_slot_id: str
    ) -> Dict[str, Any]:
        """
        Calculate route from entry zone to target slot.
        
        Args:
            vehicle_id: Unique vehicle identifier
            target_slot_id: Target parking slot ID
            
        Returns:
            Route information with waypoints
        """
        # Get entry zone and target slot coordinates
        entry_zone = self.layout_config.get("entry_zone", {"x": 0, "y": 0})
        slots = self.layout_config.get("slots", {})
        
        if target_slot_id not in slots:
            raise HTTPException(status_code=404, detail=f"Slot {target_slot_id} not found")
        
        target_slot = slots[target_slot_id]
        
        # Convert to grid coordinates
        start_grid = self.pathfinding_engine.world_to_grid((entry_zone["x"], entry_zone["y"]))
        goal_grid = self.pathfinding_engine.world_to_grid((target_slot["x"], target_slot["y"]))
        
        # Find path
        path = self.pathfinding_engine.find_path(start_grid, goal_grid)
        
        if not path:
            raise HTTPException(status_code=400, detail="No valid path found to target slot")
        
        # Generate trajectory
        waypoints = self.trajectory_generator.generate_trajectory(path)
        
        # Store trajectory for streaming
        self.active_trajectories[vehicle_id] = waypoints
        
        # Publish to Redis
        await self._publish_trajectory_event(vehicle_id, target_slot_id, waypoints)
        
        logger.info(f"🚗 Route calculated for {vehicle_id} to slot {target_slot_id}: {len(waypoints)} waypoints")
        
        return {
            "vehicle_id": vehicle_id,
            "target_slot_id": target_slot_id,
            "waypoint_count": len(waypoints),
            "waypoints": [wp.to_dict() for wp in waypoints],
            "estimated_distance_m": sum(
                math.sqrt(
                    (waypoints[i+1].x - waypoints[i].x)**2 + 
                    (waypoints[i+1].y - waypoints[i].y)**2
                ) for i in range(len(waypoints)-1)
            )
        }
    
    async def start_trajectory_broadcast(self, vehicle_id: str):
        """
        Start broadcasting trajectory waypoints at 10Hz.
        
        Args:
            vehicle_id: Unique vehicle identifier
        """
        if vehicle_id not in self.active_trajectories:
            logger.warning(f"No active trajectory for vehicle {vehicle_id}")
            return
        
        waypoints = self.active_trajectories[vehicle_id]
        current_index = 0
        
        logger.info(f"📡 Starting trajectory broadcast for {vehicle_id} at {TRAJECTORY_UPDATE_HZ}Hz")
        
        try:
            while current_index < len(waypoints):
                # Get current waypoint
                waypoint = waypoints[current_index]
                
                # Publish waypoint to Redis
                await self._publish_waypoint(vehicle_id, waypoint, current_index)
                
                # Move to next waypoint
                current_index += 1
                
                # Wait for next update interval
                await asyncio.sleep(TRAJECTORY_UPDATE_INTERVAL)
            
            logger.info(f"✅ Trajectory broadcast complete for {vehicle_id}")
            
        except asyncio.CancelledError:
            logger.info(f"🛑 Trajectory broadcast cancelled for {vehicle_id}")
        finally:
            # Clean up
            if vehicle_id in self.active_trajectories:
                del self.active_trajectories[vehicle_id]
    
    async def stop_trajectory_broadcast(self, vehicle_id: str):
        """Stop trajectory broadcast for a vehicle."""
        if vehicle_id in self.trajectory_tasks:
            self.trajectory_tasks[vehicle_id].cancel()
            del self.trajectory_tasks[vehicle_id]
            logger.info(f"🛑 Stopped trajectory broadcast for {vehicle_id}")
    
    async def _publish_trajectory_event(
        self, 
        vehicle_id: str, 
        slot_id: str, 
        waypoints: List[Waypoint]
    ):
        """Publish AVP_TRAJECTORY_UPDATED event to Redis."""
        try:
            message = {
                "event": "AVP_TRAJECTORY_UPDATED",
                "vehicle_id": vehicle_id,
                "slot_id": slot_id,
                "waypoint_count": len(waypoints),
                "timestamp": datetime.utcnow().isoformat()
            }
            await self.redis.xadd(REDIS_STREAM_V2X_NAV, message)
            logger.debug(f"Published trajectory event for {vehicle_id}")
        except Exception as e:
            logger.error(f"Failed to publish trajectory event: {e}")
    
    async def _publish_waypoint(
        self, 
        vehicle_id: str, 
        waypoint: Waypoint, 
        index: int
    ):
        """Publish individual waypoint to Redis."""
        try:
            message = {
                "event": "WAYPOINT_UPDATE",
                "vehicle_id": vehicle_id,
                "waypoint_index": index,
                "waypoint": waypoint.to_dict(),
                "timestamp": datetime.utcnow().isoformat()
            }
            await self.redis.xadd(REDIS_STREAM_V2X_NAV, message)
        except Exception as e:
            logger.error(f"Failed to publish waypoint: {e}")


# ──────────────────────────────────────────────────────────────────────────────
#   FastAPI Application
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="SLOTS V2X Wayfinding Service", version="1.0.0")

# Global service instance
v2x_service: Optional[V2XWayfindingService] = None


class RouteRequest(BaseModel):
    vehicle_id: str
    target_slot_id: str


class RouteResponse(BaseModel):
    vehicle_id: str
    target_slot_id: str
    waypoint_count: int
    waypoints: List[Dict[str, float]]
    estimated_distance_m: float


@app.on_event("startup")
async def startup_event():
    """Initialize V2X service on startup."""
    global v2x_service
    
    # Load layout configuration
    layout_path = os.getenv("SLOTS_LAYOUT_CONFIG", "config/slots_calibration.json")
    
    try:
        with open(layout_path, 'r') as f:
            layout_config = json.load(f)
    except FileNotFoundError:
        logger.warning(f"Layout config not found at {layout_path}, using default")
        layout_config = {
            "grid": {"width": 100, "height": 100},
            "entry_zone": {"x": 5.0, "y": 5.0},
            "obstacles": [],
            "slots": {
                "A1": {"x": 20.0, "y": 20.0},
                "A2": {"x": 30.0, "y": 20.0},
                "B1": {"x": 20.0, "y": 40.0},
                "B2": {"x": 30.0, "y": 40.0}
            }
        }
    
    # Connect to Redis
    redis_client = await redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        decode_responses=True
    )
    
    # Initialize service
    v2x_service = V2XWayfindingService(redis_client, layout_config)
    logger.info("✅ V2X Wayfinding Service initialized")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    if v2x_service and v2x_service.redis:
        await v2x_service.redis.close()
    logger.info("👋 V2X Wayfinding Service shutdown complete")


@app.post("/v1/v2x/route", response_model=RouteResponse)
async def calculate_route(request: RouteRequest):
    """
    Calculate route from entry zone to target slot.
    
    Returns ISO 23374 compliant trajectory waypoints.
    """
    if not v2x_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    result = await v2x_service.calculate_route(
        request.vehicle_id,
        request.target_slot_id
    )
    
    # Start trajectory broadcast in background
    task = asyncio.create_task(
        v2x_service.start_trajectory_broadcast(request.vehicle_id)
    )
    v2x_service.trajectory_tasks[request.vehicle_id] = task
    
    return result


@app.post("/v1/v2x/stop/{vehicle_id}")
async def stop_navigation(vehicle_id: str):
    """Stop trajectory broadcast for a vehicle."""
    if not v2x_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    await v2x_service.stop_trajectory_broadcast(vehicle_id)
    
    return {"status": "stopped", "vehicle_id": vehicle_id}


@app.get("/v1/v2x/slots")
async def get_available_slots():
    """Get list of available parking slots."""
    if not v2x_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    slots = v2x_service.layout_config.get("slots", {})
    return {
        "slots": [
            {"slot_id": slot_id, **slot_data}
            for slot_id, slot_data in slots.items()
        ]
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "v2x-wayfinding",
        "active_trajectories": len(v2x_service.active_trajectories) if v2x_service else 0
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=V2X_SERVICE_PORT)

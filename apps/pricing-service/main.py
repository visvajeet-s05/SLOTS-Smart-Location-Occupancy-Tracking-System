from fastapi import FastAPI
from pydantic import BaseModel, Field
from .environment import ParkingPricingEnv
from .marl_env import MultiLotPricingEnv
from .marl_agent import MARLPricingAgent
from .safety_guardrails import PricingSafetyGuardrails
import numpy as np

app = FastAPI(title="Slotify pricing")

# Legacy single-lot environment
legacy_env = ParkingPricingEnv()

# Module 4: MARL Multi-Lot components
marl_env = MultiLotPricingEnv(
    lot_ids=["LOT_PONDY_BAZAAR", "LOT_TNAGAR_NORTH", "LOT_TNAGAR_SOUTH"],
    min_price=20.0,
    max_price=150.0,
    target_occupancy=0.85,
)
marl_agent = MARLPricingAgent(
    lot_ids=marl_env.possible_agents,
    min_price=20.0,
    max_price=150.0,
)
guardrails = PricingSafetyGuardrails(min_price=20.0, max_price=150.0, max_step_change_pct=0.15)


# ──────────────────────────────────────────────────────────────────────────
#   Legacy Single-Lot Pricing
# ──────────────────────────────────────────────────────────────────────────

class PricingInput(BaseModel):
    occupancy_rate: float = Field(ge=0, le=1)
    arrival_rate: float = Field(ge=0)
    departure_rate: float = Field(ge=0)
    hour_of_day: int = Field(ge=0, le=23)
    day_of_week: int = Field(ge=0, le=6)
    rain_intensity: float = Field(ge=0)
    nearby_event_active: bool

@app.post("/v1/pricing/predict")
def predict(data: PricingInput):
    """Legacy single-lot pricing endpoint."""
    state = np.array([
        data.occupancy_rate,
        data.arrival_rate,
        data.departure_rate,
        data.hour_of_day,
        data.day_of_week,
        data.rain_intensity,
        float(data.nearby_event_active),
    ], dtype=np.float32)
    action = 5 if data.occupancy_rate > .85 else 3 if data.occupancy_rate > .65 else 2
    return {
        "multiplier": float(1 + legacy_env.actions[action]),
        "action": int(action),
        "model": "safe-fallback",
    }


# ──────────────────────────────────────────────────────────────────────────
#   Module 4: MARL Multi-Lot Pricing
# ──────────────────────────────────────────────────────────────────────────

class MARLPricingRequest(BaseModel):
    lot_states: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Dict mapping lot_id to {occupancy, inflow, outflow, price}",
    )

class MARLPricingResponse(BaseModel):
    lot_id: str
    current_price: float
    proposed_price: float
    guarded_price: float
    occupancy: float
    reward: float
    guardrail_applied: bool

@app.post("/v1/pricing/marl/predict")
def marl_predict(data: MARLPricingRequest):
    """
    Multi-lot MARL pricing endpoint.
    
    Processes all lots simultaneously and returns coordinated pricing decisions.
    Applies safety guardrails to ensure municipal compliance.
    """
    # Override environment state with provided lot states
    for lot_id, lot_state in data.lot_states.items():
        if lot_id in marl_env.state:
            marl_env.state[lot_id]["occupancy"] = float(lot_state.get("occupancy", 0.5))
            marl_env.state[lot_id]["inflow"] = float(lot_state.get("inflow", 0.1))
            marl_env.state[lot_id]["outflow"] = float(lot_state.get("outflow", 0.1))
            marl_env.state[lot_id]["price"] = float(lot_state.get("price", 50.0))

    # Get observations
    observations = marl_env._get_obs()

    # Get actions from MARL agent
    actions = marl_agent.get_batch_actions(observations, deterministic=True)

    # Execute environment step
    next_obs, rewards, terminations, truncations, infos = marl_env.step(actions)

    # Build response with guardrails applied
    results = []
    for lot_id in marl_env.agents:
        current_price = marl_env.state[lot_id]["price"] - (
            infos[lot_id].get("price", 50.0) - marl_env.state[lot_id]["price"]
        )
        proposed_price = infos[lot_id].get("price", 50.0)
        guarded_price = guardrails.apply_guardrails(current_price, proposed_price)
        guardrail_applied = abs(guarded_price - proposed_price) > 0.01

        results.append({
            "lotId": lot_id,
            "currentPrice": round(current_price, 2),
            "proposedPrice": round(proposed_price, 2),
            "guardedPrice": round(guarded_price, 2),
            "occupancy": round(infos[lot_id].get("occupancy", 0.0), 3),
            "reward": round(float(rewards[lot_id]), 3),
            "guardrailApplied": guardrail_applied,
        })

    return {
        "timestamp": int(np.datetime64("now").astype(np.int64)),
        "model": "marl_ppo_v1",
        "results": results,
    }


@app.get("/v1/pricing/marl/stats")
def marl_stats():
    """Get MARL agent and environment statistics."""
    return {
        "agent": marl_agent.get_stats(),
        "guardrails": guardrails.get_stats(),
        "env": {
            "lot_ids": marl_env.possible_agents,
            "target_occupancy": marl_env.target_occupancy,
        },
    }


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "modules": {
            "legacy": True,
            "marl_env": True,
            "marl_agent": marl_agent.get_stats()["sb3_available"],
            "guardrails": True,
        },
    }

"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 4: MARL Multi-Lot Pricing Environment  v1.0               ║
║   ┌─────────────────────────────────────────────────────────────────┐     ║
║   │ PettingZoo ParallelEnv for Multi-Agent Dynamic Pricing          │     ║
║   │ Agents coordinate to balance regional occupancy toward ~85%    │     ║
║   └─────────────────────────────────────────────────────────────────┘     ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import numpy as np
import functools
from typing import Dict, Any, List, Optional

try:
    from pettingzoo.utils.env import ParallelEnv
    from gymnasium import spaces
    PETTINGZOO_AVAILABLE = True
except ImportError:
    PETTINGZOO_AVAILABLE = False
    # Fallback: define stub classes for environments without PettingZoo
    class ParallelEnv:
        """Stub ParallelEnv for when PettingZoo is not installed."""
        pass
    class spaces:
        """Stub spaces module."""
        Box = lambda low, high, shape, dtype: None


class MultiLotPricingEnv:
    """
    Multi-Agent Reinforcement Learning environment for dynamic parking pricing.
    
    Each agent represents a parking lot and learns to set prices that:
    - Maximize revenue
    - Maintain target occupancy (~85%)
    - Coordinate with neighboring lots to prevent traffic spillover
    
    Observation Space (per agent):
        [Occupancy, Inflow_Rate, Outflow_Rate, Normalized_Price, Neighbor_Avg_Occupancy]
    
    Action Space (per agent):
        Continuous price delta ratio [-1.0, 1.0] mapping to (-15% to +15% price change)
    
    Reward Function:
        R_i = -α * (O_i - 0.85)² + β * Revenue_i - γ * Σ(O_i - O_j)²
        where α=5.0 (occupancy targeting), β=1.0 (revenue), γ=2.0 (regional balance)
    """

    metadata = {"name": "multi_lot_pricing_v1"}

    def __init__(
        self,
        lot_ids: List[str],
        min_price: float = 20.0,
        max_price: float = 150.0,
        target_occupancy: float = 0.85,
    ):
        """
        Initialize the multi-lot pricing environment.

        Args:
            lot_ids: List of parking lot identifiers
            min_price: Minimum allowed price (₹/hr)
            max_price: Maximum allowed price (₹/hr)
            target_occupancy: Target occupancy rate (default: 0.85)
        """
        self.possible_agents = lot_ids[:]
        self.agents = self.possible_agents[:]
        self.min_price = min_price
        self.max_price = max_price
        self.target_occupancy = target_occupancy

        # Observation space per agent: [Occupancy, Inflow, Outflow, Price_Norm, Neighbor_Avg_Occ]
        if PETTINGZOO_AVAILABLE:
            self.observation_spaces = {
                agent: spaces.Box(low=0.0, high=1.0, shape=(5,), dtype=np.float32)
                for agent in self.possible_agents
            }
            # Action space per agent: Continuous delta [-1.0, 1.0] -> (-15% to +15%)
            self.action_spaces = {
                agent: spaces.Box(low=-1.0, high=1.0, shape=(1,), dtype=np.float32)
                for agent in self.possible_agents
            }

        # Internal state
        self.state = {
            agent: {
                "occupancy": 0.50,
                "inflow": 0.10,
                "outflow": 0.10,
                "price": 50.0,
            }
            for agent in self.possible_agents
        }

    def observation_space(self, agent: str):
        """Return observation space for a specific agent."""
        if PETTINGZOO_AVAILABLE:
            return self.observation_spaces[agent]
        return None

    def action_space(self, agent: str):
        """Return action space for a specific agent."""
        if PETTINGZOO_AVAILABLE:
            return self.action_spaces[agent]
        return None

    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> tuple[Dict[str, np.ndarray], Dict[str, Dict[str, Any]]]:
        """
        Reset environment to initial state.

        Args:
            seed: Random seed
            options: Optional configuration overrides

        Returns:
            Tuple of (observations dict, infos dict)
        """
        self.agents = self.possible_agents[:]

        if seed is not None:
            np.random.seed(seed)

        for agent in self.agents:
            self.state[agent] = {
                "occupancy": float(np.random.uniform(0.30, 0.70)),
                "inflow": float(np.random.uniform(0.05, 0.20)),
                "outflow": float(np.random.uniform(0.05, 0.20)),
                "price": 50.0,
            }

        observations = self._get_obs()
        infos = {agent: {} for agent in self.agents}
        return observations, infos

    def _get_obs(self) -> Dict[str, np.ndarray]:
        """
        Compute observations for all agents.

        Returns:
            Dict mapping agent_id to observation array
        """
        obs = {}
        all_occupancies = [self.state[a]["occupancy"] for a in self.agents]
        avg_regional_occ = float(np.mean(all_occupancies))

        for agent in self.agents:
            st = self.state[agent]
            obs[agent] = np.array(
                [
                    st["occupancy"],
                    st["inflow"],
                    st["outflow"],
                    st["price"] / self.max_price,  # Normalized price
                    avg_regional_occ,
                ],
                dtype=np.float32,
            )

        return obs

    def step(
        self,
        actions: Dict[str, np.ndarray],
    ) -> tuple[Dict[str, np.ndarray], Dict[str, float], Dict[str, bool], Dict[str, bool], Dict[str, Dict[str, Any]]]:
        """
        Execute one environment step.

        Args:
            actions: Dict mapping agent_id to action array

        Returns:
            Tuple of (observations, rewards, terminations, truncations, infos)
        """
        if not actions:
            return {}, {}, {}, {}, {}

        rewards = {}
        terminations = {agent: False for agent in self.agents}
        truncations = {agent: False for agent in self.agents}
        infos = {agent: {} for agent in self.agents}

        # Compute regional average occupancy for coordination
        all_occupancies = [self.state[a]["occupancy"] for a in self.agents]
        avg_regional_occ = float(np.mean(all_occupancies))

        for agent, action in actions.items():
            if agent not in self.state:
                continue

            act_val = float(action[0]) if hasattr(action, '__len__') else float(action)

            # Map action [-1, 1] to price shift (-15% to +15%)
            delta_pct = act_val * 0.15
            current_price = self.state[agent]["price"]
            raw_new_price = current_price * (1.0 + delta_pct)

            # Clamp to hard limits
            new_price = max(self.min_price, min(raw_new_price, self.max_price))

            # Simulate occupancy response based on price elasticity
            # Higher price -> decreased inflow, higher outflow
            if current_price > 0:
                price_ratio = new_price / current_price
                demand_elasticity = -0.8
                inflow_change = (price_ratio - 1.0) * demand_elasticity
            else:
                inflow_change = 0.0

            new_inflow = max(
                0.01,
                min(0.50, self.state[agent]["inflow"] + inflow_change * 0.05),
            )

            # Update occupancy with stochastic transition
            new_occ = max(
                0.0,
                min(1.0, self.state[agent]["occupancy"] + new_inflow - self.state[agent]["outflow"]),
            )

            self.state[agent]["price"] = new_price
            self.state[agent]["inflow"] = new_inflow
            self.state[agent]["occupancy"] = new_occ

            # Reward Function:
            # R_i = -α * (O_i - target)² + β * Revenue_i - γ * Σ(O_i - O_j)²
            target_penalty = -5.0 * ((new_occ - self.target_occupancy) ** 2)
            revenue_yield = (new_occ * new_price) / self.max_price
            variance_penalty = -2.0 * ((new_occ - avg_regional_occ) ** 2)

            rewards[agent] = float(target_penalty + revenue_yield + variance_penalty)

            infos[agent] = {
                "price": new_price,
                "occupancy": new_occ,
                "inflow": new_inflow,
            }

        observations = self._get_obs()
        return observations, rewards, terminations, truncations, infos

    def render(self):
        """Render current environment state."""
        print(f"\n{'='*60}")
        print(f"Multi-Lot Pricing Environment State")
        print(f"{'='*60}")
        for agent in self.agents:
            st = self.state[agent]
            print(f"  {agent}: Occ={st['occupancy']:.1%}, Price=₹{st['price']:.2f}, Inflow={st['inflow']:.3f}")
        print(f"{'='*60}\n")

    def close(self):
        """Clean up environment resources."""
        pass
"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 4: MARL Multi-Agent PPO Policy  v1.0                      ║
║   ┌─────────────────────────────────────────────────────────────────┐     ║
║   │ PPO/MAPPO Agent Wrapper for Multi-Lot Pricing                  │     ║
║   │ Manages policy training and inference per lot                  │     ║
║   └─────────────────────────────────────────────────────────────────┘     ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import numpy as np
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger("MARLAgent")

try:
    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import VecEnv
    SB3_AVAILABLE = True
except ImportError:
    SB3_AVAILABLE = False
    logger.warning("stable-baselines3 not installed — using fallback pricing policy")


class MARLPricingAgent:
    """
    Multi-Agent PPO policy wrapper for parking lot pricing.
    
    Manages:
      - Per-agent PPO policies
      - Action generation from observations
      - Model persistence (save/load)
      - Fallback heuristic when SB3 unavailable
    """

    def __init__(
        self,
        lot_ids: List[str],
        observation_dim: int = 5,
        min_price: float = 20.0,
        max_price: float = 150.0,
        max_step_change_pct: float = 0.15,
        model_path: Optional[str] = None,
    ):
        """
        Initialize MARL pricing agent.

        Args:
            lot_ids: List of parking lot identifiers
            observation_dim: Observation space dimension
            min_price: Minimum allowed price (₹/hr)
            max_price: Maximum allowed price (₹/hr)
            max_step_change_pct: Max price change per step
            model_path: Path to pretrained model (optional)
        """
        self.lot_ids = lot_ids[:]
        self.observation_dim = observation_dim
        self.min_price = min_price
        self.max_price = max_price
        self.max_step_change_pct = max_step_change_pct
        self.model_path = model_path

        # Per-agent models (if SB3 available)
        self.models: Dict[str, Any] = {}
        self._fallback_prices = {lot_id: 50.0 for lot_id in lot_ids}

        if SB3_AVAILABLE:
            logger.info(f"MARLPricingAgent initialized with Stable-Baselines3 for {len(lot_ids)} agents")
        else:
            logger.info(f"MARLPricingAgent initialized in fallback mode for {len(lot_ids)} agents")

    def get_action(
        self,
        lot_id: str,
        observation: np.ndarray,
        deterministic: bool = True,
    ) -> np.ndarray:
        """
        Get pricing action for a specific lot agent.

        Args:
            lot_id: Parking lot identifier
            observation: Observation array
            deterministic: If True, use greedy policy (no exploration)

        Returns:
            Action array [delta_multiplier] in range [-1.0, 1.0]
        """
        if SB3_AVAILABLE and lot_id in self.models:
            model = self.models[lot_id]
            action, _ = model.predict(observation, deterministic=deterministic)
            return np.array([float(np.clip(action[0], -1.0, 1.0))], dtype=np.float32)

        # Fallback: simple heuristic based on occupancy
        occupancy = float(observation[0]) if len(observation) > 0 else 0.5
        current_price = float(observation[3]) * self.max_price if len(observation) > 3 else 50.0

        # Simple rule: increase price if occupancy > target, decrease if < target
        target = 0.85
        if occupancy > target:
            delta = 0.15  # Increase price
        elif occupancy < target * 0.8:
            delta = -0.15  # Decrease price
        else:
            delta = 0.0  # Hold steady

        return np.array([delta], dtype=np.float32)

    def get_batch_actions(
        self,
        observations: Dict[str, np.ndarray],
        deterministic: bool = True,
    ) -> Dict[str, np.ndarray]:
        """
        Get actions for all agents in a batch.

        Args:
            observations: Dict mapping lot_id to observation array
            deterministic: If True, use greedy policy

        Returns:
            Dict mapping lot_id to action array
        """
        actions = {}
        for lot_id in observations:
            if lot_id in self.lot_ids:
                actions[lot_id] = self.get_action(lot_id, observations[lot_id], deterministic)
        return actions

    def train(
        self,
        env: Any,
        total_timesteps: int = 100000,
        learning_rate: float = 3e-4,
    ) -> Optional[Dict[str, Any]]:
        """
        Train the MARL policy.

        Args:
            env: PettingZoo ParallelEnv or compatible environment
            total_timesteps: Total training timesteps
            learning_rate: Learning rate for PPO

        Returns:
            Training metrics or None if SB3 unavailable
        """
        if not SB3_AVAILABLE:
            logger.warning("Cannot train: stable-baselines3 not installed")
            return None

        # For simplicity, train each agent independently
        # In production, use MAPPO for true multi-agent coordination
        metrics = {}

        for lot_id in self.lot_ids:
            try:
                # Create a single-agent environment wrapper
                from pettingzoo.utils.conversions import parallel_wrapper_fn
                single_env = env

                model = PPO(
                    "MlpPolicy",
                    single_env,
                    learning_rate=learning_rate,
                    verbose=0,
                )

                model.learn(total_timesteps=total_timesteps // len(self.lot_ids))
                self.models[lot_id] = model
                metrics[lot_id] = {"status": "trained"}
            except Exception as e:
                logger.error(f"Training failed for {lot_id}: {e}")
                metrics[lot_id] = {"status": "failed", "error": str(e)}

        return metrics

    def save(self, path: str):
        """
        Save trained models to disk.

        Args:
            path: Directory path to save models
        """
        if not SB3_AVAILABLE:
            logger.warning("Cannot save: stable-baselines3 not installed")
            return

        import os
        os.makedirs(path, exist_ok=True)

        for lot_id, model in self.models.items():
            model_path = os.path.join(path, f"{lot_id}_ppo.zip")
            model.save(model_path)
            logger.info(f"Saved model for {lot_id} to {model_path}")

    def load(self, path: str):
        """
        Load trained models from disk.

        Args:
            path: Directory path to load models from
        """
        if not SB3_AVAILABLE:
            logger.warning("Cannot load: stable-baselines3 not installed")
            return

        import os
        from stable_baselines3 import PPO

        for lot_id in self.lot_ids:
            model_path = os.path.join(path, f"{lot_id}_ppo.zip")
            if os.path.exists(model_path):
                self.models[lot_id] = PPO.load(model_path)
                logger.info(f"Loaded model for {lot_id} from {model_path}")

    def get_stats(self) -> Dict[str, Any]:
        """
        Get agent statistics.

        Returns:
            Stats dict
        """
        return {
            "lot_ids": self.lot_ids,
            "models_loaded": len(self.models),
            "sb3_available": SB3_AVAILABLE,
            "observation_dim": self.observation_dim,
            "min_price": self.min_price,
            "max_price": self.max_price,
            "max_step_change_pct": self.max_step_change_pct,
        }
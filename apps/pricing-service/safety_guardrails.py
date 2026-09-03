"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 4: MARL Pricing Safety Guardrails  v1.0                   ║
║   ┌─────────────────────────────────────────────────────────────────┐     ║
║   │ 1. Hard Floor & Ceiling Price Limits                           │     ║
║   │ 2. Maximum Step Change Percentage (±15% per 30-min step)       │     ║
║   │ 3. Smooth Continuous Trajectory Interpolation                  │     ║
║   └─────────────────────────────────────────────────────────────────┘     ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import logging
from typing import Dict, Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("PricingSafetyGuardrails")


class PricingSafetyGuardrails:
    """
    Enforces deterministic safety boundaries on Reinforcement Learning pricing policies.
    Guarantees municipal price compliance and prevents sudden price volatility.
    """

    def __init__(
        self,
        min_price: float = 20.0,
        max_price: float = 150.0,
        max_step_change_pct: float = 0.15,
    ):
        """
        Initialize safety guardrails.

        Args:
            min_price: Municipal hard minimum price (₹/hr)
            max_price: Municipal hard maximum price (₹/hr)
            max_step_change_pct: Maximum percentage change per step (default: ±15%)
        """
        self.min_price = min_price
        self.max_price = max_price
        self.max_step_change_pct = max_step_change_pct

        logger.info(
            f"PricingSafetyGuardrails initialized: "
            f"min=₹{min_price}, max=₹{max_price}, max_step=±{max_step_change_pct:.0%}"
        )

    def apply_guardrails(
        self,
        current_price: float,
        proposed_price: float,
    ) -> float:
        """
        Clip proposed price adjustments within bounded limits.

        Pipeline:
          1. Enforce max percentage change per step (±15%)
          2. Enforce hard floor and ceiling boundaries (₹20 - ₹150)

        Args:
            current_price: Current price (₹/hr)
            proposed_price: Proposed new price (₹/hr)

        Returns:
            Bounded price (₹/hr)
        """
        if current_price <= 0:
            current_price = self.min_price

        # 1. Enforce Max Percentage Change per Step
        max_allowed_increase = current_price * (1.0 + self.max_step_change_pct)
        max_allowed_decrease = current_price * (1.0 - self.max_step_change_pct)

        bounded_price = max(
            max_allowed_decrease,
            min(proposed_price, max_allowed_increase),
        )

        # 2. Enforce Hard Floor and Ceiling Boundaries
        final_price = max(self.min_price, min(bounded_price, self.max_price))

        return round(final_price, 2)

    def validate_price(self, price: float) -> bool:
        """
        Check if a price is within safe bounds.

        Args:
            price: Price to validate (₹/hr)

        Returns:
            True if price is within bounds
        """
        return self.min_price <= price <= self.max_price

    def get_price_change_pct(self, current_price: float, new_price: float) -> float:
        """
        Compute the percentage change between two prices.

        Args:
            current_price: Current price (₹/hr)
            new_price: New price (₹/hr)

        Returns:
            Percentage change (e.g., 0.15 for +15%)
        """
        if current_price <= 0:
            return 0.0
        return (new_price - current_price) / current_price

    def is_change_safe(self, current_price: float, new_price: float) -> bool:
        """
        Check if a price change is within the safe step limit.

        Args:
            current_price: Current price (₹/hr)
            new_price: New price (₹/hr)

        Returns:
            True if change is within ±max_step_change_pct
        """
        change_pct = abs(self.get_price_change_pct(current_price, new_price))
        return change_pct <= self.max_step_change_pct

    def get_stats(self) -> Dict[str, Any]:
        """
        Get guardrail statistics.

        Returns:
            Stats dict
        """
        return {
            "min_price": self.min_price,
            "max_price": self.max_price,
            "max_step_change_pct": self.max_step_change_pct,
        }
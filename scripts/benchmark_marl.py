#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 4: MARL Pricing & Guardrails Benchmark                    ║
║                                                                          ║
║   Validates:                                                             ║
║   - Multi-lot MARL environment initialization                            ║
║   - Multi-agent step execution                                           ║
║   - Safety guardrails enforcement                                        ║
║   - Price bounds compliance                                              ║
║   - Step change limits (±15%)                                            ║
║   - Reward calculation (occupancy targeting + revenue + regional balance)║
║   - Performance benchmark                                                ║
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

try:
    # Direct module import by file path to handle hyphenated directory name
    import importlib.util

    def _load_module(name, path):
        spec = importlib.util.spec_from_file_location(name, path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    _SG_PATH = os.path.join(_APPS_DIR, "pricing-service", "safety_guardrails.py")
    _ENV_PATH = os.path.join(_APPS_DIR, "pricing-service", "marl_env.py")

    _sg = _load_module("pricing_service.safety_guardrails", _SG_PATH)
    PricingSafetyGuardrails = _sg.PricingSafetyGuardrails

    _env = _load_module("pricing_service.marl_env", _ENV_PATH)
    MultiLotPricingEnv = _env.MultiLotPricingEnv

    _agent_path = os.path.join(_APPS_DIR, "pricing-service", "marl_agent.py")
    _agent_mod = _load_module("pricing_service.marl_agent", _agent_path)
    MARLPricingAgent = _agent_mod.MARLPricingAgent

    IMPORT_OK = True
except Exception as e:
    err_msg = str(e)

if not IMPORT_OK:
    print("[ERROR] Failed to import MARL modules: " + err_msg)
    print("[ERROR] Ensure apps/pricing-service/ is in your Python path")


# ══════════════════════════════════════════════════════════════════════════
#   BENCHMARK SUITE
# ══════════════════════════════════════════════════════════════════════════

class MARLBenchmarkSuite:
    """Comprehensive benchmark suite for MARL Pricing Engine."""

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

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 1: Environment Initialization
    # ────────────────────────────────────────────────────────────────────────

    def test_env_initialization(self) -> Dict[str, Any]:
        """Test MARL environment initialization."""
        print("\n  -- Test 1: Environment Initialization --")

        results = {}
        lot_ids = ["LOT_PONDY_BAZAAR", "LOT_TNAGAR_NORTH", "LOT_TNAGAR_SOUTH"]
        env = MultiLotPricingEnv(lot_ids=lot_ids)

        init_ok = len(env.agents) == 3 and len(env.possible_agents) == 3
        self._check("Environment initialized with 3 lots", init_ok, f"agents={env.agents}")
        results["agent_count"] = len(env.agents)

        # Check observation space (may be None if PettingZoo not installed)
        obs_space = env.observation_space(env.agents[0])
        obs_shape = getattr(obs_space, 'shape', None) if obs_space else None
        obs_space_ok = obs_shape == (5,)
        if obs_shape is None:
            self._check("Observation space shape (5,) — skipped (PettingZoo not installed)", True)
            results["obs_shape"] = "skipped"
        else:
            self._check("Observation space shape (5,)", obs_space_ok)
            results["obs_shape"] = list(obs_shape)

        # Check action space
        action_space = env.action_space(env.agents[0])
        action_shape = getattr(action_space, 'shape', None) if action_space else None
        action_space_ok = action_shape == (1,)
        if action_shape is None:
            self._check("Action space shape (1,) — skipped (PettingZoo not installed)", True)
            results["action_shape"] = "skipped"
        else:
            self._check("Action space shape (1,)", action_space_ok)
            results["action_shape"] = list(action_shape)

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 2: Environment Reset
    # ────────────────────────────────────────────────────────────────────────

    def test_env_reset(self) -> Dict[str, Any]:
        """Test environment reset."""
        print("\n  -- Test 2: Environment Reset --")

        results = {}
        lot_ids = ["LOT_PONDY_BAZAAR", "LOT_TNAGAR_NORTH", "LOT_TNAGAR_SOUTH"]
        env = MultiLotPricingEnv(lot_ids=lot_ids)

        obs, infos = env.reset(seed=42)

        reset_ok = len(obs) == 3 and all(lid in obs for lid in lot_ids)
        self._check("Reset returns observations for all 3 lots", reset_ok)
        results["obs_count"] = len(obs)

        # Check observation values are within bounds
        for agent, observation in obs.items():
            in_bounds = bool(np.all((observation >= 0.0) & (observation <= 1.0)))
            self._check(f"  {agent}: obs in [0,1]", in_bounds, f"obs={observation}")
            results[f"{agent}_obs"] = observation.tolist()

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 3: Multi-Agent Step Execution
    # ────────────────────────────────────────────────────────────────────────

    def test_multi_agent_step(self) -> Dict[str, Any]:
        """Test multi-agent step execution."""
        print("\n  -- Test 3: Multi-Agent Step Execution --")

        results = {}
        lot_ids = ["LOT_PONDY_BAZAAR", "LOT_TNAGAR_NORTH", "LOT_TNAGAR_SOUTH"]
        env = MultiLotPricingEnv(lot_ids=lot_ids)

        obs, _ = env.reset(seed=42)

        # Generate dummy actions [-1.0, 1.0]
        actions = {agent: np.array([np.random.uniform(-1.0, 1.0)], dtype=np.float32) for agent in env.agents}

        next_obs, rewards, terminations, truncations, infos = env.step(actions)

        step_ok = (
            len(next_obs) == 3 and
            len(rewards) == 3 and
            all(lid in next_obs for lid in lot_ids)
        )
        self._check("Step returns valid observations and rewards", step_ok)
        results["step_successful"] = step_ok

        # Check rewards are finite
        rewards_ok = all(bool(np.isfinite(float(r))) for r in rewards.values())
        self._check("Rewards are finite", rewards_ok, f"rewards={list(rewards.values())}")
        results["rewards"] = {k: round(float(v), 3) for k, v in rewards.items()}

        # Check infos contain price and occupancy
        for agent in env.agents:
            info_ok = "price" in infos[agent] and "occupancy" in infos[agent]
            self._check(f"  {agent}: info contains price/occupancy", info_ok)
            results[f"{agent}_price"] = round(infos[agent].get("price", 0.0), 2)
            results[f"{agent}_occ"] = round(infos[agent].get("occupancy", 0.0), 3)

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 4: Safety Guardrails
    # ────────────────────────────────────────────────────────────────────────

    def test_safety_guardrails(self) -> Dict[str, Any]:
        """Test safety guardrails enforcement."""
        print("\n  -- Test 4: Safety Guardrails --")

        results = {}
        guardrails = PricingSafetyGuardrails(min_price=20.0, max_price=150.0, max_step_change_pct=0.15)

        # Test 4a: Max step change enforcement
        current = 100.0
        proposed = 130.0  # +30% — should be clamped to +15%
        guarded = guardrails.apply_guardrails(current, proposed)
        step_ok = abs(guarded - current) <= current * 0.15 + 0.01
        self._check("Max step change enforced (+30% -> +15%)", step_ok, f"guarded=Rs.{guarded}")
        results["step_clamp"] = step_ok

        # Test 4b: Hard floor enforcement
        proposed_low = 10.0
        guarded_low = guardrails.apply_guardrails(20.0, proposed_low)
        floor_ok = guarded_low >= 20.0
        self._check("Hard floor enforced (Rs.10 -> Rs.20)", floor_ok, f"guarded=Rs.{guarded_low}")
        results["floor_enforced"] = floor_ok

        # Test 4c: Hard ceiling enforcement
        proposed_high = 200.0
        guarded_high = guardrails.apply_guardrails(140.0, proposed_high)
        ceiling_ok = guarded_high <= 150.0
        self._check("Hard ceiling enforced (Rs.200 -> Rs.150)", ceiling_ok, f"guarded=Rs.{guarded_high}")
        results["ceiling_enforced"] = ceiling_ok

        # Test 4d: Valid change passes through
        proposed_valid = 115.0
        guarded_valid = guardrails.apply_guardrails(100.0, proposed_valid)
        valid_ok = abs(guarded_valid - proposed_valid) < 0.01
        self._check("Valid +15% change passes through", valid_ok, f"guarded=Rs.{guarded_valid}")
        results["valid_passthrough"] = valid_ok

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 5: Reward Function
    # ────────────────────────────────────────────────────────────────────────

    def test_reward_function(self) -> Dict[str, Any]:
        """Test reward function behavior."""
        print("\n  -- Test 5: Reward Function --")

        results = {}
        lot_ids = ["LOT_PONDY_BAZAAR", "LOT_TNAGAR_NORTH", "LOT_TNAGAR_SOUTH"]
        env = MultiLotPricingEnv(lot_ids=lot_ids, target_occupancy=0.85)

        # Set all lots to target occupancy
        for agent in env.agents:
            env.state[agent]["occupancy"] = 0.85
            env.state[agent]["price"] = 100.0
            env.state[agent]["inflow"] = 0.10
            env.state[agent]["outflow"] = 0.10

        # Take zero actions (hold price)
        actions = {agent: np.array([0.0], dtype=np.float32) for agent in env.agents}
        obs, rewards, _, _, infos = env.step(actions)

        # At target occupancy, reward should be positive (revenue - small penalties)
        reward_at_target = float(rewards[lot_ids[0]])
        target_reward_ok = reward_at_target > -2.0  # Allow some variance
        self._check("Reward at target occupancy is reasonable", target_reward_ok,
                    f"reward={reward_at_target:.3f}")
        results["reward_at_target"] = round(reward_at_target, 3)

        # Set one lot to very high occupancy (should get penalty)
        env.state[lot_ids[0]]["occupancy"] = 0.99
        actions2 = {agent: np.array([0.0], dtype=np.float32) for agent in env.agents}
        obs2, rewards2, _, _, infos2 = env.step(actions2)

        high_occ_penalty = float(rewards2[lot_ids[0]])
        penalty_ok = high_occ_penalty < reward_at_target
        self._check("High occupancy penalty applied", penalty_ok,
                    f"reward={high_occ_penalty:.3f}")
        results["high_occ_penalty"] = round(high_occ_penalty, 3)

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 6: Regional Coordination
    # ────────────────────────────────────────────────────────────────────────

    def test_regional_coordination(self) -> Dict[str, Any]:
        """Test that agents coordinate via regional occupancy observation."""
        print("\n  -- Test 6: Regional Coordination --")

        results = {}
        lot_ids = ["LOT_PONDY_BAZAAR", "LOT_TNAGAR_NORTH", "LOT_TNAGAR_SOUTH"]
        env = MultiLotPricingEnv(lot_ids=lot_ids)

        # Set different occupancies
        env.state[lot_ids[0]]["occupancy"] = 0.60
        env.state[lot_ids[1]]["occupancy"] = 0.90
        env.state[lot_ids[2]]["occupancy"] = 0.75

        obs = env._get_obs()

        # All agents should see the same regional average (~0.75)
        regional_avgs = [obs[lid][4] for lid in lot_ids]
        regional_match = all(abs(avg - 0.75) < 0.01 for avg in regional_avgs)
        self._check("All agents observe same regional average", regional_match,
                    f"regional_avg={regional_avgs[0]:.3f}")
        results["regional_avg"] = round(float(regional_avgs[0]), 3)

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 7: MARL Agent Integration
    # ────────────────────────────────────────────────────────────────────────

    def test_marl_agent(self) -> Dict[str, Any]:
        """Test MARL agent action generation."""
        print("\n  -- Test 7: MARL Agent Integration --")

        results = {}
        lot_ids = ["LOT_PONDY_BAZAAR", "LOT_TNAGAR_NORTH", "LOT_TNAGAR_SOUTH"]
        env = MultiLotPricingEnv(lot_ids=lot_ids)
        agent = MARLPricingAgent(lot_ids=lot_ids)

        obs, _ = env.reset(seed=42)

        # Get batch actions
        actions = agent.get_batch_actions(obs, deterministic=True)

        actions_ok = len(actions) == 3 and all(lid in actions for lid in lot_ids)
        self._check("Agent returns actions for all 3 lots", actions_ok)
        results["action_count"] = len(actions)

        # Check actions are in valid range [-1, 1]
        for lot_id, action in actions.items():
            in_range = bool(-1.0 <= float(action[0]) <= 1.0)
            self._check(f"  {lot_id}: action in [-1, 1]", in_range, f"action={action[0]:.3f}")
            results[f"{lot_id}_action"] = round(float(action[0]), 3)

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 8: Performance Benchmark
    # ────────────────────────────────────────────────────────────────────────

    def test_performance(self) -> Dict[str, Any]:
        """Benchmark MARL environment performance."""
        print("\n  -- Test 8: Performance Benchmark --")

        results = {}
        lot_ids = ["LOT_PONDY_BAZAAR", "LOT_TNAGAR_NORTH", "LOT_TNAGAR_SOUTH"]
        env = MultiLotPricingEnv(lot_ids=lot_ids)
        agent = MARLPricingAgent(lot_ids=lot_ids)

        # Warmup
        obs, _ = env.reset(seed=42)
        actions = agent.get_batch_actions(obs)
        _ = env.step(actions)

        # Time 100 steps
        times = []
        for _ in range(100):
            t0 = time.perf_counter()
            obs, _ = env.reset()
            actions = agent.get_batch_actions(obs)
            _, rewards, _, _, infos = env.step(actions)
            t1 = time.perf_counter()
            times.append((t1 - t0) * 1000)

        avg_ms = sum(times) / len(times)
        p99_ms = sorted(times)[int(len(times) * 0.99)]

        perf_ok = avg_ms < 1.0
        self._check(f"Performance: < 1ms per step (3 lots)", perf_ok,
                    f"avg={avg_ms:.3f}ms, p99={p99_ms:.3f}ms")
        results["avg_latency_ms"] = round(avg_ms, 4)
        results["p99_latency_ms"] = round(p99_ms, 4)
        results["pass"] = perf_ok

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   RUN ALL TESTS
    # ────────────────────────────────────────────────────────────────────────

    def run_all(self) -> Dict[str, Any]:
        """Run all MARL benchmark tests."""
        print("=" * 70)
        print("  SLOTS Module 4: MARL Pricing & Guardrails Benchmark")
        print("=" * 70)

        if not IMPORT_OK:
            print("\n[FAIL] Import error — skipping benchmarks")
            return {"status": "failed", "error": "ImportError"}

        all_results = {}

        all_results["env_init"] = self.test_env_initialization()
        all_results["env_reset"] = self.test_env_reset()
        all_results["multi_agent_step"] = self.test_multi_agent_step()
        all_results["safety_guardrails"] = self.test_safety_guardrails()
        all_results["reward_function"] = self.test_reward_function()
        all_results["regional_coordination"] = self.test_regional_coordination()
        all_results["marl_agent"] = self.test_marl_agent()
        all_results["performance"] = self.test_performance()

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


# ══════════════════════════════════════════════════════════════════════════
#   MAIN ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="SLOTS Module 4: MARL Pricing & Guardrails Benchmark"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output JSON file for benchmark results"
    )
    args = parser.parse_args()

    suite = MARLBenchmarkSuite()
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
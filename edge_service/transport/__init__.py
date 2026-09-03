"""Transport & pub/sub scaling bridge package for SLOTS edge AI."""

from edge_service.transport.redis_deduplicator import RedisDeltaDeduplicator

__all__ = [
    "RedisDeltaDeduplicator",
]
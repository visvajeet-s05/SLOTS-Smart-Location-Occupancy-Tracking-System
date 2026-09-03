/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   SLOTS Module 3: Real-Time Transport Service — Entry Point              ║
 * ║                                                                          ║
 * ║   Starts the WebTransport/WebSocket server with Redis Streams consumer.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { createTransportServer } from './webtransport_server';

async function main() {
  const server = await createTransportServer({
    port: Number(process.env.PORT ?? 3002),
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    redisStream: process.env.REDIS_STREAM ?? 'slots:telemetry:stream',
    consumerGroup: process.env.CONSUMER_GROUP ?? 'realtime-relay',
    consumerName: process.env.CONSUMER_NAME ?? 'relay-1',
    enableWebTransport: process.env.ENABLE_WEBTRANSPORT === 'true',
    holdWindowMs: Number(process.env.HOLD_WINDOW_MS ?? 1000),
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[main] Shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[main] Shutting down...');
    await server.stop();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('[main] Fatal error:', error);
  process.exit(1);
});
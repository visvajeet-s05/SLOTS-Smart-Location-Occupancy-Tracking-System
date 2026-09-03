/**
 * SLOTS Telemetry Gateway - MQTT to WebSocket Bridge
 * ===================================================
 * This server bridges edge node events to the frontend dashboard via:
 * 1. MQTT Consumer - Receives edge events from edge nodes
 * 2. Database Update - Persists events to PostgreSQL via Prisma
 * 3. WebSocket Broadcast - Emits real-time updates to connected clients
 */

import mqtt, { MqttClient } from 'mqtt';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// Configuration
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_TOPIC_PATTERN = 'slots/edge/+/occupancy';
const SOCKET_PORT = parseInt(process.env.SOCKET_PORT || '4001', 10);

// TypeScript interfaces
interface EdgeEvent {
  site_id: string;
  bay_id: string;
  status: 'OCCUPIED' | 'AVAILABLE' | 'RESERVED' | 'TAMPER_ALERT';
  plate_number?: string;
  confidence: number;
  timestamp: string;
}

interface BayStatusChangedEvent {
  site_id: string;
  bay_id: string;
  status: string;
  plate_number?: string;
  confidence: number;
  timestamp: string;
}

interface NeuralEventLogEvent {
  site_id: string;
  bay_id: string;
  event_type: string;
  confidence: number;
  plate_number?: string;
  timestamp: string;
}

class TelemetryGateway {
  private mqttClient: MqttClient | null = null;
  private io: SocketIOServer;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // 5 seconds

  constructor() {
    // Create HTTP server for Socket.IO
    const httpServer = createServer();
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
      }
    });

    // Start Socket.IO server
    httpServer.listen(SOCKET_PORT, () => {
      console.log(`🚀 Telemetry Gateway WebSocket server running on port ${SOCKET_PORT}`);
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`📱 Client connected: ${socket.id}`);

      // Handle site subscription
      socket.on('subscribe_site', (siteId: string) => {
        socket.join(`site:${siteId}`);
        console.log(`🔔 Socket ${socket.id} subscribed to site:${siteId}`);
      });

      // Handle site unsubscription
      socket.on('unsubscribe_site', (siteId: string) => {
        socket.leave(`site:${siteId}`);
        console.log(`🔕 Socket ${socket.id} unsubscribed from site:${siteId}`);
      });

      socket.on('disconnect', () => {
        console.log(`📴 Client disconnected: ${socket.id}`);
      });
    });
  }

  private async connectToMQTT(): Promise<void> {
    try {
      console.log(`🔌 Connecting to MQTT broker: ${MQTT_BROKER}`);
      
      this.mqttClient = mqtt.connect(MQTT_BROKER, {
        clientId: `telemetry-gateway-${Date.now()}`,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: this.reconnectDelay
      });

      this.mqttClient.on('connect', () => {
        console.log('✅ MQTT client connected');
        this.reconnectAttempts = 0;
        
        // Subscribe to edge events
        this.mqttClient!.subscribe(MQTT_TOPIC_PATTERN, (err) => {
          if (err) {
            console.error('❌ Failed to subscribe to MQTT topic:', err);
          } else {
            console.log(`🔔 Subscribed to topic: ${MQTT_TOPIC_PATTERN}`);
          }
        });
      });

      this.mqttClient.on('message', async (topic, message) => {
        try {
          const payload: EdgeEvent = JSON.parse(message.toString());
          console.log(`📨 Received MQTT message on ${topic}:`, payload);
          
          await this.processEdgeEvent(payload);
        } catch (error) {
          console.error('❌ Error processing MQTT message:', error);
        }
      });

      this.mqttClient.on('error', (err) => {
        console.error('❌ MQTT connection error:', err);
      });

      this.mqttClient.on('reconnect', () => {
        console.log('🔄 MQTT client reconnecting...');
      });

      this.mqttClient.on('close', () => {
        console.log('🔌 MQTT connection closed');
      });

    } catch (error) {
      console.error('❌ Failed to connect to MQTT broker:', error);
      await this.handleReconnect();
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
      
      console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
      
      setTimeout(() => {
        this.connectToMQTT();
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached. MQTT connection failed.');
    }
  }

  private async processEdgeEvent(event: EdgeEvent): Promise<void> {
    try {
      const { site_id, bay_id, status, plate_number, confidence, timestamp } = event;

      // Update database
      await this.updateDatabase(site_id, bay_id, status, plate_number, confidence, timestamp);

      // Broadcast to WebSocket clients
      this.broadcastToClients(site_id, bay_id, status, plate_number, confidence, timestamp);

    } catch (error) {
      console.error('❌ Error processing edge event:', error);
    }
  }

  private async updateDatabase(
    site_id: string,
    bay_id: string,
    status: string,
    plate_number: string | undefined,
    confidence: number,
    timestamp: string
  ): Promise<void> {
    try {
      // Try to update ParkingBay first (new multi-level schema)
      try {
        const parkingBay = await prisma.parkingBay.findFirst({
          where: {
            bayNumber: bay_id
          }
        });

        if (parkingBay) {
          await prisma.parkingBay.update({
            where: {
              id: parkingBay.id
            },
            data: {
              status: status as any,
              currentPlate: plate_number,
              lastUpdated: new Date(timestamp)
            }
          });

          console.log(`💾 ParkingBay updated for ${bay_id}: ${status}`);

          // Create occupancy log entry
          if (status === 'OCCUPIED') {
            await prisma.occupancyLog.create({
              data: {
                bayId: parkingBay.id,
                vehicleType: 'CAR',
                plateNumber: plate_number || 'UNKNOWN',
                entryTime: new Date(timestamp),
                confidenceScore: confidence
              }
            });

            console.log(`📝 Occupancy log created for bay ${bay_id}`);
          }
        } else {
          throw new Error('ParkingBay not found');
        }
      } catch (parkingBayError) {
        // ParkingBay may not exist yet, fall back to Slot schema
        console.log(`ℹ️ ParkingBay not found for ${bay_id}, using Slot schema`);
        
        // Extract numeric slot number from bay_id (e.g., "BAY-A-101" -> 101)
        const slotNumber = parseInt(bay_id.split('-').pop() || '0');
        
        if (slotNumber > 0) {
          const slot = await prisma.slot.updateMany({
            where: {
              slotNumber: slotNumber,
              lotId: site_id
            },
            data: {
              status: status as any,
              aiConfidence: confidence,
              updatedAt: new Date(timestamp)
            }
          });

          console.log(`💾 Slot updated for bay ${bay_id}: ${status} (${slot.count} slots updated)`);
        }
      }

    } catch (error) {
      console.error('❌ Database update failed:', error);
      // Don't throw error to prevent breaking the pipeline
    }
  }

  private broadcastToClients(
    site_id: string,
    bay_id: string,
    status: string,
    plate_number: string | undefined,
    confidence: number,
    timestamp: string
  ): void {
    // Emit bay status changed event
    const bayStatusEvent: BayStatusChangedEvent = {
      site_id,
      bay_id,
      status,
      plate_number,
      confidence,
      timestamp
    };

    // Emit to both site:{site_id} and direct site_id for compatibility
    this.io.to(`site:${site_id}`).emit('bay_status_changed', bayStatusEvent);
    this.io.to(site_id).emit('bay_status_changed', bayStatusEvent);
    console.log(`📡 Broadcasted bay_status_changed to site:${site_id} and ${site_id}`);

    // Emit neural event log entry
    const neuralEvent: NeuralEventLogEvent = {
      site_id,
      bay_id,
      event_type: status === 'OCCUPIED' ? 'VEHICLE_DETECTED' : 'VEHICLE_EXITED',
      confidence,
      plate_number,
      timestamp
    };

    this.io.to(`site:${site_id}`).emit('neural_event_log', neuralEvent);
    this.io.to(site_id).emit('neural_event_log', neuralEvent);
    console.log(`📡 Broadcasted neural_event_log to site:${site_id} and ${site_id}`);
  }

  public start(): void {
    console.log('🚀 Starting Telemetry Gateway...');
    this.connectToMQTT();
  }

  public stop(): void {
    console.log('🛑 Stopping Telemetry Gateway...');
    
    if (this.mqttClient) {
      this.mqttClient.end();
    }
    
    this.io.close();
    prisma.$disconnect();
  }
}

// Start the gateway
const gateway = new TelemetryGateway();
gateway.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  gateway.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  gateway.stop();
  process.exit(0);
});
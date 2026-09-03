import { useEffect, useRef, useState } from 'react'

interface SlotUpdate {
  type: 'SLOT_UPDATE'
  lotId: string
  slotId: string
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'DISABLED' | 'CLOSED'
  confidence?: number
  updatedBy?: 'AI' | 'OWNER' | 'CUSTOMER'
  timestamp: string
}

interface BulkUpdate {
  type: 'BULK_SLOT_UPDATE'
  lotId: string
  action: string
  status?: string
  updatedCount: number
  timestamp: string
}

interface HeartbeatMessage {
  type: 'HEARTBEAT'
  timestamp: string
}

interface PongMessage {
  type: 'PONG'
  timestamp: string
}

interface ConnectedMessage {
  type: 'CONNECTED'
  message: string
  timestamp: string
}

type WebSocketMessage = SlotUpdate | BulkUpdate | HeartbeatMessage | PongMessage | ConnectedMessage

interface UseParkingSocketOptions {
  lotId?: string
  onSlotUpdate?: (update: SlotUpdate) => void
  onBulkUpdate?: (update: BulkUpdate) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export function useParkingSocket({
  lotId,
  onSlotUpdate,
  onBulkUpdate,
  onConnect,
  onDisconnect
}: UseParkingSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null)
  const [lastDataTimestamp, setLastDataTimestamp] = useState<Date | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const onSlotUpdateRef = useRef(onSlotUpdate)
  const onBulkUpdateRef = useRef(onBulkUpdate)
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)

  // Update refs when callbacks change
  useEffect(() => {
    onSlotUpdateRef.current = onSlotUpdate
    onBulkUpdateRef.current = onBulkUpdate
    onConnectRef.current = onConnect
    onDisconnectRef.current = onDisconnect
  }, [onSlotUpdate, onBulkUpdate, onConnect, onDisconnect])

  useEffect(() => {
    if (!lotId) return

    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const connect = () => {
      try {
        // Support multiple environment variable names for compatibility
        let wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || process.env.NEXT_PUBLIC_WS_URL || '';
        
        // Auto-detect production environment if URL is missing or points to localhost
        if (typeof window !== 'undefined') {
          if (!wsUrl || wsUrl.includes('localhost')) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.hostname;
            
            // On production (e.g. Railway), if no specific WS_URL is provided, 
            // attempt to connect to the same host. Most Railway setups map 
            // both to the same domain or use a proxy.
            if (!host.includes('localhost')) {
                wsUrl = `${protocol}//${host}`;
            } else {
                wsUrl = 'ws://localhost:4000';
            }
          }
        } else if (!wsUrl) {
          wsUrl = 'ws://localhost:4000';
        }

        // Clean up the URL (remove trailing slashes)
        wsUrl = wsUrl.replace(/\/$/, '');
        
        console.log(`📡 WebSocket connecting to: ${wsUrl}`);
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('✅ WebSocket connected')
          setIsConnected(true)
          setReconnectAttempts(0) // Reset attempts on successful connection
          onConnectRef.current?.()

          // Subscribe to this parking lot as CUSTOMER, or globally if no lotId
          ws.send(JSON.stringify({
            type: 'SUBSCRIBE',
            lotId: lotId,
            role: 'CUSTOMER'
          }))

          // Start heartbeat monitoring with ping every 15 seconds for faster failure detection
          heartbeatIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'PING' }))
            }
          }, 15000) // Ping every 15 seconds (reduced from 30s for faster detection)
        }

        ws.onmessage = (event) => {
          try {
            const data: WebSocketMessage = JSON.parse(event.data)

            if (data.type === 'SLOT_UPDATE') {
              // Process updates for this parking lot or globally
              if (!lotId || data.lotId === lotId) {
                console.log(`📝 Customer received slot update: ${data.slotId} -> ${data.status}`)
                setLastDataTimestamp(new Date(data.timestamp))
                onSlotUpdateRef.current?.(data)
              }
            } else if (data.type === 'BULK_SLOT_UPDATE') {
              // Process bulk updates for this parking lot or globally
              if (!lotId || data.lotId === lotId) {
                console.log(`📦 Customer received bulk update: ${data.action} (${data.updatedCount} slots)`)
                setLastDataTimestamp(new Date(data.timestamp))
                onBulkUpdateRef.current?.(data)
              }
            } else if (data.type === 'HEARTBEAT') {
              setLastHeartbeat(new Date())
            } else if (data.type === 'PONG') {
              setLastHeartbeat(new Date())
            } else if (data.type === 'CONNECTED') {
              console.log('🔗 WebSocket connection confirmed')
              setReconnectAttempts(0) // Reset on successful connection
            }
          } catch (error) {
            console.error('❌ Error parsing WebSocket message:', error)
          }
        }

        ws.onclose = () => {
          console.log('⚠️ Customer portal disconnected from WebSocket')
          setIsConnected(false)
          onDisconnectRef.current?.()

          // Clear heartbeat interval
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current)
            heartbeatIntervalRef.current = null
          }

          // Exponential backoff: 2s, 4s, 8s, 16s, max 30s for faster reconnection
          const backoffDelay = Math.min(2000 * Math.pow(2, reconnectAttempts), 30000)
          setReconnectAttempts(prev => prev + 1)
          
          console.log(`🔄 Attempting to reconnect in ${backoffDelay/1000}s (attempt ${reconnectAttempts + 1})`)
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, backoffDelay)
        }

        ws.onerror = (error) => {
          // WebSocket errors are expected when server is not running
          // Silently ignore to avoid console noise in development
        }

      } catch (error) {
        console.error('❌ Failed to create WebSocket connection:', error)
      }
    }

    connect()

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }

      setIsConnected(false)
    }
  }, [lotId])

  return {
    isConnected,
    lastHeartbeat,
    lastDataTimestamp,
    reconnectAttempts
  }
}

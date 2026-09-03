"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

type WebSocketMessage = {
  type: string;
  lotId?: string;
  slotId?: string;
  status?: string;
  confidence?: number;
  updatedBy?: "AI" | "OWNER" | "CUSTOMER";
  oldStatus?: string;
  action?: string;
  updatedCount?: number;
  timestamp?: string;
  [key: string]: any;
};

type OwnerWebSocketContextType = {
  ws: WebSocket | null;
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  connect: () => void;
  disconnect: () => void;
};

const OwnerWebSocketContext = createContext<OwnerWebSocketContextType>({
  ws: null,
  isConnected: false,
  lastMessage: null,
  connect: () => { },
  disconnect: () => { },
});

export function OwnerWebSocketProvider({
  lotId,
  children,
}: {
  lotId: string;
  children: React.ReactNode;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  // Reconnection state
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000; // 3 seconds
  const HEARTBEAT_INTERVAL = 30000; // 30 seconds

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Connect function
  const connect = useCallback(() => {
    if (!lotId || isConnectingRef.current) return;

    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("🟡 WebSocket already connected, skipping");
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log("🟡 WebSocket already connecting, skipping");
      return;
    }

    isConnectingRef.current = true;
    clearTimers();

    // Support multiple environment variable names for compatibility
    let wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || process.env.NEXT_PUBLIC_WS_URL || "";
    
    // Auto-detect production vs local environment
    if (typeof window !== 'undefined') {
      if (!wsUrl || wsUrl.includes('localhost') || wsUrl.includes('127.0.0.1')) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const hostname = window.location.hostname;
        const port = window.location.port || '4000'; // Fallback to 4000
        
        if (hostname.includes('localhost') || hostname.includes('127.0.0.1') || 
            hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
          // If we are on local network or localhost, and no URL was provided, 
          // default to the standard port 4000
          wsUrl = `${protocol}//${hostname}:4000`;
        } else if (!wsUrl) {
          // If on a different host and no URL was provided, assume same host
          wsUrl = `${protocol}//${hostname}${window.location.port ? ':' + window.location.port : ''}`;
        }
      }
    } else if (!wsUrl) {
      wsUrl = "ws://localhost:4000";
    }

    // Standardize URL
    wsUrl = wsUrl.replace(/\/$/, '');
    
    console.log(`🟢 Creating WebSocket connection for owner to ${wsUrl}...`);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("🟢 OWNER WS CONNECTED");
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        isConnectingRef.current = false;

        // Subscribe to this parking lot
        ws.send(
          JSON.stringify({
            type: "SUBSCRIBE",
            lotId,
            role: "OWNER",
          })
        );

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "PING" }));
          }
        }, HEARTBEAT_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          console.log("📨 Owner received message:", data.type);
          setLastMessage(data);
        } catch (error) {
          console.error("❌ Failed to parse WebSocket message:", error);
        }
      };

      ws.onerror = (event) => {
        console.warn("⚠️ WS error occurred - WebSocket server may not be running", event);
        isConnectingRef.current = false;
        // Don't treat connection errors as critical - allow graceful degradation
      };

      ws.onclose = (event) => {
        console.log(`🔴 WS closed (code: ${event.code}, reason: ${event.reason})`);
        setIsConnected(false);
        wsRef.current = null;
        isConnectingRef.current = false;
        clearTimers();

        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000 && event.code !== 1001) {
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            console.log(`🔄 Reconnecting... Attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, RECONNECT_DELAY * reconnectAttemptsRef.current); // Exponential backoff
          } else {
            console.warn("⚠️ Max reconnection attempts reached - WebSocket functionality temporarily unavailable");
            // Set a longer timeout to retry connection periodically
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current = 0; // Reset attempts
              console.log("🔄 Resetting reconnection attempts and retrying...");
              connect();
            }, 60000); // Retry after 1 minute
          }
        }
      };
    } catch (error) {
      console.warn("⚠️ Failed to create WebSocket - continuing without real-time updates", error);
      isConnectingRef.current = false;
      // Allow the app to continue without WebSocket functionality
    }
  }, [lotId, clearTimers]);

  // Disconnect function
  const disconnect = useCallback(() => {
    clearTimers();
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // Prevent reconnection

    if (wsRef.current) {
      // Use code 1000 for normal closure
      wsRef.current.close(1000, "Provider unmounting");
      wsRef.current = null;
    }

    setIsConnected(false);
    isConnectingRef.current = false;
  }, [clearTimers]);

  useEffect(() => {
    if (!lotId) return;

    connect();

    // Cleanup on unmount or lotId change
    return () => {
      disconnect();
    };
  }, [lotId, connect, disconnect]);

  return (
    <OwnerWebSocketContext.Provider value={{
      ws: wsRef.current,
      isConnected,
      lastMessage,
      connect,
      disconnect
    }}>
      {children}
    </OwnerWebSocketContext.Provider>
  );
}

export function useOwnerWS() {
  return useContext(OwnerWebSocketContext);
}

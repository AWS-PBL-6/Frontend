import { useEffect, useRef, useState } from "react";
import { config } from "./config";
import type { WsMessage } from "./types";

/**
 * Subscribes to the realtime WebSocket API. Reconnects with capped backoff.
 * ``onMessage`` is kept in a ref so re-renders don't reconnect the socket.
 */
export function useWebSocket(onMessage: (msg: WsMessage) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!config.wsUrl) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: number | undefined;

    const connect = () => {
      ws = new WebSocket(config.wsUrl);
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        timer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (evt) => {
        try {
          cbRef.current(JSON.parse(evt.data) as WsMessage);
        } catch {
          /* ignore non-JSON frames */
        }
      };
    };
    connect();

    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return { connected };
}

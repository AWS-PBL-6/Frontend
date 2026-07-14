import { useEffect, useRef, useState } from "react";
import { config } from "./config";
import type { RealtimeConnectionState, RiskLevel, WsMessage, WsType } from "./types";

const WS_TYPES = new Set<WsType>([
  "line.status.updated",
  "sensor.reading.received",
  "risk.caution.detected",
  "risk.danger.detected",
  "snapback.zone.updated",
  "alert.sent",
  "device.offline",
]);
const RISK_LEVELS = new Set<RiskLevel>(["NORMAL", "CAUTION", "DANGER"]);

/** Reject malformed frames before they can overwrite live React state. */
export function parseWsMessage(value: unknown): WsMessage | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as Record<string, unknown>;
  const data = envelope.data;
  if (
    typeof envelope.type !== "string" ||
    !WS_TYPES.has(envelope.type as WsType) ||
    typeof envelope.version !== "string" ||
    typeof envelope.traceId !== "string" ||
    typeof envelope.sentAt !== "string" ||
    !data ||
    typeof data !== "object"
  ) {
    return null;
  }
  const d = data as Record<string, unknown>;
  if (
    typeof d.lineId !== "string" ||
    !RISK_LEVELS.has(d.riskLevel as RiskLevel) ||
    typeof d.riskScore !== "number" ||
    !Number.isFinite(d.riskScore)
  ) {
    return null;
  }
  if (d.measurement !== undefined) {
    const measurement = d.measurement;
    if (
      !measurement ||
      typeof measurement !== "object" ||
      (measurement as Record<string, unknown>).sensorKind !== "PIEZO" ||
      typeof (measurement as Record<string, unknown>).eventId !== "string" ||
      typeof (measurement as Record<string, unknown>).freqHz !== "number" ||
      !Number.isFinite((measurement as Record<string, unknown>).freqHz)
    ) {
      return null;
    }
  }
  if (d.responseGuidance !== undefined && d.responseGuidance !== null) {
    const response = d.responseGuidance;
    if (!response || typeof response !== "object") return null;
    const guidanceEnvelope = response as Record<string, unknown>;
    const guidance = guidanceEnvelope.guidance;
    if (
      guidanceEnvelope.schemaVersion !== "1.0.0"
      || guidanceEnvelope.type !== "response.guidance.generated"
      || guidanceEnvelope.riskLevel !== d.riskLevel
      || guidanceEnvelope.alertDispatched !== false
      || !guidance
      || typeof guidance !== "object"
      || typeof (guidance as Record<string, unknown>).headline !== "string"
      || !Array.isArray((guidance as Record<string, unknown>).immediateActions)
    ) {
      return null;
    }
  }
  return value as WsMessage;
}

interface RealtimeSocket {
  connected: boolean;
  state: RealtimeConnectionState;
  lastMessageAt: string | null;
}

/**
 * Subscribe to dashboard realtime events with capped exponential reconnect.
 * Callback refs prevent React renders from reopening the socket. When a
 * connection is restored, ``onConnected`` can reconcile events missed while
 * the browser was asleep or offline.
 */
export function useWebSocket(
  onMessage: (msg: WsMessage) => void,
  onConnected?: () => void,
): RealtimeSocket {
  const [state, setState] = useState<RealtimeConnectionState>(
    config.wsUrl ? "connecting" : "disabled",
  );
  const [lastMessageAt, setLastMessageAt] = useState<string | null>(null);
  const messageRef = useRef(onMessage);
  const connectedRef = useRef(onConnected);
  messageRef.current = onMessage;
  connectedRef.current = onConnected;

  useEffect(() => {
    if (!config.wsUrl) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: number | undefined;

    const clearRetry = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const scheduleReconnect = () => {
      if (stopped || timer !== undefined || !navigator.onLine) {
        if (!navigator.onLine) setState("offline");
        return;
      }
      attempt += 1;
      setState("reconnecting");
      const delay = Math.min(750 * 2 ** Math.min(attempt - 1, 5), 15000);
      timer = window.setTimeout(() => {
        timer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (stopped || !navigator.onLine) {
        setState("offline");
        return;
      }
      if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
      clearRetry();
      setState(attempt > 0 ? "reconnecting" : "connecting");
      const socket = new WebSocket(config.wsUrl);
      ws = socket;
      socket.onopen = () => {
        if (stopped || ws !== socket) return;
        attempt = 0;
        setState("connected");
        connectedRef.current?.();
      };
      socket.onclose = () => {
        if (ws === socket) ws = null;
        if (!stopped) scheduleReconnect();
      };
      socket.onerror = () => socket.close();
      socket.onmessage = (evt) => {
        try {
          const parsed = parseWsMessage(JSON.parse(evt.data));
          if (!parsed) return;
          setLastMessageAt(new Date().toISOString());
          messageRef.current(parsed);
        } catch {
          // API Gateway/control frames and invalid JSON never mutate app state.
        }
      };
    };

    const resume = () => {
      if (stopped) return;
      if (!navigator.onLine) {
        setState("offline");
        return;
      }
      if (document.visibilityState === "visible") connect();
    };
    const goOffline = () => {
      clearRetry();
      setState("offline");
      ws?.close();
    };

    window.addEventListener("online", resume);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", resume);
    connect();

    return () => {
      stopped = true;
      clearRetry();
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", resume);
      ws?.close();
    };
  }, []);

  return { connected: state === "connected", state, lastMessageAt };
}

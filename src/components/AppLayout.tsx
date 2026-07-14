import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { TopNav } from "./TopNav";
import { AdminGuide, adminGuideStorageKey } from "./AdminGuide";
import { RiskGuidanceAlert } from "./RiskGuidanceAlert";
import { useAuth } from "../auth/AuthProvider";
import { useWebSocket } from "../lib/useWebSocket";
import { api } from "../lib/api";
import type {
  Bollard,
  DashboardSummary,
  LineStatus,
  LiveData,
  LiveSensorReading,
  Vessel,
  WsMessage,
} from "../lib/types";

function readingFromEvent(
  event: import("../lib/types").EventRecord,
  sensorId?: string | null,
): LiveSensorReading | null {
  const sensorKind = event.context.sensorKind;
  const freqHz = event.context.structuralFreqHz;
  if (sensorKind !== "piezo" || typeof freqHz !== "number" || !Number.isFinite(freqHz)) return null;
  const loadRatio = event.context.loadRatio;
  return {
    lineId: event.lineId,
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    receivedAt: event.createdAt,
    sensorKind: "PIEZO",
    sensorId,
    freqHz,
    loadRatio: typeof loadRatio === "number" && Number.isFinite(loadRatio) ? loadRatio : null,
  };
}

function timeOf(value?: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Keep a WebSocket update when an older REST snapshot finishes afterwards. */
function mergeLineSnapshots(current: LineStatus[], snapshot: LineStatus[]): LineStatus[] {
  const currentById = new Map(current.map((line) => [line.lineId, line]));
  return snapshot.map((line) => {
    const live = currentById.get(line.lineId);
    return live && timeOf(live.updatedAt) > timeOf(line.updatedAt) ? live : line;
  });
}

export function applyWs(lines: LineStatus[], msg: WsMessage): LineStatus[] {
  const d = msg.data;
  const idx = lines.findIndex((l) => l.lineId === d.lineId);
  if (idx === -1) return lines;
  // alert.sent is notification-delivery audit data, not a new sensor/status
  // decision. Applying it would reintroduce a stale DANGER after a newer
  // NORMAL measurement has already become current.
  if (msg.type === "alert.sent") return lines;
  // A valid event may finish after a newer measurement (DANGER/RAG is the
  // common case). It stays in history and may still raise an alert, but must
  // never roll the current line snapshot backwards.
  if (d.statusCurrent === false) return lines;
  const measurementAt = d.measurement ? d.occurredAt : undefined;
  if (
    measurementAt
    && nextTime(measurementAt) < nextTime(lines[idx].lastMeasurementAt)
  ) {
    return lines;
  }
  const next = lines.slice();
  next[idx] = {
    ...next[idx],
    riskLevel: d.riskLevel,
    riskScore: d.riskScore,
    snapbackZone: "snapbackZone" in d ? d.snapbackZone ?? null : next[idx].snapbackZone,
    lastEventId: d.lastEventId ?? next[idx].lastEventId,
    deviceOnline: d.deviceOnline ?? next[idx].deviceOnline,
    lastSeenAt: d.lastSeenAt ?? next[idx].lastSeenAt,
    lastMeasurementAt: measurementAt ?? next[idx].lastMeasurementAt,
    updatedAt: msg.sentAt,
  };
  return next;
}

function nextTime(value?: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldReplaceReading(
  current: LiveSensorReading | undefined,
  incoming: LiveSensorReading,
): boolean {
  if (!current) return true;
  const currentMeasurementAt = nextTime(current.occurredAt);
  const incomingMeasurementAt = nextTime(incoming.occurredAt);
  if (incomingMeasurementAt !== currentMeasurementAt) {
    return incomingMeasurementAt > currentMeasurementAt;
  }
  return nextTime(incoming.receivedAt) >= nextTime(current.receivedAt);
}

export function AppLayout() {
  const { email, signOut } = useAuth();
  const navigate = useNavigate();
  const [lines, setLines] = useState<LineStatus[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [bollards, setBollards] = useState<Bollard[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [liveReadings, setLiveReadings] = useState<Record<string, LiveSensorReading>>({});
  const [riskAlert, setRiskAlert] = useState<WsMessage | null>(null);
  const loadedRef = useRef(false);
  const reloadInFlightRef = useRef(false);

  const reload = useCallback(async () => {
    if (reloadInFlightRef.current) return;
    reloadInFlightRef.current = true;
    try {
      const [l, v, b, s, events] = await Promise.all([
        api.listLines(),
        api.listVessels(),
        api.listBollards(),
        api.summary(),
        api.listEvents({ limit: 100 }),
      ]);
      setLines((current) => mergeLineSnapshots(current, l));
      setVessels(v);
      setBollards(b);
      setSummary(s);
      const eventsById = new Map(events.map((event) => [event.eventId, event]));
      setLiveReadings((prev) => {
        const next: Record<string, LiveSensorReading> = {};
        for (const line of l) {
          const existing = prev[line.lineId];
          if (line.sensorMode === "DEVICE" && !line.deviceOnline) {
            // A reading newer than this REST snapshot came from WebSocket and
            // must survive. Otherwise an offline line starts at the UI default 0 Hz.
            if (existing && timeOf(existing.receivedAt) > timeOf(line.updatedAt)) {
              next[line.lineId] = existing;
            }
            continue;
          }
          const event = line.lastEventId ? eventsById.get(line.lastEventId) : undefined;
          const hydrated = event ? readingFromEvent(event, line.sensorId) : null;
          if (existing && (!hydrated || Date.parse(existing.receivedAt) >= Date.parse(hydrated.receivedAt))) {
            next[line.lineId] = existing;
          } else if (hydrated) {
            next[line.lineId] = hydrated;
          }
        }
        return next;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      reloadInFlightRef.current = false;
      loadedRef.current = true;
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  useEffect(() => {
    const reconcile = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void reload();
    };
    const timer = window.setInterval(reconcile, 30_000);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [reload]);

  useEffect(() => {
    if (!loaded || !email || localStorage.getItem(adminGuideStorageKey(email)) === "done") return;
    const timer = window.setTimeout(() => setGuideOpen(true), 450);
    return () => window.clearTimeout(timer);
  }, [email, loaded]);

  const onMsg = useCallback((msg: WsMessage) => {
    setLines((prev) => applyWs(prev, msg));
    if (
      (msg.type === "risk.caution.detected" || msg.type === "risk.danger.detected")
      && (msg.data.responseGuidance || msg.data.alertMessage)
    ) {
      setRiskAlert(msg);
    }
    if (msg.data.deviceOnline === false) {
      setLiveReadings((prev) => {
        if (!(msg.data.lineId in prev)) return prev;
        const next = { ...prev };
        delete next[msg.data.lineId];
        return next;
      });
      return;
    }
    const measurement = msg.data.measurement;
    const eventId = measurement?.eventId ?? msg.data.lastEventId;
    const occurredAt = msg.data.occurredAt;
    if (measurement && eventId && occurredAt) {
      setLiveReadings((prev) => {
        const incoming: LiveSensorReading = {
          lineId: msg.data.lineId,
          eventId,
          occurredAt,
          receivedAt: msg.sentAt,
          sensorKind: measurement.sensorKind,
          sensorId: measurement.sensorId,
          freqHz: measurement.freqHz,
          loadRatio: measurement.loadRatio,
        };
        if (!shouldReplaceReading(prev[msg.data.lineId], incoming)) return prev;
        return { ...prev, [msg.data.lineId]: incoming };
      });
    }
  }, []);
  const onRealtimeConnected = useCallback(() => {
    // Initial page load already performs this fetch. Reconnects reconcile any
    // measurements or lifecycle changes missed while the socket was down.
    if (loadedRef.current) void reload();
  }, [reload]);
  const realtime = useWebSocket(onMsg, onRealtimeConnected);

  const live: LiveData = {
    lines,
    vessels,
    bollards,
    summary,
    loaded,
    error,
    reload,
    realtimeState: realtime.state,
    lastRealtimeAt: realtime.lastMessageAt,
    liveReadings,
  };

  return (
    <>
      <TopNav
        realtimeState={realtime.state}
        lastRealtimeAt={realtime.lastMessageAt}
        email={email}
        onOpenGuide={() => setGuideOpen(true)}
        onSignOut={async () => {
          setGuideOpen(false);
          await signOut();
          navigate("/login");
        }}
      />
      <Outlet context={live} />
      {guideOpen && <AdminGuide userId={email} onClose={() => setGuideOpen(false)} />}
      {riskAlert && (
        <RiskGuidanceAlert
          message={riskAlert}
          onClose={() => setRiskAlert(null)}
          onOpenEvent={(eventId) => {
            setRiskAlert(null);
            navigate(eventId ? `/events?eventId=${encodeURIComponent(eventId)}` : "/events");
          }}
        />
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { TopNav } from "./TopNav";
import { useAuth } from "../auth/AuthProvider";
import { useWebSocket } from "../lib/useWebSocket";
import { api } from "../lib/api";
import type { DashboardSummary, LineStatus, LiveData, Vessel, WsMessage } from "../lib/types";

function applyWs(lines: LineStatus[], msg: WsMessage): LineStatus[] {
  const d = msg.data;
  const idx = lines.findIndex((l) => l.lineId === d.lineId);
  if (idx === -1) return lines;
  const next = lines.slice();
  next[idx] = {
    ...next[idx],
    riskLevel: d.riskLevel,
    riskScore: d.riskScore,
    snapbackZone: d.snapbackZone ?? next[idx].snapbackZone,
    updatedAt: msg.sentAt,
  };
  return next;
}

export function AppLayout() {
  const { email, signOut } = useAuth();
  const navigate = useNavigate();
  const [lines, setLines] = useState<LineStatus[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [l, v, s] = await Promise.all([api.listLines(), api.listVessels(), api.summary()]);
      setLines(l);
      setVessels(v);
      setSummary(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onMsg = useCallback((msg: WsMessage) => {
    setLines((prev) => applyWs(prev, msg));
  }, []);
  const { connected } = useWebSocket(onMsg);

  const live: LiveData = { lines, vessels, summary, loaded, error, reload };

  return (
    <>
      <TopNav
        connected={connected}
        email={email}
        onSignOut={async () => {
          await signOut();
          navigate("/login");
        }}
      />
      <Outlet context={live} />
    </>
  );
}

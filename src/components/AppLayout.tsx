import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { TopNav } from "./TopNav";
import { AdminGuide, adminGuideStorageKey } from "./AdminGuide";
import { useAuth } from "../auth/AuthProvider";
import { useWebSocket } from "../lib/useWebSocket";
import { api } from "../lib/api";
import type { Bollard, DashboardSummary, LineStatus, LiveData, Vessel, WsMessage } from "../lib/types";

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
  const [bollards, setBollards] = useState<Bollard[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [l, v, b, s] = await Promise.all([
        api.listLines(),
        api.listVessels(),
        api.listBollards(),
        api.summary(),
      ]);
      setLines(l);
      setVessels(v);
      setBollards(b);
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

  useEffect(() => {
    if (!loaded || !email || localStorage.getItem(adminGuideStorageKey(email)) === "done") return;
    const timer = window.setTimeout(() => setGuideOpen(true), 450);
    return () => window.clearTimeout(timer);
  }, [email, loaded]);

  const onMsg = useCallback((msg: WsMessage) => {
    setLines((prev) => applyWs(prev, msg));
  }, []);
  const { connected } = useWebSocket(onMsg);

  const live: LiveData = { lines, vessels, bollards, summary, loaded, error, reload };

  return (
    <>
      <TopNav
        connected={connected}
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
    </>
  );
}

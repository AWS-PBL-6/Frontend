import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { VesselMap } from "../components/VesselMap";
import { VesselDetail } from "../components/VesselDetail";
import { LineRail } from "../components/LineRail";
import { EventDetail } from "./EventDetail";
import { api } from "../lib/api";
import type { LineStatus, LiveData, RiskLevel } from "../lib/types";

export function Dashboard() {
  const { lines, vessels, loaded, error } = useOutletContext<LiveData>();
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const counts = useMemo(() => {
    const c: Record<RiskLevel, number> = { NORMAL: 0, CAUTION: 0, DANGER: 0 };
    for (const l of lines) c[l.riskLevel] += 1;
    return c;
  }, [lines]);

  const danger = lines
    .filter((l) => l.riskLevel === "DANGER")
    .sort((a, b) => b.riskScore - a.riskScore)[0];

  const openLine = (line: LineStatus) => {
    if (line.lastEventId) {
      setSelectedVesselId(null);
      setSelectedEventId(line.lastEventId);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      await api.testAlert(danger?.lineId);
    } catch {
      /* ignore */
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="center" style={{ padding: 60 }}>
        <div className="spin" />
      </div>
    );
  }

  const selectedVessel = vessels.find((v) => v.vesselId === selectedVesselId) ?? null;

  return (
    <div className="page">
      {error && <div className="banner-danger">데이터 로드 오류: {error}</div>}

      {danger && (
        <div className="banner-danger">
          ⚠ 위험 감지 — {danger.lineId} 파단 위험 (score {danger.riskScore.toFixed(2)}). 위험구역 밖으로 대피 유도 요망.
          <span className="spacer" />
          {danger.lastEventId && (
            <button onClick={() => setSelectedEventId(danger.lastEventId!)}>상세보기</button>
          )}
        </div>
      )}

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-num">{vessels.length}</div>
          <div className="kpi-label">선박</div>
        </div>
        <div className="kpi">
          <div className="kpi-num" style={{ color: "var(--normal)" }}>{counts.NORMAL}</div>
          <div className="kpi-label">정상</div>
        </div>
        <div className="kpi">
          <div className="kpi-num" style={{ color: "var(--caution)" }}>{counts.CAUTION}</div>
          <div className="kpi-label">주의</div>
        </div>
        <div className="kpi">
          <div className="kpi-num" style={{ color: "var(--danger)" }}>{counts.DANGER}</div>
          <div className="kpi-label">위험</div>
        </div>
      </div>

      <div className="main-grid">
        <div>
          <div className="section-label">
            선박 위치 · 계류삭 위험 지도 · {lines.length}개 라인
          </div>
          <VesselMap
            vessels={vessels}
            lines={lines}
            selectedVesselId={selectedVesselId}
            onSelect={(v) => setSelectedVesselId(v.vesselId)}
          />
          <div className="map-legend">
            <span><i className="dot dot--NORMAL" /> 정상</span>
            <span><i className="dot dot--CAUTION" /> 주의</span>
            <span><i className="dot dot--DANGER" /> 위험</span>
            <span className="muted">마커 클릭 → 선박·계류삭 상세</span>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span className="section-label" style={{ margin: 0 }}>라인 상태 (위험도순)</span>
            <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={runTest} disabled={testing}>
              {testing ? "발송 중…" : "테스트 경보"}
            </button>
          </div>
          <LineRail lines={lines} onSelect={openLine} />
        </div>
      </div>

      {selectedVessel && (
        <VesselDetail
          vessel={selectedVessel}
          lines={lines}
          onClose={() => setSelectedVesselId(null)}
          onOpenLine={openLine}
        />
      )}

      {selectedEventId && (
        <EventDetail eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />
      )}
    </div>
  );
}

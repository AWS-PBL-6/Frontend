import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Bollard, LineStatus, LiveData } from "../lib/types";
import { VesselDetail } from "../components/VesselDetail";
import { BollardDetail } from "../components/BollardDetail";
import { BollardForm } from "../components/BollardForm";
import { EventDetail } from "../features/EventDetail";
import { LineDetail } from "../features/LineDetail";
import { LineForm } from "../components/LineForm";
import { PortScene, type FocusHandle } from "./PortScene";
import { Hud } from "./Hud";
import { approachState, computeTwinLayout, BOLLARD_Z, QUAY_TOP } from "./layout";

/** Full-page Busan-port digital twin: 3D live scene + translucent control HUD. */
export function DigitalTwin({ live, demo = false }: { live: LiveData; demo?: boolean }) {
  const { lines, vessels, bollards, loaded, error, reload } = live;
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [detailVesselId, setDetailVesselId] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedBollardId, setSelectedBollardId] = useState<string | null>(null);
  const [editingBollard, setEditingBollard] = useState<Bollard | null>(null);
  const [creatingBollard, setCreatingBollard] = useState(false);
  const [lineModal, setLineModal] = useState<{ presetBollardId?: string; lockBollard?: boolean } | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [focus, setFocus] = useState<FocusHandle | null>(null);
  const focusSeq = useRef(0);

  // 시연·테스트용 시각 고정: ?tod=13.5 처럼 시각(0–24h)을 지정하면 낮/밤
  // 상태를 그 시각으로 고정한다. 미지정 시 실제 현재 시각을 따라간다.
  const hourOverride = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get("tod");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? ((n % 24) + 24) % 24 : undefined;
  }, []);

  // 1 Hz HUD clock — drives 시계, ETA labels and approach sub-lines.
  const epoch = useMemo(() => Date.now(), []);
  const [nowSec, setNowSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowSec((Date.now() - epoch) / 1000), 1000);
    return () => clearInterval(t);
  }, [epoch]);

  // Geometry only re-computes when the fleet or line↔vessel mapping changes,
  // not on every risk-score tick.
  const layoutKey = useMemo(
    () =>
      vessels
        .map((v) => `${v.vesselId}:${v.status}:${v.lengthOverallM ?? ""}:${v.berthId}`)
        .sort()
        .join("|") +
      "#" +
      lines
        .map((l) => `${l.lineId}:${l.vesselId ?? ""}:${l.bollardId ?? ""}`)
        .sort()
        .join("|") +
      "#" +
      bollards
        .map((b) => `${b.bollardId}:${b.berthId}:${b.positionM}`)
        .sort()
        .join("|"),
    [vessels, lines, bollards],
  );
  const layout = useMemo(
    () => computeTwinLayout(vessels, lines, bollards),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );

  const focusVessel = useCallback(
    (vesselId: string) => {
      setSelectedVesselId(vesselId);
      const ship = layout.ships.find((s) => s.vessel.vesselId === vesselId);
      if (ship) {
        // 홋줄 관제 시점: 안벽(볼라드) 쪽에서 배를 바라봐 계류삭이 선체에 가리지
        // 않고 정면으로 보이게 한다. 시선 타겟은 볼라드–선체 사이 계류삭 구간,
        // 카메라는 그 반대편(안벽/야드 쪽, -z) 위쪽에 둔다.
        const fairleadZ = ship.z - ship.beam / 2 + 0.4;
        const midZ = (BOLLARD_Z + fairleadZ) / 2;
        const camX = ship.x - ship.length * 0.06;
        const camY = QUAY_TOP + ship.deckY + 48;
        const camZ = BOLLARD_Z - (95 + ship.beam * 1.1);
        setFocus({
          key: ++focusSeq.current,
          get: () => [ship.x, QUAY_TOP + ship.deckY * 0.55, midZ] as const,
          cam: () => [camX, camY, camZ] as const,
        });
        return;
      }
      const plan = layout.approaches.find((p) => p.vessel.vesselId === vesselId);
      if (plan) {
        const t0 = epoch;
        setFocus({
          key: ++focusSeq.current,
          get: () => {
            const st = approachState(plan, (Date.now() - t0) / 1000);
            return [st.x, plan.deckY, st.z] as const;
          },
        });
      }
    },
    [layout, epoch],
  );

  // Any line click opens its live status window (works in demo + live).
  const openLine = useCallback((line: LineStatus) => setSelectedLineId(line.lineId), []);

  const runTestAlert = useCallback(async () => {
    setTesting(true);
    try {
      const danger = lines
        .filter((l) => l.riskLevel === "DANGER")
        .sort((a, b) => b.riskScore - a.riskScore)[0];
      await api.testAlert(danger?.lineId ?? lines[0]?.lineId);
    } catch {
      /* surfaced via alerts pipeline; ignore here */
    } finally {
      setTesting(false);
    }
  }, [lines]);

  // Esc = 선택 해제
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedVesselId(null);
        setSelectedLineId(null);
        setSelectedBollardId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!loaded) {
    return (
      <div className={`twin-page ${demo ? "twin-page--full" : ""} center`}>
        <div className="spin" />
      </div>
    );
  }

  const detailVessel = vessels.find((v) => v.vesselId === detailVesselId) ?? null;
  const selectedLine = selectedLineId ? lines.find((l) => l.lineId === selectedLineId) ?? null : null;
  const selectedBollard = selectedBollardId
    ? bollards.find((b) => b.bollardId === selectedBollardId) ?? null
    : null;

  return (
    <div className={`twin-page ${demo ? "twin-page--full" : ""}`}>
      <PortScene
        layout={layout}
        lines={lines}
        selectedVesselId={selectedVesselId}
        selectedBollardId={selectedBollardId}
        nowSec={nowSec}
        focus={focus}
        hourOverride={hourOverride}
        onSelectVessel={focusVessel}
        onSelectLine={openLine}
        onSelectBollard={(id) => {
          setSelectedBollardId(id);
          setSelectedLineId(null);
        }}
        onClearSelection={() => setSelectedVesselId(null)}
      />

      <Hud
        vessels={vessels}
        lines={lines}
        layout={layout}
        selectedVesselId={selectedVesselId}
        nowSec={nowSec}
        demo={demo}
        testing={testing}
        onSelectVessel={focusVessel}
        onOpenVessel={setDetailVesselId}
        onSelectLine={openLine}
        onTestAlert={demo ? undefined : runTestAlert}
        onAddBollard={demo ? undefined : () => setCreatingBollard(true)}
      />

      {error && <div className="twin-error">데이터 로드 오류: {error}</div>}

      {detailVessel && (
        <VesselDetail
          vessel={detailVessel}
          lines={lines}
          onClose={() => setDetailVesselId(null)}
          onOpenLine={(l) => {
            setDetailVesselId(null);
            openLine(l);
          }}
        />
      )}

      {selectedLine && (
        <LineDetail
          line={selectedLine}
          vesselName={vessels.find((v) => v.vesselId === selectedLine.vesselId)?.name ?? null}
          bollardLabel={layout.bollardByLine[selectedLine.lineId] ?? selectedLine.bollardId}
          onClose={() => setSelectedLineId(null)}
          onOpenEvent={(id) => {
            setSelectedLineId(null);
            setEventId(id);
          }}
          readOnly={demo}
          onChanged={reload}
        />
      )}

      {selectedBollard && (
        <BollardDetail
          bollard={selectedBollard}
          lines={lines}
          vessels={vessels}
          readOnly={demo}
          onClose={() => setSelectedBollardId(null)}
          onEdit={(b) => setEditingBollard(b)}
          onChanged={reload}
          onOpenLine={(l) => {
            setSelectedBollardId(null);
            openLine(l);
          }}
          onCreateLine={(b) => setLineModal({ presetBollardId: b.bollardId, lockBollard: true })}
        />
      )}
      {editingBollard && (
        <BollardForm
          existing={editingBollard}
          onClose={() => setEditingBollard(null)}
          onSaved={() => {
            setEditingBollard(null);
            reload();
          }}
        />
      )}
      {creatingBollard && (
        <BollardForm
          onClose={() => setCreatingBollard(false)}
          onSaved={() => {
            setCreatingBollard(false);
            reload();
          }}
        />
      )}
      {lineModal && (
        <LineForm
          presetBollardId={lineModal.presetBollardId}
          lockBollard={lineModal.lockBollard}
          onClose={() => setLineModal(null)}
          onSaved={() => {
            setLineModal(null);
            reload();
          }}
        />
      )}

      {eventId && <EventDetail eventId={eventId} onClose={() => setEventId(null)} />}
    </div>
  );
}

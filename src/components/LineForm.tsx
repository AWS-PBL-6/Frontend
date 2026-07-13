import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { PiezoSensorPicker } from "./PiezoSensorPicker";
import { api, type LineInput } from "../lib/api";
import type { Bollard, LineStatus, RiskLevel, SensorMode, Vessel } from "../lib/types";

const MAX_LINES_PER_BOLLARD = 2;

export function LineForm({
  existing,
  presetVesselId,
  presetBollardId,
  lockBollard = false,
  onClose,
  onSaved,
}: {
  existing?: LineStatus | null;
  presetVesselId?: string;
  presetBollardId?: string;
  lockBollard?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edit = !!existing;
  const [lineId, setLineId] = useState(existing?.lineId ?? "");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(existing?.riskLevel ?? "NORMAL");
  const [bollardId, setBollardId] = useState(existing?.bollardId ?? presetBollardId ?? "");
  const [vesselId, setVesselId] = useState(existing?.vesselId ?? presetVesselId ?? "");
  const [sensorMode, setSensorMode] = useState<SensorMode>(
    existing?.sensorMode === "VIRTUAL" ? "PENDING" : existing?.sensorMode ?? "DEVICE",
  );
  const [sensorId, setSensorId] = useState(existing?.sensorId ?? "");
  const [bollards, setBollards] = useState<Bollard[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [lines, setLines] = useState<LineStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listBollards().then(setBollards).catch(() => setBollards([]));
    api.listVessels().then(setVessels).catch(() => setVessels([]));
    api.listLines().then(setLines).catch(() => setLines([]));
  }, []);

  // How many lines already occupy each bollard (excluding the line being edited).
  const countByBollard = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) {
      if (!l.bollardId || (existing && l.lineId === existing.lineId)) continue;
      m[l.bollardId] = (m[l.bollardId] ?? 0) + 1;
    }
    return m;
  }, [lines, existing]);

  // A moored line's bollard is locked (backend LINE_MOORED guard).
  const moored = !!existing?.vesselId;
  const bollardLocked = moored || (!!presetBollardId && lockBollard);

  // A line is fixed to its bollard, so Site/Berth are inherited from it.
  const selectedBollard = useMemo(
    () => bollards.find((b) => b.bollardId === bollardId) ?? null,
    [bollards, bollardId],
  );
  const derivedSite = selectedBollard?.siteId ?? existing?.siteId ?? "yard-a";
  const derivedBerth = selectedBollard?.berthId ?? existing?.berthId ?? "berth-01";

  const submit = async () => {
    if (sensorMode === "DEVICE" && !sensorId.trim()) {
      setError("AWS IoT 목록에서 이 계류삭에 부착할 피에조 센서를 선택하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const body: LineInput = {
      siteId: derivedSite,
      berthId: derivedBerth,
      riskLevel,
      bollardId: bollardId || null,
      vesselId: vesselId || null,
    };
    try {
      if (edit && existing) {
        await api.updateLine(existing.lineId, body);
        if (existing.sensorMode !== "DEVICE" && sensorMode === "DEVICE") {
          await api.provisionLine(existing.lineId, {
            sensorMode: "DEVICE",
            sensorId: sensorId.trim(),
          });
        }
      }
      // lineId is optional — omit it entirely so the backend auto-generates one.
      else {
        const createBody: LineInput = {
          ...body,
          sensorMode,
          sensorId: sensorMode === "DEVICE" ? sensorId.trim() : undefined,
        };
        await api.createLine(
          lineId.trim() ? { ...createBody, lineId: lineId.trim() } : createBody,
        );
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={edit ? "계류삭 수정" : "계류삭 추가"}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-accent"
            style={{ flex: 1 }}
            disabled={busy}
            onClick={submit}
          >
            {busy ? "저장 중…" : "저장"}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            취소
          </button>
        </>
      }
    >
      {error && <div className="alert-msg">{error}</div>}
      <div className="field-light">
        <label>라인 ID {edit ? "" : "(선택)"}</label>
        <input
          className="input-light"
          value={lineId}
          disabled={edit}
          onChange={(e) => setLineId(e.target.value)}
          placeholder={edit ? "" : "미입력 시 자동 생성 (mooring-…)"}
        />
      </div>
      <div className="field-light">
        <label>연결 볼라드 (안벽 연결 위치)</label>
        <select
          className="select-light"
          value={bollardId}
          disabled={bollardLocked}
          onChange={(e) => setBollardId(e.target.value)}
        >
          <option value="">— 미지정 —</option>
          {bollards.map((b) => {
            const count = countByBollard[b.bollardId] ?? 0;
            const full = count >= MAX_LINES_PER_BOLLARD && b.bollardId !== bollardId;
            return (
              <option key={b.bollardId} value={b.bollardId} disabled={full}>
                {(b.label || b.bollardId)} · {b.berthId} · {count}/{MAX_LINES_PER_BOLLARD}
                {full ? " 만석" : ""}
              </option>
            );
          })}
        </select>
        <span className="muted" style={{ fontSize: 11 }}>
          {moored
            ? "계선 중에는 볼라드를 변경할 수 없습니다 (출항 처리 먼저)."
            : bollardLocked
              ? "현재 볼라드 상세에서 바로 추가 중이므로 이 볼라드에 고정됩니다."
              : <>선석/사이트는 볼라드에서 자동: <b>{derivedBerth}</b> · {derivedSite}</>}
        </span>
      </div>
      <div className="field-light" data-guide="line-sensor-binding">
        <label>계류삭 연결 고리 피에조 센서</label>
        {existing?.sensorMode === "DEVICE" ? (
          <div className="sensor-card sensor-card--DEVICE">
            <div className="sensor-card-head">
              <b>이 계류삭 전용 센서 연동됨</b>
              <span className="sensor-card-meta">{existing.sensorId ?? "–"}</span>
            </div>
            <p className="sensor-card-desc">
              선박 측 계류삭 아이·스플라이스 인근의 연결 고리에 부착하는 센서입니다.
            </p>
          </div>
        ) : (
          <>
            {existing?.sensorMode === "VIRTUAL" && (
              <div className="sensor-card sensor-card--VIRTUAL">
                <div className="sensor-card-head">
                  <b>현재 시연용 가상 센서</b>
                  <span className="sensor-card-meta">실측 아님</span>
                </div>
                <p className="sensor-card-desc">
                  실제 관제를 시작하려면 아래에서 피에조 실센서를 선택해 전환하세요.
                </p>
              </div>
            )}
            <div className="sensor-choice">
              {(
                [
                  ["DEVICE", "피에조 실센서 연결", "AWS IoT Core 장비를 선택해 이 계류삭에 전용 배정"],
                  ["PENDING", "센서 설치 후 연결", "계류삭만 먼저 등록하고 측정은 시작하지 않음"],
                ] as [SensorMode, string, string][]
              ).map(([mode, title, desc]) => (
                <label key={mode} className={`sensor-choice-item ${sensorMode === mode ? "sensor-choice-item--on" : ""}`}>
                  <input
                    type="radio"
                    name="lineSensorMode"
                    checked={sensorMode === mode}
                    onChange={() => setSensorMode(mode)}
                  />
                  <span><b>{title}</b><em>{desc}</em></span>
                </label>
              ))}
            </div>
            {sensorMode === "DEVICE" && (
              <PiezoSensorPicker
                selectedSensorId={sensorId}
                onSelect={setSensorId}
                disabled={busy}
                currentLineId={existing?.lineId}
              />
            )}
            <span className="muted" style={{ fontSize: 11 }}>
              센서는 볼라드가 아니라 각 계류삭의 선박 측 연결 고리에 한 대씩 부착합니다.
            </span>
          </>
        )}
      </div>
      <div className="field-light">
        <label>위험도</label>
        <select
          className="select-light"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
        >
          <option value="NORMAL">정상</option>
          <option value="CAUTION">주의</option>
          <option value="DANGER">위험</option>
        </select>
      </div>
      <div className="field-light">
        <label>계선 선박 (접안 세션 · 보통 접안/출항으로 자동 설정)</label>
        <select
          className="select-light"
          value={vesselId}
          onChange={(e) => setVesselId(e.target.value)}
        >
          <option value="">— 미계선 —</option>
          {vessels.map((v) => (
            <option key={v.vesselId} value={v.vesselId}>
              {v.name} ({v.vesselId})
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

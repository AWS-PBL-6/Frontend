import { useState } from "react";
import { Modal } from "./Modal";
import { api, type BollardInput } from "../lib/api";
import type { Bollard, SensorMode } from "../lib/types";

const numOrUndef = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

export function BollardForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Bollard | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edit = !!existing;
  const [bollardId, setBollardId] = useState(existing?.bollardId ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [siteId, setSiteId] = useState(existing?.siteId ?? "yard-a");
  const [berthId, setBerthId] = useState(existing?.berthId ?? "berth-01");
  const [positionM, setPositionM] = useState(existing?.positionM != null ? String(existing.positionM) : "0");
  // 첫 1회 센서 연동 — 생성 시 선택 (가상 모드 기본). 수정 화면에서는 변경 불가;
  // 미연동 볼라드의 연동/가상→실센서 전환은 볼라드 상세에서 진행한다.
  const [sensorMode, setSensorMode] = useState<SensorMode>("VIRTUAL");
  const [sensorId, setSensorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!edit && sensorMode === "DEVICE" && !sensorId.trim()) {
      setError("실센서 연동에는 센서 장비 ID가 필요합니다.");
      return;
    }
    setBusy(true);
    setError(null);
    const body: BollardInput = {
      siteId,
      berthId,
      positionM: numOrUndef(positionM),
      label: label.trim() || undefined,
    };
    try {
      if (edit && existing) {
        await api.updateBollard(existing.bollardId, body);
      } else {
        await api.createBollard({
          ...body,
          bollardId: bollardId.trim() || undefined,
          sensorMode,
          sensorId: sensorMode === "DEVICE" ? sensorId.trim() : undefined,
        });
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
      title={edit ? "볼라드 수정" : "볼라드 추가"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-accent" style={{ flex: 1 }} disabled={busy} onClick={submit}>
            {busy ? "저장 중…" : "저장"}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            취소
          </button>
        </>
      }
    >
      {error && <div className="alert-msg">{error}</div>}
      {!edit && (
        <div className="field-light">
          <label>볼라드 ID (비우면 자동 생성)</label>
          <input
            className="input-light"
            value={bollardId}
            onChange={(e) => setBollardId(e.target.value)}
            placeholder="bollard-13"
          />
        </div>
      )}
      <div className="form-row">
        <div className="field-light">
          <label>라벨</label>
          <input className="input-light" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="B-13" />
        </div>
        <div className="field-light">
          <label>위치 (m, 선석 서쪽 끝 기준)</label>
          <input className="input-light" type="number" value={positionM} onChange={(e) => setPositionM(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="field-light">
          <label>Site</label>
          <input className="input-light" value={siteId} onChange={(e) => setSiteId(e.target.value)} />
        </div>
        <div className="field-light">
          <label>Berth (선석)</label>
          <input className="input-light" value={berthId} onChange={(e) => setBerthId(e.target.value)} />
        </div>
      </div>

      {!edit && (
        <div className="field-light">
          <label>센서 연동 (첫 1회 · 이후 변경 불가)</label>
          <div className="sensor-choice">
            {(
              [
                ["VIRTUAL", "가상 모드", "시뮬레이션 데이터로 동작 (이후 실센서 전환 가능)"],
                ["DEVICE", "실센서 연동", "AE 센서 장비 ID를 등록"],
                ["PENDING", "나중에 연동", "미연동 — 계류삭 연결 불가"],
              ] as [SensorMode, string, string][]
            ).map(([mode, title, desc]) => (
              <label key={mode} className={`sensor-choice-item ${sensorMode === mode ? "sensor-choice-item--on" : ""}`}>
                <input
                  type="radio"
                  name="sensorMode"
                  checked={sensorMode === mode}
                  onChange={() => setSensorMode(mode)}
                />
                <span>
                  <b>{title}</b>
                  <em>{desc}</em>
                </span>
              </label>
            ))}
          </div>
          {sensorMode === "DEVICE" && (
            <input
              className="input-light"
              style={{ marginTop: 6 }}
              value={sensorId}
              onChange={(e) => setSensorId(e.target.value)}
              placeholder="센서 장비 ID (예: ae-0013)"
            />
          )}
        </div>
      )}
    </Modal>
  );
}

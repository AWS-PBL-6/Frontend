import { useState } from "react";
import { Modal } from "./Modal";
import { api, type VesselInput } from "../lib/api";
import type { Vessel, VesselStatus } from "../lib/types";

const numOrUndef = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

export function VesselForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Vessel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edit = !!existing;
  const [vesselId, setVesselId] = useState(existing?.vesselId ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [siteId, setSiteId] = useState(existing?.siteId ?? "yard-a");
  const [berthId, setBerthId] = useState(existing?.berthId ?? "berth-01");
  const [imo, setImo] = useState(existing?.imo ?? "");
  const [vesselType, setVesselType] = useState(existing?.vesselType ?? "");
  const [loa, setLoa] = useState(existing?.lengthOverallM != null ? String(existing.lengthOverallM) : "");
  const [lat, setLat] = useState(existing?.lat != null ? String(existing.lat) : "");
  const [lon, setLon] = useState(existing?.lon != null ? String(existing.lon) : "");
  const [status, setStatus] = useState<VesselStatus>(existing?.status ?? "BERTHED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const body: VesselInput = {
      name,
      siteId,
      berthId,
      imo: imo.trim() || undefined,
      vesselType: vesselType.trim() || undefined,
      lengthOverallM: numOrUndef(loa),
      lat: numOrUndef(lat),
      lon: numOrUndef(lon),
      status,
    };
    try {
      if (edit && existing) await api.updateVessel(existing.vesselId, body);
      else await api.createVessel({ ...body, vesselId: vesselId.trim() || undefined });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={edit ? "선박 수정" : "선박 추가"}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-accent"
            style={{ flex: 1 }}
            disabled={busy || !name}
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
      {!edit && (
        <div className="field-light">
          <label>선박 ID (비우면 자동 생성)</label>
          <input
            className="input-light"
            value={vesselId}
            onChange={(e) => setVesselId(e.target.value)}
            placeholder="vessel-03"
          />
        </div>
      )}
      <div className="field-light">
        <label>선박명 *</label>
        <input
          className="input-light"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="HYUNDAI FORWARD"
        />
      </div>
      <div className="form-row">
        <div className="field-light">
          <label>선종</label>
          <input className="input-light" value={vesselType} onChange={(e) => setVesselType(e.target.value)} placeholder="Container" />
        </div>
        <div className="field-light">
          <label>IMO</label>
          <input className="input-light" value={imo} onChange={(e) => setImo(e.target.value)} placeholder="9812345" />
        </div>
      </div>
      <div className="form-row">
        <div className="field-light">
          <label>Site</label>
          <input className="input-light" value={siteId} onChange={(e) => setSiteId(e.target.value)} />
        </div>
        <div className="field-light">
          <label>Berth</label>
          <input className="input-light" value={berthId} onChange={(e) => setBerthId(e.target.value)} />
        </div>
        <div className="field-light">
          <label>전장 LOA (m)</label>
          <input className="input-light" type="number" value={loa} onChange={(e) => setLoa(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="field-light">
          <label>위도 (lat)</label>
          <input className="input-light" type="number" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="34.7842" />
        </div>
        <div className="field-light">
          <label>경도 (lon)</label>
          <input className="input-light" type="number" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="126.5170" />
        </div>
      </div>
      <div className="field-light">
        <label>상태</label>
        <select
          className="select-light"
          value={status}
          onChange={(e) => setStatus(e.target.value as VesselStatus)}
        >
          <option value="BERTHED">접안</option>
          <option value="APPROACHING">접근 중</option>
          <option value="DEPARTED">출항</option>
        </select>
      </div>
    </Modal>
  );
}

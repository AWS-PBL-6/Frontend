import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Radio, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { api } from "../lib/api";
import type { PiezoSensor } from "../lib/types";

const STATUS_LABEL = {
  CONNECTED: "온라인",
  DISCONNECTED: "오프라인",
  UNKNOWN: "AWS IoT 등록됨",
} as const;

export function PiezoSensorPicker({
  selectedSensorId,
  onSelect,
  disabled = false,
  currentLineId,
}: {
  selectedSensorId: string;
  onSelect: (sensorId: string) => void;
  disabled?: boolean;
  currentLineId?: string;
}) {
  const [sensors, setSensors] = useState<PiezoSensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSensors(await api.listSensors());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "센서 목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const availableCount = useMemo(
    () => sensors.filter((sensor) => sensor.available || sensor.assignedLineId === currentLineId).length,
    [currentLineId, sensors],
  );

  return (
    <div className="piezo-picker">
      <div className="piezo-picker-head">
        <div>
          <b>피에조 압전센서 선택</b>
          <span>AWS IoT Core 등록 장비 · 사용 가능 {availableCount}대</span>
        </div>
        <button className="piezo-refresh" onClick={load} disabled={loading || disabled} title="센서 목록 새로고침">
          <RefreshCw size={14} className={loading ? "is-spinning" : ""} />
        </button>
      </div>

      {error && <div className="piezo-picker-message piezo-picker-message--error">{error}</div>}
      {loading && <div className="piezo-picker-message">AWS IoT 센서 목록을 불러오는 중…</div>}
      {!loading && !error && sensors.length === 0 && (
        <div className="piezo-picker-message">
          등록된 피에조 센서가 없습니다. 먼저 AWS IoT Core에 장비를 등록하세요.
        </div>
      )}

      {!loading && sensors.length > 0 && (
        <div className="piezo-sensor-list" role="radiogroup" aria-label="피에조 압전센서 목록">
          {sensors.map((sensor) => {
            const ownedHere = sensor.assignedLineId === currentLineId;
            const unavailable = !sensor.available && !ownedHere;
            const selected = sensor.sensorId === selectedSensorId;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                key={sensor.sensorId}
                className={`piezo-sensor-row ${selected ? "is-selected" : ""}`}
                disabled={disabled || unavailable}
                onClick={() => onSelect(sensor.sensorId)}
              >
                <span className="piezo-radio">{selected ? <Check size={14} /> : <Radio size={14} />}</span>
                <span className="piezo-sensor-main">
                  <b>{sensor.displayName}</b>
                  <small>AWS IoT Thing · {sensor.thingName}</small>
                </span>
                <span className={`piezo-connectivity is-${sensor.connectivityStatus.toLowerCase()}`}>
                  {sensor.connectivityStatus === "CONNECTED" ? <Wifi size={12} /> : <WifiOff size={12} />}
                  {STATUS_LABEL[sensor.connectivityStatus]}
                </span>
                <span className="piezo-assignment">
                  {unavailable
                    ? `${sensor.assignedLineId} · ${sensor.assignedBerthId} 사용 중`
                    : selected
                      ? "선택됨"
                      : "선택 가능"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="piezo-picker-help">
        목록에는 AWS IoT Core에 실제 등록된 장비만 표시됩니다. 선택한 센서는 이 계류삭에
        전용으로 배정되어 다른 계류삭에서는 선택할 수 없습니다.
      </p>
    </div>
  );
}

import type { LineStatus } from "./types";

export interface BoundSensorRecord {
  sensorId: string;
  lineId: string;
  bollardId?: string | null;
  berthId: string;
  sensorBoundAt?: string | null;
}

function normalizeSensorId(sensorId: string): string {
  return sensorId.trim().toLowerCase();
}

export function listBoundSensors(
  lines: LineStatus[],
  excludeLineId?: string,
): BoundSensorRecord[] {
  return lines
    .filter((line) => line.lineId !== excludeLineId)
    .filter((line) => line.sensorMode === "DEVICE" && !!line.sensorId?.trim())
    .map((line) => ({
      sensorId: line.sensorId!.trim(),
      lineId: line.lineId,
      bollardId: line.bollardId,
      berthId: line.berthId,
      sensorBoundAt: line.sensorBoundAt,
    }))
    .sort(
      (a, b) =>
        a.berthId.localeCompare(b.berthId) ||
        a.lineId.localeCompare(b.lineId) ||
        a.sensorId.localeCompare(b.sensorId),
    );
}

export function findSensorOwner(
  lines: LineStatus[],
  sensorId: string,
  excludeLineId?: string,
): BoundSensorRecord | null {
  const wanted = normalizeSensorId(sensorId);
  if (!wanted) return null;
  return (
    listBoundSensors(lines, excludeLineId).find(
      (sensor) => normalizeSensorId(sensor.sensorId) === wanted,
    ) ?? null
  );
}

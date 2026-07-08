import { useOutletContext } from "react-router-dom";
import { DigitalTwin } from "../twin/DigitalTwin";
import type { LiveData } from "../lib/types";

/** 관제 대시보드 — 부산항 디지털 트윈 (실시간 선박·홋줄·볼라드 상태). */
export function Dashboard() {
  const live = useOutletContext<LiveData>();
  return <DigitalTwin live={live} />;
}

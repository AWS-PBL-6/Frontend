import { DigitalTwin } from "../twin/DigitalTwin";
import { useDemoLive } from "../twin/demo";

/** 공개 시연용 라우트(/demo): 백엔드·로그인 없이 시뮬레이션 데이터로 동작. */
export function TwinDemo() {
  const live = useDemoLive();
  return <DigitalTwin live={live} demo />;
}

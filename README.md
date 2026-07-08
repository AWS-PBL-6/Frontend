# AE-Sentinel Frontend

React 기반 관제 대시보드 repo root 를 반영한 로컬 디렉토리다.

## 역할

- 계류삭 상태 대시보드
- 위험 이벤트 시각화
- 스냅백 위험구역 렌더링
- REST 조회 및 WebSocket 실시간 반영

## 구조

```text
public/
src/
  app/
  components/
  features/
tests/
```

## 계약 기준

- docs canonical source: `../docs`
- WebSocket 계약: `../docs/packages/contracts/schemas/websocket/ws-risk-message.v1.json`

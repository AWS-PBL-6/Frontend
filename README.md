# AE-Sentinel Frontend

React 기반 관제 대시보드 저장소다.

## 역할

- 계류삭 상태 대시보드
- 위험 이벤트 표시
- 스냅백 위험구역 시각화
- REST 조회 및 WebSocket 실시간 반영

## 구조

```text
src/
  app/
  components/
  features/
public/
tests/
```

## 계약 기준

- contracts canonical source: `AWS-PBL-6/docs`
- 주요 참조:
  - `packages/contracts/schemas/websocket/ws-risk-message.v1.json`
  - `packages/contracts/schemas/app/**`

## 구현 원칙

- UI 상태 모델은 Backend 응답 구조를 임의로 재정의하지 않는다.
- WebSocket 이벤트 타입은 docs repo 기준 enum 을 따른다.
- 위험도 색상/표현은 `NORMAL`, `CAUTION`, `DANGER` 공통 enum 을 기준으로 한다.

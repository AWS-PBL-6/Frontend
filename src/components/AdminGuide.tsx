import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

type Placement = "top" | "right" | "bottom" | "left";

interface GuideStep {
  path: string;
  target: string;
  phase: string;
  title: string;
  body: string;
  tip?: string;
  placement: Placement;
}

interface TargetRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

const STEPS: GuideStep[] = [
  {
    path: "/",
    target: "navigation",
    phase: "관리자 빠른 시작",
    title: "운영 순서대로 함께 둘러볼게요",
    body: "초기 설정부터 실시간 관제와 이벤트 대응까지 꼭 필요한 화면만 순서대로 안내합니다. 약 2분 정도 걸립니다.",
    tip: "가이드 중에는 화면이 자동으로 이동하며, 실제 데이터는 변경하지 않습니다.",
    placement: "bottom",
  },
  {
    path: "/",
    target: "connection-status",
    phase: "1 · 운영 준비",
    title: "먼저 실시간 연결을 확인하세요",
    body: "업무 시작 시 ‘실시간 연결됨’인지 확인합니다. 연결 대기 상태라면 위험도 갱신이 늦을 수 있으므로 새로고침 후 다시 확인하세요.",
    placement: "bottom",
  },
  {
    path: "/",
    target: "bollard-setup",
    phase: "2 · 현장 자산 설정",
    title: "먼저 안벽의 볼라드 위치를 등록합니다",
    body: "볼라드는 센서 소유 자산이 아니라 계류삭이 연결되는 안벽 지점입니다. 선석과 위치를 입력해 디지털 트윈의 연결 기준을 만드세요.",
    tip: "피에조 센서는 다음 단계에서 각 계류삭의 선박 측 연결 고리에 개별 배정합니다.",
    placement: "right",
  },
  {
    path: "/vessels",
    target: "vessel-add",
    phase: "3 · 선박 등록",
    title: "입항 선박을 등록하세요",
    body: "선박명, IMO, 선종, 선석 정보를 입력합니다. 등록 후 접안 처리하면 해당 선석의 사용 가능한 계류삭을 선박에 연결할 수 있습니다.",
    placement: "bottom",
  },
  {
    path: "/vessels",
    target: "line-management",
    phase: "4 · 계류삭 매핑",
    title: "계류삭마다 센서를 선택해 적용합니다",
    body: "선박 행을 펼쳐 계류삭을 추가하고, AWS IoT 목록에서 연결 고리에 부착한 피에조 센서를 선택한 뒤 안벽 볼라드를 지정하세요.",
    tip: "한 센서는 한 계류삭에만 배정됩니다. 센서가 아직 없다면 미연동으로 등록한 뒤 계류삭 상세에서 나중에 적용할 수 있습니다.",
    placement: "bottom",
  },
  {
    path: "/recipients",
    target: "recipient-add",
    phase: "5 · 경보 수신 설정",
    title: "비상 SMS 수신자를 지정하세요",
    body: "DANGER 이벤트를 받을 담당자를 등록합니다. 실제 발송 대상이 되려면 ‘활성’과 ‘SMS 수신 동의’가 모두 켜져 있어야 합니다.",
    tip: "전화번호는 국가번호를 포함한 E.164 형식(예: +821012345678)으로 입력하세요.",
    placement: "bottom",
  },
  {
    path: "/",
    target: "control-list",
    phase: "6 · 실시간 관제",
    title: "관제 현황에서 위험 순서를 파악합니다",
    body: "선박과 계류삭 상태를 한눈에 확인합니다. 선박을 선택하면 3D 화면이 이동하고, 계류삭을 누르면 센서·위험도·스냅백 상세가 열립니다.",
    placement: "right",
  },
  {
    path: "/",
    target: "risk-summary",
    phase: "7 · 위험도 판독",
    title: "주의·위험 건수를 먼저 보세요",
    body: "상단 요약은 전체 계류삭의 현재 위험도를 집계합니다. DANGER가 발생하면 중앙 경보 배너와 위험반경이 함께 표시됩니다.",
    tip: "위험 시에는 상세 수치 확인보다 먼저 표시된 스냅백 위험구역 밖으로 대피를 유도하세요.",
    placement: "bottom",
  },
  {
    path: "/events",
    target: "event-workspace",
    phase: "8 · 이벤트 대응",
    title: "이벤트 상세에서 조치 상태를 남깁니다",
    body: "라인·위험도 필터로 대상을 찾고 ‘상세’를 여세요. 신규 → 확인 → 조치 중 → 완료 순으로 상태와 관리자 메모를 남기면 인수인계가 쉬워집니다.",
    placement: "bottom",
  },
  {
    path: "/events",
    target: "guide-launch",
    phase: "가이드 완료",
    title: "필요할 때 언제든 다시 볼 수 있어요",
    body: "상단의 ‘사용 가이드’를 누르면 이 안내를 처음부터 다시 시작합니다. 이제 실제 운영을 시작해 보세요.",
    placement: "bottom",
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function tooltipPosition(
  rect: TargetRect | null,
  size: { width: number; height: number },
  preferred: Placement,
) {
  const margin = 16;
  const gap = 18;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (!rect) {
    return {
      top: Math.max(margin, (viewportHeight - size.height) / 2),
      left: Math.max(margin, (viewportWidth - size.width) / 2),
    };
  }

  const candidates: Record<Placement, { top: number; left: number }> = {
    top: {
      top: rect.top - size.height - gap,
      left: rect.left + rect.width / 2 - size.width / 2,
    },
    right: {
      top: rect.top + rect.height / 2 - size.height / 2,
      left: rect.right + gap,
    },
    bottom: {
      top: rect.bottom + gap,
      left: rect.left + rect.width / 2 - size.width / 2,
    },
    left: {
      top: rect.top + rect.height / 2 - size.height / 2,
      left: rect.left - size.width - gap,
    },
  };
  const placements: Placement[] = [preferred, "bottom", "right", "top", "left"];
  const order = placements.filter(
    (placement, index, all) => all.indexOf(placement) === index,
  );
  const fits = ({ top, left }: { top: number; left: number }) =>
    top >= margin &&
    left >= margin &&
    top + size.height <= viewportHeight - margin &&
    left + size.width <= viewportWidth - margin;
  const selected = order.map((placement) => candidates[placement]).find(fits) ?? candidates[preferred];

  return {
    top: clamp(selected.top, margin, Math.max(margin, viewportHeight - size.height - margin)),
    left: clamp(selected.left, margin, Math.max(margin, viewportWidth - size.width - margin)),
  };
}

export function adminGuideStorageKey(userId: string | null) {
  return `ae-sentinel:admin-guide:v1:${userId ?? "signed-in"}`;
}

export function AdminGuide({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 360, height: 250 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  useEffect(() => {
    if (location.pathname !== step.path) navigate(step.path);
  }, [location.pathname, navigate, step.path]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let timer = 0;
    let resizeObserver: ResizeObserver | null = null;
    let attempts = 0;

    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
      if (!target) {
        setTargetRect(null);
        if (attempts < 30) {
          attempts += 1;
          timer = window.setTimeout(update, 80);
        }
        return;
      }

      target.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = target.getBoundingClientRect();
      const padding = 7;
      setTargetRect({
        top: Math.max(6, rect.top - padding),
        right: Math.min(window.innerWidth - 6, rect.right + padding),
        bottom: Math.min(window.innerHeight - 6, rect.bottom + padding),
        left: Math.max(6, rect.left - padding),
        width: Math.min(window.innerWidth - 12, rect.width + padding * 2),
        height: Math.min(window.innerHeight - 12, rect.height + padding * 2),
      });
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(updateRectOnly);
      resizeObserver.observe(target);
    };

    const updateRectOnly = () => {
      const target = document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const padding = 7;
      setTargetRect({
        top: Math.max(6, rect.top - padding),
        right: Math.min(window.innerWidth - 6, rect.right + padding),
        bottom: Math.min(window.innerHeight - 6, rect.bottom + padding),
        left: Math.max(6, rect.left - padding),
        width: Math.min(window.innerWidth - 12, rect.width + padding * 2),
        height: Math.min(window.innerHeight - 12, rect.height + padding * 2),
      });
    };

    setTargetRect(null);
    timer = window.setTimeout(update, location.pathname === step.path ? 40 : 140);
    window.addEventListener("resize", updateRectOnly);
    window.addEventListener("scroll", updateRectOnly, true);
    return () => {
      window.clearTimeout(timer);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateRectOnly);
      window.removeEventListener("scroll", updateRectOnly, true);
    };
  }, [location.pathname, step.path, step.target]);

  useLayoutEffect(() => {
    const node = tooltipRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setTooltipSize({ width: rect.width, height: rect.height });
    node.focus();
  }, [index, targetRect]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        localStorage.setItem(adminGuideStorageKey(userId), "done");
        onClose();
      }
      if (event.key === "ArrowRight" && !last) setIndex((current) => current + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex((current) => current - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, last, onClose, userId]);

  const position = useMemo(
    () => tooltipPosition(targetRect, tooltipSize, step.placement),
    [step.placement, targetRect, tooltipSize],
  );

  const close = () => {
    localStorage.setItem(adminGuideStorageKey(userId), "done");
    onClose();
  };

  return createPortal(
    <div className="guide-layer" aria-live="polite">
      <div className="guide-intercept" />
      {targetRect && (
        <div
          className="guide-spotlight"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}
      <div
        ref={tooltipRef}
        className="guide-tooltip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-guide-title"
        tabIndex={-1}
        style={{ top: position.top, left: position.left }}
      >
        <div className="guide-tooltip-head">
          <span>{step.phase}</span>
          <button className="guide-close" onClick={close} aria-label="사용 가이드 닫기">
            <X size={17} />
          </button>
        </div>
        <h2 id="admin-guide-title">{step.title}</h2>
        <p>{step.body}</p>
        {step.tip && <div className="guide-tip">TIP · {step.tip}</div>}

        <div className="guide-progress" aria-label={`전체 ${STEPS.length}단계 중 ${index + 1}단계`}>
          {STEPS.map((_, stepIndex) => (
            <i key={stepIndex} className={stepIndex <= index ? "is-on" : ""} />
          ))}
          <span>
            {index + 1} / {STEPS.length}
          </span>
        </div>

        <div className="guide-actions">
          <button className="guide-skip" onClick={close}>
            건너뛰기
          </button>
          <div>
            <button
              className="guide-nav-btn guide-nav-btn--ghost"
              onClick={() => setIndex((current) => current - 1)}
              disabled={index === 0}
            >
              <ArrowLeft size={15} /> 이전
            </button>
            <button
              className="guide-nav-btn"
              onClick={() => (last ? close() : setIndex((current) => current + 1))}
            >
              {last ? (
                <>
                  <Check size={15} /> 완료
                </>
              ) : (
                <>
                  다음 <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

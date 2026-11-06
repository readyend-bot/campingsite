import {
  Drop,
  MapPin,
  Recycle,
  Storefront,
  Stairs,
  Waves,
} from "@phosphor-icons/react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { type Facility, type Site } from "./domain";
import { PLAN_STAIRS, stairAnchor, maRaisedTerrace } from "./sitePlan";

export function PlanStairLayer({
  area,
  sites,
}: {
  area: string;
  sites: Site[];
}) {
  const terrace = area === "마" ? maRaisedTerrace(sites) : undefined;
  return (
    <>
      {terrace && (
        <div
          className="plan-terrace-edge"
          role="img"
          aria-label="마7·마8 단차 경계"
          style={{
            left: `${terrace.left}%`,
            top: `${terrace.bottom}%`,
            width: `${terrace.right - terrace.left}%`,
          }}
        />
      )}
      {PLAN_STAIRS.flatMap((stair) =>
        stair.ends
          .filter((end) => end.area === area)
          .map((end) => {
            const point = stairAnchor(sites, end);
            if (!point) return null;
            const other = stair.ends.find((peer) => peer.area !== area)!;
            return (
              <div
                key={stair.id}
                className="plan-stair"
                data-stair-id={stair.id}
                role="img"
                aria-label={stair.label}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              >
                <Stairs size={20} aria-hidden="true" />
                <span>{other.area}동 계단</span>
              </div>
            );
          }),
      )}
    </>
  );
}

export function FacilitySymbol({
  type,
  size = 18,
}: {
  type: Facility["type"];
  size?: number;
}) {
  const Icon =
    type === "pool"
      ? Waves
      : type === "store"
        ? Storefront
        : type === "recycling"
          ? Recycle
          : type === "sink" || type === "shower"
            ? Drop
            : MapPin;
  return <Icon size={size} aria-hidden="true" />;
}
export function PlanApproachLayer({ facilities }: { facilities: Facility[] }) {
  if (!facilities.some((facility) => facility.location === "approach"))
    return null;
  return (
    <div className="plan-approach" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M18 100 V20" />
        <path className="plan-approach-branch" d="M18 20 H100" />
      </svg>
      <span>진입로</span>
    </div>
  );
}
export function FacilityLayer({ facilities }: { facilities: Facility[] }) {
  return (
    <>
      {facilities
        .filter((f) => f.layout)
        .map((f) => (
          <div
            key={f.id}
            className={`plan-facility facility-${f.type}${f.location === "approach" ? " location-approach" : ""}`}
            data-facility-id={f.id}
            style={{
              left: `${f.layout!.x}%`,
              top: `${f.layout!.y}%`,
              width: `${f.width}%`,
              height: `${f.height}%`,
            }}
          >
            <FacilitySymbol type={f.type} />
            <strong>{f.label}</strong>
          </div>
        ))}
    </>
  );
}
export function planCanvasStyle(profile: {
  width: number;
  height: number;
}): CSSProperties {
  return {
    "--layout-min-width": `${profile.width}px`,
    "--layout-aspect": `${profile.width} / ${profile.height}`,
    "--layout-print-width": `${(160 * profile.width) / profile.height}mm`,
    "--layout-marker-width": `${(88 / (profile.width - 108)) * 100}%`,
  } as CSSProperties;
}

export function PlanViewport({
  profile,
  children,
  initialFit = true,
}: {
  profile?: { width: number; height: number };
  children: ReactNode;
  initialFit?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fit, setFit] = useState(initialFit);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    // 처음 큰 원본이 그려졌다가 축소되는 깜빡임을 막고 높이 변경은 무시한다.
    const measure = (value: number) => {
      const next = Math.max(0, Math.floor(value));
      if (next) setWidth((previous) => (previous === next ? previous : next));
    };
    const observer = new ResizeObserver((entries) =>
      measure(entries[0].contentRect.width),
    );
    observer.observe(element);
    measure(element.clientWidth);
    return () => observer.disconnect();
  }, [profile]);
  if (!profile)
    return (
      <div className="area-layout-viewport" ref={viewport}>
        {children}
      </div>
    );
  const scale = fit && width ? Math.min(1, width / profile.width) : 1;
  return (
    <div
      className="plan-viewport"
      style={{ "--plan-label-zoom": Math.min(2, 1 / scale) } as CSSProperties}
    >
      <div className="plan-zoom-controls">
        <span>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className={fit ? "active" : ""}
          aria-pressed={fit}
          onClick={() => setFit(true)}
        >
          한눈에 보기
        </button>
        <button
          type="button"
          className={!fit ? "active" : ""}
          aria-pressed={!fit}
          onClick={() => setFit(false)}
        >
          크게 보기
        </button>
      </div>
      <div className="area-layout-viewport" ref={viewport}>
        <div
          className="plan-zoom-frame"
          style={{
            width: profile.width * scale,
            height: profile.height * scale,
          }}
        >
          <div
            className="plan-zoom-content"
            style={{
              width: profile.width,
              height: profile.height,
              transform: `scale(${scale})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

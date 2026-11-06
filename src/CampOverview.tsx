import { type KeyboardEvent } from "react";
import {
  KINDS,
  siteKindLabel,
  siteStatus,
  type Site,
  type State,
} from "./domain";
import {
  PLAN_STAIRS,
  SOPUNG_PLAN_ID,
  TERRACE_ORDER,
  stairAnchor,
  maRaisedTerrace,
  RA_LAYOUT_SCALE,
} from "./sitePlan";

// 두 종이 도면을 도로 기준으로 이어 붙이고 항공사진의 상대 폭을 대조한 평면.
// 실측·방위 좌표가 아니라 전체 탐색 화면의 표시 좌표이며 운영 자료를 바꾸지 않는다.
const AREAS: Record<
  string,
  {
    x: number;
    y: number;
    width: number;
    height: number;
    outline: string;
    label: [number, number];
  }
> = {
  B: {
    x: 210,
    y: 40,
    width: 877,
    height: 230,
    outline: "M255 280 L255 152 L280 90 L280 35 L430 22 L1097 22 L1097 280 Z",
    label: [500, 168],
  },
  A: {
    x: 117,
    y: 302,
    width: 972,
    height: 130,
    outline: "M124 442 L124 395 L240 286 L1097 286 L1097 442 Z",
    label: [466, 367],
  },
  라: {
    x: 190,
    y: 465,
    width: 705,
    height: 130,
    outline: "M221 604 L221 472 L253 451 L950 451 L950 604 Z",
    label: [538, 527],
  },
  다: {
    x: 260,
    y: 630,
    width: 695,
    height: 125,
    outline: "M270 767 L270 667 L307 619 L945 619 L945 767 Z",
    label: [518, 697],
  },
  나: {
    x: 30,
    y: 790,
    width: 905,
    height: 190,
    outline: "M16 994 L16 912 L183 912 L183 779 L945 779 L945 994 Z",
    label: [541, 858],
  },
  가: {
    x: 435,
    y: 1030,
    width: 470,
    height: 160,
    outline: "M468 1210 L468 1018 L945 1018 L945 1210 Z",
    label: [705, 1114],
  },
  마: {
    x: 1222,
    y: 302,
    width: 245,
    height: 287,
    // 2026-10-06 현장 확인: 도로 건너 A동·라동과 나란히 놓인다.
    outline: "M1226 286 L1483 286 L1483 604 L1226 604 Z",
    label: [1305, 407],
  },
};
const shortSite = (site: Site) =>
  site.kind === "bungalow"
    ? "방갈로"
    : site.label.match(/\d+$/)?.[0] || site.label;
function position(
  area: string,
  x: number,
  y: number,
  facilityType?: string,
  facilityLocation?: string,
) {
  const frame = AREAS[area];
  if (area === "라" && facilityLocation === "approach")
    return {
      x: 982 + ((x - 84.4) * 590) / RA_LAYOUT_SCALE / 100,
      y: 455 + (y * frame.height) / 100,
    };
  if (area === "라") x /= RA_LAYOUT_SCALE;
  // 사진마다 다른 칸 간격을 공통 진입로에 맞춘다. 줄별 꺾임·시설 간격도 보존한다.
  const upper = area === "A" ? Math.max(0, Math.min(1, (84 - y) / 70)) : 0;
  let horizontal =
    frame.x + upper * 98 + (x * (frame.width - upper * 61)) / 100;
  if (area === "가" && facilityType) horizontal += 45;
  if (area === "라") {
    horizontal = facilityType
      ? 273 + (x * 590) / 100
      : horizontal +
        30 * Math.max(0, Math.min(1, (84 - y) / 74)) * (1 - x / 100);
  }
  if (area === "B") {
    if (facilityType) horizontal += facilityType === "pool" ? 60 : 52;
    else
      horizontal +=
        40 * Math.max(0, Math.min(1, (25 - y) / 18)) -
        6.3 * Math.max(0, x - 91);
  }
  return {
    x: horizontal,
    y: frame.y + (y * frame.height) / 100,
  };
}
const FACILITY_SHORT: Record<string, string> = {
  toilet: "화장실",
  sink: "개수대",
  shower: "샤워·WC",
  store: "관리실·매점",
  trampoline: "트램펄린",
  tableTennis: "탁구장",
  pool: "수영장",
  recycling: "분리수거",
};

export function CampOverview({
  s,
  day,
  onArea,
}: {
  s: State;
  day: string;
  onArea: (area: string) => void;
}) {
  function choose(event: KeyboardEvent<SVGGElement>, area: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onArea(area);
    }
  }
  return (
    <div className="camp-overview">
      <div className="camp-overview-title">
        <div>
          <h3>캠핑장 전체 배치</h3>
          <p>동을 누르면 해당 동에서 자리를 고를 수 있어요.</p>
        </div>
        <span>아래쪽 입구에서 위로 올라가는 배치</span>
      </div>
      <div
        className="camp-overview-board"
        role="group"
        aria-label="소풍캠핑장 전체 구역 배치"
      >
        <svg
          className="camp-plan"
          viewBox="0 0 1540 1250"
          aria-label="사진과 도면을 조합한 캠핑장 전체 평면도"
        >
          <g className="camp-landscape" aria-hidden="true">
            <path d="M44 777 L268 583 L271 440 L148 442 L306 126 L428 6 L1528 6 L1528 1225 L4 1225 L4 1000 Z" />
            {[286, 448, 611, 773, 1003].map((y, i) => (
              <path
                key={y}
                className="camp-terrace-edge"
                d={`M${[270, 130, 226, 277, 20][i]} ${y} H${i < 2 ? 1098 : 951}`}
              />
            ))}
          </g>
          <g className="camp-roads" aria-hidden="true">
            <path
              className="camp-main-road camp-lower-road"
              d="M976 1250 V478"
            />
            <path className="camp-road-center" d="M976 1250 V478" />
            <path
              className="camp-main-road camp-upper-road"
              d="M1128 478 V310 Q1128 72 1108 0"
            />
            <path
              className="camp-road-center"
              d="M1128 478 V310 Q1128 72 1108 0"
            />
            <path
              className="camp-main-road camp-branch-road"
              d="M976 478 H1226"
            />
            <path className="camp-road-center" d="M976 478 H1226" />
            <path
              className="camp-road-arrow"
              d="M1119 333 L1128 320 L1137 333 M967 1000 L976 987 L985 1000 M1184 469 L1197 478 L1184 487"
            />
            <text
              className="camp-road-label"
              x="976"
              y="870"
              transform="rotate(-90 976 870)"
            >
              주 진입로
            </text>
            <text
              className="camp-road-label"
              x="1128"
              y="183"
              transform="rotate(-90 1128 183)"
            >
              A·B동 오르막
            </text>
          </g>
          {TERRACE_ORDER.map((area) => {
            const frame = AREAS[area];
            const sites = s.sites.filter(
              (site) => !site.archived && site.area === area,
            );
            const facilities = (s.facilities || []).filter(
              (f) => f.area === area && f.layout,
            );
            const [labelX, labelY] = frame.label;
            const terrace = area === "마" ? maRaisedTerrace(sites) : undefined;
            return (
              <g
                key={area}
                role="button"
                tabIndex={0}
                aria-label={`${area}동 상세 배치 보기`}
                className={`overview-region overview-region-${area}`}
                onClick={() => onArea(area)}
                onKeyDown={(event) => choose(event, area)}
              >
                <title>
                  {area}동 · {sites.length}자리 · 클릭하면 상세 배치
                </title>
                <path className="overview-boundary" d={frame.outline} />
                {terrace &&
                  (() => {
                    const first = position(area, terrace.left, terrace.bottom);
                    const last = position(area, terrace.right, terrace.bottom);
                    return (
                      <g
                        className="overview-raised-terrace"
                        role="img"
                        aria-label="마7·마8 단차 경계"
                      >
                        <path
                          className="overview-terrace-edge"
                          d={`M${first.x} ${first.y} H${last.x} M${first.x} ${first.y + 3} H${last.x}`}
                        />
                      </g>
                    );
                  })()}
                {sites
                  .filter((site) => site.layout)
                  .map((site) => {
                    const status = siteStatus(s, site.id, day);
                    const { x, y } = position(
                      area,
                      site.layout!.x,
                      site.layout!.y,
                    );
                    const width =
                      site.kind === "bungalow"
                        ? 44
                        : area === "마"
                          ? 29
                          : area === "가"
                            ? 35
                            : 30;
                    return (
                      <g
                        key={site.id}
                        className={`overview-site ${status.type} kind-${site.kind}`}
                        data-site-id={site.id}
                        transform={`translate(${x} ${y})`}
                      >
                        <title>
                          {site.label} · {siteKindLabel(site)} · {status.label}
                        </title>
                        <rect
                          x={-width / 2}
                          y="-13"
                          width={width}
                          height="26"
                          rx="3"
                        />
                        {site.kind === "glamping" && (
                          <path
                            className="overview-tent"
                            d={`M${-width / 2} -13 L0 -21 L${width / 2} -13`}
                          />
                        )}
                        <text textAnchor="middle" dominantBaseline="central">
                          {shortSite(site)}
                        </text>
                      </g>
                    );
                  })}
                {facilities.map((f) => {
                  const { x, y } = position(
                    area,
                    f.layout!.x,
                    f.layout!.y,
                    f.type,
                    f.location,
                  );
                  const w =
                    (f.width *
                      (area === "라" ? 590 / RA_LAYOUT_SCALE : frame.width)) /
                    100;
                  // A동 경계와 가로길 사이에서 시설명과 도로가 겹치지 않게 표시한다.
                  const h =
                    area === "라" && f.location === "approach"
                      ? Math.min(16, (f.height * frame.height) / 100)
                      : (f.height * frame.height) / 100;
                  return (
                    <g
                      key={f.id}
                      className={`overview-facility facility-${f.type}${f.location === "approach" ? " location-approach" : ""}`}
                      data-facility-id={f.id}
                      transform={`translate(${x} ${y})`}
                    >
                      <title>{f.label}</title>
                      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="3" />
                      <text textAnchor="middle" dominantBaseline="central">
                        {f.label.includes("화장실·개수대")
                          ? f.label
                          : FACILITY_SHORT[f.type] || f.label}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={labelX}
                  y={labelY}
                  className="overview-area-name"
                  textAnchor="middle"
                >
                  {area}동
                </text>
                <text
                  x={labelX}
                  y={labelY + 25}
                  className="overview-area-count"
                  textAnchor="middle"
                >
                  {sites.length}자리
                </text>
              </g>
            );
          })}
          {s.sitePlan === SOPUNG_PLAN_ID &&
            PLAN_STAIRS.map((stair) => {
              const ends = stair.ends.map((end) => {
                const point = stairAnchor(s.sites, end);
                return point && position(end.area, point.x, point.y);
              });
              if (!ends[0] || !ends[1]) return null;
              const [from, to] = ends as [
                { x: number; y: number },
                { x: number; y: number },
              ];
              // 계단은 두 단의 경계에 같은 크기로 표시하고 접근 통로만 연결한다.
              const x = (from.x + to.x) / 2;
              const y =
                stair.id === "da-na" ? (767 + 779) / 2 : (994 + 1018) / 2;
              const top = y - 22,
                bottom = y + 22;
              const upperLanding = (from.y + top) / 2,
                lowerLanding = (bottom + to.y) / 2;
              return (
                <g
                  key={stair.id}
                  className="overview-stairway"
                  data-stair-id={stair.id}
                  role="img"
                  aria-label={stair.label}
                >
                  <title>{stair.label}</title>
                  <path
                    className="overview-stair-approach"
                    d={`M${from.x} ${from.y} V${upperLanding} H${x} V${top} M${x} ${bottom} V${lowerLanding} H${to.x} V${to.y}`}
                  />
                  <g
                    className="overview-stair-symbol"
                    transform={`translate(${x} ${y})`}
                  >
                    <rect
                      className="overview-stair-flight"
                      x="-14"
                      y="-22"
                      width="28"
                      height="44"
                      rx="2"
                    />
                    {Array.from({ length: 7 }, (_, i) => (
                      <path
                        key={i}
                        className="overview-stair-tread"
                        d={`M-11 ${-15 + i * 5} H11`}
                      />
                    ))}
                    <path
                      className="overview-stair-arrow"
                      d="M0 16 V-13 M-4 -8 L0 -13 L4 -8"
                    />
                  </g>
                  <text x={x + 25} y={y + 5}>
                    계단
                  </text>
                </g>
              );
            })}
          <g className="camp-parking" aria-hidden="true">
            <rect x="1054" y="1080" width="201" height="120" rx="9" />
            <text x="1154" y="1129" textAnchor="middle">
              주차장
            </text>
            <text
              x="1154"
              y="1154"
              textAnchor="middle"
              className="camp-parking-note"
            >
              입구 오른쪽
            </text>
          </g>
          <text
            x="1173"
            y="514"
            textAnchor="middle"
            className="camp-entrance-label"
          >
            직진 · 마동
          </text>
          <text x="1028" y="1230" className="camp-entrance-label">
            입구
          </text>
        </svg>
      </div>
      <p className="camp-overview-note">
        도면과 항공사진을 바탕으로 동별 위치·진입로·시설을 표시했어요.
      </p>
      <div className="camp-kind-legend">
        <span>
          <i />
          오토캠핑
        </span>
        <span>
          <i className="glamping" />
          {KINDS.glamping}
        </span>
        <span>
          <i className="caravan" />
          {KINDS.caravan}·{KINDS.bungalow}
        </span>
      </div>
    </div>
  );
}

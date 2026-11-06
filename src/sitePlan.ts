import {
  emptyState,
  log,
  saveSite,
  update,
  validateState,
  type Facility,
  type Kind,
  type LayoutPoint,
  type Site,
  type State,
} from "./domain";

// 2026-10-05 사용자가 제공한 두 도면. 가려진 숫자는 연번으로 복원하도록 지시함.
// 도면의 ‘장박’ 표시는 점유 데이터로 가져오지 않는다.
const PREVIOUS_SOPUNG_PLAN_ID = "sopung-user-plan-2026-10-05";
const PREVIOUS_APPROACH_PLAN_ID = "sopung-user-plan-2026-10-06";
export const SOPUNG_PLAN_ID = "sopung-user-plan-2026-10-06-corner";
// 라동 오른쪽 시설을 위한 여백. 기존 위치의 픽셀 간격을 유지하며 좌표를 변환한다.
export const RA_LAYOUT_SCALE = (1600 - 108) / (2000 - 108);
export const AREA_CANVAS: Record<string, { width: number; height: number }> = {
  가: { width: 1000, height: 430 },
  나: { width: 1800, height: 510 },
  다: { width: 1400, height: 370 },
  라: { width: 2000, height: 490 },
  마: { width: 760, height: 760 },
  A: { width: 1600, height: 410 },
  B: { width: 1500, height: 690 },
};
export const TERRACE_ORDER = ["B", "A", "라", "마", "다", "나", "가"];
export const AREA_HINTS: Record<string, string> = {
  가: "매점 건물 · 트램펄린",
  나: "개수대 · 꺾인 두 줄 배치",
  다: "개수대 · 두 줄 배치",
  라: "글램핑 1–11 · 방갈로 A · 트램펄린",
  마: "탁구장 · 샤워실 · 마7·8 단차",
  A: "화장실 · 개수대",
  B: "수영장 · 카라반 · 방갈로 B",
};
export interface StairAnchor {
  area: string;
  labels: string[];
  dx?: number;
  dy?: number;
}
// 2026-10-06 사용자가 확인한 두 동간 계단. 운영 시설·점유를 추가하지 않는다.
// 계단 끝은 자리 위치를 따라가며 개수대와 사이트 표시를 가리지 않게 띄운다.
export const PLAN_STAIRS: {
  id: string;
  label: string;
  ends: [StairAnchor, StairAnchor];
}[] = [
  {
    id: "da-na",
    label: "다6·7 사이 ↔ 나22·23 사이 계단",
    ends: [
      { area: "다", labels: ["다6", "다7"], dy: 12 },
      { area: "나", labels: ["나22", "나23"], dy: -8 },
    ],
  },
  {
    id: "na-ga",
    label: "나4·5 사이 ↔ 가10 오른쪽 계단",
    ends: [
      { area: "나", labels: ["나4", "나5"], dy: 18 },
      { area: "가", labels: ["가10"], dx: 10 },
    ],
  },
];
export function stairAnchor(
  sites: Site[],
  anchor: StairAnchor,
): LayoutPoint | undefined {
  const endpoints = anchor.labels.map((label) =>
    sites.find(
      (site) =>
        !site.archived &&
        site.area === anchor.area &&
        site.label === label &&
        site.layout,
    ),
  );
  if (endpoints.some((site) => !site)) return undefined;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return {
    x: clamp(
      endpoints.reduce((sum, site) => sum + site!.layout!.x, 0) /
        endpoints.length +
        (anchor.dx || 0),
    ),
    y: clamp(
      endpoints.reduce((sum, site) => sum + site!.layout!.y, 0) /
        endpoints.length +
        (anchor.dy || 0),
    ),
  };
}
export function maRaisedTerrace(sites: Site[]) {
  const pair = ["마7", "마8"].map((label) =>
    sites.find(
      (site) =>
        !site.archived &&
        site.area === "마" &&
        site.label === label &&
        site.layout,
    ),
  );
  if (pair.some((site) => !site)) return undefined;
  const points = pair.map((site) => site!.layout!);
  return {
    left: Math.min(...points.map((point) => point.x)) - 7,
    right: Math.max(...points.map((point) => point.x)) + 7,
    bottom: Math.max(...points.map((point) => point.y)) + 8,
  };
}
const areaKey: Record<string, string> = {
  가: "ga",
  나: "na",
  다: "da",
  라: "ra",
  마: "ma",
  A: "a",
  B: "b",
};
export function sopungPlan() {
  const sites: Site[] = [];
  const facilities: Facility[] = [];
  function site(
    area: string,
    n: number | string,
    x: number,
    y: number,
    kind: Kind = "auto",
    detail?: string,
    label = `${area}${n}`,
  ) {
    sites.push({
      id: `sopung-${areaKey[area]}-${n}`,
      area,
      label,
      kind,
      archived: false,
      layout: { x, y },
      ...(detail ? { detail } : {}),
    });
  }
  function facility(
    area: string,
    key: string,
    label: string,
    type: Facility["type"],
    x: number,
    y: number,
    width = 10,
    height = 18,
  ) {
    facilities.push({
      id: `sopung-facility-${areaKey[area]}-${key}`,
      area,
      label,
      type,
      layout: { x, y },
      width,
      height,
    });
  }
  for (let n = 1; n <= 5; n++) site("가", n, 64 - (n - 1) * 11, 84);
  for (let n = 6; n <= 10; n++) site("가", n, 20 + (n - 6) * 11, 18);
  facility("가", "store", "매점 건물", "store", 86, 40, 23, 26);
  facility("가", "trampoline", "트램펄린", "trampoline", 84, 84, 19, 24);

  for (let n = 1; n <= 4; n++) site("나", n, 97 - (n - 1) * 6, 59);
  for (let n = 5; n <= 9; n++) site("나", n, 67 - (n - 5) * 6, 59);
  for (let n = 10; n <= 15; n++) site("나", n, 37 - (n - 10) * 6, 90);
  for (let n = 16; n <= 22; n++) site("나", n, 22 + (n - 16) * 6, 12);
  for (let n = 23; n <= 27; n++) site("나", n, 73 + (n - 23) * 6, 12);
  facility("나", "sink", "개수대", "sink", 73, 59, 5.5, 19);

  for (let n = 1; n <= 6; n++) site("다", n, 93 - (n - 1) * 8, 84);
  for (let n = 7; n <= 11; n++) site("다", n, 37 - (n - 7) * 8, 84);
  for (let n = 12; n <= 21; n++) site("다", n, 9 + (n - 12) * 8, 14);
  facility("다", "sink", "개수대", "sink", 94, 14, 9, 28);

  for (let n = 1; n <= 10; n++) site("라", n, 70 - (n - 1) * 7, 84, "glamping");
  site("라", 11, 7, 47, "glamping");
  site("라", 12, 7, 10);
  for (let n = 13; n <= 19; n++) site("라", n, 22 + (n - 13) * 7, 10);
  // 방갈로에 임의의 라20 번호를 부여하지 않고 도면의 명칭을 유지한다.
  site("라", "bungalow-a", 74, 10, "bungalow", undefined, "방갈로 A");
  site("라", 21, 91, 84);
  site("라", 22, 84, 84);
  site("라", 23, 77, 84);
  facility("라", "toilet", "화장실", "toilet", 85, 10, 7, 20);
  facility("라", "sink", "개수대", "sink", 95, 10, 7, 20);
  for (const item of [...sites, ...facilities].filter(
    (item) => item.area === "라",
  )) {
    item.layout!.x *= RA_LAYOUT_SCALE;
    if ("width" in item) item.width *= RA_LAYOUT_SCALE;
  }
  // 진입로가 꺾이는 모서리(81% + 19% × 18%) 바로 위에 놓는다.
  facility("라", "trampoline", "트램펄린", "trampoline", 84.4, 0, 7.5, 20);
  facilities[facilities.length - 1].location = "approach";

  for (let n = 1; n <= 6; n++) site("마", n, 10, 90 - (n - 1) * 15);
  site("마", 7, 24, 3);
  site("마", 8, 50, 3);
  for (let n = 9; n <= 12; n++) site("마", n, 90, 50 + (n - 9) * 15);
  for (let n = 13; n <= 15; n++) site("마", n, 56, 80 - (n - 13) * 15);
  facility("마", "table-tennis", "탁구장", "tableTennis", 82, 17, 30, 13);
  facility("마", "shower", "샤워실·화장실", "shower", 75, 32, 24, 13);
  facility("마", "sink", "개수대", "sink", 96, 32, 15, 13);

  for (let n = 1; n <= 6; n++) site("A", n, 97 - (n - 1) * 6.6, 84);
  for (let n = 7; n <= 13; n++) site("A", n, 44 - (n - 7) * 6.6, 84);
  for (let n = 14; n <= 26; n++) site("A", n, 6 + (n - 14) * 7, 14);
  facility("A", "toilet", "화장실", "toilet", 54, 72, 11, 22);
  facility("A", "sink", "개수대", "sink", 54, 95, 11, 22);

  site("B", 1, 95, 25);
  site("B", 2, 95, 47);
  for (let n = 3; n <= 12; n++)
    site(
      "B",
      n,
      91 - (n - 3) * 7.7,
      89,
      "caravan",
      n === 7 ? "골든" : n === 8 ? "스페셜3" : n === 10 ? "스파3" : "럭셔리",
      `카라반 ${n}`,
    );
  site("B", "bungalow-b", 12.5, 89, "bungalow", undefined, "방갈로 B");
  for (let n = 14; n <= 18; n++) site("B", n, 31 + (n - 14) * 8, 7);
  facility("B", "toilet-sink", "화장실·개수대", "toilet", 14, 9, 21, 18);
  facility("B", "recycling", "분리수거장", "recycling", 14, 24, 21, 10);
  facility("B", "pool", "수영장", "pool", 53, 47, 32, 29);
  return { sites, facilities };
}
const normalizedLabel = (label: string) =>
  label.replace(/\s+/g, "").toUpperCase();
export function applySopungPlan(s: State) {
  const plan = sopungPlan();
  const next = update(s, (draft) => {
    const previousActivity = [...draft.activity];
    for (const input of plan.sites) {
      const matches = draft.sites.filter(
        (current) =>
          current.id === input.id ||
          (current.area === input.area &&
            normalizedLabel(current.label) === normalizedLabel(input.label)),
      );
      if (matches.length > 1)
        throw new Error(
          `${input.label} 자리가 중복되어 있어요. 자리 목록을 먼저 확인해 주세요.`,
        );
      const existing = matches[0];
      if (existing?.archived) continue;
      // 기존 ID, 항공사진 좌표와 예약 연결을 유지한다. 공식 ID 자리는 운영자가 바꾼
      // 동·이름·유형까지 유지하고, 이름으로 찾은 수동 자리는 도면 유형으로 맞춘다.
      // 사용 중 유형 변경은 saveSite가 차단한다.
      const next: Site = existing
        ? existing.id === input.id
          ? { ...input, ...existing }
          : { ...existing, ...input, id: existing.id }
        : { ...input };
      // 편집한 위치는 유지하고, 위치가 없을 때만 같은 동의 도면 위치를 채운다.
      if (existing?.layout) next.layout = existing.layout;
      else if (next.area === input.area) next.layout = input.layout;
      else delete next.layout;
      saveSite(draft, next);
    }
    const facilityIds = new Set(plan.facilities.map((f) => f.id));
    const current = new Map((draft.facilities || []).map((f) => [f.id, f]));
    draft.facilities = [
      ...(draft.facilities || []).filter((f) => !facilityIds.has(f.id)),
      // 편집한 시설 위치·크기와 정보를 유지하고 빠진 항목만 도면 값으로 채운다.
      ...plan.facilities.map((f) => ({ ...f, ...current.get(f.id) })),
    ];
    draft.sitePlan = SOPUNG_PLAN_ID;
    draft.activity = previousActivity;
    log(
      draft,
      "제공한 소풍캠핑장 도면의 자리·시설·숙박 유형을 반영했어요. 장박은 별도 등록해 주세요.",
    );
    validateState(draft);
  });
  Object.assign(s, next);
}
export function sopungInitialState() {
  const s = emptyState();
  applySopungPlan(s);
  return s;
}
export function upgradeSopungPlan(s: State) {
  const legacy = s.sitePlan === PREVIOUS_SOPUNG_PLAN_ID;
  if (!legacy && s.sitePlan !== PREVIOUS_APPROACH_PLAN_ID) return;
  const existing = (s.facilities || []).find(
    (item) => item.area === "라" && item.type === "trampoline",
  );
  // 0.1.9·0.1.10의 기본 위치만 정정하고 사용자가 옮긴 시설은 그대로 둔다.
  const previousDefault =
    existing?.id === "sopung-facility-ra-trampoline" &&
    existing.location === "approach" &&
    existing.layout?.x === 93 &&
    (existing.layout.y === 34 || existing.layout.y === 0);
  const next = update(s, (draft) => {
    if (legacy) {
      for (const site of draft.sites.filter(
        (site) => site.area === "라" && site.layout,
      ))
        site.layout!.x *= RA_LAYOUT_SCALE;
      for (const item of (draft.facilities || []).filter(
        (item) => item.area === "라",
      )) {
        if (item.layout) item.layout.x *= RA_LAYOUT_SCALE;
        item.width *= RA_LAYOUT_SCALE;
      }
    }
    draft.facilities ||= [];
    if (
      !draft.facilities.some(
        (item) => item.area === "라" && item.type === "trampoline",
      )
    ) {
      const trampoline = sopungPlan().facilities.find(
        (item) => item.id === "sopung-facility-ra-trampoline",
      )!;
      draft.facilities.push(trampoline);
    } else {
      const trampoline = draft.facilities.find(
        (item) => item.area === "라" && item.type === "trampoline",
      )!;
      const previousX =
        95 * RA_LAYOUT_SCALE + (7 * RA_LAYOUT_SCALE + 10) / 2 + 2;
      if (
        trampoline.id === "sopung-facility-ra-trampoline" &&
        trampoline.layout &&
        ((Math.abs(trampoline.layout.x - previousX) < 1e-6 &&
          trampoline.layout.y === 10) ||
          previousDefault)
      ) {
        trampoline.layout = { x: 84.4, y: 0 };
        if (existing?.width === 10) trampoline.width = 7.5;
      }
      trampoline.location = "approach";
    }
    draft.sitePlan = SOPUNG_PLAN_ID;
    log(
      draft,
      "트램펄린을 라동 진입로가 꺾이는 모서리 위쪽에 반영했어요. 기존 예약·배정과 편집한 위치는 유지해요.",
    );
  });
  Object.assign(s, next);
}

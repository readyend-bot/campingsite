import savedLayout from "./bundledLayout.json";
import { emptyState, log, update, validateState, type State } from "./domain";

export const BUNDLED_LAYOUT_DATE = savedLayout.capturedOn;

// 배포 시 사용자가 저장한 자리·시설만 추출한 고정본이다.
// 운영 파일, 예약, 장박, PIN, 캠핏 세션을 설치 파일에 넣지 않는다.
export function bundledInitialState(): State {
  const state = {
    ...emptyState(),
    sitePlan: savedLayout.sitePlan,
    sites: JSON.parse(JSON.stringify(savedLayout.sites)),
    facilities: JSON.parse(JSON.stringify(savedLayout.facilities)),
  };
  validateState(state);
  log(state, `${BUNDLED_LAYOUT_DATE}에 포함한 저장된 자리배치를 준비했어요.`);
  return state;
}

const normalized = (label: string) => label.replace(/\s+/g, "").toUpperCase();

// 기존 PC에서는 운영자가 명시적으로 적용할 때만 위치를 바꾼다.
// 수동 등록 자리의 ID, 삭제 상태, 객실 유형과 모든 운영 연결을 유지한다.
export function applyBundledLayout(state: State) {
  if (state.demo)
    throw new Error("체험 데이터를 마치고 실제 운영에서 배치를 적용해 주세요.");
  const template = bundledInitialState();
  const next = update(state, (draft) => {
    const matched = new Set<string>();
    for (const site of template.sites) {
      const matches = draft.sites.filter(
        (current) =>
          current.id === site.id ||
          normalized(current.label) === normalized(site.label),
      );
      if (matches.length > 1 || (matches[0] && matched.has(matches[0].id)))
        throw new Error(
          `${site.label} 자리가 중복되어 있어요. 자리 목록을 확인해 주세요.`,
        );
      const current = matches[0];
      if (!current) {
        draft.sites.push(site);
        continue;
      }
      matched.add(current.id);
      if (current.archived) continue;
      if (current.area !== site.area)
        throw new Error(
          `${current.label}의 동이 저장된 배치와 달라요. 자리 정보를 확인해 주세요.`,
        );
      current.layout = site.layout;
    }
    draft.facilities ||= [];
    const matchedFacilities = new Set<string>();
    for (const facility of template.facilities || []) {
      const matches = draft.facilities.filter(
        (current) =>
          current.id === facility.id ||
          (current.area === facility.area &&
            current.type === facility.type &&
            normalized(current.label) === normalized(facility.label)),
      );
      if (
        matches.length > 1 ||
        (matches[0] && matchedFacilities.has(matches[0].id))
      )
        throw new Error(
          `${facility.area}동 ${facility.label} 시설이 중복되어 있어요. 시설 목록을 확인해 주세요.`,
        );
      const current = matches[0];
      if (!current) {
        draft.facilities.push(facility);
        continue;
      }
      matchedFacilities.add(current.id);
      if (current.area !== facility.area)
        throw new Error(
          `${current.label}의 동이 저장된 배치와 달라요. 시설 정보를 확인해 주세요.`,
        );
      current.layout = facility.layout;
      current.width = facility.width;
      current.height = facility.height;
      if (facility.location) current.location = facility.location;
      else delete current.location;
    }
    draft.sitePlan = template.sitePlan;
    log(
      draft,
      `${BUNDLED_LAYOUT_DATE}에 포함한 저장된 자리배치를 적용했어요. 예약·배정·장박은 유지해요.`,
    );
    validateState(draft);
  });
  Object.assign(state, next);
}

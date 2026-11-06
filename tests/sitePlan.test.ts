import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  addReservation,
  assign,
  emptyState,
  saveFacilityLayout,
  validateState,
} from "../src/domain";
import {
  applySopungPlan,
  sopungInitialState,
  sopungPlan,
  upgradeSopungPlan,
  SOPUNG_PLAN_ID,
  RA_LAYOUT_SCALE,
} from "../src/sitePlan";
const { allowedNavigation } = createRequire(import.meta.url)(
  "../electron/camfit.cjs",
);

test("사용자 도면 140자리와 시설, 객실 종류를 복원하고 장박은 만들지 않음", () => {
  const s = sopungInitialState();
  validateState(s);
  assert.equal(s.sites.length, 140);
  assert.deepEqual(
    ["가", "나", "다", "라", "마", "A", "B"].map(
      (area) => s.sites.filter((x) => x.area === area).length,
    ),
    [10, 27, 21, 23, 15, 26, 18],
  );
  assert.equal(
    s.sites.filter((x) => x.area === "라" && x.kind === "glamping").length,
    11,
  );
  const caravans = s.sites.filter((x) => x.kind === "caravan");
  assert.equal(caravans.length, 10);
  assert.equal(caravans.filter((x) => x.detail === "럭셔리").length, 7);
  assert.deepEqual(
    caravans
      .filter((x) => x.detail !== "럭셔리")
      .map((x) => [x.label, x.detail]),
    [
      ["카라반 7", "골든"],
      ["카라반 8", "스페셜3"],
      ["카라반 10", "스파3"],
    ],
  );
  assert.deepEqual(
    s.sites.filter((x) => x.kind === "bungalow").map((x) => [x.area, x.label]),
    [
      ["라", "방갈로 A"],
      ["B", "방갈로 B"],
    ],
  );
  assert.equal(s.facilities?.length, 15);
  assert.equal(s.blocks.length, 0);
  assert.equal(s.reservations.length, 0);
  assert.ok(s.facilities?.some((x) => x.area === "B" && x.type === "pool"));
  const find = (label: string) => s.sites.find((x) => x.label === label)!;
  assert.ok(find("가1").layout!.x > find("가5").layout!.x);
  assert.ok(find("가1").layout!.y > find("가6").layout!.y);
  assert.ok(find("A1").layout!.y > find("A26").layout!.y);
  assert.ok(find("라1").layout!.x < find("라23").layout!.x);
  assert.ok(find("나10").layout!.y > find("나9").layout!.y);
});

test("도면 재적용은 기존 ID·예약·배정·장박·항공사진 좌표와 추가 자리를 보존", () => {
  const s = emptyState();
  s.sites = [
    {
      id: "existing",
      area: "가",
      label: "가1",
      kind: "auto",
      archived: false,
      x: 12,
      y: 34,
    },
    {
      id: "custom",
      area: "가",
      label: "별도 자리",
      kind: "auto",
      archived: false,
    },
  ];
  const guest = addReservation(s, {
    name: "검증 손님",
    phone: "",
    arrival: "2031-10-05",
    departure: "2031-10-07",
    kind: "auto",
    source: "캠핏",
    people: 2,
    vehicle: "",
    note: "",
    fee: 0,
    paid: false,
  });
  assign(s, guest.id, "existing", false, "2031-10-01T10:00:00");
  s.blocks.push({
    id: "long",
    siteId: "custom",
    type: "long",
    name: "직접 등록한 장박",
    phone: "",
    start: "2031-10-01T14:00:00",
    end: "2031-11-01T11:00:00",
    note: "",
  });
  const bookings = JSON.stringify({
    r: s.reservations,
    a: s.allocations,
    b: s.blocks,
  });
  applySopungPlan(s);
  applySopungPlan(s);
  validateState(s);
  assert.equal(s.sites.length, 141);
  assert.equal(s.facilities?.length, 15);
  const existing = s.sites.find((x) => x.id === "existing")!;
  assert.equal(existing.label, "가1");
  assert.equal(existing.x, 12);
  assert.equal(existing.y, 34);
  assert.equal(
    JSON.stringify({ r: s.reservations, a: s.allocations, b: s.blocks }),
    bookings,
  );
});

test("사용 예정인 유형 충돌은 부분 적용 없이 도면 전체 반영을 거절", () => {
  const s = emptyState();
  s.sites = [
    { id: "ra1", area: "라", label: "라1", kind: "auto", archived: false },
  ];
  const guest = addReservation(s, {
    name: "검증",
    phone: "",
    arrival: "2031-10-05",
    departure: "2031-10-07",
    kind: "auto",
    source: "캠핏",
    people: 2,
    vehicle: "",
    note: "",
    fee: 0,
    paid: false,
  });
  assign(s, guest.id, "ra1", false, "2031-10-01T10:00:00");
  const before = JSON.stringify(s);
  assert.throws(() => applySopungPlan(s), /사용 예정/);
  assert.equal(JSON.stringify(s), before);
});

test("시설 위치는 개별 저장·복원하고 잘못된 시설·좌표 변경은 원본 보존", () => {
  const s = sopungInitialState(),
    pool = s.facilities!.find((f) => f.type === "pool")!;
  saveFacilityLayout(s, "B", [{ id: pool.id, position: { x: 47, y: 51 } }]);
  const copy = JSON.parse(JSON.stringify(s));
  validateState(copy);
  assert.deepEqual(
    copy.facilities!.find((f: { id: string }) => f.id === pool.id)!.layout,
    { x: 47, y: 51 },
  );
  const before = JSON.stringify(s);
  assert.throws(() =>
    saveFacilityLayout(s, "B", [
      { id: pool.id, position: { x: 40, y: 30 } },
      { id: "missing", position: { x: 5, y: 5 } },
    ]),
  );
  assert.equal(JSON.stringify(s), before);
  copy.facilities![0].width = -1;
  assert.throws(() => validateState(copy), /시설/);
  assert.equal(sopungPlan().sites.length, 140);
});

test("캠핏 로그인 창은 공식 관리 도메인만 탐색하고 다른 출처·인증정보 URL을 거절", () => {
  assert.equal(
    allowedNavigation("https://admin.camfit.co.kr/#/auth/login"),
    true,
  );
  for (const value of [
    "http://admin.camfit.co.kr/",
    "file:///tmp/data",
    "javascript:alert(1)",
    "https://admin.camfit.co.kr.evil.test/",
    "https://user:pass@admin.camfit.co.kr/",
    "not-a-url",
  ])
    assert.equal(allowedNavigation(value), false);
});

test("이전 배치 갱신은 편집한 라동의 실제 간격·다른 동·예약·장박을 보존하고 한 번만 시설을 추가", () => {
  const s = sopungInitialState();
  s.sitePlan = "sopung-user-plan-2026-10-05";
  s.facilities = s.facilities!.filter(
    (f) => f.id !== "sopung-facility-ra-trampoline",
  );
  for (const item of [...s.sites, ...s.facilities].filter(
    (item) => item.area === "라",
  )) {
    item.layout!.x /= RA_LAYOUT_SCALE;
    if ("width" in item) item.width /= RA_LAYOUT_SCALE;
  }
  const ra12 = s.sites.find((site) => site.label === "라12")!;
  ra12.layout = { x: 17, y: 24 };
  ra12.x = 22;
  ra12.y = 31;
  const sink = s.facilities!.find(
    (item) => item.id === "sopung-facility-ra-sink",
  )!;
  sink.layout = { x: 82, y: 19 };
  const guest = addReservation(s, {
    name: "기존 예약",
    phone: "",
    arrival: "2031-10-05",
    departure: "2031-10-07",
    kind: "auto",
    source: "캠핏",
    people: 2,
    vehicle: "",
    note: "",
    fee: 0,
    paid: false,
  });
  assign(s, guest.id, ra12.id, false, "2031-10-01T10:00:00");
  s.blocks.push({
    id: "long",
    siteId: "sopung-ma-8",
    type: "long",
    name: "직접 등록",
    phone: "",
    start: "2031-10-01T14:00:00",
    end: "2031-11-01T11:00:00",
    note: "",
  });
  const before = structuredClone(s);
  upgradeSopungPlan(s);
  validateState(s);
  assert.equal(s.sitePlan, SOPUNG_PLAN_ID);
  assert.equal(s.facilities?.length, 15);
  const ra = s.sites.find((site) => site.id === ra12.id)!;
  assert.ok(Math.abs(ra.layout!.x * (2000 - 108) - 17 * (1600 - 108)) < 1e-8);
  assert.equal(ra.layout!.y, 24);
  assert.equal(ra.x, 22);
  assert.equal(ra.y, 31);
  for (const key of [
    "reservations",
    "allocations",
    "blocks",
    "changes",
    "settings",
  ] as const)
    assert.deepEqual(s[key], before[key]);
  assert.deepEqual(
    s.sites.filter((site) => site.area !== "라"),
    before.sites.filter((site) => site.area !== "라"),
  );
  assert.deepEqual(
    s.facilities!.filter((item) => item.area !== "라"),
    before.facilities!.filter((item) => item.area !== "라"),
  );
  const trampoline = s.facilities!.find(
    (item) => item.id === "sopung-facility-ra-trampoline",
  )!;
  const movedSink = s.facilities!.find((item) => item.id === sink.id)!;
  assert.ok(
    trampoline.layout!.x - trampoline.width / 2 >
      movedSink.layout!.x + movedSink.width / 2,
  );
  assert.equal(trampoline.location, "approach");
  assert.deepEqual(trampoline.layout, { x: 84.4, y: 0 });
  const once = JSON.stringify(s);
  upgradeSopungPlan(s);
  assert.equal(JSON.stringify(s), once);
  const unknown = { ...before, sitePlan: "custom-plan" };
  const untouched = JSON.stringify(unknown);
  upgradeSopungPlan(unknown);
  assert.equal(JSON.stringify(unknown), untouched);
});

test("라동 내부로 표시했던 트램펄린만 길목으로 정정하고 자리 좌표는 다시 변환하지 않음", () => {
  const s = sopungInitialState();
  s.sitePlan = "sopung-user-plan-2026-10-06";
  const trampoline = s.facilities!.find(
    (item) => item.id === "sopung-facility-ra-trampoline",
  )!;
  delete trampoline.location;
  trampoline.layout = {
    x: 95 * RA_LAYOUT_SCALE + (7 * RA_LAYOUT_SCALE + 10) / 2 + 2,
    y: 10,
  };
  const before = structuredClone(s.sites);
  upgradeSopungPlan(s);
  assert.deepEqual(s.sites, before);
  const corrected = s.facilities!.find((item) => item.id === trampoline.id)!;
  assert.deepEqual(corrected.layout, { x: 84.4, y: 0 });
  assert.equal(corrected.location, "approach");
  const once = JSON.stringify(s);
  upgradeSopungPlan(s);
  assert.equal(JSON.stringify(s), once);
});

for (const oldY of [34, 0])
  test(`이전 기본 트램펄린(y=${oldY})만 도로 모서리로 옮기고 운영 기록·사용자 편집은 보존`, () => {
    const s = sopungInitialState();
    s.sitePlan = "sopung-user-plan-2026-10-06";
    const trampoline = s.facilities!.find(
      (item) => item.id === "sopung-facility-ra-trampoline",
    )!;
    trampoline.layout = { x: 93, y: oldY };
    trampoline.width = 10;
    const guest = addReservation(s, {
      name: "위치 정정 중 보존할 예약",
      phone: "",
      arrival: "2031-10-05",
      departure: "2031-10-07",
      kind: "auto",
      source: "캠핏",
      people: 2,
      vehicle: "",
      note: "현장 메모",
      fee: 0,
      paid: false,
    });
    assign(
      s,
      guest.id,
      s.sites.find((site) => site.label === "A1")!.id,
      false,
      "2031-10-01T10:00:00",
    );
    const before = structuredClone(s);
    upgradeSopungPlan(s);
    validateState(s);
    for (const key of [
      "sites",
      "reservations",
      "allocations",
      "blocks",
      "changes",
      "settings",
    ] as const)
      assert.deepEqual(s[key], before[key]);
    const otherFacilities = (state: typeof s) =>
      state.facilities!.filter((item) => item.id !== trampoline.id);
    assert.deepEqual(otherFacilities(s), otherFacilities(before));
    assert.deepEqual(
      s.facilities!.find((item) => item.id === trampoline.id)!.layout,
      { x: 84.4, y: 0 },
    );
    assert.equal(
      s.facilities!.find((item) => item.id === trampoline.id)!.width,
      7.5,
    );
    const once = JSON.stringify(s);
    upgradeSopungPlan(s);
    assert.equal(JSON.stringify(s), once);

    for (const position of [
      { x: 92, y: 34 },
      { x: 93, y: 33 },
    ]) {
      const edited = structuredClone(before);
      edited.facilities!.find((item) => item.id === trampoline.id)!.layout =
        position;
      const untouched = JSON.stringify(edited);
      upgradeSopungPlan(edited);
      assert.deepEqual(edited.facilities, JSON.parse(untouched).facilities);
      assert.equal(edited.sitePlan, SOPUNG_PLAN_ID);
      const upgraded = JSON.stringify(edited);
      upgradeSopungPlan(edited);
      assert.equal(JSON.stringify(edited), upgraded);
    }

    // 갱신 후 운영자가 예전 기본 위치로 옮겨도 다시 덮어쓰지 않는다.
    s.facilities!.find((item) => item.id === trampoline.id)!.layout = {
      x: 93,
      y: oldY,
    };
    const manuallyMoved = JSON.stringify(s);
    upgradeSopungPlan(s);
    assert.equal(JSON.stringify(s), manuallyMoved);
  });

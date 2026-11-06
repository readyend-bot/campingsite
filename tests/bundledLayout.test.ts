import { test } from "node:test";
import assert from "node:assert/strict";
import savedLayout from "../src/bundledLayout.json";
import { applyBundledLayout, bundledInitialState } from "../src/bundledLayout";
import {
  addReservation,
  assign,
  emptyState,
  validateState,
} from "../src/domain";
import { sopungInitialState } from "../src/sitePlan";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test("설치 배치는 자리·시설만 담으며 편집한 마7·마8 위치를 그대로 포함", () => {
  assert.deepEqual(Object.keys(savedLayout).sort(), [
    "capturedOn",
    "facilities",
    "format",
    "savedAt",
    "sitePlan",
    "sites",
    "version",
  ]);
  for (const site of savedLayout.sites)
    assert.ok(
      Object.keys(site).every((key) =>
        [
          "id",
          "label",
          "area",
          "kind",
          "archived",
          "layout",
          "detail",
        ].includes(key),
      ),
    );
  for (const facility of savedLayout.facilities)
    assert.ok(
      Object.keys(facility).every((key) =>
        [
          "id",
          "area",
          "label",
          "type",
          "layout",
          "width",
          "height",
          "location",
        ].includes(key),
      ),
    );
  const state = bundledInitialState();
  validateState(state);
  assert.equal(state.sites.length, 140);
  assert.equal(state.facilities?.length, 15);
  assert.deepEqual(state.sites.find((s) => s.label === "마7")?.layout, {
    x: 24,
    y: 0.2,
  });
  assert.deepEqual(state.sites.find((s) => s.label === "마8")?.layout, {
    x: 50,
    y: 0,
  });
  assert.deepEqual(state.sites, savedLayout.sites);
  assert.deepEqual(state.facilities, savedLayout.facilities);
  assert.deepEqual(state.reservations, []);
  assert.deepEqual(state.allocations, []);
  assert.deepEqual(state.blocks, []);
  assert.deepEqual(state.changes, []);
  assert.deepEqual(state.settings, emptyState().settings);
  state.sites[0].layout!.x = 1;
  state.facilities![0].width = 1;
  assert.deepEqual(bundledInitialState().sites, savedLayout.sites);
  assert.deepEqual(bundledInitialState().facilities, savedLayout.facilities);
});

test("저장된 배치 수동 적용은 기존 ID·예약·배정·장박·삭제·유형·사진을 유지", () => {
  const state = sopungInitialState();
  state.sites[0].id = "legacy-ga1";
  state.sites[0].layout = { x: 8, y: 9 };
  state.sites[0].x = 23;
  state.sites[0].y = 45;
  state.sites[1].archived = true;
  state.sites[1].layout = { x: 17, y: 22 };
  state.sites[3].label = "가4 새 이름";
  state.sites[3].kind = "glamping";
  state.sites.push({
    id: "extra",
    label: "현장 추가",
    area: "나",
    kind: "auto",
    archived: false,
    layout: { x: 25, y: 35 },
  });
  state.facilities![0].id = "legacy-facility";
  state.facilities![0].layout = { x: 1, y: 2 };
  state.facilities![0].width = 3;
  state.settings.aerial = "data:image/png;base64,AAAA";
  const guest = addReservation(state, {
    name: "시험 예약",
    phone: "",
    arrival: "2036-11-06",
    departure: "2036-11-08",
    kind: "auto",
    source: "캠핏",
    people: 2,
    vehicle: "",
    note: "현장 메모",
    fee: 0,
    paid: false,
  });
  assign(state, guest.id, state.sites[0].id, false, "2036-11-01T10:00:00");
  state.blocks.push({
    id: "long",
    siteId: state.sites[2].id,
    type: "long",
    name: "시험 장박",
    phone: "",
    start: "2036-11-01T14:00:00",
    end: "2036-12-01T11:00:00",
    note: "",
  });
  const before = clone(state);
  applyBundledLayout(state);
  assert.equal(state.sites.length, 141);
  assert.equal(state.facilities?.length, 15);
  assert.equal(state.sites[0].id, "legacy-ga1");
  assert.deepEqual(state.sites[0].layout, savedLayout.sites[0].layout);
  assert.equal(state.sites[0].x, 23);
  assert.equal(state.sites[0].y, 45);
  assert.deepEqual(state.sites[1], before.sites[1]);
  assert.equal(state.sites[3].label, "가4 새 이름");
  assert.equal(state.sites[3].kind, "glamping");
  assert.deepEqual(state.sites.at(-1), before.sites.at(-1));
  assert.equal(state.facilities![0].id, "legacy-facility");
  assert.deepEqual(
    state.facilities![0].layout,
    savedLayout.facilities[0].layout,
  );
  assert.equal(state.facilities![0].width, savedLayout.facilities[0].width);
  for (const key of [
    "reservations",
    "allocations",
    "blocks",
    "changes",
    "settings",
  ] as const)
    assert.deepEqual(state[key], before[key]);
  assert.deepEqual(state.activity.slice(1), before.activity);
  const once = clone(state);
  applyBundledLayout(state);
  assert.deepEqual(state.sites, once.sites);
  assert.deepEqual(state.facilities, once.facilities);
  validateState(state);
});

test("기존 빈 PC에도 저장된 편집 배치 전체를 적용할 수 있음", () => {
  const state = emptyState();
  applyBundledLayout(state);
  assert.deepEqual(state.sites, savedLayout.sites);
  assert.deepEqual(state.facilities, savedLayout.facilities);
});

test("자리·시설 연결이 중복되거나 동이 다르면 일부만 바꾸지 않고 전체를 유지", () => {
  for (const problem of [
    "site-duplicate",
    "facility-duplicate",
    "area",
  ] as const) {
    const state = sopungInitialState();
    state.sites[0].layout = { x: 1, y: 2 };
    if (problem === "site-duplicate")
      state.sites.push({ ...state.sites[2], id: "duplicate" });
    if (problem === "facility-duplicate")
      state.facilities!.push({ ...state.facilities![0], id: "duplicate" });
    if (problem === "area") state.sites[2].area = "나";
    const before = clone(state);
    assert.throws(() => applyBundledLayout(state), /중복|동이/);
    assert.deepEqual(clone(state), before);
  }
});

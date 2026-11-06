import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addReservation,
  assign,
  emptyState,
  saveAreaLayout,
  saveSite,
  validateState,
  type LayoutChange,
} from "../src/domain";

function fixture() {
  const s = emptyState();
  s.sites = [
    {
      id: "a1",
      area: "가",
      label: "가1",
      kind: "auto",
      archived: false,
      x: 10,
      y: 20,
    },
    { id: "a2", area: "가", label: "가2", kind: "auto", archived: false },
    { id: "b1", area: "나", label: "나1", kind: "auto", archived: false },
  ];
  const r = addReservation(s, {
    name: "배치 검증 손님",
    phone: "",
    arrival: "2026-09-28",
    departure: "2026-10-01",
    kind: "auto",
    source: "전화",
    people: 2,
    note: "",
    vehicle: "",
    fee: 0,
    paid: false,
  });
  assign(s, r.id, "a1", true, "2026-09-28T09:00:00");
  return s;
}

test("동별 위치 변경은 예약·배정과 항공사진 좌표를 보존하고 백업에서 복원", () => {
  const s = fixture();
  validateState(s);
  const reservations = JSON.stringify(s.reservations),
    allocations = JSON.stringify(s.allocations);
  saveAreaLayout(s, "가", [
    { siteId: "a1", position: { x: 0, y: 100 } },
    { siteId: "a2", position: { x: 73.4, y: 19.6 } },
  ]);
  assert.equal(JSON.stringify(s.reservations), reservations);
  assert.equal(JSON.stringify(s.allocations), allocations);
  assert.equal(s.sites[0].x, 10);
  assert.equal(s.sites[0].y, 20);
  assert.equal(s.sites[2].layout, undefined);
  const restored = JSON.parse(JSON.stringify(s));
  validateState(restored);
  assert.deepEqual(restored.sites[1].layout, { x: 73.4, y: 19.6 });
  saveAreaLayout(s, "가", [{ siteId: "a1" }]);
  assert.equal(s.sites[0].layout, undefined);
  validateState(s);
});

test("다른 동·삭제된 자리·잘못된 좌표가 섞인 편집은 전체 반영 전에 거절", () => {
  const s = fixture();
  s.sites[1].archived = true;
  const before = JSON.stringify(s);
  for (const invalid of [
    { siteId: "b1", position: { x: 40, y: 40 } },
    { siteId: "a2", position: { x: 40, y: 40 } },
    { siteId: "missing", position: { x: 40, y: 40 } },
    { siteId: "a1", position: { x: -1, y: 40 } },
    { siteId: "a1", position: { x: 40, y: 101 } },
  ]) {
    const changes: LayoutChange[] =
      invalid.siteId === "a1"
        ? [invalid]
        : [{ siteId: "a1", position: { x: 30, y: 30 } }, invalid];
    assert.throws(() => saveAreaLayout(s, "가", changes));
    assert.equal(JSON.stringify(s), before);
  }
  assert.throws(
    () => saveAreaLayout(s, "가", [{ siteId: "a1" }, { siteId: "a1" }]),
    /중복/,
  );
});

test("동을 바꾸면 동별 위치를 다시 지정하고 원래 손님의 배정 연결은 유지", () => {
  const s = fixture();
  saveAreaLayout(s, "가", [{ siteId: "a1", position: { x: 35, y: 55 } }]);
  saveSite(s, { ...s.sites[0], area: "나" });
  assert.equal(s.sites[0].layout, undefined);
  assert.equal(s.sites[0].x, 10);
  assert.equal(s.allocations[0].siteId, "a1");
  validateState(s);
});

test("예전 백업은 그대로 읽고 손상된 동별 위치는 거절", () => {
  const s = fixture();
  validateState(JSON.parse(JSON.stringify(s)));
  for (const layout of [
    null,
    {},
    { x: 10 },
    { x: "10", y: 10 },
    { x: 200, y: 10 },
  ]) {
    const corrupted = JSON.parse(JSON.stringify(s));
    corrupted.sites[0].layout = layout;
    assert.throws(() => validateState(corrupted), /자리 정보/);
  }
});

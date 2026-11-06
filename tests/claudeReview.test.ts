import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DATA_LIMIT,
  addBlock,
  addDays,
  addReservation,
  allocationIndex,
  assign,
  assignWaitingRoom,
  checkInAssigned,
  currentAllocation,
  emptyState,
  finish,
  importRows,
  latestAllocation,
  mondayOfWeek,
  releaseWaitingRoom,
  resolveChange,
  saveAreaLayout,
  saveFacilityLayout,
  saveSite,
  scheduleMove,
  storageNotice,
  sweep,
  update,
  validDate,
  validateState,
  type ImportRow,
  type State,
} from "../src/domain";
import { applySopungPlan, sopungInitialState } from "../src/sitePlan";
const require = createRequire(import.meta.url);
const { Repository } = require("../electron/repository.cjs");

// 화면의 mutate와 같은 순서: 자동 퇴실 → 조작 → 자동 퇴실 → 전체 검증
function mutate(s: State, op: (draft: State) => void, now: string) {
  const next = update(s, (draft) => {
    sweep(draft, now);
    op(draft);
    sweep(draft, now);
  });
  validateState(next);
  return next;
}
const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  source: "캠핏",
  externalId: "C-1",
  unit: "1",
  name: "카라반 손님",
  phone: "010-1111-2222",
  arrival: "2026-10-20",
  departure: "2026-10-22",
  kind: "caravan",
  people: 2,
  cancelled: false,
  siteLabel: "카라반 5",
  ...overrides,
});
const siteId = (s: State, label: string) =>
  s.sites.find((x) => x.label === label)!.id;
const labelOf = (s: State, id: string) =>
  s.sites.find((x) => x.id === currentAllocation(s, id)?.siteId)?.label;

test("입실 전 지정 객실을 바꾼 뒤 기존 객실 정비와 원본 날짜 변경을 반영하고 재가져오기로 되돌리지 않음", () => {
  const now = "2026-10-15T10:00:00";
  let s = mutate(
    sopungInitialState(),
    (d) =>
      importRows(d, [
        row({ externalId: "A", name: "A손님" }),
        row({
          externalId: "B",
          name: "B손님",
          arrival: "2026-10-22",
          departure: "2026-10-24",
        }),
      ]),
    now,
  );
  // 원본이 A손님 퇴실을 하루 늘림 → 카라반 5에서는 B손님과 겹쳐 반영할 수 없음
  s = mutate(
    s,
    (d) =>
      importRows(d, [
        row({ externalId: "A", name: "A손님", departure: "2026-10-23" }),
      ]),
    now,
  );
  const a = s.reservations.find((r) => r.externalId === "A")!;
  const change = s.changes.find((c) => c.reservationId === a.id)!;
  assert.throws(
    () => mutate(s, (d) => resolveChange(d, change.id, true, now), now),
    /B손님/,
  );
  s = mutate(
    s,
    (d) => assignWaitingRoom(d, a.id, siteId(d, "카라반 6"), now),
    now,
  );
  const moved = s.reservations.find((r) => r.id === a.id)!;
  assert.equal(moved.status, "waiting");
  assert.deepEqual(
    [moved.externalId, moved.arrival, moved.departure],
    ["A", "2026-10-20", "2026-10-22"],
  );
  assert.equal(labelOf(s, a.id), "카라반 6");
  assert.deepEqual(
    s.allocations
      .filter((x) => x.reservationId === a.id)
      .map((x) => [x.start, x.end, x.state]),
    [["2026-10-20T14:00:00", "2026-10-22T11:00:00", "active"]],
  );
  assert.equal(s.changes.filter((c) => c.reservationId === a.id).length, 1);
  // 비운 카라반 5에 B손님 전까지 정비 등록, 이어서 원본 날짜 변경 반영
  s = mutate(
    s,
    (d) =>
      addBlock(d, {
        siteId: siteId(d, "카라반 5"),
        type: "disabled",
        name: "에어컨 정비",
        phone: "",
        start: "2026-10-19T00:00:00",
        end: "2026-10-22T11:00:00",
        note: "",
      }),
    now,
  );
  s = mutate(s, (d) => resolveChange(d, change.id, true, now), now);
  assert.equal(currentAllocation(s, a.id)!.end, "2026-10-23T11:00:00");
  assert.equal(labelOf(s, a.id), "카라반 6");
  // 같은 원본을 다시 가져와도 운영자가 바꾼 객실을 원본 객실로 되돌리지 않음
  s = mutate(
    s,
    (d) =>
      importRows(d, [
        row({ externalId: "A", name: "A손님", departure: "2026-10-23" }),
      ]),
    now,
  );
  assert.equal(labelOf(s, a.id), "카라반 6");
  assert.equal(s.changes.length, 0);
});

test("입실 전 객실 변경은 같은 유형·사용 가능한 객실·전체 기간 겹침을 검사하고 실패하면 그대로 둠", () => {
  const now = "2026-10-15T10:00:00";
  let s = mutate(
    sopungInitialState(),
    (d) => {
      importRows(d, [
        row({ externalId: "A" }),
        row({
          externalId: "B",
          name: "B손님",
          arrival: "2026-10-21",
          departure: "2026-10-23",
          siteLabel: "카라반 7",
        }),
      ]);
      saveSite(d, {
        ...d.sites.find((x) => x.label === "카라반 8")!,
        archived: true,
      });
    },
    now,
  );
  const a = s.reservations.find((r) => r.externalId === "A")!;
  const before = JSON.stringify(s);
  for (const [label, message] of [
    ["가1", /같은, 사용 중인 객실/],
    ["카라반 8", /같은, 사용 중인 객실/],
    ["카라반 7", /B손님/],
    ["카라반 5", /다른 객실/],
  ] as const)
    assert.throws(
      () =>
        mutate(
          s,
          (d) => assignWaitingRoom(d, a.id, siteId(d, label), now),
          now,
        ),
      message,
    );
  assert.equal(JSON.stringify(s), before);
  // 오토캠핑 예약과 이미 입실한 손님은 기존 현장 배정·이동 규칙을 그대로 사용
  s = mutate(
    s,
    (d) => {
      addReservation(d, {
        name: "오토 손님",
        phone: "",
        arrival: "2026-10-15",
        departure: "2026-10-16",
        kind: "auto",
        source: "전화",
        people: 2,
        vehicle: "",
        note: "",
        fee: 0,
        paid: false,
      });
      importRows(d, [
        row({
          externalId: "C",
          name: "입실 손님",
          arrival: "2026-10-15",
          departure: "2026-10-16",
          siteLabel: "카라반 9",
        }),
      ]);
      checkInAssigned(
        d,
        d.reservations.find((r) => r.externalId === "C")!.id,
        now,
      );
    },
    now,
  );
  for (const name of ["오토 손님", "입실 손님"]) {
    const id = s.reservations.find((r) => r.name === name)!.id;
    assert.throws(
      () =>
        mutate(
          s,
          (d) => assignWaitingRoom(d, id, siteId(d, "카라반 10"), now),
          now,
        ),
      /입실 전 카라반·방갈로/,
    );
  }
});

test("배정 해제 후 입실 없이 다시 지정하고 재가져오기는 해제한 배정을 되살리지 않음", () => {
  const now = "2026-10-15T10:00:00";
  let s = mutate(sopungInitialState(), (d) => importRows(d, [row()]), now);
  const id = s.reservations[0].id;
  s = mutate(s, (d) => releaseWaitingRoom(d, id, now), now);
  assert.equal(currentAllocation(s, id), undefined);
  assert.equal(s.allocations.length, 0);
  assert.equal(s.reservations[0].status, "waiting");
  assert.throws(
    () => mutate(s, (d) => releaseWaitingRoom(d, id, now), now),
    /해제할 객실 배정이 없어요/,
  );
  s = mutate(s, (d) => importRows(d, [row()]), now);
  assert.equal(currentAllocation(s, id), undefined);
  s = mutate(
    s,
    (d) => assignWaitingRoom(d, id, siteId(d, "카라반 7"), now),
    now,
  );
  assert.equal(labelOf(s, id), "카라반 7");
  assert.equal(s.reservations[0].status, "waiting");
});

test("입실일이 지난 입실 전 예약은 지난 보류를 이력으로 남기고 날짜 변경 반영에서도 겹치지 않음", () => {
  const now = "2026-10-15T10:00:00";
  let s = mutate(
    sopungInitialState(),
    (d) =>
      importRows(d, [row({ arrival: "2026-10-14", departure: "2026-10-16" })]),
    now,
  );
  const id = s.reservations[0].id;
  s = mutate(
    s,
    (d) => assignWaitingRoom(d, id, siteId(d, "카라반 6"), now),
    now,
  );
  assert.deepEqual(
    s.allocations.map((x) => [x.start, x.end, x.state]),
    [
      ["2026-10-14T14:00:00", now, "ended"],
      [now, "2026-10-16T11:00:00", "active"],
    ],
  );
  s = mutate(
    s,
    (d) =>
      importRows(d, [row({ arrival: "2026-10-14", departure: "2026-10-17" })]),
    now,
  );
  s = mutate(s, (d) => resolveChange(d, d.changes[0].id, true, now), now);
  assert.deepEqual(
    [currentAllocation(s, id)!.start, currentAllocation(s, id)!.end],
    [now, "2026-10-17T11:00:00"],
  );
});

test("이동 후 원본 퇴실일 단축은 원인을 안내하고 상태를 유지하며 자동 퇴실하지 않음", () => {
  let s = sopungInitialState();
  let now = "2026-10-08T15:00:00";
  s = mutate(
    s,
    (d) =>
      importRows(d, [
        row({
          externalId: "M-1",
          kind: "auto",
          siteLabel: "",
          arrival: "2026-10-08",
          departure: "2026-10-10",
        }),
      ]),
    now,
  );
  const id = s.reservations[0].id;
  s = mutate(s, (d) => assign(d, id, siteId(d, "가1"), true, now), now);
  now = "2026-10-09T15:00:00";
  s = mutate(
    s,
    (d) => scheduleMove(d, id, siteId(d, "가2"), now, true, now),
    now,
  );
  now = "2026-10-09T16:00:00";
  s = mutate(
    s,
    (d) =>
      importRows(d, [
        row({
          externalId: "M-1",
          kind: "auto",
          siteLabel: "",
          arrival: "2026-10-08",
          departure: "2026-10-09",
        }),
      ]),
    now,
  );
  const before = JSON.stringify(s);
  assert.throws(
    () => mutate(s, (d) => resolveChange(d, d.changes[0].id, true, now), now),
    /10\.9 11:00.*이용 시작\(10\.9 15:00\)/,
  );
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.reservations[0].status, "checkedIn");

  // 이동하지 않은 입실 손님도 이미 지난 퇴실 시각으로는 반영하지 않음
  let t = sopungInitialState();
  now = "2026-10-08T15:00:00";
  t = mutate(
    t,
    (d) =>
      importRows(d, [
        row({
          kind: "auto",
          siteLabel: "",
          arrival: "2026-10-08",
          departure: "2026-10-11",
        }),
      ]),
    now,
  );
  const guest = t.reservations[0].id;
  t = mutate(t, (d) => assign(d, guest, siteId(d, "나1"), true, now), now);
  now = "2026-10-09T12:00:00";
  t = mutate(
    t,
    (d) =>
      importRows(d, [
        row({
          kind: "auto",
          siteLabel: "",
          arrival: "2026-10-08",
          departure: "2026-10-09",
        }),
      ]),
    now,
  );
  assert.throws(
    () => mutate(t, (d) => resolveChange(d, d.changes[0].id, true, now), now),
    /이미 지나 반영하면 바로 자동 퇴실/,
  );
  // 앞으로의 퇴실일 단축은 그대로 반영
  t = mutate(
    t,
    (d) =>
      importRows(d, [
        row({
          kind: "auto",
          siteLabel: "",
          arrival: "2026-10-08",
          departure: "2026-10-10",
        }),
      ]),
    now,
  );
  t = mutate(t, (d) => resolveChange(d, d.changes[0].id, true, now), now);
  assert.equal(currentAllocation(t, guest)!.end, "2026-10-10T11:00:00");
  assert.equal(t.reservations[0].status, "checkedIn");
});

test("잘못된 날짜나 네 자리 연도를 벗어난 날짜 계산은 예외 없이 유효한 날짜만 만든다", () => {
  assert.equal(addDays("2026-10-08", 1), "2026-10-09");
  assert.equal(mondayOfWeek("2026-10-08"), "2026-10-05");
  for (const day of ["20266-10-08", "2026-13-40", "", "abc"]) {
    assert.equal(addDays(day, 1), day);
    assert.equal(mondayOfWeek(day), day);
  }
  assert.equal(addDays("9999-12-31", 1), "9999-12-31");
  assert.equal(addDays("0000-01-01", -1), "0000-01-01");
  for (let i = -3; i <= 3; i++) assert.ok(validDate(addDays("9999-12-30", i)));
});

test("도면 재적용은 편집한 사이트·시설 위치와 크기를 보존하고 빠진 위치만 채움", () => {
  const s = sopungInitialState();
  const ga1 = siteId(s, "가1"),
    ga2 = siteId(s, "가2"),
    ga3 = siteId(s, "가3");
  const store = s.facilities!.find((f) => f.id === "sopung-facility-ga-store")!;
  const trampoline = s.facilities!.find(
    (f) => f.id === "sopung-facility-ra-trampoline",
  )!;
  const defaultLayout = { ...s.sites.find((x) => x.id === ga2)!.layout! };
  saveAreaLayout(s, "가", [
    { siteId: ga1, position: { x: 12.3, y: 45.6 } },
    { siteId: ga2 },
  ]);
  saveFacilityLayout(s, "가", [
    { id: store.id, position: { x: 33.3, y: 22.2 } },
  ]);
  store.width = 30;
  store.height = 12;
  delete trampoline.location;
  saveSite(s, { ...s.sites.find((x) => x.id === ga3)!, archived: true });
  Object.assign(
    s.sites.find((x) => x.id === ga1)!,
    { x: 41, y: 42 },
  );
  s.sitePlan = "sopung-user-plan-2099-01-01";
  const activity = s.activity.length;
  applySopungPlan(s);
  validateState(s);
  const find = (id: string) => s.sites.find((x) => x.id === id)!;
  assert.deepEqual(find(ga1).layout, { x: 12.3, y: 45.6 });
  assert.deepEqual([find(ga1).x, find(ga1).y], [41, 42]);
  assert.deepEqual(find(ga2).layout, defaultLayout);
  assert.equal(find(ga3).archived, true);
  assert.equal(s.sites.length, 140);
  assert.equal(s.facilities!.length, 15);
  const kept = s.facilities!.find((f) => f.id === store.id)!;
  assert.deepEqual(
    [kept.layout, kept.width, kept.height],
    [{ x: 33.3, y: 22.2 }, 30, 12],
  );
  assert.equal(
    s.facilities!.find((f) => f.id === trampoline.id)!.location,
    "approach",
  );
  assert.equal(s.activity.length, activity + 1);
});

test("도면 재적용은 공식 자리의 동 이동·이름·유형 편집과 그 동의 위치를 유지하고 수동 자리는 도면 유형으로 맞춤", () => {
  const s = sopungInitialState();
  const ga1 = siteId(s, "가1"),
    ga4 = siteId(s, "가4"),
    c7 = siteId(s, "카라반 7");
  const site = (id: string) => s.sites.find((x) => x.id === id)!;
  // 가1을 나동 ‘나28’로 옮겨 위치를 잡고, 가4는 다동으로 옮기기만 함
  saveSite(s, { ...site(ga1), area: "나", label: "나28" });
  saveAreaLayout(s, "나", [{ siteId: ga1, position: { x: 12.3, y: 45.6 } }]);
  saveSite(s, { ...site(ga4), area: "다" });
  saveSite(s, { ...site(c7), detail: "골든 리모델링" });
  // 이름으로만 일치하는 예전 수동 자리는 도면의 유형으로 갱신
  s.sites = s.sites.filter((x) => x.id !== "sopung-ra-1");
  saveSite(s, {
    id: "manual-ra1",
    label: "라1",
    area: "라",
    kind: "auto",
    archived: false,
  });
  s.sitePlan = undefined;
  applySopungPlan(s);
  validateState(s);
  assert.deepEqual(
    [site(ga1).area, site(ga1).label, site(ga1).layout],
    ["나", "나28", { x: 12.3, y: 45.6 }],
  );
  assert.deepEqual([site(ga4).area, site(ga4).layout], ["다", undefined]);
  assert.equal(site(c7).detail, "골든 리모델링");
  assert.deepEqual(
    [site("manual-ra1").kind, site("manual-ra1").label],
    ["glamping", "라1"],
  );
  assert.equal(s.sites.filter((x) => x.label === "가1").length, 0);
});

test("같은 이름의 폴더·손상 파일을 일일 백업 성공으로 기록하거나 덮어쓰지 않음", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-claude-backup-"));
  const stamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  try {
    for (const kind of ["folder", "damaged", "valid"] as const) {
      const backups = path.join(directory, `${kind}-backups`);
      const daily = path.join(backups, `sopung-${stamp}.json`);
      mkdirSync(backups);
      if (kind === "folder") mkdirSync(daily);
      if (kind === "damaged") writeFileSync(daily, "{손상");
      if (kind === "valid") writeFileSync(daily, JSON.stringify(emptyState()));
      const repo = new Repository(
        path.join(directory, `${kind}-data`),
        backups,
      );
      const result = repo.save(sopungInitialState());
      if (kind === "valid") {
        assert.equal(result.backupError, "");
        assert.equal(repo.config.lastBackup, stamp);
        assert.equal(readFileSync(daily, "utf8"), JSON.stringify(emptyState()));
        continue;
      }
      assert.match(
        result.backupError,
        kind === "folder"
          ? /같은 이름의 폴더/
          : /읽을 수 없어 덮어쓰지 않았어요/,
      );
      assert.equal(repo.config.lastBackup, undefined);
      assert.throws(() => repo.dailyBackup());
      if (kind === "folder") assert.ok(statSync(daily).isDirectory());
      else assert.equal(readFileSync(daily, "utf8"), "{손상");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("백업 폴더 변경은 새 폴더의 첫 백업 확인과 설정 저장이 모두 성공할 때만 적용", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-claude-path-"));
  const stamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  try {
    const original = path.join(directory, "original");
    const repo = new Repository(path.join(directory, "data"), original);
    repo.save(sopungInitialState());
    const preferences = readFileSync(repo.configFile, "utf8");
    for (const kind of ["folder", "damaged"] as const) {
      const target = path.join(directory, kind);
      mkdirSync(target);
      const daily = path.join(target, `sopung-${stamp}.json`);
      if (kind === "folder") mkdirSync(daily);
      else writeFileSync(daily, "{손상");
      assert.throws(() => repo.setBackupPath(target));
      assert.equal(repo.backupPath, original);
      assert.equal(readFileSync(repo.configFile, "utf8"), preferences);
    }
    const target = path.join(directory, "next");
    mkdirSync(target);
    repo.setBackupPath(target);
    const saved = JSON.parse(readFileSync(repo.configFile, "utf8"));
    assert.deepEqual(
      [repo.backupPath, saved.backupPath, saved.lastBackup],
      [target, target, stamp],
    );
    assert.deepEqual(
      JSON.parse(
        readFileSync(path.join(target, `sopung-${stamp}.json`), "utf8"),
      ),
      repo.load(),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("오늘 퇴실한 자리에 현재 시각부터 사용중지를 등록하고 실제 이용 시간과 겹치면 거절", () => {
  let s = sopungInitialState();
  let now = "2026-10-07T15:00:00";
  s = mutate(
    s,
    (d) => {
      const r = addReservation(d, {
        name: "전날 손님",
        phone: "",
        arrival: "2026-10-07",
        departure: "2026-10-08",
        kind: "auto",
        source: "전화",
        people: 2,
        vehicle: "",
        note: "",
        fee: 0,
        paid: false,
      });
      assign(d, r.id, siteId(d, "나1"), true, now);
    },
    now,
  );
  now = "2026-10-08T13:00:00";
  const block = (start: string) => (d: State) =>
    addBlock(d, {
      siteId: siteId(d, "나1"),
      type: "disabled",
      name: "배수 공사",
      phone: "",
      start,
      end: "2026-10-10T11:00:00",
      note: "",
    });
  assert.throws(
    () => mutate(s, block("2026-10-08T09:00:00"), now),
    /전날 손님 님의 이용 기간/,
  );
  s = mutate(s, block("2026-10-08T13:00:00"), now);
  assert.equal(s.blocks[0].start, "2026-10-08T13:00:00");
});

test("예약 명단 배정 인덱스는 예약별 현재·마지막 배정과 같은 결과", () => {
  let s = sopungInitialState();
  const autos = s.sites.filter((x) => x.kind === "auto").map((x) => x.id);
  let day = "2026-07-01";
  for (let i = 0; i < 60; i++, day = addDays(day, 1)) {
    const now = `${day}T15:00:00`;
    s = update(s, (d) => {
      sweep(d, now);
      const r = addReservation(d, {
        name: `손님${i}`,
        phone: "",
        arrival: day,
        departure: addDays(day, 2),
        kind: "auto",
        source: "전화",
        people: 2,
        vehicle: "",
        note: "",
        fee: 0,
        paid: false,
      });
      assign(d, r.id, autos[i % 20], true, now);
      if (i % 3 === 0)
        scheduleMove(d, r.id, autos[20 + (i % 20)], now, true, now);
      if (i % 4 === 1)
        scheduleMove(
          d,
          r.id,
          autos[40 + (i % 20)],
          `${addDays(day, 1)}T14:00:00`,
          false,
          now,
        );
      if (i % 5 === 2) finish(d, r.id, "checkedOut", now);
    });
  }
  validateState(s);
  const index = allocationIndex(s);
  for (const r of s.reservations) {
    assert.equal(index.get(r.id)?.current?.id, currentAllocation(s, r.id)?.id);
    assert.equal(index.get(r.id)?.latest?.id, latestAllocation(s, r.id)?.id);
  }
});

test("저장 용량은 실제 파일 크기로 알리고 16MB의 75%부터 계속 안내하며 한도를 넘으면 기존 파일을 유지", () => {
  assert.equal(storageNotice(0), "");
  assert.equal(storageNotice(DATA_LIMIT * 0.74), "");
  assert.match(
    storageNotice(DATA_LIMIT * 0.75),
    /12\.0MB.*16\.0MB의 75%.*지우지 않았어요/,
  );
  assert.match(storageNotice(DATA_LIMIT * 0.95), /95%/);
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-claude-size-"));
  try {
    const repo = new Repository(
      path.join(directory, "data"),
      path.join(directory, "backups"),
    );
    assert.equal(repo.dataBytes(), 0);
    const s = sopungInitialState();
    const result = repo.save(s);
    assert.equal(result.bytes, statSync(repo.file).size);
    assert.equal(repo.dataBytes(), result.bytes);
    const saved = readFileSync(repo.file, "utf8");
    const big = update(s, (d) => {
      d.settings.aerial = `data:image/png;base64,${"A".repeat(DATA_LIMIT)}`;
    });
    assert.throws(
      () => repo.save(big),
      /너무 커요\. 16\.\dMB로 한도 16MB를 넘어/,
    );
    assert.equal(readFileSync(repo.file, "utf8"), saved);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("같은 예약번호에 새 단위번호가 들어오면 확인 경고만 남기고 합치거나 취소하지 않음", () => {
  const now = "2026-10-08T10:00:00";
  const unit = (n: string) =>
    row({ externalId: "R-77", unit: n, kind: "auto", siteLabel: "" });
  let s = sopungInitialState();
  let result: ReturnType<typeof importRows> | null = null;
  s = mutate(s, (d) => (result = importRows(d, [unit("1"), unit("2")])), now);
  assert.deepEqual(result!.warnings, []);
  s = mutate(s, (d) => (result = importRows(d, [unit("선착순03")])), now);
  assert.equal(result!.added, 1);
  assert.match(
    result!.warnings.join(),
    /R-77에 기존 단위번호\(1, 2\)와 다른 단위번호 선착순03.*자동으로 합치거나 취소하지 않았어요/,
  );
  assert.deepEqual(
    s.reservations.map((r) => [r.unit, r.status]),
    [
      ["1", "waiting"],
      ["2", "waiting"],
      ["선착순03", "waiting"],
    ],
  );
  assert.equal(s.changes.length, 0);
});

test("지정 객실은 공백 차이만 맞춰 유일한 같은 유형 객실에 배치하고 미확인 표기는 추측하지 않음", () => {
  const now = "2026-10-08T10:00:00";
  let s = sopungInitialState();
  let result: ReturnType<typeof importRows> | null = null;
  s = mutate(
    s,
    (d) =>
      (result = importRows(d, [
        row({ externalId: "K-1", siteLabel: "카라반5" }),
        row({
          externalId: "K-2",
          siteLabel: "5호",
          arrival: "2026-10-25",
          departure: "2026-10-26",
        }),
      ])),
    now,
  );
  assert.equal(labelOf(s, s.reservations[0].id), "카라반 5");
  assert.equal(currentAllocation(s, s.reservations[1].id), undefined);
  assert.match(result!.warnings.join(), /5호을 찾지 못해/);
  // 공백만 다른 객실이 둘이면 어느 쪽에도 배치하지 않음
  s = mutate(
    s,
    (d) => {
      saveSite(d, {
        id: "extra-caravan",
        label: "카라반6 ",
        area: "B",
        kind: "caravan",
        archived: false,
      });
      result = importRows(d, [
        row({
          externalId: "K-3",
          siteLabel: "카라반  6",
          arrival: "2026-11-01",
          departure: "2026-11-02",
        }),
      ]);
    },
    now,
  );
  assert.equal(currentAllocation(s, s.reservations[2].id), undefined);
  assert.match(result!.warnings.join(), /여러 개라 미배정/);
});

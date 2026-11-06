import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  addBlock,
  addReservation,
  assign,
  completeMove,
  currentAllocation,
  dateLabel,
  emptyState,
  extendStay,
  finish,
  importRows,
  lateCheckout,
  resolveChange,
  saveSite,
  scheduleMove,
  siteStatus,
  sweep,
  update,
  validateState,
  weekdayLabel,
  mondayOfWeek,
  type ImportRow,
  type State,
} from "../src/domain";
import { guessMapping, mapRows, parseCSV } from "../src/importer";
const require = createRequire(import.meta.url);
const { Repository } = require("../electron/repository.cjs");
const now = "2026-09-28T15:00:00";
function fixture() {
  const s = emptyState();
  s.sites = ["가1", "나1", "다1"].map((label, i) => ({
    id: String(i),
    label,
    area: label[0],
    kind: "auto",
    archived: false,
  }));
  return s;
}
function guest(s: State, arrival = "2026-09-28", departure = "2026-09-30") {
  return addReservation(s, {
    name: "테스트 손님",
    phone: "010-0000-0000",
    arrival,
    departure,
    source: "전화",
    kind: "auto",
    vehicle: "",
    note: "",
    fee: 0,
    paid: false,
    people: 2,
  });
}
const imported = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  source: "캠핏",
  externalId: "R-123",
  unit: "1",
  name: "테스트 예약",
  phone: "010-0000-0000",
  arrival: "2026-09-28",
  departure: "2026-09-30",
  kind: "auto",
  people: 2,
  cancelled: false,
  siteLabel: "",
  ...overrides,
});

test("연박 마지막 날에 장박이 겹쳐도 배정 차단, 실패한 트랜잭션은 원본 보존", () => {
  const s = fixture(),
    r = guest(s);
  addBlock(s, {
    siteId: "0",
    type: "long",
    name: "장박자",
    phone: "",
    start: "2026-09-29T14:00:00",
    end: "2026-10-30T11:00:00",
    note: "",
  });
  assert.throws(
    () => update(s, (d) => assign(d, r.id, "0", true, now)),
    /장박/,
  );
  assert.equal(s.allocations.length, 0);
  assign(s, r.id, "1", true, now);
  assert.equal(r.status, "checkedIn");
});
test("같은 날 퇴실 후 다음 입실은 허용하고 겹치는 시간은 거절", () => {
  const s = fixture(),
    first = guest(s, "2026-09-27", "2026-09-28"),
    next = guest(s);
  assign(s, first.id, "0", false);
  assign(s, next.id, "0", true, now);
  assert.equal(s.allocations.length, 2);
  assert.throws(() => assign(s, guest(s).id, "0", true, now), /겹쳐/);
});
test("유형이 다른 자리에 배정하지 않음", () => {
  const s = fixture();
  s.sites[0].kind = "caravan";
  assert.throws(() => assign(s, guest(s).id, "0", true, now), /유형/);
});
test("장박과 사용중지는 기존 예약을 밀어내지 않음", () => {
  const s = fixture();
  assign(s, guest(s).id, "0", true, now);
  assert.throws(
    () =>
      addBlock(s, {
        siteId: "0",
        name: "정비",
        type: "disabled",
        phone: "",
        note: "",
        start: now,
        end: "2026-10-01T11:00:00",
      }),
    /겹쳐/,
  );
});
test("연박 중간 퇴실 없음, 마지막 날 11시 자동 종료와 기록 보존", () => {
  const s = fixture(),
    r = guest(s);
  assign(s, r.id, "0", true, now);
  sweep(s, "2026-09-29T11:00:00");
  assert.equal(r.status, "checkedIn");
  sweep(s, "2026-09-30T11:00:00");
  assert.equal(r.status, "checkedOut");
  assert.equal(s.allocations[0].state, "ended");
  assert.equal(
    siteStatus(s, "0", "2026-09-30", "2026-09-30T11:00:00").type,
    "empty",
  );
});
test("레이트 시각까지 점유 유지, 다음 예약 입실과 시간 경계 비교", () => {
  const s = fixture(),
    r = guest(s, "2026-09-27", "2026-09-28");
  assign(s, r.id, "0", true, "2026-09-27T15:00:00");
  assign(s, guest(s).id, "0", false);
  s.settings.lateTime = "13:00";
  s.settings.lateFee = 10000;
  lateCheckout(s, r.id, 12000);
  assert.equal(r.paid, false);
  assert.equal(r.fee, 12000);
  sweep(s, "2026-09-28T11:00:00");
  assert.equal(r.status, "checkedIn");
  sweep(s, "2026-09-28T13:00:00");
  assert.equal(r.status, "checkedOut");
  const t = fixture(),
    a = guest(t, "2026-09-27", "2026-09-28");
  assign(t, a.id, "0", true, "2026-09-27T15:00:00");
  assign(t, guest(t).id, "0", false);
  t.settings.lateTime = "15:00";
  t.settings.lateFee = 10000;
  assert.throws(() => update(t, (d) => lateCheckout(d, a.id, 10000)), /겹쳐/);
});
test("미설정 레이트 시각·금액을 추정하지 않음", () => {
  const s = fixture(),
    r = guest(s);
  assign(s, r.id, "0", true, now);
  assert.throws(() => lateCheckout(s, r.id, 10000), /설정/);
});
test("예정 이동은 출발지 유지, 목적지 확보, 사장님 완료 후 실제 이동", () => {
  const s = fixture(),
    r = guest(s);
  assign(s, r.id, "0", true, now);
  scheduleMove(s, r.id, "1", "2026-09-29T14:00:00", false, now);
  assert.equal(currentAllocation(s, r.id)?.siteId, "0");
  assert.equal(
    siteStatus(s, "0", "2026-09-29", "2026-09-29T15:00:00").type,
    "assigned",
  );
  assert.equal(
    siteStatus(s, "1", "2026-09-29", "2026-09-29T15:00:00").label,
    "이동 예정",
  );
  assert.throws(() => completeMove(s, r.id, now), /예정 시각/);
  completeMove(s, r.id, "2026-09-29T16:00:00");
  assert.equal(currentAllocation(s, r.id)?.siteId, "1");
  assert.equal(
    siteStatus(s, "0", "2026-09-29", "2026-09-29T16:00:00").type,
    "empty",
  );
});
test("조기 퇴실은 해당 손님의 남은 배정만 해제", () => {
  const s = fixture(),
    r = guest(s),
    other = guest(s, "2026-10-02", "2026-10-03");
  assign(s, r.id, "0", true, now);
  assign(s, other.id, "0", false);
  scheduleMove(s, r.id, "1", "2026-09-29T14:00:00", false, now);
  finish(s, r.id, "checkedOut", "2026-09-28T17:00:00");
  assert.equal(s.allocations.filter((a) => a.reservationId === r.id).length, 1);
  assert.equal(currentAllocation(s, other.id)?.siteId, "0");
  assert.equal(r.departure, "2026-09-30");
});
test("동일 파일 재가져오기·여러 자리 예약·현장 연장 보존", () => {
  const s = fixture();
  importRows(s, [imported(), imported({ unit: "2" })]);
  const r = s.reservations[0];
  r.note = "현장 메모";
  r.vehicle = "123가4567";
  extendStay(s, r.id, "2026-10-01", 5000);
  importRows(s, [imported(), imported({ unit: "2" })]);
  assert.equal(s.reservations.length, 2);
  assert.equal(r.departure, "2026-10-01");
  assert.equal(r.note, "현장 메모");
  assert.equal(r.vehicle, "123가4567");
  assert.equal(s.changes.length, 0);
});
test("외부 날짜 변경은 확인 전 유지, 겹치면 변경 전체 취소", () => {
  let s = fixture();
  importRows(s, [imported()]);
  const r = s.reservations[0];
  assign(s, r.id, "0", false);
  assign(s, guest(s, "2026-09-30", "2026-10-03").id, "0", false);
  importRows(s, [imported({ departure: "2026-10-02" })]);
  assert.equal(r.departure, "2026-09-30");
  assert.equal(s.changes.length, 1);
  assert.throws(
    () => update(s, (d) => resolveChange(d, s.changes[0].id, true, now)),
    /겹쳐/,
  );
  assert.equal(s.reservations[0].departure, "2026-09-30");
  s = update(s, (d) => resolveChange(d, d.changes[0].id, false, now));
  assert.equal(s.changes.length, 0);
});
test("취소 재수신은 확인 전 배정 유지, 확인 뒤 해제, 재가져오기로 복구하지 않음", () => {
  const s = fixture();
  importRows(s, [imported()]);
  const r = s.reservations[0];
  assign(s, r.id, "0", false);
  importRows(s, [imported({ cancelled: true })]);
  assert.ok(currentAllocation(s, r.id));
  assert.equal(r.status, "waiting");
  resolveChange(s, s.changes[0].id, true, now);
  assert.equal(r.status, "cancelled");
  assert.equal(currentAllocation(s, r.id), undefined);
  importRows(s, [imported()]);
  assert.equal(r.status, "cancelled");
});
test("누락된 예약 행은 취소하지 않으며 노쇼는 재가져오기로 부활하지 않음", () => {
  const s = fixture();
  importRows(s, [imported()]);
  const r = s.reservations[0];
  importRows(s, []);
  assert.equal(r.status, "waiting");
  finish(s, r.id, "noShow", now);
  importRows(s, [imported()]);
  assert.equal(r.status, "noShow");
});
test("원본 취소가 철회되면 오래된 취소 알림을 없애고 배정은 유지", () => {
  const s = fixture();
  importRows(s, [imported()]);
  const r = s.reservations[0];
  assign(s, r.id, "0", false);
  importRows(s, [imported({ cancelled: true })]);
  const oldChange = s.changes[0].id;
  importRows(s, [imported()]);
  assert.equal(s.changes.length, 0);
  assert.equal(r.status, "waiting");
  assert.equal(currentAllocation(s, r.id)?.siteId, "0");
  assert.throws(() => resolveChange(s, oldChange, true, now), /변경이 없어요/);
  importRows(s, [imported({ cancelled: true })]);
  assert.equal(s.changes[0].type, "cancel");
});
test("날짜 변경 철회와 취소 철회 후 새 날짜를 최신 원본에 맞춰 확인", () => {
  const s = fixture();
  importRows(s, [imported()]);
  importRows(s, [imported({ departure: "2026-10-02" })]);
  assert.equal(s.changes.length, 1);
  importRows(s, [imported()]);
  assert.equal(s.changes.length, 0);
  importRows(s, [imported({ cancelled: true, departure: "2026-10-03" })]);
  importRows(s, [imported({ departure: "2026-10-03" })]);
  assert.equal(s.changes.length, 1);
  assert.equal(s.changes[0].type, "dates");
  assert.equal(s.changes[0].departure, "2026-10-03");
  assert.equal(s.reservations[0].departure, "2026-09-30");
  resolveChange(s, s.changes[0].id, false, now);
  importRows(s, [imported({ departure: "2026-10-03" })]);
  assert.equal(s.changes.length, 0);
});
test("직접 노쇼·퇴실 처리한 예약에 실행할 수 없는 변경 알림을 남기지 않음", () => {
  const s = fixture();
  importRows(s, [imported()]);
  const r = s.reservations[0];
  importRows(s, [imported({ cancelled: true })]);
  finish(s, r.id, "noShow", now);
  assert.equal(s.changes.length, 0);
  importRows(s, [imported()]);
  assert.equal(r.status, "noShow");
});
test("월·연도·윤년 경계의 요일을 날짜에 맞춰 표시하고 빈 날짜는 안전하게 처리", () => {
  assert.equal(weekdayLabel("2026-09-28"), "월요일");
  assert.equal(weekdayLabel("2026-10-03"), "토요일");
  assert.equal(weekdayLabel("2026-10-04"), "일요일");
  assert.equal(weekdayLabel("2027-01-01"), "금요일");
  assert.equal(weekdayLabel("2028-02-29"), "화요일");
  assert.equal(dateLabel("2027-01-01"), "2027년 1월 1일 금요일");
  assert.equal(dateLabel(""), "");
  assert.equal(dateLabel("2026-02-29"), "");
  assert.equal(mondayOfWeek("2026-09-28"), "2026-09-28");
  assert.equal(mondayOfWeek("2026-10-04"), "2026-09-28");
  assert.equal(mondayOfWeek("2026-10-13"), "2026-10-12");
  assert.equal(mondayOfWeek("2027-01-01"), "2026-12-28");
});
test("CSV의 쉼표·줄바꿈·따옴표 처리, 헤더 연결과 날짜·중복 검증", () => {
  const rows = parseCSV(
    '\uFEFF예약번호,예약자 이름,입실일,퇴실일,숙박 유형\r\n123,"김,\n민준",2026-9-28,2026-09-30,오토캠핑',
  );
  assert.equal(rows[1][1], "김,\n민준");
  const result = mapRows(rows, guessMapping(rows[0]), "캠핏");
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].arrival, "2026-09-28");
  assert.ok(
    mapRows([...rows, rows[1]], guessMapping(rows[0]), "캠핏").errors.length,
  );
  assert.throws(() => parseCSV('a,"unterminated'), /따옴표/);
});
test("손상된 백업과 참조 누락 거절", () => {
  const s = fixture();
  validateState(s);
  assert.throws(() => validateState({ ...s, version: 2 }), /버전/);
  const r = guest(s);
  assign(s, r.id, "0", true, now);
  s.sites = [];
  assert.throws(() => validateState(s), /배정/);
});
test("디스크 저장·다시 열기·일일 백업, 손상 파일 보존", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-store-"));
  try {
    const repo = new Repository(
      path.join(directory, "data"),
      path.join(directory, "backups"),
    );
    const s = fixture();
    guest(s);
    repo.save(s);
    assert.deepEqual(repo.load(), s);
    assert.equal(readdirSync(path.join(directory, "backups")).length, 1);
    repo.save(s);
    assert.equal(readdirSync(path.join(directory, "backups")).length, 1);
    assert.ok(new Repository(repo.directory, repo.defaultBackupPath).load());
    repo.backup();
    assert.equal(readdirSync(path.join(directory, "backups")).length, 2);
    writeFileSync(repo.file, "damaged");
    assert.throws(() => repo.save(s));
    assert.equal(readFileSync(repo.file, "utf8"), "damaged");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("백업 실패는 저장 성공을 되돌린 것처럼 보고하지 않음", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-backup-error-"));
  try {
    const blocked = path.join(directory, "not-a-folder");
    writeFileSync(blocked, "x");
    const repo = new Repository(path.join(directory, "data"), blocked);
    const s = fixture();
    assert.ok(repo.save(s).backupError);
    assert.deepEqual(repo.load(), s);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("복원은 손상된 원본도 별도 보존하고 검증된 백업을 기록", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-restore-"));
  try {
    const repo = new Repository(
      path.join(directory, "data"),
      path.join(directory, "backups"),
    );
    const s = fixture();
    repo.save(s);
    writeFileSync(repo.file, "corrupted-original");
    repo.restore(s);
    assert.deepEqual(repo.load(), s);
    const old = readdirSync(repo.directory).find((name: string) =>
      name.startsWith("before-restore-"),
    );
    assert.ok(old);
    assert.equal(
      readFileSync(path.join(repo.directory, old), "utf8"),
      "corrupted-original",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("손상된 백업 설정은 예약 원본을 건드리지 않고 읽기 단계에서 거절", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-preferences-"));
  try {
    const dataDirectory = path.join(directory, "data");
    const repo = new Repository(dataDirectory, path.join(directory, "backups"));
    const s = fixture();
    guest(s);
    repo.save(s);
    writeFileSync(path.join(dataDirectory, "preferences.json"), "null");
    assert.throws(
      () => new Repository(dataDirectory, repo.defaultBackupPath),
      /백업 설정/,
    );
    assert.deepEqual(JSON.parse(readFileSync(repo.file, "utf8")), s);
    assert.equal(
      readFileSync(path.join(dataDirectory, "preferences.json"), "utf8"),
      "null",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

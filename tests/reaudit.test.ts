import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  addBlock,
  addReservation,
  assign,
  assignmentPeriod,
  checkInAssigned,
  conflict,
  emptyState,
  finish,
  latestAllocation,
  scheduleMove,
  siteStatus,
  sweep,
  update,
  validateState,
} from "../src/domain";
const require = createRequire(import.meta.url);
const { Repository, basicValidate } = require("../electron/repository.cjs");
const { readAuth } = require("../electron/auth.cjs");

function fixture() {
  const s = emptyState();
  s.sites = ["가1", "나1"].map((label, i) => ({
    id: String(i),
    label,
    area: label[0],
    kind: "auto",
    archived: false,
  }));
  const r = addReservation(s, {
    name: "검증 손님",
    phone: "",
    arrival: "2026-09-27",
    departure: "2026-09-28",
    kind: "auto",
    source: "전화",
    people: 2,
    vehicle: "",
    note: "",
    fee: 0,
    paid: false,
  });
  assign(s, r.id, "0", true, "2026-09-27T15:00:00");
  return { s, r };
}

test("오후 장박이 있어도 오전에는 현재 입실 손님을 표시", () => {
  const { s, r } = fixture();
  addBlock(s, {
    siteId: "0",
    type: "long",
    name: "오후 장박",
    phone: "",
    note: "",
    start: "2026-09-28T14:00:00",
    end: "2026-10-28T11:00:00",
  });
  const morning = siteStatus(s, "0", "2026-09-28", "2026-09-28T10:00:00");
  assert.equal(morning.type, "assigned");
  assert.equal(morning.name, r.name);
  assert.equal(
    siteStatus(s, "0", "2026-09-28", "2026-09-28T14:00:00").type,
    "long",
  );
});

test("입실과 같은 초에 즉시 이동해도 출발지의 유령 점유가 남지 않음", () => {
  const { s, r } = fixture();
  scheduleMove(s, r.id, "1", "", true, "2026-09-27T15:00:00");
  assert.equal(
    siteStatus(s, "0", "2026-09-27", "2026-09-27T14:00:00").type,
    "empty",
  );
  assert.equal(
    conflict(s, "0", "2026-09-27T14:00:00", "2026-09-28T11:00:00"),
    null,
  );
  finish(s, r.id, "checkedOut", "2026-09-27T18:00:00");
  assert.equal(latestAllocation(s, r.id)?.siteId, "1");
  validateState(s);
});

test("완료하지 않은 이동 예약은 자동 퇴실 후 실제 이용 이력으로 바뀌지 않음", () => {
  const { s, r } = fixture();
  scheduleMove(
    s,
    r.id,
    "1",
    "2026-09-27T17:00:00",
    false,
    "2026-09-27T16:00:00",
  );
  sweep(s, "2026-09-28T11:00:00");
  assert.equal(r.status, "checkedOut");
  assert.equal(latestAllocation(s, r.id)?.siteId, "0");
  assert.equal(
    siteStatus(s, "1", "2026-09-27", "2026-09-27T14:00:00").type,
    "empty",
  );
  validateState(s);
});

test("백업의 잘못된 시각과 숙박 유형·상태는 복원 전에 거절", () => {
  const { s } = fixture();
  for (const timestamp of [
    "2026-09-27",
    "2026-09-27T99:99:00",
    "2026-09-27T15:00:77",
  ]) {
    assert.throws(
      () =>
        validateState(
          update(s, (d) => {
            d.allocations[0].start = timestamp;
          }),
        ),
      /배정/,
    );
  }
  for (const field of ["kind", "status"] as const) {
    const broken = JSON.parse(JSON.stringify(s));
    broken.reservations[0][field] = "toString";
    assert.throws(() => validateState(broken), /예약/);
  }
});

test("백업에 겹치는 배정·장박 또는 한 손님의 이중 배정이 있으면 거절", () => {
  const { s, r } = fixture();
  const duplicate = update(s, (d) => {
    d.allocations.push({ ...d.allocations[0], id: "duplicate", siteId: "1" });
  });
  assert.throws(() => validateState(duplicate), /배정/);
  const blocked = update(s, (d) => {
    d.blocks.push({
      id: "overlap",
      siteId: "0",
      type: "disabled",
      name: "정비",
      phone: "",
      note: "",
      start: "2026-09-27T18:00:00",
      end: "2026-09-28T10:00:00",
    });
  });
  assert.throws(() => validateState(blocked), /겹/);
  const validMove = update(s, (d) =>
    scheduleMove(
      d,
      r.id,
      "1",
      "2026-09-27T18:00:00",
      false,
      "2026-09-27T16:00:00",
    ),
  );
  validateState(validMove);
});

test("같은 날 이동을 여러 번 해도 이용 순서와 시간 경계는 보존", () => {
  const { s, r } = fixture();
  scheduleMove(s, r.id, "1", "", true, "2026-09-27T16:00:00");
  scheduleMove(s, r.id, "0", "", true, "2026-09-27T18:00:00");
  validateState(s);
  assert.equal(
    siteStatus(s, "0", "2026-09-27", "2026-09-27T15:30:00").name,
    r.name,
  );
  assert.equal(
    siteStatus(s, "1", "2026-09-27", "2026-09-27T17:00:00").name,
    r.name,
  );
  assert.equal(
    siteStatus(s, "1", "2026-09-27", "2026-09-27T18:00:00").type,
    "empty",
  );
  finish(s, r.id, "checkedOut", "2026-09-27T20:00:00");
  assert.equal(latestAllocation(s, r.id)?.siteId, "0");
  validateState(s);
});

test("손상된 잠금 파일은 초기 설정으로 오인하거나 덮어쓰지 않음", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-auth-review-"));
  const file = path.join(directory, "lock.json");
  try {
    assert.equal(readAuth(file), null);
    for (const value of [
      null,
      {},
      [],
      { mode: "pin", salt: "bad", hash: "bad" },
    ]) {
      const contents = JSON.stringify(value);
      writeFileSync(file, contents);
      assert.throws(() => readAuth(file), /잠금/);
      assert.equal(readFileSync(file, "utf8"), contents);
    }
    const valid = {
      mode: "password",
      salt: "a".repeat(48),
      hash: "b".repeat(64),
    };
    writeFileSync(file, JSON.stringify(valid));
    assert.deepEqual(readAuth(file), valid);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("백업 경로 저장 실패 시 실행 중 경로와 디스크 설정 모두 기존 값 유지", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-path-review-"));
  try {
    const original = path.join(directory, "original"),
      target = path.join(directory, "target");
    mkdirSync(target);
    const repo = new Repository(path.join(directory, "data"), original);
    repo.save(emptyState());
    const preferences = readFileSync(repo.configFile, "utf8");
    repo.saveConfig = () => {
      throw new Error("검증용 설정 저장 실패");
    };
    assert.throws(() => repo.setBackupPath(target), /저장 실패/);
    assert.equal(repo.backupPath, original);
    assert.equal(readFileSync(repo.configFile, "utf8"), preferences);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("직접 배정과 지정 객실 모두 입실일 당일 14시 전 입실 허용", () => {
  for (const time of ["00:00:00", "09:00:00", "13:59:59"]) {
    for (const preassigned of [false, true]) {
      const { s, r } = fixture();
      r.status = "waiting";
      s.allocations = [];
      const now = `2026-09-27T${time}`;
      assert.equal(assignmentPeriod(r, now).start, now);
      if (preassigned) {
        assign(s, r.id, "0", false);
        checkInAssigned(s, r.id, now);
      } else assign(s, r.id, "0", true, now);
      assert.equal(r.status, "checkedIn");
      assert.equal(s.allocations[0].start, now);
      assert.equal(s.allocations[0].end, "2026-09-28T11:00:00");
      assert.equal(r.fee, 0);
      validateState(s);
    }
  }
});

test("조기 입실을 허용해도 입실일 전날과 퇴실 시각 이후는 차단", () => {
  const { s, r } = fixture();
  r.status = "waiting";
  s.allocations = [];
  assert.throws(
    () => assign(s, r.id, "0", true, "2026-09-26T23:59:59"),
    /입실일 당일/,
  );
  assert.throws(
    () => assign(s, r.id, "0", true, "2026-09-28T11:00:00"),
    /퇴실 시각/,
  );
  assert.equal(r.status, "waiting");
  assert.equal(s.allocations.length, 0);
  assign(s, r.id, "0", false);
  assert.throws(
    () => checkInAssigned(s, r.id, "2026-09-26T23:59:59"),
    /입실일 당일/,
  );
  assert.throws(
    () => checkInAssigned(s, r.id, "2026-09-28T11:00:00"),
    /퇴실 시각/,
  );
  checkInAssigned(s, r.id, "2026-09-27T09:00:00");
  assert.equal(r.status, "checkedIn");
  validateState(s);
});

test("조기 입실은 오전에 아직 이용 중인 손님·장박·사용중지와 겹치면 차단", () => {
  for (const occupancy of ["guest", "long", "disabled"] as const) {
    for (const preassigned of [false, true]) {
      const { s, r } = fixture();
      r.status = "waiting";
      s.allocations = [];
      if (occupancy === "guest") {
        const previous = addReservation(s, {
          ...r,
          name: "이전 손님",
          arrival: "2026-09-26",
          departure: "2026-09-27",
        });
        assign(s, previous.id, "0", true, "2026-09-26T15:00:00");
      } else
        addBlock(s, {
          siteId: "0",
          type: occupancy,
          name: "오전 이용",
          phone: "",
          note: "",
          start: "2026-09-26T14:00:00",
          end: "2026-09-27T11:00:00",
        });
      if (preassigned) assign(s, r.id, "0", false);
      const original = JSON.stringify(s);
      const checkIn = (now: string) =>
        preassigned
          ? checkInAssigned(s, r.id, now)
          : assign(s, r.id, "0", true, now);
      assert.throws(() => checkIn("2026-09-27T09:00:00"), /겹쳐/);
      assert.equal(JSON.stringify(s), original);
      checkIn("2026-09-27T11:00:00");
      assert.equal(r.status, "checkedIn");
      validateState(s);
    }
  }
});

test("한글이 많은 저장 파일도 복원과 같은 16MB 바이트 제한 적용", () => {
  const s = emptyState();
  s.activity.push({
    id: "large",
    at: "2026-09-28T15:00:00",
    text: "가".repeat(6 * 1024 * 1024),
  });
  assert.ok(JSON.stringify(s).length < 16 * 1024 * 1024);
  assert.throws(() => basicValidate(s), /너무 커요/);
});

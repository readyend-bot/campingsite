import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  addReservation,
  assign,
  emptyState,
  replaceState,
  scheduleMove,
  update,
  validateState,
} from "../src/domain";
import { guessMapping, mapRows, readTable } from "../src/importer";
import { prepareCamfitProfile, previewCamfit } from "../src/camfitSync";

const require = createRequire(import.meta.url);
const { Repository } = require("../electron/repository.cjs");
const { validProfile } = require("../electron/camfit-sync.cjs");
const headers = [
  "예약번호",
  "단위번호",
  "예약자 이름",
  "연락처",
  "입실일",
  "퇴실일",
  "숙박 유형",
  "인원",
  "예약 상태",
  "지정 객실",
];
const row = [
  "FINAL-1",
  "1",
  "검토 손님",
  "010-0000-0000",
  "2027-01-01",
  "2027-01-03",
  "오토캠핑",
  "2",
  "예약",
  "",
];

test("수동 명단의 취소 완료를 취소로 읽고 알 수 없거나 빈 상태는 예약으로 추정하지 않음", () => {
  const mapping = guessMapping(headers);
  for (const status of ["취소 완료", "취소완료", "CANCELLED", "canceled"]) {
    const cells = [...row];
    cells[8] = status;
    const result = mapRows([headers, cells], mapping, "캠핏");
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows[0].cancelled, true);
  }
  for (const status of ["결제 대기", "취소 요청 중", ""]) {
    const cells = [...row];
    cells[8] = status;
    const result = mapRows([headers, cells], mapping, "캠핏");
    assert.match(result.errors.join(" "), /예약 상태/);
    assert.equal(result.rows.length, 0);
  }
  assert.deepEqual(
    mapRows([headers, row], { ...mapping, status: -1 }, "캠핏").errors,
    [],
  );
});

test("수동·캠핏 명단의 필수·선택 열 중복과 범위 밖 연결을 저장 전에 차단", () => {
  const table = [headers, row];
  const mapping = guessMapping(headers);
  const profile = prepareCamfitProfile(
    table,
    {
      fileName: "명단.csv",
      base64: "",
      route: "https://admin.camfit.co.kr/reservations",
      exportLabels: ["엑셀 다운로드"],
      clickedLabel: "엑셀 다운로드",
    },
    null,
  );
  for (const broken of [
    { ...mapping, phone: mapping.externalId },
    { ...mapping, externalId: headers.length },
    { ...mapping, people: -2 },
  ]) {
    assert.ok(mapRows(table, broken, "캠핏").errors.length);
    const config = { ...profile, mapping: broken };
    assert.ok(previewCamfit(table, config).errors.length);
    assert.equal(validProfile(config), false);
  }
});

test("CSV도 100열 제한을 적용하고 UTF-8이 아닌 파일은 깨진 이름으로 가져오지 않음", async () => {
  const wide = new File(
    [Array.from({ length: 101 }, (_, i) => `열${i}`).join(",")],
    "넓은.csv",
  );
  await assert.rejects(readTable(wide), /100열/);
  const invalidUTF8 = new File(
    [new Uint8Array([0xb0, 0xa1, 0x2c, 0xb3, 0xaa])],
    "구형인코딩.csv",
  );
  await assert.rejects(readTable(invalidUTF8), /UTF-8/);
});

function fixture() {
  const s = emptyState();
  s.sites = ["가1", "가2"].map((label, i) => ({
    id: String(i),
    label,
    area: "가",
    kind: "auto",
    archived: false,
  }));
  const r = addReservation(
    s,
    {
      name: "검토 손님",
      phone: "",
      arrival: "2027-01-01",
      departure: "2027-01-03",
      kind: "auto",
      source: "캠핏",
      people: 2,
      vehicle: "",
      note: "",
      fee: 0,
      paid: false,
    },
    "FINAL-1",
  );
  assign(s, r.id, "0", true, "2027-01-01T09:00:00");
  return { s, r };
}

test("전체 상태 교체는 선택 필드를 제거하고 원본 백업을 수정하지 않으며 손상 입력은 거절", () => {
  const { s } = fixture();
  s.sitePlan = "current";
  s.facilities = [];
  const backup = emptyState();
  replaceState(s, backup);
  assert.deepEqual(s, backup);
  s.settings.lateTime = "13:00";
  assert.equal(backup.settings.lateTime, "");
  const before = JSON.stringify(s);
  const broken = update(backup, (d) => {
    d.settings.lateTime = "99:99";
  });
  assert.throws(() => replaceState(s, broken), /설정/);
  assert.equal(JSON.stringify(s), before);
});

test("종료된 예약의 현재 배정·입실 손님의 배정 누락·잘못된 숙박 유형 백업을 거절", () => {
  const { s, r } = fixture();
  for (const status of ["cancelled", "noShow", "checkedOut"] as const) {
    assert.throws(
      () =>
        validateState(
          update(s, (d) => {
            d.reservations[0].status = status;
          }),
        ),
      /배정/,
    );
  }
  assert.throws(
    () =>
      validateState(
        update(s, (d) => {
          d.allocations = [];
        }),
      ),
    /배정/,
  );
  assert.throws(
    () =>
      validateState(
        update(s, (d) => {
          d.sites[0].kind = "caravan";
        }),
      ),
    /유형/,
  );
  const waiting = update(s, (d) => {
    scheduleMove(
      d,
      r.id,
      "1",
      "2027-01-02T14:00:00",
      false,
      "2027-01-01T10:00:00",
    );
    d.reservations[0].status = "waiting";
  });
  assert.throws(() => validateState(waiting), /이동/);
});

test("서로 다른 자리라도 한 손님의 실제 이용 이력이 겹치면 백업을 거절", () => {
  const { s } = fixture();
  s.allocations.push({
    ...s.allocations[0],
    id: "history",
    siteId: "1",
    state: "ended",
  });
  assert.throws(() => validateState(s), /이용.*겹/);
});

test("백업 파일 생성 후 설정 기록에 실패해도 재시도에서 백업 날짜를 디스크에 기록", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-final-backup-"));
  try {
    const repo = new Repository(
      path.join(directory, "data"),
      path.join(directory, "backups"),
    );
    const saveConfig = repo.saveConfig.bind(repo);
    repo.saveConfig = () => {
      throw new Error("검토용 설정 기록 실패");
    };
    assert.match(repo.save(emptyState()).backupError, /기록 실패/);
    repo.saveConfig = saveConfig;
    repo.dailyBackup();
    const config = JSON.parse(readFileSync(repo.configFile, "utf8"));
    assert.match(config.lastBackup, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(repo.backupError, "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

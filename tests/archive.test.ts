import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  addBlock,
  addReservation,
  archiveCandidates,
  archivePlan,
  assign,
  finish,
  importRows,
  log,
  sweep,
  validateState,
  type ArchiveFile,
  type ArchivedMatch,
  type ImportRow,
  type State,
} from "../src/domain";
import { sopungInitialState } from "../src/sitePlan";
const require = createRequire(import.meta.url);
const { Repository } = require("../electron/repository.cjs");

const NOW = "2026-03-10T10:00:00";
// 저장 파일과 같은 JSON 기준으로 비교한다(값이 없는 선택 항목은 저장되지 않는다).
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const siteId = (s: State, label: string) =>
  s.sites.find((x) => x.label === label)!.id;
function stay(
  s: State,
  name: string,
  arrival: string,
  departure: string,
  externalId = "",
) {
  const r = addReservation(
    s,
    {
      name,
      phone: "010-2000-0000",
      arrival,
      departure,
      kind: "auto",
      source: "캠핏",
      people: 2,
      vehicle: "12가 3456",
      note: `${name} 메모`,
      fee: 0,
      paid: false,
    },
    externalId,
  );
  return r;
}
// 지난 연도·올해·진행 중 기록이 섞인 운영 상태
function history() {
  const s = sopungInitialState();
  const ga = (n: number) => siteId(s, `가${n}`);
  const done = (
    name: string,
    arrival: string,
    departure: string,
    site: number,
    externalId = "",
  ) => {
    const r = stay(s, name, arrival, departure, externalId);
    assign(s, r.id, ga(site), true, `${arrival}T15:00:00`);
    sweep(s, `${departure}T12:00:00`);
    return r;
  };
  const r2024 = done("재작년 손님", "2024-08-10", "2024-08-11", 1, "CF-2024");
  const r2025 = done("작년 손님", "2025-12-30", "2025-12-31", 2, "CF-2025");
  const boundary = done("해넘이 손님", "2025-12-31", "2026-01-01", 3);
  const noShow = stay(s, "노쇼 손님", "2025-06-01", "2025-06-02");
  finish(s, noShow.id, "noShow", "2025-06-01T20:00:00");
  const waiting = stay(s, "미처리 손님", "2025-11-01", "2025-11-03");
  const futureCancel = stay(s, "취소 손님", "2026-02-01", "2026-02-02");
  finish(s, futureCancel.id, "cancelled", "2025-12-01T09:00:00");
  const current = stay(s, "현재 손님", "2026-03-09", "2026-03-11");
  assign(s, current.id, ga(4), true, "2026-03-09T15:00:00");
  addBlock(s, {
    siteId: ga(5),
    type: "long",
    name: "작년 장박",
    phone: "",
    start: "2025-05-01T14:00:00",
    end: "2025-09-30T11:00:00",
    note: "",
  });
  log(s, "명단 가져오기: 신규 3건", undefined, "2025-07-01T09:00:00");
  log(s, "명단 가져오기: 신규 1건", undefined, "2026-02-01T09:00:00");
  sweep(s, NOW);
  validateState(s);
  return { s, r2024, r2025, boundary, noShow, waiting, futureCancel, current };
}
const files = (plan: Awaited<ReturnType<typeof archivePlan>>) =>
  plan.files.map((f) => JSON.parse(f.text) as ArchiveFile);

test("보관 대상은 올해 이전에 끝난 퇴실·노쇼·취소 예약과 그 기록이고 연도 경계·진행 기록은 남김", async () => {
  const h = history();
  const picked = archiveCandidates(h.s, NOW);
  assert.deepEqual(
    picked.reservations.map((r) => r.name).sort(),
    ["노쇼 손님", "작년 손님", "재작년 손님"].sort(),
  );
  const plan = await archivePlan(h.s, NOW, 600);
  validateState(plan.next);
  // 해를 넘겨 올해 퇴실·미처리·올해 날짜의 취소·진행 중 예약은 본 파일에 남는다
  assert.deepEqual(
    plan.next.reservations.map((r) => r.name).sort(),
    ["해넘이 손님", "미처리 손님", "취소 손님", "현재 손님"].sort(),
  );
  assert.equal(plan.next.blocks.length, 1);
  assert.deepEqual(
    plan.next.sites.map((x) => x.id),
    h.s.sites.map((x) => x.id),
  );
  // 연도별 파일, 큰 연도는 여러 파일로 나눔
  const contents = files(plan);
  assert.deepEqual(
    [...new Set(contents.map((f) => f.year))].sort(),
    [2024, 2025],
  );
  assert.ok(contents.filter((f) => f.year === 2025).length > 1);
  assert.equal(
    contents.find((f) => f.reservations.some((r) => r.name === "재작년 손님"))!
      .year,
    2024,
  );
  // 기록을 하나도 잃지 않음: 본 파일 + 보관 파일 = 원래 기록
  const ids = (list: { id: string }[]) => list.map((x) => x.id).sort();
  assert.deepEqual(
    ids([
      ...plan.next.reservations,
      ...contents.flatMap((f) => f.reservations),
    ]),
    ids(h.s.reservations),
  );
  assert.deepEqual(
    ids([...plan.next.allocations, ...contents.flatMap((f) => f.allocations)]),
    ids(h.s.allocations),
  );
  assert.deepEqual(
    ids([
      ...plan.next.activity.slice(1),
      ...contents.flatMap((f) => f.activity),
    ]),
    ids(h.s.activity),
  );
  assert.ok(
    contents.some((f) =>
      f.activity.some((a) => a.text === "명단 가져오기: 신규 3건"),
    ),
  );
  assert.ok(
    plan.next.activity.some((a) => a.text === "명단 가져오기: 신규 1건"),
  );
  // 목록의 크기·SHA-256은 실제 파일 내용과 같음
  for (const [index, ref] of plan.refs.entries()) {
    const text = plan.files[index].text;
    assert.equal(ref.bytes, Buffer.byteLength(text));
    assert.equal(ref.sha256, createHash("sha256").update(text).digest("hex"));
  }
  assert.deepEqual(plan.next.archives, plan.refs);
  await assert.rejects(() => archivePlan(plan.next, NOW), /보관할 지난 연도/);
});

test("보관된 예약은 반복 가져오기에서 새로 만들지 않고 차이만 알리며 새 단위번호는 확인 경고", async () => {
  const h = history();
  const plan = await archivePlan(h.s, NOW);
  const archived: ArchivedMatch[] = files(plan).flatMap((f) =>
    f.reservations.map((reservation) => ({ year: f.year, reservation })),
  );
  const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
    source: "캠핏",
    externalId: "CF-2025",
    unit: "1",
    name: "작년 손님",
    phone: "010-2000-0000",
    arrival: "2025-12-30",
    departure: "2025-12-31",
    kind: "auto",
    people: 2,
    cancelled: false,
    siteLabel: "",
    ...overrides,
  });
  const s = structuredClone(plan.next);
  const same = importRows(s, [row()], archived);
  assert.deepEqual([same.added, same.unchanged, same.warnings], [0, 1, []]);
  const changed = importRows(s, [row({ departure: "2026-01-01" })], archived);
  assert.equal(changed.added, 0);
  assert.match(
    changed.warnings.join(),
    /2025년 보관 기록의 예약.*바꾸지 않았으니/,
  );
  const unit = importRows(s, [row({ unit: "2" })], archived);
  assert.equal(unit.added, 1);
  assert.match(unit.warnings.join(), /기존 단위번호\(1\)와 다른 단위번호 2/);
  assert.equal(
    s.reservations.filter((r) => r.externalId === "CF-2025").length,
    1,
  );
  assert.equal(s.changes.length, 0);
});

function repository(root: string, name: string) {
  return new Repository(
    path.join(root, `${name}-data`),
    path.join(root, `${name}-backups`),
  );
}

test("보관은 보관 파일을 먼저 확인·기록한 뒤 본 파일을 바꾸고 검색·조회·백업에 함께 쓰임", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-archive-commit-"));
  try {
    const repo = repository(root, "a");
    const h = history();
    repo.save(h.s);
    const plan = await archivePlan(h.s, NOW);
    repo.commitArchive(plan.next, plan.files);
    const saved = repo.load();
    assert.deepEqual(saved, json(plan.next));
    for (const file of plan.files)
      assert.equal(
        readFileSync(path.join(repo.archiveDir, file.file), "utf8"),
        file.text,
      );
    assert.deepEqual(repo.fileProblems(), []);
    const found = repo.searchArchives("재작년");
    assert.equal(found.total, 1);
    assert.equal(found.results[0].year, 2024);
    assert.equal(found.results[0].allocations.length, 1);
    assert.ok(found.results[0].activity.length >= 2);
    assert.equal(repo.searchArchives("12가3456").total, 3);
    assert.deepEqual(
      repo
        .lookupArchives([["캠핏", "CF-2024"]])
        .map((m: ArchivedMatch) => [m.year, m.reservation.name]),
      [[2024, "재작년 손님"]],
    );
    const backupFile = repo.backup();
    for (const file of plan.files)
      assert.equal(
        readFileSync(
          path.join(path.dirname(backupFile), "archive", file.file),
          "utf8",
        ),
        file.text,
      );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("보관 중 실패·이름 충돌·내용 불일치·빠진 기존 목록은 본 파일을 그대로 두고 이번 파일을 남기지 않음", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-archive-fail-"));
  try {
    const repo = repository(root, "a");
    const h = history();
    repo.save(h.s);
    const before = readFileSync(repo.file, "utf8");
    const plan = await archivePlan(h.s, NOW);
    const listArchive = () =>
      existsSync(repo.archiveDir) ? readdirSync(repo.archiveDir) : [];
    // 본 파일 교체 단계 실패
    const save = repo.save.bind(repo);
    repo.save = () => {
      throw new Error("검증용 본 파일 저장 실패");
    };
    assert.throws(() => repo.commitArchive(plan.next, plan.files), /검증용/);
    repo.save = save;
    assert.equal(readFileSync(repo.file, "utf8"), before);
    assert.deepEqual(listArchive(), []);
    // 내용이 목록과 다른 파일
    const tampered = plan.files.map((f, i) =>
      i === 0 ? { ...f, text: f.text.replace("작년", "올해") } : f,
    );
    assert.throws(
      () => repo.commitArchive(plan.next, tampered),
      /내용이 저장 기록과 달라요/,
    );
    // 같은 이름 파일이 이미 있음
    mkdirSync(repo.archiveDir, { recursive: true });
    writeFileSync(path.join(repo.archiveDir, plan.files[0].file), "다른 파일");
    assert.throws(
      () => repo.commitArchive(plan.next, plan.files),
      /이미 있어 덮어쓰지 않았어요/,
    );
    assert.equal(
      readFileSync(path.join(repo.archiveDir, plan.files[0].file), "utf8"),
      "다른 파일",
    );
    rmSync(path.join(repo.archiveDir, plan.files[0].file));
    // 정상 보관 후, 기존 목록을 빠뜨린 오래된 화면 상태로는 다시 보관하지 않음
    repo.commitArchive(plan.next, plan.files);
    const stale = await archivePlan(
      { ...h.s, archives: undefined },
      "2027-01-05T10:00:00",
    );
    assert.throws(
      () => repo.commitArchive(stale.next, stale.files),
      /보관 목록이 빠진/,
    );
    assert.deepEqual(repo.load(), json(plan.next));
    assert.equal(listArchive().length, plan.files.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("보관 파일이 없거나 손상되면 상태·검색·가져오기 조회·새 보관·백업에서 파일명을 알리고 덮어쓰지 않음", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-archive-broken-"));
  try {
    const repo = repository(root, "a");
    const h = history();
    repo.save(h.s);
    const plan = await archivePlan(h.s, NOW);
    repo.commitArchive(plan.next, plan.files);
    const [first, second] = plan.refs;
    rmSync(path.join(repo.archiveDir, first.file));
    const damaged = path.join(repo.archiveDir, second.file);
    const text = readFileSync(damaged, "utf8");
    writeFileSync(damaged, text.replace("손님", "손닙"));
    assert.match(
      repo.fileProblems().join(),
      new RegExp(`${first.file}.*없어요`),
    );
    assert.throws(
      () => repo.searchArchives("손님"),
      /찾을 수 없어요|저장 기록과 달라요/,
    );
    assert.throws(
      () => repo.lookupArchives([["캠핏", "CF-2025"]]),
      new RegExp(first.file),
    );
    assert.match(
      repo.verifyAttachments({ archives: [second] }).join(),
      /저장 기록과 달라요/,
    );
    // 손상된 보관 파일을 정상 파일로 덮어쓰지 않고 백업도 실패로 알림
    const next = await archivePlan(plan.next, "2027-01-05T10:00:00");
    assert.throws(
      () => repo.commitArchive(next.next, next.files),
      /기존 보관 파일에 문제가/,
    );
    assert.throws(() => repo.backup(), new RegExp(first.file));
    assert.equal(readFileSync(damaged, "utf8"), text.replace("손님", "손닙"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("보관 파일이 있는 백업은 같은 폴더의 archive와 함께 복원하고 빠지면 바꾸지 않으며 예전 단일 백업도 복원", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-archive-restore-"));
  try {
    const source = repository(root, "source");
    const h = history();
    source.save(h.s);
    const plan = await archivePlan(h.s, NOW);
    source.commitArchive(plan.next, plan.files);
    const backupFile = source.backup();
    // 새 PC: 백업 폴더째 복원
    const target = repository(root, "target");
    const picked = target.inspectBackup(backupFile);
    assert.deepEqual(picked.value, json(plan.next));
    assert.equal(existsSync(target.archiveDir), false);
    assert.throws(() => target.restoreBackup("다른 백업"), /다시 선택/);
    target.inspectBackup(backupFile);
    target.restoreBackup(picked.token);
    assert.deepEqual(target.load(), json(plan.next));
    assert.equal(target.searchArchives("재작년").total, 1);
    assert.throws(() => target.restoreBackup(picked.token), /다시 선택/);
    // 보관 파일 없이 본 파일만 옮긴 경우: 파일명을 알리고 아무것도 바꾸지 않음
    const lonely = path.join(root, "lonely");
    mkdirSync(lonely);
    copyFileSync(backupFile, path.join(lonely, "sopung-copy.json"));
    const empty = repository(root, "empty");
    assert.throws(
      () => empty.inspectBackup(path.join(lonely, "sopung-copy.json")),
      new RegExp(`${plan.refs[0].file}.*바꾸지 않았어요`),
    );
    assert.equal(existsSync(empty.directory), false);
    // 예전 단일 백업(보관 목록 없음)은 그대로 복원
    const old = path.join(lonely, "old.json");
    writeFileSync(old, JSON.stringify(h.s));
    const single = empty.inspectBackup(old);
    assert.deepEqual(single.value, json(h.s));
    empty.restoreBackup(single.token);
    assert.deepEqual(empty.load(), json(h.s));
    // 내보내기 폴더도 보관 파일과 함께 복원 가능
    const exported = source.exportBackup(path.join(root, "usb"));
    const exportedFile = readdirSync(exported).find((name) =>
      name.endsWith(".json"),
    )!;
    const again = repository(root, "again");
    again.restoreBackup(
      again.inspectBackup(path.join(exported, exportedFile)).token,
    );
    assert.deepEqual(
      readdirSync(again.archiveDir).sort(),
      plan.files.map((f) => f.file).sort(),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("확인된 일일 백업이라도 지워진 보관 사본은 다시 만들고 손상된 사본은 덮어쓰지 않고 알림", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-archive-copies-"));
  try {
    const repo = repository(root, "a");
    const h = history();
    repo.save(h.s);
    const plan = await archivePlan(h.s, NOW);
    repo.commitArchive(plan.next, plan.files);
    // 다음 날처럼 오늘 일일 백업을 새로 만들게 한 뒤 사본 확인
    const daily = readdirSync(repo.backupPath).find((name) =>
      /^sopung-\d{4}-\d{2}-\d{2}\.json$/.test(name),
    )!;
    rmSync(path.join(repo.backupPath, daily));
    repo.dailyBackup();
    const copy = path.join(repo.backupPath, "archive", plan.files[0].file);
    assert.equal(readFileSync(copy, "utf8"), plan.files[0].text);
    // 같은 프로세스에서 사본을 지우면 다시 만듦
    rmSync(copy);
    repo.dailyBackup();
    assert.equal(readFileSync(copy, "utf8"), plan.files[0].text);
    rmSync(path.join(repo.backupPath, "archive"), {
      recursive: true,
      force: true,
    });
    repo.save(repo.load());
    assert.equal(repo.backupError, "");
    assert.equal(readFileSync(copy, "utf8"), plan.files[0].text);
    // 사본이 손상되면 원본으로 덮어쓰지 않고 오류로 알림
    const damaged = plan.files[0].text.replace("손님", "손닙");
    writeFileSync(copy, damaged);
    assert.match(
      repo.save(repo.load()).backupError,
      new RegExp(`${plan.files[0].file}.*사본이 저장 기록과 달라`),
    );
    assert.equal(readFileSync(copy, "utf8"), damaged);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("현재 보관 파일이 손상돼도 정상 백업 폴더로 복원하며 손상 파일은 따로 보존하고 실패하면 모두 되돌림", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-archive-repair-"));
  try {
    const repo = repository(root, "a");
    const h = history();
    repo.save(h.s);
    const plan = await archivePlan(h.s, NOW);
    repo.commitArchive(plan.next, plan.files);
    const backupFile = repo.backup();
    const current = path.join(repo.archiveDir, plan.files[0].file);
    const damaged = "x".repeat(Buffer.byteLength(plan.files[0].text));
    writeFileSync(current, damaged);
    assert.match(
      repo.verifyAttachments({ archives: plan.refs }).join(),
      /저장 기록과 달라요/,
    );
    const before = readFileSync(repo.file, "utf8");
    // 본 파일 교체 단계가 실패하면 보관 파일과 본 파일을 모두 되돌림
    const picked = repo.inspectBackup(backupFile);
    const restore = repo.restore.bind(repo);
    repo.restore = () => {
      throw new Error("검증용 본 파일 복원 실패");
    };
    assert.throws(() => repo.restoreBackup(picked.token), /검증용/);
    repo.restore = restore;
    assert.equal(readFileSync(current, "utf8"), damaged);
    assert.equal(readFileSync(repo.file, "utf8"), before);
    // 되돌린 뒤에는 옮겨 둔 파일이 남지 않고 원래 자리로 돌아옴
    assert.deepEqual(
      readdirSync(repo.archiveDir)
        .filter((name) => name.startsWith("replaced-"))
        .flatMap((dir) => readdirSync(path.join(repo.archiveDir, dir))),
      [],
    );
    // 다시 선택하면 정상 사본으로 고치고 손상 파일은 replaced-<시각>/에 보존
    repo.restoreBackup(repo.inspectBackup(backupFile).token);
    assert.equal(readFileSync(current, "utf8"), plan.files[0].text);
    assert.deepEqual(repo.verifyAttachments({ archives: plan.refs }), []);
    const preserved = readdirSync(repo.archiveDir)
      .filter((name) => name.startsWith("replaced-"))
      .map((dir) => path.join(repo.archiveDir, dir, plan.files[0].file))
      .filter((file) => existsSync(file));
    assert.equal(preserved.length, 1);
    assert.equal(readFileSync(preserved[0], "utf8"), damaged);
    assert.ok(
      readdirSync(repo.directory).some((name) =>
        name.startsWith("before-restore-"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("보관 기록 검색은 한 쪽씩 보내고 이후 쪽으로 201번째 기록까지 열 수 있음", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-archive-pages-"));
  try {
    const repo = repository(root, "a");
    const s = sopungInitialState();
    for (let i = 0; i < 250; i++) {
      const day = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
      const next = new Date(Date.UTC(2025, 0, 2 + i))
        .toISOString()
        .slice(0, 10);
      const r = stay(s, `단골 손님 ${String(i).padStart(3, "0")}`, day, next);
      finish(s, r.id, "cancelled", `${day}T09:00:00`);
    }
    repo.save(s);
    const plan = await archivePlan(s, NOW);
    repo.commitArchive(plan.next, plan.files);
    const first = repo.searchArchives("단골 손님");
    assert.deepEqual(
      [first.total, first.offset, first.results.length],
      [250, 0, 100],
    );
    assert.equal(first.results[0].reservation.name, "단골 손님 249");
    const third = repo.searchArchives("단골 손님", 200);
    assert.deepEqual([third.offset, third.results.length], [200, 50]);
    assert.equal(third.results[0].reservation.name, "단골 손님 049");
    assert.equal(third.results[49].reservation.name, "단골 손님 000");
    assert.equal(repo.searchArchives("단골 손님", 999).results.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("항공사진은 assets 불변 파일로 저장하고 기존 내장 사진도 같은 이미지·좌표로 옮기며 백업·복원에 포함", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-aerial-asset-"));
  try {
    const repo = repository(root, "a");
    const s = sopungInitialState();
    s.settings.aerial = PNG;
    Object.assign(s.sites[0], { x: 11, y: 22 });
    repo.save(s);
    const embedded = Buffer.byteLength(readFileSync(repo.file, "utf8"));
    // 기존 내장 사진 분리: 같은 바이트, 같은 좌표, 본 파일에는 참조만
    const ref = repo.saveAerial(PNG);
    assert.match(ref, /^asset:aerial-[a-f0-9]{64}\.png$/);
    assert.equal(repo.saveAerial(PNG), ref);
    assert.equal(repo.readAerial(ref), PNG);
    const moved = { ...json(s), settings: { ...s.settings, aerial: ref } };
    validateState(moved);
    repo.save(moved);
    assert.ok(Buffer.byteLength(readFileSync(repo.file, "utf8")) < embedded);
    assert.deepEqual(
      [repo.load().sites[0].x, repo.load().sites[0].y],
      [11, 22],
    );
    assert.deepEqual(repo.fileProblems(), []);
    // 백업 폴더에도 사진 파일을 함께 둠
    const backupFile = repo.backup();
    const name = ref.slice("asset:".length);
    assert.deepEqual(
      readFileSync(path.join(path.dirname(backupFile), "assets", name)),
      readFileSync(path.join(repo.directory, "assets", name)),
    );
    // 사진 파일이 빠지면 상태·읽기에서 알리고, 정상 백업 폴더로 복원
    rmSync(path.join(repo.directory, "assets", name));
    assert.match(repo.fileProblems().join(), new RegExp(`${name}이 없어요`));
    assert.throws(() => repo.readAerial(ref), /찾을 수 없어요/);
    repo.restoreBackup(repo.inspectBackup(backupFile).token);
    assert.equal(repo.readAerial(ref), PNG);
    // 손상된 사진 파일은 읽지 않고, 본 파일만 옮긴 백업은 복원하지 않음
    writeFileSync(path.join(repo.directory, "assets", name), "깨진 사진");
    assert.throws(() => repo.readAerial(ref), /저장 기록과 달라요/);
    const lonely = path.join(root, "lonely");
    mkdirSync(lonely);
    copyFileSync(backupFile, path.join(lonely, "only.json"));
    const other = repository(root, "other");
    assert.throws(
      () => other.inspectBackup(path.join(lonely, "only.json")),
      new RegExp(`${name}.*바꾸지 않았어요`),
    );
    // 정상 백업으로 다시 복원하면 손상 파일은 assets/replaced-<시각>/에 보존
    repo.restoreBackup(repo.inspectBackup(backupFile).token);
    assert.equal(repo.readAerial(ref), PNG);
    const kept = readdirSync(path.join(repo.directory, "assets")).filter(
      (dir) => dir.startsWith("replaced-"),
    );
    assert.equal(
      readFileSync(path.join(repo.directory, "assets", kept[0], name), "utf8"),
      "깨진 사진",
    );
    // 내보내기 폴더에도 사진 파일 포함
    const exported = repo.exportBackup(path.join(root, "usb"));
    assert.ok(existsSync(path.join(exported, "assets", name)));
    assert.throws(() => repo.saveAerial("data:text/plain;base64,AAAA"), /사진/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("저장 상태는 정해진 사진 참조만 허용", () => {
  const s = sopungInitialState();
  for (const aerial of [
    `asset:aerial-${"a".repeat(64)}.png`,
    `asset:aerial-${"b".repeat(64)}.jpg`,
    PNG,
    "",
  ]) {
    s.settings.aerial = aerial;
    validateState(s);
  }
  for (const aerial of [
    "asset:../../camp-data.json",
    `asset:aerial-${"a".repeat(63)}.png`,
    "file:///C:/photo.png",
  ]) {
    s.settings.aerial = aerial;
    assert.throws(() => validateState(s), /항공사진/);
  }
});

test("보관 연도는 기존 날짜 규칙처럼 네 자리 연도 전체를 받고 파일명은 네 자리로 맞춤", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-archive-years-"));
  try {
    const s = sopungInitialState();
    for (const [name, arrival, departure] of [
      ["1969년 손님", "1969-07-20", "1969-07-21"],
      ["0999년 손님", "0999-05-01", "0999-05-02"],
    ]) {
      const r = stay(s, name, arrival, departure);
      finish(s, r.id, "cancelled", `${arrival}T09:00:00`);
    }
    const plan = await archivePlan(s, NOW);
    validateState(plan.next);
    assert.deepEqual(
      plan.refs.map((r) => [r.year, r.file.slice(0, 19)]),
      [
        [999, "sopung-archive-0999"],
        [1969, "sopung-archive-1969"],
      ],
    );
    const repo = repository(root, "a");
    repo.save(s);
    repo.commitArchive(plan.next, plan.files);
    assert.deepEqual(repo.fileProblems(), []);
    assert.equal(repo.searchArchives("0999년").results[0].year, 999);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("보관 기록 없이 사진만 분리한 데이터도 내보낸 폴더로 새 PC에 사진까지 복원", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sopung-aerial-export-"));
  try {
    const repo = repository(root, "a");
    const s = json(sopungInitialState());
    s.settings.aerial = repo.saveAerial(PNG);
    Object.assign(s.sites[0], { x: 5, y: 6 });
    repo.save(s);
    const exported = repo.exportBackup(path.join(root, "usb"));
    const file = readdirSync(exported).find((name) => name.endsWith(".json"))!;
    const fresh = repository(root, "fresh");
    fresh.restoreBackup(fresh.inspectBackup(path.join(exported, file)).token);
    assert.equal(fresh.readAerial(fresh.load().settings.aerial), PNG);
    assert.deepEqual(
      [fresh.load().sites[0].x, fresh.load().sites[0].y],
      [5, 6],
    );
    assert.deepEqual(fresh.fileProblems(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

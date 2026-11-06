import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { addReservation, assign, emptyState, type State } from "../src/domain";
import { SOPUNG_PLAN_ID, sopungInitialState } from "../src/sitePlan";
import bundledLayout from "../src/bundledLayout.json";
import type { DesktopBridge } from "../src/storage";

const { Repository } = createRequire(import.meta.url)(
  "../electron/repository.cjs",
);
// 설치 앱의 preload 브리지처럼 설정한 뒤 저장 모듈을 불러온다.
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { camp: {} },
});
const { loadState } = await import("../src/storage");

async function withRepository(
  run: (repo: InstanceType<typeof Repository>, saves: State[]) => Promise<void>,
) {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-first-run-"));
  const repo = new Repository(directory, path.join(directory, "backups"));
  const saves: State[] = [];
  const camp = {
    load: async () => repo.load(),
    save: async (state: State) => {
      saves.push(state);
      return repo.save(state);
    },
  };
  window.camp = camp as DesktopBridge;
  try {
    await run(repo, saves);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("설치 앱 첫 실행은 저장된 편집 배치와 일치하고 재실행에서도 140자리·15시설을 유지", async () => {
  await withRepository(async (repo, saves) => {
    assert.equal(repo.load(), null);
    const state = await loadState();
    assert.equal(state.sitePlan, SOPUNG_PLAN_ID);
    assert.equal(state.demo, false);
    assert.equal(state.sites.length, 140);
    assert.equal(state.facilities?.length, 15);
    assert.deepEqual(state.sites, bundledLayout.sites);
    assert.deepEqual(state.facilities, bundledLayout.facilities);
    assert.deepEqual(
      ["가", "나", "다", "라", "마", "A", "B"].map(
        (area) =>
          state.sites.filter(
            (site: State["sites"][number]) => site.area === area,
          ).length,
      ),
      [10, 27, 21, 23, 15, 26, 18],
    );
    assert.deepEqual(state.reservations, []);
    assert.deepEqual(state.allocations, []);
    assert.deepEqual(state.blocks, []);
    assert.deepEqual(state.changes, []);
    assert.deepEqual(state.settings, {
      lateTime: "",
      lateFee: null,
      aerial: "",
    });
    assert.equal(saves.length, 1);
    assert.deepEqual(repo.load(), JSON.parse(JSON.stringify(state)));
    assert.ok(repo.config.lastBackup);
    const savedText = readFileSync(repo.file, "utf8");
    assert.deepEqual(await loadState(), JSON.parse(JSON.stringify(state)));
    assert.equal(saves.length, 1);
    assert.equal(readFileSync(repo.file, "utf8"), savedText);
  });
});

test("기존 도면의 편집 위치·설정·예약·배정·장박은 첫 실행 처리로 덮어쓰지 않음", async () => {
  await withRepository(async (repo, saves) => {
    const state = sopungInitialState();
    state.sites[0].label = "운영자가 바꾼 자리";
    state.sites[0].layout = { x: 12.3, y: 45.6 };
    state.sites[0].x = 76;
    state.sites[0].y = 32;
    state.facilities![0].layout = { x: 23, y: 67 };
    state.settings = {
      lateTime: "13:00",
      lateFee: 10000,
      aerial: "data:image/png;base64,AAAA",
    };
    const guest = addReservation(state, {
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
    assign(state, guest.id, state.sites[0].id, false, "2031-10-01T10:00:00");
    state.blocks.push({
      id: "long",
      siteId: state.sites[1].id,
      type: "long",
      name: "직접 등록한 장박",
      phone: "",
      start: "2031-10-01T14:00:00",
      end: "2031-11-01T11:00:00",
      note: "",
    });
    repo.save(state);
    const savedText = readFileSync(repo.file, "utf8");
    assert.deepEqual(await loadState(), JSON.parse(savedText));
    assert.equal(saves.length, 0);
    assert.equal(readFileSync(repo.file, "utf8"), savedText);
  });
});

test("이미 저장한 빈 상태는 운영자의 삭제일 수 있으므로 자동 도면 복원하지 않음", async () => {
  await withRepository(async (repo, saves) => {
    const state = emptyState();
    repo.save(state);
    assert.deepEqual(await loadState(), state);
    assert.equal(saves.length, 0);
  });
});

test("첫 도면 저장이 실패하면 빈 상태로 시작하지 않고 오류를 전달", async () => {
  await withRepository(async (repo, saves) => {
    const save = window.camp!.save;
    window.camp!.save = async () => {
      throw new Error("시험용 저장 실패");
    };
    await assert.rejects(loadState(), /시험용 저장 실패/);
    assert.equal(repo.load(), null);
    window.camp!.save = save;
    assert.equal((await loadState()).sites.length, 140);
    assert.equal(saves.length, 1);
  });
});

test("첫 화면을 동시에 불러와도 도면 생성·저장은 한 번만 수행", async () => {
  await withRepository(async (repo, saves) => {
    const [first, second] = await Promise.all([loadState(), loadState()]);
    assert.deepEqual(first, second);
    assert.equal(first.sites.length, 140);
    assert.equal(saves.length, 1);
    assert.deepEqual(repo.load(), JSON.parse(JSON.stringify(first)));
  });
});

test("저장 파일 불러오기가 실패하면 도면으로 덮어쓰지 않음", async () => {
  await withRepository(async (_repo, saves) => {
    window.camp!.load = async () => {
      throw new Error("시험용 읽기 실패");
    };
    await assert.rejects(loadState(), /시험용 읽기 실패/);
    assert.equal(saves.length, 0);
  });
});

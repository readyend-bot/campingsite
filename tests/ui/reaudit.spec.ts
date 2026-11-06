import { test, expect, type Page } from "@playwright/test";
import {
  addBlock,
  addReservation,
  assign,
  emptyState,
  scheduleMove,
  type State,
} from "../../src/domain";

function stayFixture() {
  const s = emptyState();
  s.sites = ["가1", "나1"].map((label, i) => ({
    id: String(i),
    label,
    area: label[0],
    kind: "auto",
    archived: false,
  }));
  const r = addReservation(s, {
    name: "퇴실 경계 손님",
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

async function seed(page: Page, state: State) {
  await page.addInitScript((data) => {
    if (!localStorage.getItem("sopung-camp-v1"))
      localStorage.setItem("sopung-camp-v1", JSON.stringify(data));
  }, state);
}

async function desktopStub(page: Page, failSave = false) {
  await page.addInitScript(
    ({ initial, failSave }) => {
      let data = initial;
      let backupError = "";
      let attempts = 0;
      window.camp = {
        status: async () => ({
          configured: true,
          unlocked: true,
          mode: "pin",
          dataPath: "test-data",
          backupPath: "test-backups",
          lastBackup: "",
          backupError,
        }),
        load: async () => JSON.parse(JSON.stringify(data)),
        save: async (next) => {
          attempts++;
          if (failSave && attempts === 1)
            throw new Error("검증용 디스크 저장 실패");
          data = JSON.parse(JSON.stringify(next));
          backupError = "검증용 백업 폴더 쓰기 실패";
          return { backupError };
        },
        setup: async () => {},
        unlock: async () => {},
        lock: async () => {},
        restore: async (next) => {
          data = next;
          return {};
        },
        backup: async () => "test-backup.json",
        chooseBackup: async () => null,
        openFolder: async () => {},
        openCampfit: async () => {},
        quit: async () => {},
        camfitProfile: async () => null,
        downloadCampfit: async () => {
          throw new Error("검증용 미연결");
        },
        saveCamfitProfile: async () => {},
        cancelCampfitSync: async () => {},
      };
    },
    { initial: emptyState(), failSave },
  );
  await page.goto("/");
}

test("저장 성공 후 창을 닫아도 자동 백업 실패 안내를 유지", async ({
  page,
}) => {
  await desktopStub(page);
  await page.getByRole("button", { name: "자리 등록", exact: true }).click();
  await page.getByLabel("자리 이름", { exact: true }).fill("백업 검증 자리");
  await page.getByRole("button", { name: "자리 저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("자동 백업");
  const saved = await page.evaluate(() => window.camp!.load());
  expect(saved!.sites[0].label).toBe("백업 검증 자리");
});

test("디스크 저장 실패 시 기존 데이터와 입력을 보존하고 재시도는 한 번만 반영", async ({
  page,
}) => {
  await desktopStub(page, true);
  await page.getByRole("button", { name: "자리 등록", exact: true }).click();
  await page.getByLabel("자리 이름", { exact: true }).fill("재시도 자리");
  await page.getByRole("button", { name: "자리 저장", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "디스크 저장 실패",
  );
  expect((await page.evaluate(() => window.camp!.load()))!.sites).toHaveLength(
    0,
  );
  await expect(page.getByLabel("자리 이름", { exact: true })).toHaveValue(
    "재시도 자리",
  );
  await page.getByRole("button", { name: "자리 저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await page.evaluate(() => window.camp!.load()))!.sites).toHaveLength(
    1,
  );
});

test("오전 손님을 열어 레이트 충돌을 막고 퇴실 경계에는 후속 장박을 표시", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-28T10:59:40+09:00") });
  const { s } = stayFixture();
  s.settings.lateTime = "15:00";
  s.settings.lateFee = 10000;
  addBlock(s, {
    siteId: "0",
    type: "long",
    name: "후속 장박",
    phone: "",
    note: "",
    start: "2026-09-28T14:00:00",
    end: "2026-10-28T11:00:00",
  });
  await seed(page, s);
  await page.goto("/");
  await page
    .locator(".map-panel")
    .getByRole("button", { name: "가1 입실 퇴실 경계 손님", exact: true })
    .click();
  await page
    .getByRole("button", { name: "레이트 체크아웃", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "장박",
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.clock.fastForward(31000);
  await expect(
    page
      .locator(".map-panel")
      .getByRole("button", { name: "가1 장박 후속 장박", exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sopung-camp-v1")!),
  );
  expect(saved.reservations[0].status).toBe("checkedOut");
  expect(saved.reservations[0].fee).toBe(0);
});

test("지난 백업 복원 직후 만료된 이동 예약을 정리하고 실제 마지막 자리 유지", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-29T09:00:00+09:00"));
  await seed(page, emptyState());
  await page.goto("/");
  const { s, r } = stayFixture();
  scheduleMove(
    s,
    r.id,
    "1",
    "2026-09-27T17:00:00",
    false,
    "2026-09-27T16:00:00",
  );
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: "지난백업.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(s)),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sopung-camp-v1")!),
  );
  expect(saved.reservations[0].status).toBe("checkedOut");
  expect(saved.allocations).toHaveLength(1);
  expect(saved.allocations[0].siteId).toBe("0");
});

test("겹치는 자리 기록이 들어 있는 백업은 현재 데이터 교체 전에 거절", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-28T09:00:00+09:00"));
  const { s } = stayFixture();
  await seed(page, s);
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const corrupt = JSON.parse(JSON.stringify(s));
  corrupt.allocations.push({
    ...corrupt.allocations[0],
    id: "duplicate",
    siteId: "1",
  });
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: "손상된백업.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(corrupt)),
  });
  await expect(page.getByRole("alert")).toContainText("중복 배정");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sopung-camp-v1")!),
    ),
  ).toEqual(s);
});

test("오전에도 빈자리에 직접 입실하고 재실행 후 실제 입실 시각 보존", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-27T09:00:00+09:00"));
  const { s, r } = stayFixture();
  r.status = "waiting";
  s.allocations = [];
  await seed(page, s);
  await page.goto("/");
  await page
    .locator(".map-panel")
    .getByRole("button", { name: "가1 빈자리", exact: true })
    .click();
  await page.getByLabel("배정할 예약자", { exact: true }).selectOption(r.id);
  await expect(
    page.getByRole("button", { name: "배정하고 입실", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "배정하고 입실", exact: true })
    .click();
  await expect(
    page
      .locator(".map-panel")
      .getByRole("button", { name: "가1 입실 퇴실 경계 손님", exact: true }),
  ).toBeVisible();
  await page.reload();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sopung-camp-v1")!),
  );
  expect(saved.reservations[0].status).toBe("checkedIn");
  expect(saved.allocations[0].start).toBe("2026-09-27T09:00:00");
});

test("미리 지정된 객실도 오전 입실 처리 가능", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-27T09:00:00+09:00"));
  const { s, r } = stayFixture();
  r.status = "waiting";
  r.kind = "caravan";
  s.sites[0].kind = "caravan";
  s.allocations = [];
  assign(s, r.id, "0", false);
  await seed(page, s);
  await page.goto("/");
  await page
    .locator(".map-panel")
    .getByRole("button", { name: "가1 배정 퇴실 경계 손님", exact: true })
    .click();
  await page.getByRole("button", { name: "입실 처리", exact: true }).click();
  await expect(
    page
      .locator(".map-panel")
      .getByRole("button", { name: "가1 입실 퇴실 경계 손님", exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sopung-camp-v1")!),
  );
  expect(saved.allocations[0].start).toBe("2026-09-27T09:00:00");
});

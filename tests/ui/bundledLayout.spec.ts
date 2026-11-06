import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import {
  addReservation,
  assign,
  emptyState,
  type State,
} from "../../src/domain";
import { sopungInitialState } from "../../src/sitePlan";
const bundledLayout = JSON.parse(
  readFileSync(
    new URL("../../src/bundledLayout.json", import.meta.url),
    "utf8",
  ),
);

async function seed(page: Page, state: State) {
  await page.clock.setFixedTime(new Date("2026-11-06T10:00:00+09:00"));
  await page.addInitScript((data) => {
    if (!localStorage.getItem("sopung-camp-v1"))
      localStorage.setItem("sopung-camp-v1", JSON.stringify(data));
  }, state);
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
}

const saved = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("sopung-camp-v1")!) as State,
  );

test("기존 PC의 저장된 배치 적용은 취소·백업·확인·재실행과 예약 연결을 지원", async ({
  page,
}) => {
  const state = sopungInitialState();
  const site = state.sites.find((s) => s.label === "마7")!;
  site.layout = { x: 34, y: 45 };
  const guest = addReservation(state, {
    name: "배치 검증 손님",
    phone: "",
    arrival: "2026-11-06",
    departure: "2026-11-08",
    kind: "auto",
    source: "캠핏",
    people: 2,
    vehicle: "",
    note: "보존 메모",
    fee: 0,
    paid: false,
  });
  assign(state, guest.id, site.id, false, "2026-11-05T10:00:00");
  await seed(page, state);
  await page
    .getByRole("button", { name: "저장된 자리배치 적용", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "돌아가기", exact: true })
    .click();
  expect(await saved(page)).toEqual(state);
  await page
    .getByRole("button", { name: "저장된 자리배치 적용", exact: true })
    .click();
  const backupPending = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  const backup = await backupPending;
  expect(JSON.parse(await readFile((await backup.path())!, "utf8"))).toEqual(
    state,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const next = await saved(page);
  expect(next.sites).toEqual(bundledLayout.sites);
  expect(next.facilities).toHaveLength(bundledLayout.facilities.length);
  expect(next.facilities).toEqual(
    expect.arrayContaining(bundledLayout.facilities),
  );
  expect(next.reservations).toEqual(state.reservations);
  expect(next.allocations).toEqual(state.allocations);
  await page.reload();
  await expect(
    page.getByRole("group", { name: "소풍캠핑장 전체 구역 배치", exact: true }),
  ).toBeVisible();
  expect(await saved(page)).toEqual(next);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/bundled-layout-settings.png",
    fullPage: true,
  });
});

test("이미 빈 상태를 저장한 PC도 설정에서 저장된 편집 배치를 불러옴", async ({
  page,
}) => {
  await seed(page, emptyState());
  await page
    .getByRole("button", { name: "저장된 자리배치 적용", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "자리 배정", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "소풍캠핑장 전체 구역 배치", exact: true }),
  ).toBeVisible();
  expect((await saved(page)).sites).toEqual(bundledLayout.sites);
});

test("설치 앱에서 적용 전 백업이 실패하면 자리배치를 바꾸지 않음", async ({
  page,
}) => {
  const state = sopungInitialState();
  state.sites[0].layout = { x: 23, y: 45 };
  await page.addInitScript(() => {
    window.camp = {
      status: async () => ({
        configured: true,
        unlocked: true,
        mode: "pin",
        dataPath: "test-data",
        backupPath: "test-backups",
        lastBackup: "",
      }),
      load: async () => JSON.parse(localStorage.getItem("sopung-camp-v1")!),
      save: async (data) => {
        localStorage.setItem("sopung-camp-v1", JSON.stringify(data));
        return {};
      },
      backup: async () => {
        throw new Error("검증용 백업 폴더 쓰기 실패");
      },
      setup: async () => {},
      unlock: async () => {},
      lock: async () => {},
      restore: async () => ({}),
      chooseBackup: async () => null,
      openFolder: async () => {},
      openCampfit: async () => {},
      camfitProfile: async () => null,
      downloadCampfit: async () => {
        throw new Error("검증용 미연결");
      },
      saveCamfitProfile: async () => {},
      cancelCampfitSync: async () => {},
      quit: async () => {},
    };
  });
  await seed(page, state);
  await page
    .getByRole("button", { name: "저장된 자리배치 적용", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "검증용 백업 폴더 쓰기 실패",
  );
  expect(await saved(page)).toEqual(state);
});

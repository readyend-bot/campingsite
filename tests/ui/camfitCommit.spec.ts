import { test, expect, type Page } from "@playwright/test";
import { sopungInitialState } from "../../src/sitePlan";
import { prepareCamfitProfile } from "../../src/camfitSync";
import type { State } from "../../src/domain";

const originalLabel = "엑셀 다운로드";
const otherLabel = "예약 목록 내려받기";
const lastSync = "2026-11-01T00:00:00.000Z";
const table = [
  ["예약번호", "예약자 이름", "입실일", "퇴실일", "숙박 유형", "예약 상태"],
  [
    "CF-BUTTON-1",
    "버튼 확인 손님",
    "2030-01-01",
    "2030-01-03",
    "카라반",
    "예약",
  ],
];

async function openSync(page: Page, clickedLabel: string) {
  const received = {
    fileName: "reservations.csv",
    base64: Buffer.from(table.map((row) => row.join(",")).join("\n")).toString(
      "base64",
    ),
    route: "https://admin.camfit.co.kr/reservations",
    exportLabels: [originalLabel, otherLabel],
    clickedLabel,
  };
  const previous = {
    ...prepareCamfitProfile(
      table,
      { ...received, clickedLabel: originalLabel },
      null,
    ),
    lastSync,
  };
  await page.addInitScript(
    ({ initial, previous, received }) => {
      let data = initial;
      let profile = previous;
      const ok = async () => {};
      Object.assign(window, {
        camp: {
          status: async () => ({
            configured: true,
            unlocked: true,
            mode: "pin",
            dataPath: "test-data",
            backupPath: "test-backups",
            lastBackup: "",
            backupError: "",
            fileProblems: [],
          }),
          load: async () => structuredClone(data),
          save: async (next: State) => {
            data = structuredClone(next);
            return { backupError: "" };
          },
          setup: ok,
          unlock: ok,
          lock: ok,
          restore: async () => ({}),
          backup: async () => "test-backup.json",
          chooseBackup: async () => null,
          openFolder: ok,
          openCampfit: ok,
          camfitProfile: async () => structuredClone(profile),
          downloadCampfit: async () => structuredClone(received),
          saveCamfitProfile: async (next: typeof previous) => {
            profile = structuredClone(next);
          },
          cancelCampfitSync: ok,
          quit: ok,
          lookupArchives: async () => [],
        },
      });
    },
    { initial: sopungInitialState(), previous, received },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("button", { name: "캠핏 동기화", exact: true }).click();
}

test("확인한 내보내기 버튼의 같은 형식만 자동 저장", async ({ page }) => {
  await openSync(page, originalLabel);
  await expect(
    page.getByRole("heading", { name: "예약 목록을 동기화했어요" }),
  ).toBeVisible();
  const saved = await page.evaluate(async () => ({
    data: await window.camp!.load(),
    profile: await window.camp!.camfitProfile(),
  }));
  expect(saved.data?.reservations).toHaveLength(1);
  expect(saved.profile?.exportLabel).toBe(originalLabel);
  expect(saved.profile?.lastSync).not.toBe(lastSync);
});

for (const [name, clickedLabel] of [
  ["다른 내보내기 버튼", otherLabel],
  ["누른 버튼을 확인하지 못한 파일", ""],
] as const) {
  test(`${name}은 같은 열이어도 확인 전 예약과 마지막 동기화를 유지`, async ({
    page,
  }) => {
    await openSync(page, clickedLabel);
    const confirm = page.getByRole("button", {
      name: "연결하고 동기화",
      exact: true,
    });
    await expect(confirm).toBeEnabled();
    await expect(
      page.getByText(
        clickedLabel
          ? "이전에 연결한 내보내기와 달라요. 파일 내용을 확인한 뒤 연결해 주세요."
          : "어떤 내보내기로 받은 파일인지 확인하지 못했어요. 파일 내용을 확인한 뒤 연결해 주세요.",
        { exact: true },
      ),
    ).toBeVisible();
    const before = await page.evaluate(async () => ({
      data: await window.camp!.load(),
      profile: await window.camp!.camfitProfile(),
    }));
    expect(before.data?.reservations).toHaveLength(0);
    expect(before.profile?.exportLabel).toBe(originalLabel);
    expect(before.profile?.lastSync).toBe(lastSync);
    await confirm.click();
    await expect(
      page.getByRole("heading", { name: "예약 목록을 동기화했어요" }),
    ).toBeVisible();
    const after = await page.evaluate(async () => ({
      data: await window.camp!.load(),
      profile: await window.camp!.camfitProfile(),
    }));
    expect(after.data?.reservations).toHaveLength(1);
    expect(after.profile?.exportLabel).toBe(clickedLabel || originalLabel);
    expect(after.profile?.lastSync).not.toBe(lastSync);
  });
}

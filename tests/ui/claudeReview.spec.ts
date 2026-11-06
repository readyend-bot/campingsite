import { test, expect, type Page } from "@playwright/test";
import {
  addReservation,
  assign,
  emptyState,
  importRows,
  type State,
} from "../../src/domain";
import { sopungInitialState } from "../../src/sitePlan";

async function seed(page: Page, s: State) {
  await page.addInitScript((state) => {
    if (!localStorage.getItem("sopung-camp-v1"))
      localStorage.setItem("sopung-camp-v1", JSON.stringify(state));
  }, s);
  await page.goto("/");
}
const saved = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("sopung-camp-v1")!) as State,
  );
const guest = (name: string, arrival: string, departure: string) => ({
  name,
  phone: "",
  arrival,
  departure,
  kind: "auto" as const,
  source: "전화",
  people: 2,
  vehicle: "",
  note: "",
  fee: 0,
  paid: false,
});

test("현황 날짜에 다섯 자리 연도를 넣어도 화면이 사라지지 않고 기존 날짜를 유지", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date("2026-10-08T10:00:00+09:00"));
  await page.goto("/");
  const input = page.getByLabel("현황 날짜");
  await input.fill("20266-10-08");
  await expect(input).toHaveValue("2026-10-08");
  await expect(
    page.getByRole("heading", { name: "자리 배정", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "다음 날짜", exact: true }).click();
  await expect(input).toHaveValue("2026-10-09");
  expect(errors).toEqual([]);
});

test("입실 전 지정 객실을 입실 처리 없이 바꾸고 해제한 뒤 다시 지정", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T10:00:00+09:00"));
  const s = sopungInitialState();
  importRows(s, [
    {
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
    },
  ]);
  await seed(page, s);
  const dialog = page.getByRole("dialog");
  const openDetail = async () => {
    await page.getByRole("button", { name: "예약 명단", exact: true }).click();
    await page.getByRole("button", { name: "상세", exact: true }).click();
  };
  const current = async () => {
    const state = await saved(page);
    return state.allocations
      .filter((a) => a.state === "active")
      .map((a) => [a.siteId, a.start, a.end, state.reservations[0].status]);
  };
  await openDetail();
  await dialog.getByRole("button", { name: "객실 변경", exact: true }).click();
  await expect(dialog.locator("option", { hasText: "카라반 5" })).toHaveCount(
    0,
  );
  await dialog.getByLabel("객실", { exact: true }).selectOption("sopung-b-6");
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await current()).toEqual([
    ["sopung-b-6", "2026-10-20T14:00:00", "2026-10-22T11:00:00", "waiting"],
  ]);
  await openDetail();
  await dialog.getByRole("button", { name: "배정 해제", exact: true }).click();
  await expect(dialog).toContainText("카라반 6 배정을 해제할까요?");
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await current()).toEqual([]);
  await openDetail();
  await dialog.getByRole("button", { name: "객실 지정", exact: true }).click();
  await dialog.getByLabel("객실", { exact: true }).selectOption("sopung-b-5");
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await current()).toEqual([
    ["sopung-b-5", "2026-10-20T14:00:00", "2026-10-22T11:00:00", "waiting"],
  ]);
  const state = await saved(page);
  expect(state.reservations[0].externalId).toBe("C-1");
});

test("오늘 아침 퇴실한 자리에 지금 시각부터 사용중지를 등록하고 지난 이용 시간은 거절", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-08T13:00:00+09:00"));
  const s = sopungInitialState();
  const site = s.sites.find((x) => x.label === "나1")!.id;
  const r = addReservation(
    s,
    guest("아침 퇴실 손님", "2026-10-07", "2026-10-08"),
  );
  assign(s, r.id, site, true, "2026-10-07T15:00:00");
  await seed(page, s);
  await page
    .getByRole("button", { name: "장박·사용중지", exact: true })
    .click();
  await page
    .getByRole("button", { name: "장박·사용중지 등록", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("구분", { exact: true }).selectOption("disabled");
  await dialog.getByLabel("자리", { exact: true }).selectOption(site);
  await dialog.getByLabel("사용중지 사유", { exact: true }).fill("배수 공사");
  const time = dialog.getByLabel("시작 시각", { exact: true });
  await expect(time).toHaveValue("13:00");
  await time.fill("09:00");
  await dialog.getByRole("button", { name: "등록하기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "아침 퇴실 손님 님의 이용 기간과 겹쳐요",
  );
  await time.fill("13:00");
  await dialog.getByRole("button", { name: "등록하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const state = await saved(page);
  expect(state.blocks.map((b) => [b.siteId, b.type, b.start, b.end])).toEqual([
    [site, "disabled", "2026-10-08T13:00:00", "2026-11-07T11:00:00"],
  ]);
  // 다른 날을 고르면 0시, 오늘로 돌아오면 지금 시각이 기본값
  await page
    .getByRole("button", { name: "장박·사용중지 등록", exact: true })
    .click();
  await dialog.getByLabel("구분", { exact: true }).selectOption("disabled");
  await dialog.getByLabel("시작일", { exact: true }).fill("2026-10-20");
  await expect(time).toHaveValue("00:00");
  await dialog.getByLabel("시작일", { exact: true }).fill("2026-10-08");
  await expect(time).toHaveValue("13:00");
});

test("항공사진을 바꿔도 기존 사진 위치를 지우지 않고 확인을 안내", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-08T10:00:00+09:00"));
  const s = sopungInitialState();
  s.settings.aerial =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  Object.assign(s.sites[0], { x: 11, y: 22 });
  Object.assign(s.sites[1], { x: 33, y: 44 });
  await seed(page, s);
  await page.getByRole("button", { name: "자리 편집", exact: true }).click();
  await page
    .getByRole("button", { name: "항공사진 위치", exact: true })
    .click();
  await page
    .locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]')
    .setInputFiles({
      name: "새사진.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
  await expect(page.locator(".aerial-editor")).toContainText(
    "기존 위치 2곳은 그대로 두었으니",
  );
  const state = await saved(page);
  expect(state.settings.aerial).not.toBe(s.settings.aerial);
  expect(state.sites.slice(0, 2).map((x) => [x.x, x.y])).toEqual([
    [11, 22],
    [33, 44],
  ]);
});

test("오늘을 보던 화면은 자정 뒤 새 오늘을 따라가고 직접 고른 날짜는 유지", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-08T23:59:40+09:00") });
  await page.goto("/");
  const input = page.getByLabel("현황 날짜");
  await expect(input).toHaveValue("2026-10-08");
  await page.clock.fastForward(31000);
  await expect(input).toHaveValue("2026-10-09");
  await input.fill("2026-10-12");
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await expect(input).toHaveValue("2026-10-12");
});

test("큰 예약 명단은 쪽으로 나눠 보여 주고 검색은 전체 예약에서 찾음", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-08T10:00:00+09:00"));
  const s = emptyState();
  for (let i = 0; i < 230; i++) {
    const day = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    const next = new Date(Date.UTC(2025, 0, 2 + i)).toISOString().slice(0, 10);
    addReservation(
      s,
      guest(`명단 손님 ${String(i).padStart(3, "0")}`, day, next),
    );
  }
  await seed(page, s);
  await page.getByRole("button", { name: "예약 명단", exact: true }).click();
  const rows = page.locator(".list-panel tbody tr");
  const pager = page.getByRole("navigation", { name: "예약 명단 쪽" });
  await expect(rows).toHaveCount(100);
  await expect(pager).toContainText("1 / 3쪽 · 전체 230건");
  await expect(rows.first()).toContainText("명단 손님 229");
  await pager.getByRole("button", { name: "다음", exact: true }).click();
  await pager.getByRole("button", { name: "다음", exact: true }).click();
  await expect(pager).toContainText("3 / 3쪽");
  await expect(rows).toHaveCount(30);
  await page
    .getByRole("textbox", { name: "이름, 연락처, 차량, 메모 검색" })
    .fill("명단 손님 005");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("명단 손님 005");
  await expect(pager).toHaveCount(0);
});

test("지도 옆 예약자 명단도 쪽으로 나눠 전체 인원을 보여 주고 다음 쪽 손님을 선택·검색해도 날짜를 유지", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-08T10:00:00+09:00"));
  const s = sopungInitialState();
  for (let i = 0; i < 230; i++)
    addReservation(
      s,
      guest(
        `도착 손님 ${String(i).padStart(3, "0")}`,
        "2026-10-08",
        "2026-10-09",
      ),
    );
  await seed(page, s);
  const panel = page.locator(".guests-panel");
  const rows = panel.locator(".guest-row");
  const pager = page.getByRole("navigation", { name: "예약자 명단 쪽" });
  await expect(rows).toHaveCount(100);
  await expect(pager).toContainText("1 / 3쪽 · 전체 230명");
  await pager.getByRole("button", { name: "다음", exact: true }).click();
  await expect(pager).toContainText("2 / 3쪽");
  const target = rows.filter({ hasText: "도착 손님 150" });
  await expect(target).toHaveCount(1);
  await target.locator(".guest-row-content").click();
  await expect(page.locator(".selection-banner")).toContainText(
    "도착 손님 150",
  );
  await expect(page.getByLabel("현황 날짜")).toHaveValue("2026-10-08");
  await panel
    .getByRole("textbox", { name: "이름, 연락처 검색" })
    .fill("도착 손님 229");
  await expect(rows).toHaveCount(1);
  await expect(pager).toHaveCount(0);
  await expect(page.locator(".selection-banner")).toContainText(
    "도착 손님 150",
  );
});

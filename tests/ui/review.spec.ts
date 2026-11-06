import { test, expect } from "@playwright/test";
import { addReservation, assign, emptyState } from "../../src/domain";

test("화요일에도 월요일부터 시작하고 주 이동·연도 경계·이번 주를 맞춤", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-13T09:00:00+09:00"));
  await page.goto("/");
  await page.getByRole("button", { name: "숙박 캘린더", exact: true }).click();
  const times = page.locator(".calendar-wrap thead time");
  await expect(times).toHaveText([
    "10.12",
    "10.13",
    "10.14",
    "10.15",
    "10.16",
    "10.17",
    "10.18",
  ]);
  await expect(page.locator(".calendar-weekday")).toHaveText([
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
    "일요일",
  ]);
  await page.getByRole("button", { name: "다음 주", exact: true }).click();
  await expect(times).toHaveText([
    "10.19",
    "10.20",
    "10.21",
    "10.22",
    "10.23",
    "10.24",
    "10.25",
  ]);
  await page.getByRole("button", { name: "이전 주", exact: true }).click();
  await expect(times.first()).toHaveText("10.12");
  await page.getByRole("button", { name: "자리 배정", exact: true }).click();
  await page.getByLabel("현황 날짜", { exact: true }).fill("2027-01-01");
  await page.getByRole("button", { name: "숙박 캘린더", exact: true }).click();
  await expect(times).toHaveText([
    "12.28",
    "12.29",
    "12.30",
    "12.31",
    "1.1",
    "1.2",
    "1.3",
  ]);
  await page.getByRole("button", { name: "이번 주", exact: true }).click();
  await expect(times.first()).toHaveText("10.12");
  await page.screenshot({
    path: "docs/screenshots/calendar-monday-sunday.png",
    fullPage: true,
  });
});

test("캘린더가 표시한 손님을 열고 날짜 열을 눌러도 주간 범위를 유지", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-28T09:00:00+09:00"));
  const state = emptyState();
  state.sites.push({
    id: "site",
    label: "가1",
    area: "가",
    kind: "auto",
    archived: false,
  });
  const base = {
    name: "오전 퇴실 손님",
    phone: "",
    source: "전화",
    kind: "auto" as const,
    people: 2,
    note: "",
    vehicle: "",
    fee: 0,
    paid: false,
  };
  const morning = addReservation(state, {
    ...base,
    arrival: "2026-09-27",
    departure: "2026-09-28",
  });
  const afternoon = addReservation(state, {
    ...base,
    name: "오후 입실 손님",
    arrival: "2026-09-28",
    departure: "2026-09-29",
  });
  assign(state, morning.id, "site", true, "2026-09-27T15:00:00");
  assign(state, afternoon.id, "site", false);
  await page.addInitScript(
    (data) => localStorage.setItem("sopung-camp-v1", JSON.stringify(data)),
    state,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "숙박 캘린더", exact: true }).click();
  const dates = ["9.28", "9.29", "9.30", "10.1", "10.2", "10.3", "10.4"];
  await expect(page.locator(".calendar-wrap thead time")).toHaveText(dates);
  await expect(page.locator(".calendar-weekday")).toHaveText([
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
    "일요일",
  ]);
  await page.locator(".calendar-cell").first().click();
  await expect(page.getByRole("dialog").locator(".guest-hero")).toContainText(
    "오후 입실 손님",
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.locator(".calendar-cell").nth(3).click();
  await expect(page.getByRole("dialog")).toContainText(
    "2026년 10월 1일 목요일",
  );
  await expect(page.locator(".calendar-wrap thead time")).toHaveText(dates);
});

test("입실일과 장박 시작일을 지웠다가 다시 입력해도 화면과 요일 안내 유지", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "예약 등록", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("입실일", { exact: true }).fill("");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("입실일", { exact: true }).fill("2027-01-01");
  await expect(dialog).toContainText("2027년 1월 1일 금요일");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .getByRole("button", { name: "장박·사용중지", exact: true })
    .click();
  await page
    .getByRole("button", { name: "장박·사용중지 등록", exact: true })
    .click();
  await dialog.getByLabel("시작일", { exact: true }).fill("");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("시작일", { exact: true }).fill("2028-02-29");
  await expect(dialog).toContainText("2028년 2월 29일 화요일");
  expect(errors).toEqual([]);
});

test("새 파일 읽기에 실패하면 이전 명단을 대신 가져올 수 없음", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "명단 가져오기", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const input = dialog.locator("input[type=file]");
  await input.setInputFiles("tests/fixtures/reservations.xlsx");
  await expect(
    dialog.getByRole("button", { name: "1건 가져오기", exact: true }),
  ).toBeEnabled();
  await input.setInputFiles({
    name: "깨진파일.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("broken xlsx"),
  });
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.locator(".import-preview")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "0건 가져오기", exact: true }),
  ).toBeDisabled();
});

test("예약 명단은 입실 손님도 기본 검색하고 결과가 없으면 안내", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "예약 명단", exact: true }).click();
  const search = page.getByRole("textbox", {
    name: "이름, 연락처, 차량, 메모 검색",
    exact: true,
  });
  await search.fill("김민준");
  await expect(page.locator(".list-panel tbody tr")).toHaveCount(1);
  await expect(page.locator(".list-panel tbody tr")).toContainText("입실");
  await search.fill("명단에없는이름");
  await expect(
    page.getByText("검색 결과가 없어요", { exact: true }),
  ).toBeVisible();
});

test("자리 등록 전에도 가져온 예약 명단을 확인할 수 있음", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "실제 운영 시작", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await page
    .getByRole("button", { name: "명단 가져오기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/reservations.xlsx");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "1건 가져오기", exact: true })
    .click();
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await page.getByRole("button", { name: "예약 명단", exact: true }).click();
  await expect(page.locator(".list-panel tbody tr")).toHaveCount(1);
});

test("연락처와 이름 수정 후 공백을 넣은 전화번호로 검색하고 재실행해도 보존", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "예약 명단", exact: true }).click();
  let search = page.getByRole("textbox", {
    name: "이름, 연락처, 차량, 메모 검색",
    exact: true,
  });
  await search.fill("김민준");
  await page
    .locator(".list-panel tbody")
    .getByRole("button", { name: "상세", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "정보·요금 수정", exact: true })
    .click();
  await dialog
    .getByLabel("예약자 이름", { exact: true })
    .fill("수정 확인 손님");
  await dialog.getByLabel("연락처", { exact: true }).fill("010-1234-5678");
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "예약 명단", exact: true }).click();
  search = page.getByRole("textbox", {
    name: "이름, 연락처, 차량, 메모 검색",
    exact: true,
  });
  await search.fill("010 1234 5678");
  await expect(page.locator(".list-panel tbody tr")).toHaveCount(1);
  await expect(page.locator(".list-panel tbody tr")).toContainText(
    "수정 확인 손님",
  );
});

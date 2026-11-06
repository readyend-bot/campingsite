import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T15:00:00+09:00"));
});
test("XLSX 명단을 읽고 저장", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "명단 가져오기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/reservations.xlsx");
  await expect(page.getByRole("dialog")).toContainText(
    "가져오기 미리보기 · 1건",
  );
  await page.getByRole("button", { name: "1건 가져오기", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("신규 1건");
});
test("인쇄 화면에 명단과 배치도 표시, 관리 버튼 숨김", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".map-panel")).toBeVisible();
  await page.setViewportSize({ width: 960, height: 680 });
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printRequested = "true";
    };
  });
  await page.getByRole("button", { name: "인쇄", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-requested",
    "true",
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("main")).toBeHidden();
  await expect(page.locator(".print-report")).toBeVisible();
  await expect(page.locator(".print-report")).toContainText("자리별 손님 명단");
  await expect(page.locator(".print-report")).toContainText("동별 배치도");
  await page.pdf({
    path: "docs/screenshots/print-preview.pdf",
    format: "A4",
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
  });
});
test("예약 등록, 배정, 즉시 이동과 새로고침 뒤 데이터 보존", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("체험 데이터", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "예약 등록", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("예약자 이름", { exact: true }).fill("기능검증 손님");
  await dialog.getByLabel("연락처", { exact: true }).fill("010-0000-2222");
  await dialog.getByRole("button", { name: "예약 등록", exact: true }).click();
  await expect(page.locator(".selection-banner")).toContainText(
    "기능검증 손님",
  );
  await page
    .locator(".map-panel")
    .getByRole("button", { name: "가1 빈자리", exact: true })
    .click();
  await page.getByRole("button", { name: "배정하고 입실" }).click();
  const assigned = page
    .locator(".map-panel")
    .getByRole("button", { name: "가1 입실 기능검증 손님", exact: true });
  await expect(assigned).toHaveClass(/assigned/);
  await page.reload();
  await expect(assigned).toBeVisible();
  await assigned.click();
  await page.getByRole("button", { name: "자리 이동", exact: true }).click();
  await page
    .getByLabel("이동할 자리", { exact: true })
    .selectOption("demo-가-10");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(
    page
      .locator(".map-panel")
      .getByRole("button", { name: "가10 입실 기능검증 손님", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".map-panel")
      .getByRole("button", { name: "가1 빈자리", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("색상 구분, 캘린더, 작은 화면의 가로 넘침 없음", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".site-tile.empty").first()).toBeVisible();
  await expect(page.locator(".site-tile.assigned").first()).toBeVisible();
  const colors = await page
    .locator(".map-panel .site-tile")
    .evaluateAll((nodes) =>
      Object.fromEntries(
        ["empty", "assigned", "long"].map((type) => [
          type,
          getComputedStyle(nodes.find((n) => n.classList.contains(type))!)
            .backgroundColor,
        ]),
      ),
    );
  expect(new Set(Object.values(colors)).size).toBe(3);
  await page.screenshot({
    path: "docs/screenshots/desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "숙박 캘린더", exact: true }).click();
  await expect(page.locator(".calendar-cell").first()).toBeVisible();
  await page.getByRole("button", { name: "자리 배정", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("명단 열 연결, CSV 가져오기, 반복 가져오기 중복 방지", async ({
  page,
}) => {
  await page.goto("/");
  const csv =
    "예약번호,예약자 이름,입실일,퇴실일,숙박 유형,연락처\nUI-001,가져오기 손님,2026-10-10,2026-10-12,오토캠핑,010-0000-3333\n";
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "명단 가져오기", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .locator("input[type=file]")
      .setInputFiles({
        name: "test.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });
    await expect(page.getByRole("dialog")).toContainText(
      "가져오기 미리보기 · 1건",
    );
    await page
      .getByRole("button", { name: "1건 가져오기", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      i ? "신규 0건" : "신규 1건",
    );
    await page.getByRole("button", { name: "완료", exact: true }).click();
  }
  const count = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("sopung-camp-v1")!).reservations.filter(
        (r: { externalId: string }) => r.externalId === "UI-001",
      ).length,
  );
  expect(count).toBe(1);
});
test("실제 운영 전환 시 예시 제거, 자리 생성과 장박 표시", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "실제 운영 시작" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(
    page.getByText("우리 캠핑장의 첫 자리를 등록해요"),
  ).toBeVisible();
  await page.getByRole("button", { name: "자리 등록", exact: true }).click();
  await page.getByLabel("자리 이름", { exact: true }).fill("가1");
  await page.getByRole("button", { name: "자리 저장", exact: true }).click();
  await page
    .getByRole("button", { name: "장박·사용중지", exact: true })
    .click();
  await page
    .getByRole("button", { name: "장박·사용중지 등록", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("자리", { exact: true })
    .selectOption({ label: "가1" });
  await page.getByLabel("장박자 이름", { exact: true }).fill("장박 검증");
  await page.getByRole("button", { name: "등록하기", exact: true }).click();
  await page.getByRole("button", { name: "자리 배정", exact: true }).click();
  await expect(
    page
      .locator(".map-panel")
      .getByRole("button", { name: "가1 장박 장박 검증", exact: true }),
  ).toHaveClass(/long/);
});

import { test, expect, type Page } from "@playwright/test";
import {
  addReservation,
  assign,
  emptyState,
  type State,
} from "../../src/domain";

function fixture() {
  const s = emptyState();
  s.sites = [
    { id: "a1", area: "가", label: "가1", kind: "auto", archived: false },
    { id: "a2", area: "가", label: "가2", kind: "auto", archived: false },
    { id: "b1", area: "나", label: "나1", kind: "auto", archived: false },
  ];
  const r = addReservation(s, {
    name: "배치 검증 손님",
    phone: "",
    arrival: "2026-09-28",
    departure: "2026-10-01",
    kind: "auto",
    source: "전화",
    people: 2,
    note: "",
    vehicle: "",
    fee: 0,
    paid: false,
  });
  assign(s, r.id, "a1", true, "2026-09-28T09:00:00");
  return s;
}
async function openEditor(page: Page, s = fixture()) {
  await page.clock.setFixedTime(new Date("2026-09-29T09:00:00+09:00"));
  await page.addInitScript((data) => {
    if (!localStorage.getItem("sopung-camp-v1"))
      localStorage.setItem("sopung-camp-v1", JSON.stringify(data));
  }, s);
  await page.goto("/");
  await page.getByRole("button", { name: "자리 편집", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "가동 위치 편집", exact: true }),
  ).toBeVisible();
}
async function stored(page: Page): Promise<State> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("sopung-camp-v1")!),
  );
}
async function point(page: Page, x: number, y: number) {
  const stage = page.locator(".area-layout-editor .area-layout-stage");
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  return {
    x: box.x + (box.width * x) / 100,
    y: box.y + (box.height * y) / 100,
  };
}

test("동별 클릭 배치·미세 이동·되돌리기와 재실행, 배정 화면·인쇄 반영", async ({
  page,
}) => {
  const s = fixture();
  await openEditor(page, s);
  const destination = await point(page, 30, 40);
  await page.mouse.click(destination.x, destination.y);
  await expect
    .poll(async () => (await stored(page)).sites[0].layout)
    .toBeDefined();
  const initial = (await stored(page)).sites[0].layout!;
  expect(Math.abs(initial.x - 30)).toBeLessThan(0.3);
  expect(Math.abs(initial.y - 40)).toBeLessThan(0.3);
  const marker = page.getByRole("button", {
    name: "가1 위치 이동",
    exact: true,
  });
  await marker.press("ArrowRight");
  await expect
    .poll(async () => (await stored(page)).sites[0].layout?.x)
    .toBeCloseTo(initial.x + 1, 5);
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).sites[0].layout?.x)
    .toBe(initial.x);
  await page.getByRole("button", { name: "나동", exact: true }).click();
  await page.getByRole("button", { name: "가운데 놓기", exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).sites[2].layout)
    .toEqual({ x: 50, y: 50 });
  await page.reload();
  await page
    .locator(".map-panel")
    .getByRole("button", { name: "가동", exact: true })
    .click();
  const mapMarker = page.locator(
    '.map-panel .area-layout-marker[data-site-id="a1"]',
  );
  await expect(mapMarker).toHaveAttribute(
    "style",
    `left: ${initial.x}%; top: ${initial.y}%;`,
  );
  await mapMarker.getByRole("button").click();
  await expect(page.getByRole("dialog").locator(".guest-hero")).toContainText(
    "배치 검증 손님",
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  await expect(
    page.locator('.print-report .area-layout-marker[data-site-id="a1"]'),
  ).toHaveAttribute("style", `left: ${initial.x}%; top: ${initial.y}%;`);
  const saved = await stored(page);
  expect(saved.reservations).toEqual(s.reservations);
  expect(saved.allocations).toEqual(s.allocations);
});

test("미지정 사이트를 끌어 놓고 다시 이동해도 자동 저장", async ({ page }) => {
  await openEditor(page);
  const target = await point(page, 40, 30);
  const source = page.getByRole("button", {
    name: "가1 위치 지정",
    exact: true,
  });
  await source.scrollIntoViewIfNeeded();
  const box = (await source.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await stored(page)).sites[0].layout)
    .toEqual({ x: 40, y: 30 });
  const marker = page.getByRole("button", {
    name: "가1 위치 이동",
    exact: true,
  });
  const initial = (await marker.boundingBox())!;
  const next = await point(page, 70, 65);
  await page.mouse.move(
    initial.x + initial.width / 2,
    initial.y + initial.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(next.x, next.y, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await stored(page)).sites[0].layout)
    .toEqual({ x: 70, y: 65 });
});

test("격자 정렬·위치 해제·되돌리기는 선택한 동에만 적용", async ({ page }) => {
  const s = fixture();
  s.sites[2].layout = { x: 23, y: 78 };
  await openEditor(page, s);
  await page.getByRole("button", { name: "격자로 정렬", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await stored(page)).sites.filter((site) => site.layout).length,
    )
    .toBe(3);
  const grid = (await stored(page)).sites[0].layout;
  await page
    .getByRole("button", { name: "선택 위치 해제", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page)).sites[0].layout)
    .toBeUndefined();
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).sites[0].layout)
    .toEqual(grid);
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await stored(page)).sites.filter((site) => site.layout).length,
    )
    .toBe(1);
  expect((await stored(page)).sites[2].layout).toEqual({ x: 23, y: 78 });
});

test("동을 변경한 사이트는 새 동에서 위치 미지정으로 표시", async ({
  page,
}) => {
  const s = fixture();
  s.sites[0].layout = { x: 20, y: 30 };
  await openEditor(page, s);
  await page.getByRole("button", { name: "자리 목록", exact: true }).click();
  await page
    .locator("tbody tr")
    .filter({ hasText: "가1" })
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await page.getByLabel("동", { exact: true }).selectOption("나");
  await page.getByRole("button", { name: "자리 저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "동별 배치", exact: true }).click();
  await page.getByRole("button", { name: "나동", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "가1 위치 지정", exact: true }),
  ).toBeVisible();
  expect((await stored(page)).allocations).toEqual(s.allocations);
});

test("작은 창에서도 페이지 넘침 없이 위치 편집과 배정 가능", async ({
  page,
}) => {
  const s = fixture();
  s.sites[0].layout = { x: 25, y: 35 };
  s.sites[1].layout = { x: 65, y: 60 };
  await openEditor(page, s);
  for (const viewport of [
    { width: 960, height: 680 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "오른쪽으로 이동", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "오른쪽으로 이동", exact: true }),
    ).toBeEnabled();
  }
  expect((await stored(page)).sites[0].layout?.x).toBe(27);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/area-layout-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "자리 배정", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/area-layout-map.png",
    fullPage: true,
  });
});

test("저장 실패 시 원래 위치를 유지하고 재시도와 되돌리기 가능", async ({
  page,
}) => {
  const s = fixture();
  s.sites[0].layout = { x: 25, y: 35 };
  await openEditor(page, s);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "sopung-camp-v1")
        throw new DOMException("검증용 저장 실패", "QuotaExceededError");
      return original.call(this, key, value);
    };
    window.addEventListener(
      "restore-test-storage",
      () => {
        Storage.prototype.setItem = original;
      },
      { once: true },
    );
  });
  await page
    .getByRole("button", { name: "오른쪽으로 이동", exact: true })
    .click();
  await expect(
    page.locator(".area-layout-editor").getByRole("alert"),
  ).toContainText("이전 위치를 유지");
  expect((await stored(page)).sites[0].layout).toEqual({ x: 25, y: 35 });
  await expect(
    page.getByRole("button", { name: "되돌리기", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("restore-test-storage")),
  );
  await page
    .getByRole("button", { name: "오른쪽으로 이동", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page)).sites[0].layout?.x)
    .toBe(26);
  await expect(
    page.locator(".area-layout-editor").getByRole("alert"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).sites[0].layout)
    .toEqual({ x: 25, y: 35 });
});

test("배치도 밖에 놓은 미지정 자리는 취소하고 지정된 자리는 테두리 안에 유지", async ({
  page,
}) => {
  const s = fixture();
  s.sites[0].layout = { x: 0, y: 100 };
  await openEditor(page, s);
  const marker = page.getByRole("button", {
    name: "가1 위치 이동",
    exact: true,
  });
  await marker.press("ArrowLeft");
  await marker.press("ArrowDown");
  expect((await stored(page)).sites[0].layout).toEqual({ x: 0, y: 100 });
  const tray = page.getByRole("button", { name: "가2 위치 지정", exact: true });
  await tray.scrollIntoViewIfNeeded();
  const bounds = (await tray.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 20, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(tray).toBeVisible();
  expect((await stored(page)).sites[1].layout).toBeUndefined();
  await expect(page.locator(".layout-drag-preview")).toHaveCount(0);
});

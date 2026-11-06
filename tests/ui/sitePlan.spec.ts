import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  addBlock,
  addReservation,
  assign,
  emptyState,
  type State,
} from "../../src/domain";
import { sopungInitialState } from "../../src/sitePlan";
async function open(page: Page, state: State = emptyState()) {
  await page.clock.setFixedTime(new Date("2026-10-05T10:00:00+09:00"));
  await page.addInitScript((data) => {
    if (!localStorage.getItem("sopung-camp-v1"))
      localStorage.setItem("sopung-camp-v1", JSON.stringify(data));
  }, state);
  await page.goto("/");
}
const saved = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("sopung-camp-v1")!) as State,
  );
// 선 두께를 포함할 수 있는 SVG 바깥 상자 대신 실제 꺾임 좌표를 비교한다.
const turnX = (branch: Locator) =>
  branch.evaluate((node) => {
    const path = node as SVGPathElement;
    return path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!).x;
  });

test("마동 자동 맞춤은 확대 전 원본 크기로 넘치거나 화면 높이가 반복해서 흔들리지 않음", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 760 });
  await open(page, sopungInitialState());
  await page
    .getByRole("button", { name: "마동 상세 배치 보기", exact: true })
    .click();
  await expect(page.locator(".map-panel .area-layout-marker")).toHaveCount(15);
  const dimensions = await page
    .locator(".map-panel .area-layout-viewport")
    .evaluate(async (viewport) => {
      await document.fonts.ready;
      const samples: {
        width: number;
        height: number;
        scrollWidth: number;
        scrollHeight: number;
      }[] = [];
      for (let i = 0; i < 45; i++) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (i >= 15)
          samples.push({
            width: viewport.clientWidth,
            height: viewport.clientHeight,
            scrollWidth: viewport.scrollWidth,
            scrollHeight: viewport.scrollHeight,
          });
      }
      return samples;
    });
  expect(
    new Set(dimensions.map((size) => `${size.width}:${size.height}`)).size,
  ).toBe(1);
  expect(dimensions.at(-1)!.scrollWidth).toBeLessThanOrEqual(
    dimensions.at(-1)!.width + 1,
  );
  expect(dimensions.at(-1)!.scrollHeight).toBeLessThanOrEqual(
    dimensions.at(-1)!.height + 1,
  );
  await page.getByRole("button", { name: "크게 보기", exact: true }).click();
  await page.getByRole("button", { name: "한눈에 보기", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "마8 빈자리", exact: true }),
  ).toBeVisible();
});

test("도면을 적용해 7개 동과 140자리·시설·카라반 종류를 표시", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "소풍캠핑장 도면 적용", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "소풍캠핑장 전체 구역 배치", exact: true }),
  ).toBeVisible();
  expect((await saved(page)).sites.length).toBe(140);
  expect((await saved(page)).blocks).toEqual([]);
  await expect(page.locator(".camp-plan .overview-site")).toHaveCount(140);
  await expect(page.locator(".camp-plan .overview-facility")).toHaveCount(15);
  await expect(page.locator(".camp-plan .overview-stairway")).toHaveCount(2);
  // 글꼴 로딩 중 레이아웃 변화가 끼지 않도록 같은 시점의 위치를 비교한다.
  const geometry = await page.locator(".camp-plan").evaluate((svg) => {
    const rect = (selector: string) =>
      svg.querySelector(selector)!.getBoundingClientRect().toJSON();
    const area = (name: string) =>
      rect(`.overview-region-${name} .overview-boundary`);
    return {
      ga: area("가"),
      na: area("나"),
      a: area("A"),
      ra: area("라"),
      da: area("다"),
      ma: area("마"),
      lowerRoad: rect(".camp-lower-road"),
      upperRoad: rect(".camp-upper-road"),
      branch: rect(".camp-branch-road"),
      raSink: rect('[data-facility-id="sopung-facility-ra-sink"]'),
    };
  });
  const { ga, na, a, ra, da, ma, lowerRoad, upperRoad, branch, raSink } =
    geometry;
  expect(ga.width).toBeLessThan(na.width * 0.6);
  expect(na.x).toBeLessThan(ga.x);
  expect(ma.x).toBeGreaterThan(ra.x + ra.width);
  expect(ma.y).toBeCloseTo(a.y, 1);
  expect(ma.y + ma.height).toBeCloseTo(ra.y + ra.height, 1);
  expect(ma.y + ma.height).toBeLessThan(da.y);
  expect(ma.height).toBeGreaterThan(ra.height * 1.8);
  expect(upperRoad.x).toBeGreaterThan(lowerRoad.x);
  expect(branch.x).toBeLessThan(upperRoad.x);
  expect(branch.x + branch.width).toBeCloseTo(ma.x, 1);
  expect(branch.y).toBeCloseTo(raSink.y + raSink.height / 2, 1);
  await expect(page.locator(".overview-stair-flight")).toHaveCount(2);
  await expect(page.locator(".camp-plan")).toContainText("A·B동 오르막");
  await expect(page.locator(".camp-plan")).toContainText("직진 · 마동");
  await page.screenshot({
    path: "docs/screenshots/site-plan-overview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "B동 상세 배치 보기", exact: true })
    .click();
  await expect(page.locator(".map-panel .plan-facility")).toHaveCount(3);
  await expect(page.locator(".map-panel")).toContainText("수영장");
  await expect(
    page.getByRole("button", { name: "카라반 8 빈자리", exact: true }),
  ).toContainText("스페셜3");
  await page
    .getByRole("button", { name: "카라반 8 빈자리", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("스페셜3");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/site-plan-b.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("group", { name: "소풍캠핑장 전체 구역 배치", exact: true }),
  ).toBeVisible();
  for (const [area, count] of [
    ["다", 1],
    ["나", 2],
    ["가", 1],
  ] as const) {
    await page
      .getByRole("button", { name: `${area}동 상세 배치 보기`, exact: true })
      .click();
    await expect(page.locator(".map-panel .plan-stair")).toHaveCount(count);
    await page
      .getByRole("button", { name: "전체 배치로", exact: true })
      .click();
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-report .plan-facility")).toHaveCount(15);
  await expect(page.locator(".print-report .plan-stair")).toHaveCount(4);
  await expect(page.locator(".print-report .area-layout-marker")).toHaveCount(
    140,
  );
  const maPlan = page
    .locator(".print-report")
    .getByRole("group", { name: "마동 배치도", exact: true });
  expect((await maPlan.boundingBox())!.height).toBeLessThanOrEqual(606);
});

test("전체 지도가 실제 상태·시설 이동을 반영하고 키보드로 동 상세를 선택", async ({
  page,
}) => {
  const state = sopungInitialState();
  const ga1 = state.sites.find((s) => s.label === "가1")!;
  const ga2 = state.sites.find((s) => s.label === "가2")!;
  for (const [site, type] of [
    [ga1, "long"],
    [ga2, "disabled"],
  ] as const)
    addBlock(state, {
      siteId: site.id,
      type,
      name: "검증용 점유",
      phone: "",
      note: "",
      start: "2026-10-05T00:00:00",
      end: "2026-10-07T11:00:00",
    });
  const guest = addReservation(state, {
    name: "배치 색상 검증",
    phone: "",
    arrival: "2026-10-05",
    departure: "2026-10-06",
    kind: "auto",
    source: "캠핏",
    people: 2,
    vehicle: "",
    note: "",
    fee: 0,
    paid: false,
  });
  assign(
    state,
    guest.id,
    state.sites.find((s) => s.label === "A1")!.id,
    false,
    "2026-10-05T10:00:00",
  );
  await open(page, state);
  const colors = await page
    .locator(".camp-plan .overview-site")
    .evaluateAll((nodes) =>
      ["empty", "assigned", "long", "disabled"].map(
        (type) =>
          getComputedStyle(
            nodes
              .find((n) => n.classList.contains(type))!
              .querySelector("rect")!,
          ).fill,
      ),
    );
  expect(new Set(colors).size).toBe(4);
  const pool = page.locator(
    '.camp-plan [data-facility-id="sopung-facility-b-pool"]',
  );
  const initialX = (await pool.boundingBox())!.x;
  const b = page.getByRole("button", {
    name: "B동 상세 배치 보기",
    exact: true,
  });
  await b.focus();
  await b.press("Enter");
  await expect(
    page.getByRole("heading", { name: "B동 상세 배치", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "B동 배치 수정", exact: true })
    .click();
  await page.getByRole("button", { name: "시설 위치", exact: true }).click();
  await page
    .getByLabel("이동할 시설", { exact: true })
    .selectOption("sopung-facility-b-pool");
  await page
    .getByRole("button", { name: "오른쪽으로 이동", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).facilities!.find((f) => f.type === "pool")!.layout!
          .x,
    )
    .toBe(54);
  await page.getByRole("button", { name: "자리 배정", exact: true }).click();
  await page.getByRole("button", { name: "전체 배치로", exact: true }).click();
  expect((await pool.boundingBox())!.x).toBeGreaterThan(initialX);
  expect((await saved(page)).blocks).toEqual(state.blocks);
  const a = page.getByRole("button", {
    name: "A동 상세 배치 보기",
    exact: true,
  });
  await a.focus();
  await a.press("Space");
  await expect(
    page.getByRole("heading", { name: "A동 상세 배치", exact: true }),
  ).toBeVisible();
});

test("시설 위치 변경·되돌리기와 사이트 위치는 독립 저장", async ({ page }) => {
  const s = sopungInitialState();
  await open(page, s);
  await page.getByRole("button", { name: "자리 편집", exact: true }).click();
  await page.getByRole("button", { name: "B동", exact: true }).click();
  await page.getByRole("button", { name: "시설 위치", exact: true }).click();
  await page
    .getByLabel("이동할 시설", { exact: true })
    .selectOption("sopung-facility-b-pool");
  await page
    .getByRole("button", { name: "오른쪽으로 이동", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).facilities!.find((f) => f.type === "pool")!.layout!
          .x,
    )
    .toBe(54);
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await saved(page)).facilities!.find((f) => f.type === "pool")!.layout!
          .x,
    )
    .toBe(53);
  expect((await saved(page)).sites).toEqual(s.sites);
  await page.getByRole("button", { name: "사이트 위치", exact: true }).click();
  await page.getByRole("button", { name: "라동", exact: true }).click();
  await expect(
    page
      .locator(".area-layout-editor .site-type-label")
      .filter({ hasText: "글램핑" }),
  ).toHaveCount(11);
  await page.getByRole("button", { name: "한눈에 보기", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/site-plan-ra-editor.png",
    fullPage: true,
  });
});

test("전체 배치에서 동 상세를 오가도 손님·날짜를 유지하고 자리를 배정", async ({
  page,
}) => {
  await open(page, sopungInitialState());
  await page.getByRole("button", { name: "예약 등록", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("예약자 이름", { exact: true })
    .fill("동 선택 검증 손님");
  await dialog.getByRole("button", { name: "예약 등록", exact: true }).click();
  await expect(page.locator(".selection-banner")).toContainText(
    "동 선택 검증 손님",
  );
  const day = page.getByLabel("현황 날짜", { exact: true });
  await day.fill("2026-10-06");
  await page
    .getByRole("button", { name: "B동 상세 배치 보기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "B동 상세 배치", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".map-panel .area-layout-marker")).toHaveCount(18);
  await page.getByRole("button", { name: "전체 배치로", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "소풍캠핑장 전체 구역 배치", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "A동 상세 배치 보기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A동 상세 배치", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".map-panel .area-layout-marker")).toHaveCount(26);
  await expect(page.locator(".selection-banner")).toContainText(
    "동 선택 검증 손님",
  );
  await expect(day).toHaveValue("2026-10-06");
  await day.fill("2026-10-05");
  await page.getByRole("button", { name: "A1 빈자리", exact: true }).click();
  await expect(dialog).toContainText("동 선택 검증 손님");
  await dialog
    .getByRole("button", { name: "배정하고 입실", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "A1 입실 동 선택 검증 손님",
      exact: true,
    }),
  ).toBeVisible();
  const state = await saved(page);
  expect(state.reservations[0].status).toBe("checkedIn");
  expect(state.allocations[0].siteId).toBe(
    state.sites.find((s) => s.area === "A" && s.label === "A1")!.id,
  );
  await page.getByRole("button", { name: "전체 배치로", exact: true }).click();
  await page
    .getByRole("button", { name: "A동 상세 배치 보기", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "A1 입실 동 선택 검증 손님",
      exact: true,
    }),
  ).toBeVisible();
});

test("좁은 창에서도 도면 전체 보기·확대와 기존 손님 배정 동작", async ({
  page,
}) => {
  await open(page, sopungInitialState());
  await page
    .getByRole("button", { name: "A동 상세 배치 보기", exact: true })
    .click();
  for (const viewport of [
    { width: 960, height: 680 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".map-panel .area-layout-marker")).toHaveCount(
      26,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "크게 보기", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "한눈에 보기", exact: true })
      .click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "A1 빈자리", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("A1");
});

test("도로 모서리 위 트램펄린과 마7·8 단차 선은 전체·상세·편집·인쇄에 반영", async ({
  page,
}) => {
  const state = sopungInitialState();
  state.sitePlan = "sopung-user-plan-2026-10-06";
  state.facilities!.find(
    (item) => item.id === "sopung-facility-ra-trampoline",
  )!.layout = { x: 93, y: 0 };
  state.facilities!.find(
    (item) => item.id === "sopung-facility-ra-trampoline",
  )!.width = 10;
  await open(page, state);
  expect(
    (await saved(page)).facilities!.find(
      (item) => item.id === "sopung-facility-ra-trampoline",
    )!.layout,
  ).toEqual({ x: 84.4, y: 0 });
  const whole = await page.locator(".camp-plan").evaluate((svg) => {
    const box = (selector: string) =>
      svg.querySelector(selector)!.getBoundingClientRect().toJSON();
    const trampoline = box(
      '[data-facility-id="sopung-facility-ra-trampoline"]',
    );
    return {
      sink: box('[data-facility-id="sopung-facility-ra-sink"]'),
      trampoline,
      road: box(".camp-lower-road"),
      branch: box(".camp-branch-road"),
      branchStroke:
        parseFloat(
          getComputedStyle(svg.querySelector(".camp-branch-road")!).strokeWidth,
        ) * (svg as SVGSVGElement).getScreenCTM()!.a,
      a: box(".overview-region-A .overview-boundary"),
      ra: box(".overview-region-라 .overview-boundary"),
      coveredSites: [...svg.querySelectorAll(".overview-site")]
        .filter((node) => {
          const site = node.getBoundingClientRect();
          return (
            trampoline.left < site.right &&
            trampoline.right > site.left &&
            trampoline.top < site.bottom &&
            trampoline.bottom > site.top
          );
        })
        .map((node) => node.getAttribute("data-site-id")),
    };
  });
  expect(whole.trampoline.x).toBeGreaterThan(whole.sink.x + whole.sink.width);
  expect(whole.trampoline.x).toBeGreaterThan(whole.ra.right);
  expect(
    Math.abs(
      whole.trampoline.x +
        whole.trampoline.width / 2 -
        (whole.road.x + whole.road.width / 2),
    ),
  ).toBeLessThan(whole.trampoline.width * 0.15);
  expect(whole.trampoline.bottom).toBeLessThan(
    whole.branch.y - whole.branchStroke / 2,
  );
  expect(whole.trampoline.top).toBeGreaterThan(whole.a.bottom);
  expect(whole.coveredSites).toEqual([]);
  await expect(page.locator(".overview-raised-terrace")).toHaveCount(1);
  await page
    .getByRole("button", { name: "라동 상세 배치 보기", exact: true })
    .click();
  const sink = (await page
    .locator('.map-panel [data-facility-id="sopung-facility-ra-sink"]')
    .boundingBox())!;
  const trampoline = (await page
    .locator('.map-panel [data-facility-id="sopung-facility-ra-trampoline"]')
    .boundingBox())!;
  expect(trampoline.x).toBeGreaterThan(sink.x + sink.width);
  const branch = (await page
    .locator(".map-panel .plan-approach-branch")
    .boundingBox())!;
  expect(trampoline.y + trampoline.height).toBeLessThan(branch.y);
  expect(
    Math.abs(
      trampoline.x +
        trampoline.width / 2 -
        (await turnX(page.locator(".map-panel .plan-approach-branch"))),
    ),
  ).toBeLessThan(2);
  await expect(page.locator(".map-panel .facility-trampoline")).toContainText(
    "트램펄린",
  );
  await page.screenshot({
    path: "docs/screenshots/site-plan-ra.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "라동 배치 수정", exact: true })
    .click();
  await page.getByRole("button", { name: "시설 위치", exact: true }).click();
  const editTrampoline = (await page
    .locator(".area-layout-editor")
    .getByRole("button", { name: "트램펄린 위치 이동", exact: true })
    .boundingBox())!;
  const editBranch = (await page
    .locator(".area-layout-editor .plan-approach-branch")
    .boundingBox())!;
  expect(editTrampoline.y + editTrampoline.height).toBeLessThan(editBranch.y);
  expect(
    Math.abs(
      editTrampoline.x +
        editTrampoline.width / 2 -
        (await turnX(
          page.locator(".area-layout-editor .plan-approach-branch"),
        )),
    ),
  ).toBeLessThan(2);
  await page.getByRole("button", { name: "자리 배정", exact: true }).click();
  await page.getByRole("button", { name: "전체 배치로", exact: true }).click();
  await page
    .getByRole("button", { name: "마동 상세 배치 보기", exact: true })
    .click();
  await expect(page.locator(".map-panel .plan-terrace-edge")).toBeVisible();
  await expect(page.locator(".map-panel")).not.toContainText("계단 위");
  await page.getByRole("button", { name: "마7 빈자리", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("마7");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/site-plan-ma.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "마동 배치 수정", exact: true })
    .click();
  await expect(
    page.locator(".area-layout-editor .plan-terrace-edge"),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-report .plan-terrace-edge")).toHaveCount(1);
  await expect(
    page.locator(
      '.print-report [data-facility-id="sopung-facility-ra-trampoline"]',
    ),
  ).toContainText("트램펄린");
  const printedTrampoline = (await page
    .locator('.print-report [data-facility-id="sopung-facility-ra-trampoline"]')
    .boundingBox())!;
  const printedBranch = (await page
    .locator(".print-report .plan-approach-branch")
    .boundingBox())!;
  expect(printedTrampoline.y + printedTrampoline.height).toBeLessThan(
    printedBranch.y,
  );
  expect(
    Math.abs(
      printedTrampoline.x +
        printedTrampoline.width / 2 -
        (await turnX(page.locator(".print-report .plan-approach-branch"))),
    ),
  ).toBeLessThan(2);
});

import { test, expect, type Page } from "@playwright/test";
import {
  addReservation,
  assign,
  emptyState,
  type State,
} from "../../src/domain";
import { demoState } from "../../src/demo";
import { SOPUNG_PLAN_ID, sopungInitialState } from "../../src/sitePlan";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-08T10:00:00+09:00"));
});

async function seed(page: Page, s: State) {
  await page.addInitScript((state) => {
    if (!localStorage.getItem("sopung-camp-v1"))
      localStorage.setItem("sopung-camp-v1", JSON.stringify(state));
  }, s);
  await page.goto("/");
}

async function restore(page: Page, s: State) {
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: "검토백업.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(s)),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return await page.evaluate(
    () => JSON.parse(localStorage.getItem("sopung-camp-v1")!) as State,
  );
}

test("도면 없는 예전 백업 복원 시 현재 시설·도면 식별자가 남지 않음", async ({
  page,
}) => {
  await seed(page, sopungInitialState());
  const backup = emptyState();
  backup.sites.push({
    id: "old",
    label: "가1",
    area: "가",
    kind: "auto",
    archived: false,
    layout: { x: 35, y: 40 },
  });
  const saved = await restore(page, backup);
  expect(saved).toEqual(backup);
  await page.getByRole("button", { name: "자리 배정", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "소풍캠핑장 도면 적용", exact: true }),
  ).toBeVisible();
  await page.reload();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sopung-camp-v1")!),
    ),
  ).toEqual(backup);
});

test("예전 도면 백업은 복원 즉시 최신 위치로 갱신하고 편집·운영 기록을 유지", async ({
  page,
}) => {
  await seed(page, sopungInitialState());
  const backup = sopungInitialState();
  backup.sitePlan = "sopung-user-plan-2026-10-06";
  const trampoline = backup.facilities!.find(
    (f) => f.id === "sopung-facility-ra-trampoline",
  )!;
  trampoline.layout = { x: 93, y: 0 };
  backup.sites[0].layout = { x: 37.2, y: 56.4 };
  backup.sites[0].x = 17;
  backup.sites[0].y = 29;
  const r = addReservation(backup, {
    name: "복원 손님",
    phone: "",
    arrival: "2026-10-08",
    departure: "2026-10-10",
    kind: "auto",
    source: "캠핏",
    people: 2,
    vehicle: "",
    note: "현장 메모",
    fee: 0,
    paid: false,
  });
  assign(backup, r.id, backup.sites[0].id, true, "2026-10-08T09:00:00");
  const saved = await restore(page, backup);
  expect(saved.sitePlan).toBe(SOPUNG_PLAN_ID);
  expect(saved.facilities!.find((f) => f.id === trampoline.id)!.layout).toEqual(
    { x: 84.4, y: 0 },
  );
  expect(saved.sites).toEqual(backup.sites);
  expect(saved.reservations).toEqual(backup.reservations);
  expect(saved.allocations).toEqual(backup.allocations);
  await page.reload();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sopung-camp-v1")!),
    ),
  ).toEqual(saved);
});

test("실제 운영 전환 시 체험용 시설과 도면 정보도 함께 비움", async ({
  page,
}) => {
  const demo = demoState("2026-10-08");
  demo.sitePlan = SOPUNG_PLAN_ID;
  demo.facilities = sopungInitialState().facilities;
  await seed(page, demo);
  await page
    .getByRole("button", { name: "실제 운영 시작", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sopung-camp-v1")!),
    ),
  ).toEqual(emptyState());
});

test("수동 명단의 취소 완료 미리보기·저장과 미확인 상태 거절", async ({
  page,
}) => {
  await seed(page, emptyState());
  await page
    .getByRole("button", { name: "명단 가져오기", exact: true })
    .click();
  const upload = page.getByRole("dialog").locator('input[type="file"]');
  const csv = (status: string) =>
    `예약번호,예약자 이름,입실일,퇴실일,숙박 유형,예약 상태\nFINAL-1,검토 손님,2027-01-01,2027-01-03,오토캠핑,${status}\n`;
  await upload.setInputFiles({
    name: "미확인.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv("결제 대기")),
  });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "예약 상태",
  );
  await expect(
    page.getByRole("button", { name: /건 가져오기/ }),
  ).toBeDisabled();
  await upload.setInputFiles({
    name: "취소.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv("취소 완료")),
  });
  await expect(page.locator(".import-preview tbody")).toContainText("취소");
  await page.getByRole("button", { name: "1건 가져오기", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("명단을 가져왔어요");
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("sopung-camp-v1")!) as State,
  );
  expect(saved.reservations[0].status).toBe("cancelled");
  expect(saved.allocations).toHaveLength(0);
});

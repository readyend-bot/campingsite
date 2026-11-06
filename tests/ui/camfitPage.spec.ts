import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";

const { inspectionScript } = createRequire(import.meta.url)(
  "../../electron/camfit-page.cjs",
);
const origin = "https://admin.camfit.co.kr";
const booking =
  "<table><thead><tr><th>예약번호</th><th>예약자 이름</th><th>입실일</th></tr></thead></table>";
const button =
  '<button onclick="window.exportClicks=(window.exportClicks||0)+1">엑셀 다운로드</button>';

async function open(page: Page, html: string, url = origin + "/reservations") {
  await page.route("**/*", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`,
    }),
  );
  await page.goto(url);
}

const inspect = (page: Page, options: Record<string, unknown> = {}) =>
  page.evaluate(inspectionScript(options));

test("첫 연결은 예약 목록 제목 행과 유일한 내보내기 버튼이 있을 때만 실행", async ({
  page,
}) => {
  await open(page, booking + button);
  expect(await inspect(page)).toMatchObject({
    booking: true,
    matches: 1,
    login: false,
  });
  expect(await inspect(page, { action: "export" })).toMatchObject({
    clicked: true,
  });
  expect(await page.evaluate("window.exportClicks")).toBe(1);
  await page.setContent(button);
  expect(await inspect(page, { action: "export" })).toMatchObject({
    booking: false,
    clicked: false,
  });
});

test("로그인·중복 내보내기·다른 예약 경로에서는 자동 다운로드하지 않음", async ({
  page,
}) => {
  await open(
    page,
    '<input type="password" value="읽으면 안 되는 시험 입력">' +
      booking +
      button,
  );
  const login = await inspect(page, { action: "export" });
  expect(login).toMatchObject({ login: true, clicked: false });
  expect(JSON.stringify(login)).not.toContain("시험 입력");
  await page.setContent(booking + button + button);
  expect(await inspect(page, { action: "export" })).toMatchObject({
    matches: 2,
    clicked: false,
  });
  await page.setContent(booking + button);
  expect(
    await inspect(page, {
      action: "export",
      label: "엑셀 다운로드",
      route: origin + "/other",
    }),
  ).toMatchObject({ clicked: false });
  expect(await page.evaluate("window.exportClicks || 0")).toBe(0);
});

test("숨긴 중복 버튼과 예약 변경 버튼은 제외하고 로그인 완료를 입력값 없이 확인", async ({
  page,
}) => {
  await open(
    page,
    "<button>로그아웃</button>" +
      booking +
      button +
      '<div aria-hidden="true">' +
      button +
      "</div><button>예약 취소</button>",
  );
  expect(await inspect(page, { action: "export" })).toMatchObject({
    authenticated: true,
    matches: 1,
    clicked: true,
  });
});

test("예약 메뉴는 같은 공식 도메인의 유일한 탐색 링크만 자동으로 이동", async ({
  page,
}) => {
  await open(
    page,
    '<a href="/reservations">예약 목록</a><a href="https://evil.example/">예약 관리</a><a href="/new">예약하기</a>',
    origin + "/dashboard",
  );
  expect(await inspect(page)).toMatchObject({ navigationMatches: 1 });
  await inspect(page, { action: "navigate" });
  await expect(page).toHaveURL(origin + "/reservations");
  await page.setContent(
    '<a href="/one">예약 목록</a><a href="/two">예약 내역</a>',
  );
  expect(await inspect(page, { action: "navigate" })).toMatchObject({
    navigationMatches: 2,
    navigated: false,
  });
  await open(page, booking + button, "https://unrelated.example/reservations");
  expect(await inspect(page, { action: "export" })).toMatchObject({
    blocked: true,
  });
});

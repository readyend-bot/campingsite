// 합성 공식 도메인 화면·XLSX로 연결 흐름을 검증한다. 실제 캠핏 계정은 사용하지 않는다.
const { _electron: electron } = require("playwright");
const { mkdtempSync, readFileSync, rmSync } = require("fs");
const path = require("path");
const os = require("os");
const assert = require("node:assert/strict");

(async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "sopung-camfit-auto-"));
  let app;
  try {
    app = await electron.launch({
      args: ["."],
      env: { ...process.env, SOPUNG_TEST_DIR: directory },
    });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByLabel("6자리 PIN", { exact: true }).fill("123456");
    await page.getByLabel("다시 한 번 입력", { exact: true }).fill("123456");
    await page
      .getByRole("button", { name: "설정하고 시작하기", exact: true })
      .click();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await app.evaluate(
      ({ session }, files) => {
        globalThis.sopungAutoStage = 0;
        globalThis.sopungAutoExpired = false;
        session
          .fromPartition("persist:sopung-camfit")
          .protocol.interceptStringProtocol("https", (request, callback) => {
            const route = new URL(request.url).pathname;
            const stage = globalThis.sopungAutoStage;
            let html;
            if (route === "/" || globalThis.sopungAutoExpired) {
              html =
                '<h1>시험 캠핏 로그인</h1><input type="password" aria-label="시험 비밀번호"><button onclick="location.href=\'/dashboard\'">로그인</button>';
            } else if (route === "/dashboard") {
              html =
                '<button>로그아웃</button><a href="/reservations">예약 목록</a>';
            } else {
              const name = stage === 3 ? "예약.xls" : "예약.xlsx";
              const encoded = files[stage === 3 ? 0 : stage];
              html =
                "<button>로그아웃</button><h1>시험 예약 목록</h1><table><thead><tr><th>예약번호</th><th>입실일</th></tr></thead></table>" +
                `<a href="/export" onclick="event.preventDefault(); window.exportClicks=(window.exportClicks||0)+1; const a=document.createElement('a'); a.href='data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${encoded}'; a.download='${name}'; document.body.append(a); a.click(); a.remove();">엑셀 다운로드</a>`;
            }
            callback({
              mimeType: "text/html",
              data: `<!doctype html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`,
            });
          });
      },
      [0, 1, 2].map((stage) =>
        readFileSync(
          `tests/fixtures/camfit/reservations-${stage}.xlsx`,
        ).toString("base64"),
      ),
    );

    const opened = app.waitForEvent("window");
    await page.getByRole("button", { name: "캠핏 연결", exact: true }).click();
    const camfit = await opened;
    await camfit.getByRole("heading", { name: "시험 캠핏 로그인" }).waitFor();
    await page
      .getByRole("status")
      .filter({ hasText: "캠핏 창에서 로그인해 주세요" })
      .waitFor();
    await camfit.getByLabel("시험 비밀번호").fill("synthetic-test-password");
    await camfit.getByRole("button", { name: "로그인", exact: true }).click();
    // 이후 예약 메뉴와 내보내기 버튼은 시험 코드가 누르지 않는다.
    await page
      .getByRole("button", { name: "연결하고 동기화", exact: true })
      .waitFor();
    assert.equal(new URL(camfit.url()).pathname, "/reservations");
    assert.equal(await camfit.evaluate(() => window.exportClicks), 1);
    assert.equal(
      (await page.evaluate(() => window.camp.load())).reservations.length,
      0,
    );
    await page.screenshot({ path: "docs/screenshots/camfit-first-xlsx.png" });
    await page
      .getByRole("button", { name: "연결하고 동기화", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "예약 목록을 동기화했어요", exact: true })
      .waitFor();
    const initial = await page.evaluate(() => window.camp.load());
    assert.equal(initial.reservations.length, 1);
    assert.equal(initial.reservations[0].externalId, "CF-AUTO-1");
    assert.equal(initial.allocations.length, 1);
    await page.getByRole("button", { name: "완료", exact: true }).click();

    await app.evaluate(() => {
      globalThis.sopungAutoExpired = true;
    });
    await page
      .getByRole("button", { name: "캠핏 동기화", exact: true })
      .click();
    await camfit.getByRole("heading", { name: "시험 캠핏 로그인" }).waitFor();
    await page
      .getByRole("status")
      .filter({ hasText: "캠핏 창에서 로그인해 주세요" })
      .waitFor();
    await app.evaluate(() => {
      globalThis.sopungAutoExpired = false;
    });
    await camfit.getByRole("button", { name: "로그인", exact: true }).click();
    await page
      .getByRole("heading", { name: "예약 목록을 동기화했어요", exact: true })
      .waitFor();
    assert.equal(new URL(camfit.url()).pathname, "/reservations");
    assert.equal(await camfit.evaluate(() => window.exportClicks), 1);
    assert.equal(
      (await page.evaluate(() => window.camp.load())).reservations.length,
      1,
    );
    await page.getByRole("button", { name: "완료", exact: true }).click();

    for (const stage of [1, 2]) {
      await app.evaluate((_electron, value) => {
        globalThis.sopungAutoStage = value;
      }, stage);
      await page
        .getByRole("button", { name: "캠핏 동기화", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "예약 목록을 동기화했어요", exact: true })
        .waitFor();
      const changed = await page.evaluate(() => window.camp.load());
      assert.equal(changed.reservations.length, 1);
      assert.ok(
        changed.changes.some(
          (change) => change.type === (stage === 1 ? "dates" : "cancel"),
        ),
      );
      assert.deepEqual(changed.allocations, initial.allocations);
      await page.getByRole("button", { name: "완료", exact: true }).click();
    }
    const beforeFailure = await page.evaluate(() => window.camp.load());
    const beforeProfile = await page.evaluate(() =>
      window.camp.camfitProfile(),
    );
    await app.evaluate(() => {
      globalThis.sopungAutoStage = 3;
    });
    await page
      .getByRole("button", { name: "캠핏 동기화", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("alert")
      .filter({ hasText: "XLS" })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(() => window.camp.load()),
      beforeFailure,
    );
    assert.deepEqual(
      await page.evaluate(() => window.camp.camfitProfile()),
      beforeProfile,
    );
    await app.evaluate(() => {
      globalThis.sopungAutoStage = 2;
    });
    await page.getByRole("button", { name: "다시 연결", exact: true }).click();
    await page
      .getByRole("heading", { name: "예약 목록을 동기화했어요", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "완료", exact: true }).click();
    await app.evaluate(() => {
      globalThis.sopungAutoExpired = true;
    });
    await page
      .getByRole("button", { name: "캠핏 동기화", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "캠핏 창에서 로그인해 주세요" })
      .waitFor();
    await page
      .getByRole("button", { name: "동기화 중단", exact: true })
      .click();
    assert.deepEqual(await page.evaluate(() => window.camp.camfitProgress()), {
      stage: "idle",
    });
    assert.equal(
      (await page.evaluate(() => window.camp.load())).reservations.length,
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Electron 22 / Chromium 108: 연결 시작→모의 로그인→예약 메뉴 탐색→XLSX 자동 수신→첫 열 확인→저장, 세션 만료 복귀·반복/변경/취소·오류 보존·재시도·중단 통과 (실제 캠핏·Windows 미검증)",
    );
  } finally {
    if (app) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

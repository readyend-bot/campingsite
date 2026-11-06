const { _electron: electron } = require("playwright");
const {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  existsSync,
  rmSync,
} = require("fs");
const path = require("path");
const os = require("os");
const assert = require("node:assert/strict");

(async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "sopung-desktop-"));
  const options = {
    args: ["."],
    env: { ...process.env, SOPUNG_TEST_DIR: directory },
  };
  let app;
  try {
    app = await electron.launch(options);
    let page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByLabel("6자리 PIN", { exact: true }).fill("123456");
    await page.getByLabel("다시 한 번 입력", { exact: true }).fill("123456");
    await page.getByRole("button", { name: "설정하고 시작하기" }).click();
    await page
      .getByRole("group", { name: "소풍캠핑장 전체 구역 배치", exact: true })
      .waitFor();
    const firstRun = await page.evaluate(() => window.camp.load());
    assert.equal(firstRun.sites.length, 140);
    assert.equal(firstRun.facilities.length, 15);
    assert.equal(firstRun.reservations.length, 0);
    assert.equal(firstRun.allocations.length, 0);
    assert.equal(firstRun.blocks.length, 0);
    const bundledLayout = JSON.parse(
      readFileSync("src/bundledLayout.json", "utf8"),
    );
    assert.deepEqual(firstRun.sites, bundledLayout.sites);
    assert.deepEqual(firstRun.facilities, bundledLayout.facilities);
    await page.reload();
    await page
      .getByRole("group", { name: "소풍캠핑장 전체 구역 배치", exact: true })
      .waitFor();
    assert.deepEqual(
      (await page.evaluate(() => window.camp.load())).sites,
      bundledLayout.sites,
    );
    // 이전 설치 PC처럼 기존 파일이 있어도 명시 적용 전에 백업을 만든다.
    await page.evaluate(async () => {
      const state = await window.camp.load();
      state.sites.find((site) => site.label === "마7").layout = {
        x: 11,
        y: 22,
      };
      await window.camp.save(state);
    });
    await page.reload();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page
      .getByRole("button", { name: "저장된 자리배치 적용", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "확인", exact: true })
      .click();
    await page
      .getByText("저장된 자리배치를 적용했어요.", { exact: true })
      .waitFor();
    assert.deepEqual(
      (await page.evaluate(() => window.camp.load())).sites,
      bundledLayout.sites,
    );
    const beforeLayoutBackups = readdirSync(path.join(directory, "backups"))
      .filter((name) => name.endsWith(".json"))
      .map((name) =>
        JSON.parse(readFileSync(path.join(directory, "backups", name), "utf8")),
      );
    assert.ok(
      beforeLayoutBackups.some(
        (state) =>
          state.sites.find((site) => site.label === "마7")?.layout?.x === 11,
      ),
    );
    // 이 뒤의 기존 체험 운영 검증은 임시 저장소에서만 예시 진입 상태를 만든다.
    await page.evaluate(async () => {
      const state = await window.camp.load();
      state.sites = [];
      state.facilities = [];
      state.activity = [];
      delete state.sitePlan;
      await window.camp.save(state);
    });
    await page.reload();
    await page.getByRole("button", { name: "예시로 둘러보기" }).click();
    await page
      .locator(".map-panel")
      .getByRole("button", { name: "가1 빈자리", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "명단 가져오기", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .locator("input[type=file]")
      .setInputFiles("tests/fixtures/reservations.xlsx");
    await page
      .getByRole("button", { name: "1건 가져오기", exact: true })
      .click();
    await page.getByText("명단을 가져왔어요", { exact: true }).waitFor();
    await page.getByRole("button", { name: "완료", exact: true }).click();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByLabel("공통 종료 시각", { exact: true }).fill("13:00");
    await page.getByLabel("기본 추가요금 (원)", { exact: true }).fill("10000");
    await page
      .getByRole("button", { name: "시간·요금 저장", exact: true })
      .click();
    await page
      .getByText("공통 레이트 설정을 저장했어요.", { exact: true })
      .waitFor();
    assert.equal(
      JSON.parse(readFileSync(path.join(directory, "camp-data.json"), "utf8"))
        .settings.lateTime,
      "13:00",
    );
    const backup = await page.evaluate(() => window.camp.status());
    assert.ok(backup.lastBackup);
    assert.ok(existsSync(path.join(directory, "camp-data.previous.json")));
    const beforeLayout = await page.evaluate(() => window.camp.load());
    const layoutSite = beforeLayout.sites.find((site) => site.label === "가1");
    await page.getByRole("button", { name: "자리 편집", exact: true }).click();
    await page
      .getByRole("button", { name: "가운데 놓기", exact: true })
      .click();
    const layoutMarker = page.getByRole("button", {
      name: "가1 위치 이동",
      exact: true,
    });
    await layoutMarker.waitFor();
    await layoutMarker.scrollIntoViewIfNeeded();
    const markerBounds = await layoutMarker.boundingBox();
    const stageBounds = await page
      .locator(".area-layout-editor .area-layout-stage")
      .boundingBox();
    await page.mouse.move(
      markerBounds.x + markerBounds.width / 2,
      markerBounds.y + markerBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      stageBounds.x + stageBounds.width * 0.7,
      stageBounds.y + stageBounds.height * 0.6,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForFunction(async (id) => {
      const state = await window.camp.load();
      return state.sites.find((site) => site.id === id).layout.x > 60;
    }, layoutSite.id);
    const afterLayout = await page.evaluate(() => window.camp.load());
    const savedLayout = afterLayout.sites.find(
      (site) => site.id === layoutSite.id,
    ).layout;
    assert.ok(Math.abs(savedLayout.x - 70) < 0.3);
    assert.ok(Math.abs(savedLayout.y - 60) < 0.3);
    assert.deepEqual(afterLayout.reservations, beforeLayout.reservations);
    assert.deepEqual(afterLayout.allocations, beforeLayout.allocations);
    await page.getByRole("button", { name: "화면 잠금", exact: true }).click();
    const locked = await page.evaluate(async () => {
      try {
        await window.camp.load();
        return false;
      } catch {
        return true;
      }
    });
    assert.ok(locked);
    await app.close();
    app = await electron.launch(options);
    page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByLabel("6자리 PIN", { exact: true }).fill("000000");
    await page.getByRole("button", { name: "잠금 해제", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "일치하지 않아요" })
      .waitFor();
    await page.getByLabel("6자리 PIN", { exact: true }).fill("123456");
    await page.getByRole("button", { name: "잠금 해제", exact: true }).click();
    await page
      .locator(".map-panel")
      .getByRole("button", { name: "가1 빈자리", exact: true })
      .waitFor();
    const restored = await page.evaluate(() => window.camp.load());
    assert.equal(restored.settings.lateTime, "13:00");
    assert.deepEqual(
      restored.sites.find((site) => site.id === layoutSite.id).layout,
      savedLayout,
    );
    await page.screenshot({ path: "docs/screenshots/desktop-electron.png" });
    assert.equal(restored.reservations.length, 19);
    assert.deepEqual(errors, []);

    // 새 PC에 기본 도면이 준비돼도 기존 백업의 편집 위치·예약을 복원할 수 있어야 한다.
    await app.close();
    const freshDirectory = path.join(directory, "fresh-install");
    app = await electron.launch({
      ...options,
      env: { ...process.env, SOPUNG_TEST_DIR: freshDirectory },
    });
    page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page
      .getByLabel("잠금 방식", { exact: true })
      .selectOption("password");
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("test-password-2026");
    await page
      .getByLabel("다시 한 번 입력", { exact: true })
      .fill("test-password-2026");
    await page.getByRole("button", { name: "설정하고 시작하기" }).click();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    const freshPlan = await page.evaluate(() => window.camp.load());
    assert.equal(freshPlan.sites.length, 140);
    assert.equal(freshPlan.facilities.length, 15);
    assert.equal(freshPlan.reservations.length, 0);
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "검증용-백업.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(restored)),
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "확인", exact: true })
      .click();
    await page.getByText("백업을 복원했어요.", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("공통 종료 시각", { exact: true }).inputValue(),
      "13:00",
    );
    assert.equal(
      await page.getByLabel("기본 추가요금 (원)", { exact: true }).inputValue(),
      "10000",
    );
    const freshRestored = JSON.parse(
      readFileSync(path.join(freshDirectory, "camp-data.json"), "utf8"),
    );
    assert.equal(freshRestored.reservations.length, 19);
    assert.equal(freshRestored.settings.lateTime, "13:00");
    assert.deepEqual(
      freshRestored.sites.find((site) => site.id === layoutSite.id).layout,
      savedLayout,
    );
    await page
      .getByRole("button", { name: "숙박 캘린더", exact: true })
      .click();
    await page.locator(".calendar-weekday").first().waitFor();
    assert.equal(await page.locator(".calendar-weekday").count(), 7);
    await page.screenshot({ path: "docs/screenshots/calendar-electron.png" });

    // 실제 파일 시스템의 백업 경로 오류: 본 데이터 저장과 경고 표시를 확인한다.
    const backupDirectory = (await page.evaluate(() => window.camp.status()))
      .backupPath;
    renameSync(backupDirectory, `${backupDirectory}.saved`);
    writeFileSync(backupDirectory, "검증용 백업 경로 차단");
    await page.getByRole("button", { name: "자리 편집", exact: true }).click();
    await page.getByRole("button", { name: "자리 추가", exact: true }).click();
    await page
      .getByLabel("자리 이름", { exact: true })
      .fill("백업 오류 검증 자리");
    await page.getByRole("button", { name: "자리 저장", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "자동 백업" }).waitFor();
    assert.ok(
      (await page.evaluate(() => window.camp.load())).sites.some(
        (site) => site.label === "백업 오류 검증 자리",
      ),
    );
    assert.ok((await page.evaluate(() => window.camp.status())).backupError);
    rmSync(backupDirectory);
    renameSync(`${backupDirectory}.saved`, backupDirectory);
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByRole("button", { name: "지금 백업", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "자동 백업" })
      .first()
      .waitFor({ state: "hidden" });
    assert.equal(
      (await page.evaluate(() => window.camp.status())).backupError,
      "",
    );

    // 읽을 수 없는 원본은 보존하고, 복원 시 잠금과 예약을 모두 다시 확인한다.
    await app.close();
    writeFileSync(
      path.join(freshDirectory, "camp-data.json"),
      "damaged-original",
    );
    app = await electron.launch({
      ...options,
      env: { ...process.env, SOPUNG_TEST_DIR: freshDirectory },
    });
    page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("test-password-2026");
    await page.getByRole("button", { name: "잠금 해제", exact: true }).click();
    await page
      .getByText("저장된 데이터를 읽지 못했어요", { exact: true })
      .waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "손상복구-백업.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(restored)),
    });
    await page.locator(".map-panel").waitFor();
    assert.equal(
      (await page.evaluate(() => window.camp.load())).reservations.length,
      19,
    );
    const preserved = readdirSync(freshDirectory).find((name) =>
      name.startsWith("before-restore-"),
    );
    assert.ok(preserved);
    assert.equal(
      readFileSync(path.join(freshDirectory, preserved), "utf8"),
      "damaged-original",
    );
    const checkInDay = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
    }).format(new Date());
    await page.clock.setFixedTime(new Date(`${checkInDay}T09:00:00+09:00`));
    await page.getByRole("button", { name: "예약 등록", exact: true }).click();
    await page
      .getByLabel("예약자 이름", { exact: true })
      .fill("오전 입실 검증");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "예약 등록", exact: true })
      .click();
    await page
      .locator(".map-panel")
      .getByRole("button", { name: "가1 빈자리", exact: true })
      .click();
    await page
      .getByRole("button", { name: "배정하고 입실", exact: true })
      .click();
    await page
      .locator(".map-panel")
      .getByRole("button", { name: "가1 입실 오전 입실 검증", exact: true })
      .waitFor();
    const earlyState = await page.evaluate(() => window.camp.load());
    const earlyGuest = earlyState.reservations.find(
      (guest) => guest.name === "오전 입실 검증",
    );
    assert.equal(earlyGuest.status, "checkedIn");
    assert.equal(
      earlyState.allocations.find(
        (allocation) => allocation.reservationId === earlyGuest.id,
      ).start,
      `${checkInDay}T09:00:00`,
    );
    // 실제 운영 자료에 도면을 합쳐도 방금 입실한 손님과 기존 자리 ID는 유지한다.
    await page.evaluate(async () => {
      const state = await window.camp.load();
      state.demo = false;
      await window.camp.save(state);
    });
    await page.reload();
    await page
      .getByRole("button", { name: "소풍캠핑장 도면 적용", exact: true })
      .click();
    await page
      .getByRole("group", { name: "소풍캠핑장 전체 구역 배치", exact: true })
      .waitFor();
    const physicalPlan = await page.evaluate(() => window.camp.load());
    assert.equal(physicalPlan.sites.length, 140);
    assert.equal(physicalPlan.facilities.length, 15);
    assert.deepEqual(physicalPlan.reservations, earlyState.reservations);
    assert.deepEqual(physicalPlan.allocations, earlyState.allocations);
    // 0.1.8 운영 데이터에서 자동 갱신: 반복 실행에도 시설 추가·좌표 변환은 한 번만.
    await page.evaluate(async () => {
      const state = await window.camp.load();
      const scale = (1600 - 108) / (2000 - 108);
      state.sitePlan = "sopung-user-plan-2026-10-05";
      state.facilities = state.facilities.filter(
        (f) => f.id !== "sopung-facility-ra-trampoline",
      );
      for (const item of [...state.sites, ...state.facilities].filter(
        (item) => item.area === "라",
      )) {
        item.layout.x /= scale;
        if ("width" in item) item.width /= scale;
      }
      state.sites.find((item) => item.label === "라12").layout = {
        x: 18,
        y: 27,
      };
      await window.camp.save(state);
    });
    await page.reload();
    await page.waitForFunction(
      async () =>
        (await window.camp.load()).sitePlan ===
        "sopung-user-plan-2026-10-06-corner",
    );
    const upgraded = await page.evaluate(() => window.camp.load());
    assert.equal(upgraded.facilities.length, 15);
    assert.ok(
      Math.abs(
        upgraded.sites.find((item) => item.label === "라12").layout.x *
          (2000 - 108) -
          18 * (1600 - 108),
      ) < 1e-8,
    );
    assert.deepEqual(upgraded.reservations, earlyState.reservations);
    assert.deepEqual(upgraded.allocations, earlyState.allocations);
    await page.reload();
    await page
      .getByRole("button", { name: "B동 상세 배치 보기", exact: true })
      .waitFor();
    assert.deepEqual(await page.evaluate(() => window.camp.load()), upgraded);
    const maErrors = [];
    page.on("pageerror", (error) => maErrors.push(error.message));
    await page
      .getByRole("button", { name: "마동 상세 배치 보기", exact: true })
      .click();
    for (const size of [
      { width: 960, height: 760 },
      { width: 1180, height: 900 },
      { width: 1600, height: 950 },
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, value) =>
          BrowserWindow.getAllWindows()[0].setContentSize(
            value.width,
            value.height,
          ),
        size,
      );
      await page
        .getByRole("button", { name: "한눈에 보기", exact: true })
        .click();
      const samples = await page
        .locator(".map-panel .area-layout-viewport")
        .evaluate(async (viewport) => {
          await document.fonts.ready;
          const sizes = [];
          for (let i = 0; i < 45; i++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            if (i >= 15)
              sizes.push({
                width: viewport.clientWidth,
                height: viewport.clientHeight,
                scrollWidth: viewport.scrollWidth,
                scrollHeight: viewport.scrollHeight,
              });
          }
          return sizes;
        });
      assert.equal(
        new Set(samples.map((item) => `${item.width}:${item.height}`)).size,
        1,
      );
      assert.ok(samples.at(-1).scrollWidth <= samples.at(-1).width + 1);
      assert.ok(samples.at(-1).scrollHeight <= samples.at(-1).height + 1);
      assert.equal(
        await page.locator(".map-panel .area-layout-marker").count(),
        15,
      );
      assert.equal(
        await page.locator(".map-panel .plan-terrace-edge").count(),
        1,
      );
    }
    await page.getByRole("button", { name: "마7 빈자리", exact: true }).click();
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    assert.deepEqual(maErrors, []);
    await page.screenshot({
      path: "docs/screenshots/desktop-electron-ma.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "전체 배치로", exact: true })
      .click();
    await page
      .getByRole("button", { name: "B동 상세 배치 보기", exact: true })
      .click();
    assert.equal(await page.locator(".map-panel .plan-facility").count(), 3);
    assert.ok(
      await page
        .getByRole("button", { name: "카라반 8 빈자리", exact: true })
        .textContent()
        .then((text) => text.includes("스페셜3")),
    );
    await page.getByRole("button", { name: "자리 편집", exact: true }).click();
    await page.getByRole("button", { name: "시설 위치", exact: true }).click();
    await page
      .getByLabel("이동할 시설", { exact: true })
      .selectOption("sopung-facility-b-pool");
    await page
      .getByRole("button", { name: "오른쪽으로 이동", exact: true })
      .click();
    await page.waitForFunction(
      async () =>
        (await window.camp.load()).facilities.find((f) => f.type === "pool")
          .layout.x === 54,
    );
    assert.equal(
      JSON.parse(
        readFileSync(path.join(freshDirectory, "camp-data.json"), "utf8"),
      ).facilities.find((f) => f.type === "pool").layout.x,
      54,
    );
    // 실제 계정을 대신하지 않는 로컬 공식 도메인 응답으로 격리·파일 동기화를 검증한다.
    assert.equal(
      await app.evaluate(({ session }) =>
        session
          .fromPartition("persist:sopung-camfit")
          .protocol.interceptStringProtocol("https", (_request, callback) => {
            const stage = globalThis.sopungTestExportStage || 0;
            const csv =
              "예약번호,단위번호,예약자 이름,연락처,입실일,퇴실일,숙박 유형,인원,예약 상태,지정 객실\n" +
              "CF-DESKTOP-1,1,캠핏 동기화 검증,," +
              (stage === 1
                ? "2027-01-02,2027-01-04"
                : "2027-01-01,2027-01-03") +
              ",카라반,2," +
              (stage === 2 ? "취소" : "예약") +
              ",카라반 8\n";
            const encoded = Buffer.from(csv, "utf8").toString("base64");
            const name = stage === 3 ? "예약.xls" : "예약.csv";
            callback({
              mimeType: "text/html",
              data: `<!doctype html><html><body>캠핏 로그인 창 격리 검증<a href="/export" onclick="event.preventDefault(); const a = document.createElement('a'); a.href = 'data:text/csv;base64,${encoded}'; a.download='${name}'; document.body.append(a); a.click(); a.remove();">엑셀 다운로드</a></body></html>`,
            });
          }),
      ),
      true,
    );
    await page.getByRole("button", { name: "설정", exact: true }).click();
    const loginWindowPromise = app.waitForEvent("window");
    await page
      .getByRole("button", { name: "캠핏 로그인", exact: true })
      .click();
    const loginPage = await loginWindowPromise;
    await loginPage.getByText("캠핏 로그인 창 격리 검증").waitFor();
    assert.equal(
      await loginPage.evaluate(() => typeof window.camp),
      "undefined",
    );
    assert.equal(new URL(loginPage.url()).origin, "https://admin.camfit.co.kr");
    const loginWindow = await app.browserWindow(loginPage);
    const preferences = await loginWindow.evaluate((window) =>
      window.webContents.getLastWebPreferences(),
    );
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.sandbox, true);
    await loginPage.goto("https://admin.camfit.co.kr/reservations");
    await page
      .getByRole("button", { name: "캠핏 동기화", exact: true })
      .click();
    await loginPage.waitForFunction(() => window.__sopungExportListener);
    await loginPage
      .getByRole("link", { name: "엑셀 다운로드", exact: true })
      .click();
    await page
      .getByRole("button", { name: "연결하고 동기화", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "연결하고 동기화", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "예약 목록을 동기화했어요", exact: true })
      .waitFor();
    const syncState = await page.evaluate(() => window.camp.load());
    const syncedGuest = syncState.reservations.find(
      (r) => r.externalId === "CF-DESKTOP-1",
    );
    assert.ok(syncedGuest);
    const syncedAllocation = syncState.allocations.find(
      (a) => a.reservationId === syncedGuest.id,
    );
    assert.ok(syncedAllocation);
    assert.equal(
      syncState.sites.find((s) => s.id === syncedAllocation.siteId).label,
      "카라반 8",
    );
    const connection = await page.evaluate(() => window.camp.camfitProfile());
    assert.equal(connection.route, "https://admin.camfit.co.kr/reservations");
    assert.ok(connection.lastSync);
    assert.ok(existsSync(path.join(freshDirectory, "camfit-sync.json")));
    await page.getByRole("button", { name: "완료", exact: true }).click();
    for (const stage of [0, 1, 2, 2]) {
      await app.evaluate((_electron, version) => {
        globalThis.sopungTestExportStage = version;
      }, stage);
      await page
        .getByRole("button", { name: "캠핏 동기화", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "예약 목록을 동기화했어요", exact: true })
        .waitFor();
      const current = await page.evaluate(() => window.camp.load());
      assert.equal(
        current.reservations.filter((r) => r.externalId === "CF-DESKTOP-1")
          .length,
        1,
      );
      assert.deepEqual(
        current.allocations.find((a) => a.reservationId === syncedGuest.id),
        syncedAllocation,
      );
      assert.equal(
        current.reservations.find((r) => r.id === syncedGuest.id).arrival,
        "2027-01-01",
      );
      if (stage === 1)
        assert.ok(
          current.changes.some(
            (c) => c.reservationId === syncedGuest.id && c.type === "dates",
          ),
        );
      if (stage === 2)
        assert.equal(
          current.changes.filter(
            (c) => c.reservationId === syncedGuest.id && c.type === "cancel",
          ).length,
          1,
        );
      await page.getByRole("button", { name: "완료", exact: true }).click();
    }
    const beforeFailure = readFileSync(
      path.join(freshDirectory, "camp-data.json"),
      "utf8",
    );
    await app.evaluate(() => {
      globalThis.sopungTestExportStage = 3;
    });
    await page
      .getByRole("button", { name: "캠핏 동기화", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("alert")
      .filter({ hasText: "CSV 또는 XLSX" })
      .waitFor();
    assert.equal(
      readFileSync(path.join(freshDirectory, "camp-data.json"), "utf8"),
      beforeFailure,
    );
    await page
      .getByRole("button", { name: "닫기", exact: true })
      .last()
      .click();
    await loginPage.evaluate(() => {
      window.onbeforeunload = () => false;
    });
    const loginClosed = loginPage.waitForEvent("close");
    await page.getByRole("button", { name: "화면 잠금", exact: true }).click();
    await loginClosed;
    await page
      .getByRole("button", { name: "잠금 해제", exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    const exit = app.waitForEvent("close");
    await page
      .getByRole("button", { name: "프로그램 종료", exact: true })
      .click();
    await exit;
    app = null;
    console.log(
      "Electron 22 / Chromium 108: 기존 운영 검증, 캠핏 창 격리·CSV 다운로드·첫 열 연결·반복 동기화·중복 방지·변경/취소 확인·배정 보존·XLS 오류 시 원본 보존·잠금 시 닫힘·종료 버튼 통과 (실제 캠핏 인증·내보내기 화면, Windows 실행 미검증)",
    );

    // 0.1.13 지난 연도 보관·사진 파일: 실제 메인 프로세스의 저장소·IPC·대화상자 경로로 확인한다.
    const archiveDirectory = mkdtempSync(
      path.join(os.tmpdir(), "sopung-desktop-archive-"),
    );
    try {
      const png =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
      const seeded = {
        version: 1,
        demo: false,
        sites: [
          { id: "s1", label: "가1", area: "가", kind: "auto", archived: false },
        ],
        reservations: [
          {
            id: "r-old",
            name: "보관 확인 손님",
            phone: "010-0000-1111",
            arrival: "2025-08-01",
            departure: "2025-08-02",
            kind: "auto",
            source: "캠핏",
            externalId: "CF-DESK",
            unit: "1",
            people: 2,
            vehicle: "",
            note: "데스크톱 보관 검증",
            fee: 0,
            paid: false,
            status: "checkedOut",
            lateTime: "",
            actualCheckout: "2025-08-02T11:00:00",
          },
        ],
        allocations: [
          {
            id: "a-old",
            reservationId: "r-old",
            siteId: "s1",
            start: "2025-08-01T15:00:00",
            end: "2025-08-02T11:00:00",
            state: "ended",
          },
        ],
        blocks: [],
        changes: [],
        activity: [
          {
            id: "log-old",
            at: "2025-08-01T15:00:00",
            text: "보관 확인 손님 님을 가1에 배정하고 입실 처리했어요.",
            reservationId: "r-old",
          },
        ],
        settings: { lateTime: "", lateFee: null, aerial: png },
      };
      app = await electron.launch({
        ...options,
        env: { ...process.env, SOPUNG_TEST_DIR: archiveDirectory },
      });
      page = await app.firstWindow();
      const archiveErrors = [];
      page.on("pageerror", (error) => archiveErrors.push(error.message));
      await page.getByLabel("6자리 PIN", { exact: true }).fill("123456");
      await page.getByLabel("다시 한 번 입력", { exact: true }).fill("123456");
      await page.getByRole("button", { name: "설정하고 시작하기" }).click();
      await page.getByRole("button", { name: "설정", exact: true }).waitFor();
      await page.evaluate((state) => window.camp.save(state), seeded);
      await page.reload();
      await page.getByRole("button", { name: "설정", exact: true }).click();
      await page
        .getByRole("button", { name: "지난 연도 기록 보관", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "확인", exact: true })
        .click();
      await page
        .getByText("지난 연도 예약 1건을 보관 파일로 옮겼어요.")
        .waitFor();
      const dataFile = path.join(archiveDirectory, "camp-data.json");
      const archived = JSON.parse(readFileSync(dataFile, "utf8"));
      assert.equal(archived.reservations.length, 0);
      assert.equal(archived.archives.length, 1);
      const archiveName = archived.archives[0].file;
      const archiveFile = path.join(archiveDirectory, "archive", archiveName);
      const archiveText = readFileSync(archiveFile, "utf8");
      assert.equal(
        readFileSync(
          path.join(archiveDirectory, "backups", "archive", archiveName),
          "utf8",
        ),
        archiveText,
      );
      await page
        .getByRole("button", { name: "자리 편집", exact: true })
        .click();
      await page
        .getByRole("button", { name: "항공사진 위치", exact: true })
        .click();
      await page
        .getByRole("button", { name: "사진을 별도 파일로 옮기기", exact: true })
        .click();
      await page
        .getByText(
          "사진을 별도 파일로 옮겼어요. 사진과 자리 위치는 그대로예요.",
        )
        .waitFor();
      const aerial = JSON.parse(readFileSync(dataFile, "utf8")).settings.aerial;
      assert.match(aerial, /^asset:aerial-[a-f0-9]{64}\.png$/);
      const assetName = aerial.slice("asset:".length);
      assert.ok(existsSync(path.join(archiveDirectory, "assets", assetName)));
      await page
        .getByRole("button", { name: "예약 명단", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "이름, 연락처, 차량, 메모 검색" })
        .fill("보관 확인");
      await page
        .getByRole("button", { name: "보관 기록에서 찾기", exact: true })
        .click();
      const results = page.locator(".archive-results");
      await results.getByText("보관 확인 손님").waitFor();
      await results.getByRole("button", { name: "상세", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByText("2025년 보관 기록이에요", { exact: false })
        .waitFor();
      await page.getByRole("button", { name: "닫기", exact: true }).click();
      // 사진 파일 참조가 들어간 수동 백업을 만들고, 현재 보관 파일을 손상시킨 뒤 백업 폴더로 복원
      await page.getByRole("button", { name: "설정", exact: true }).click();
      await page
        .getByRole("button", { name: "지금 백업", exact: true })
        .click();
      const backupDirectory = path.join(archiveDirectory, "backups");
      const manual = readdirSync(backupDirectory)
        .filter((name) => /^sopung-\d{4}-\d{2}-\d{2}-\d+\.json$/.test(name))
        .sort()
        .pop();
      const manualFile = path.join(backupDirectory, manual);
      assert.equal(
        JSON.parse(readFileSync(manualFile, "utf8")).settings.aerial,
        aerial,
      );
      assert.ok(existsSync(path.join(backupDirectory, "assets", assetName)));
      const damaged = "x".repeat(Buffer.byteLength(archiveText));
      writeFileSync(archiveFile, damaged);
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, manualFile);
      await page
        .getByRole("button", { name: "백업 폴더에서 복원", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "확인", exact: true })
        .click();
      await page.getByRole("button", { name: "설정", exact: true }).waitFor();
      assert.equal(readFileSync(archiveFile, "utf8"), archiveText);
      const replaced = readdirSync(path.join(archiveDirectory, "archive")).find(
        (name) => name.startsWith("replaced-"),
      );
      assert.equal(
        readFileSync(
          path.join(archiveDirectory, "archive", replaced, archiveName),
          "utf8",
        ),
        damaged,
      );
      assert.deepEqual(
        JSON.parse(readFileSync(dataFile, "utf8")).archives,
        archived.archives,
      );
      assert.deepEqual(archiveErrors, []);
      const archiveExit = app.waitForEvent("close");
      await page
        .getByRole("button", { name: "프로그램 종료", exact: true })
        .click();
      await archiveExit;
      app = null;
      console.log(
        "Electron 22 / Chromium 108: 지난 연도 보관 파일 기록·백업 사본, 보관 기록 검색·읽기 전용 상세, 내장 항공사진 파일 분리, 사진 포함 수동 백업, 손상된 현재 보관 파일의 백업 폴더 복원과 손상 파일 보존 통과",
      );
    } finally {
      rmSync(archiveDirectory, { recursive: true, force: true });
    }
  } finally {
    if (app) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

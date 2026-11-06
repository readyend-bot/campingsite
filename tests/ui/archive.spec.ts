import { test, expect, type Page } from "@playwright/test";
import { addReservation, assign, sweep, type State } from "../../src/domain";
import { sopungInitialState } from "../../src/sitePlan";

// 설치 앱 저장소 대신 메모리에서 보관 파일을 다루는 시험용 브리지.
// 실제 파일 확인·원자적 기록은 tests/archive.test.ts에서 저장소 코드로 검증한다.
async function desktop(page: Page, initial: State, problems: string[] = []) {
  await page.addInitScript(
    ({ initial, problems }) => {
      let data = initial;
      const archives: Record<string, string> = {};
      const assets: Record<string, string> = {};
      const exports: State[] = [];
      const normalize = (value: unknown) =>
        String(value ?? "")
          .toLowerCase()
          .replace(/[\s()+-]/g, "");
      const read = () => Object.values(archives).map((t) => JSON.parse(t));
      const ok = async () => {};
      Object.assign(window, {
        __archive: { files: archives, data: () => data, exports },
        camp: {
          status: async () => ({
            configured: true,
            unlocked: true,
            mode: "pin",
            dataPath: "test-data",
            backupPath: "test-backups",
            lastBackup: "",
            backupError: "",
            fileProblems: problems,
          }),
          load: async () => JSON.parse(JSON.stringify(data)),
          save: async (next: State) => {
            data = JSON.parse(JSON.stringify(next));
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
          camfitProfile: async () => null,
          downloadCampfit: async () => {
            throw new Error("사용하지 않음");
          },
          saveCamfitProfile: ok,
          cancelCampfitSync: ok,
          quit: ok,
          commitArchive: async (
            next: State,
            files: { file: string; text: string }[],
          ) => {
            for (const file of files) archives[file.file] = file.text;
            data = JSON.parse(JSON.stringify(next));
            return { backupError: "" };
          },
          searchArchives: async (query: string) => {
            const wanted = normalize(query);
            const results = read().flatMap((f) =>
              f.reservations
                .filter((r: Record<string, string>) =>
                  [r.name, r.phone, r.vehicle, r.note].some((v) =>
                    normalize(v).includes(wanted),
                  ),
                )
                .map((reservation: { id: string }) => ({
                  year: f.year,
                  reservation,
                  allocations: f.allocations.filter(
                    (a: { reservationId: string }) =>
                      a.reservationId === reservation.id,
                  ),
                  activity: f.activity.filter(
                    (a: { reservationId?: string }) =>
                      a.reservationId === reservation.id,
                  ),
                })),
            );
            return { total: results.length, results };
          },
          lookupArchives: async (pairs: [string, string][]) => {
            const wanted = new Set(pairs.map((p) => JSON.stringify(p)));
            return read().flatMap((f) =>
              f.reservations
                .filter((r: { source: string; externalId: string }) =>
                  wanted.has(JSON.stringify([r.source, r.externalId])),
                )
                .map((reservation: unknown) => ({ year: f.year, reservation })),
            );
          },
          verifyAttachments: async () => [],
          saveAerial: async (dataUrl: string) => {
            const digest = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(dataUrl),
            );
            const hex = [...new Uint8Array(digest)]
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
            const ref = `asset:aerial-${hex}.png`;
            assets[ref] = dataUrl;
            return ref;
          },
          readAerial: async (ref: string) => {
            if (!assets[ref]) throw new Error("사진 파일을 찾을 수 없어요.");
            return assets[ref];
          },
          pickBackup: async () => null,
          restoreBackup: async () => ({}),
          exportBackup: async () => {
            exports.push(JSON.parse(JSON.stringify(data)));
            return "D:/소풍백업/sopung-export";
          },
        },
      });
    },
    { initial, problems },
  );
  await page.goto("/");
}
function history() {
  const s = sopungInitialState();
  const site = s.sites.find((x) => x.label === "가1")!.id;
  const old = addReservation(
    s,
    {
      name: "보관 손님",
      phone: "010-3000-0000",
      arrival: "2025-08-01",
      departure: "2025-08-02",
      kind: "auto",
      source: "캠핏",
      people: 2,
      vehicle: "34나 5678",
      note: "작년 여름 방문",
      fee: 0,
      paid: false,
    },
    "CF-OLD",
  );
  assign(s, old.id, site, true, "2025-08-01T15:00:00");
  sweep(s, "2026-03-10T10:00:00");
  addReservation(s, {
    name: "올해 손님",
    phone: "",
    arrival: "2026-03-12",
    departure: "2026-03-13",
    kind: "auto",
    source: "전화",
    people: 2,
    vehicle: "",
    note: "",
    fee: 0,
    paid: false,
  });
  return s;
}

test("지난 연도 기록을 보관하고 예약 명단에서 읽기 전용으로 찾으며 다시 가져와도 새로 만들지 않음", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-03-10T10:00:00+09:00"));
  await desktop(page, history());
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByText("예약 1건 · 배정 1건")).toBeVisible();
  await page
    .getByRole("button", { name: "지난 연도 기록 보관", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(
    page.getByText("지난 연도 예약 1건을 보관 파일로 옮겼어요."),
  ).toBeVisible();
  const saved = await page.evaluate(() => {
    const store = (
      window as unknown as {
        __archive: { files: Record<string, string>; data: () => State };
      }
    ).__archive;
    return { data: store.data(), files: Object.keys(store.files) };
  });
  expect(saved.data.reservations.map((r) => r.name)).toEqual(["올해 손님"]);
  expect(saved.data.archives!.map((a) => a.file)).toEqual(saved.files);
  await expect(page.getByText("2025년 예약 1건")).toBeVisible();

  await page.getByRole("button", { name: "예약 명단", exact: true }).click();
  await page
    .getByRole("textbox", { name: "이름, 연락처, 차량, 메모 검색" })
    .fill("보관 손님");
  await expect(page.getByText("검색 결과가 없어요")).toBeVisible();
  await page
    .getByRole("button", { name: "보관 기록에서 찾기", exact: true })
    .click();
  const results = page.locator(".archive-results");
  await expect(results).toContainText("보관 기록 검색 · ‘보관 손님’ 1건");
  await expect(results).toContainText("2025년");
  await expect(results).toContainText("가1");
  await results.getByRole("button", { name: "상세", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("보관된 예약 상세");
  await expect(dialog).toContainText("2025년 보관 기록이에요");
  await expect(dialog).toContainText("작년 여름 방문");
  await expect(dialog).toContainText("가1에 배정하고 입실 처리했어요");
  await expect(dialog.getByRole("button", { name: "입실 처리" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();

  await page
    .getByRole("button", { name: "명단 가져오기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "camfit.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "예약번호,예약자 이름,입실일,퇴실일,숙박 유형\nCF-OLD,보관 손님,2025-08-01,2025-08-03,오토캠핑\n",
      ),
    });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "1건 가져오기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "신규 0건 · 변경 확인 0건 · 동일 1건",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "2025년 보관 기록의 예약",
  );
  const after = await page.evaluate(() =>
    (window as unknown as { __archive: { data: () => State } }).__archive
      .data()
      .reservations.map((r) => r.name),
  );
  expect(after).toEqual(["올해 손님"]);
});

test("보관 파일이 없거나 손상되면 모든 화면에 파일명과 해결 방법을 계속 안내", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-03-10T10:00:00+09:00"));
  await desktop(page, history(), [
    "보관 파일 sopung-archive-2025-abc-1.json(2025년)이 없어요.",
  ]);
  await expect(page.getByRole("alert").first()).toContainText(
    "보관 기록·사진 파일을 확인해 주세요.",
  );
  await expect(page.getByText(/sopung-archive-2025-abc-1\.json/)).toBeVisible();
  await page.getByRole("button", { name: "예약 명단", exact: true }).click();
  await expect(
    page.getByText(/그동안 명단 가져오기와 새 보관은/),
  ).toBeVisible();
});

const PNG_A =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_B =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

test("설치 앱은 내장 항공사진을 같은 이미지·좌표로 별도 파일로 옮기고 새 사진도 파일 참조로 저장", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-03-10T10:00:00+09:00"));
  const s = sopungInitialState();
  s.settings.aerial = PNG_A;
  Object.assign(s.sites[0], { x: 11, y: 22 });
  await desktop(page, s);
  const data = () =>
    page.evaluate(() =>
      (
        window as unknown as { __archive: { data: () => State } }
      ).__archive.data(),
    );
  await page.getByRole("button", { name: "자리 편집", exact: true }).click();
  await page
    .getByRole("button", { name: "항공사진 위치", exact: true })
    .click();
  const editor = page.locator(".aerial-editor");
  await expect(editor).toContainText("이 사진은 저장 파일 안에 들어 있어요");
  await editor
    .getByRole("button", { name: "사진을 별도 파일로 옮기기", exact: true })
    .click();
  await expect(
    page.getByText(
      "사진을 별도 파일로 옮겼어요. 사진과 자리 위치는 그대로예요.",
    ),
  ).toBeVisible();
  let saved = await data();
  expect(saved.settings.aerial).toMatch(/^asset:aerial-[a-f0-9]{64}\.png$/);
  expect([saved.sites[0].x, saved.sites[0].y]).toEqual([11, 22]);
  await expect(editor.locator("img")).toHaveAttribute("src", PNG_A);
  await expect(editor).not.toContainText(
    "이 사진은 저장 파일 안에 들어 있어요",
  );
  const first = saved.settings.aerial;
  await editor
    .locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]')
    .setInputFiles({
      name: "새사진.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_B, "base64"),
    });
  await expect(editor).toContainText("기존 위치 1곳은 그대로 두었으니");
  saved = await data();
  expect(saved.settings.aerial).toMatch(/^asset:aerial-[a-f0-9]{64}\.png$/);
  expect(saved.settings.aerial).not.toBe(first);
  expect([saved.sites[0].x, saved.sites[0].y]).toEqual([11, 22]);
  await page.getByRole("button", { name: "자리 배정", exact: true }).click();
  await page.getByRole("button", { name: "항공사진", exact: true }).click();
  await expect(page.locator(".map-panel .aerial-canvas img")).toHaveAttribute(
    "src",
    `data:image/png;base64,${PNG_B}`,
  );
});

test("보관 기록 없이 사진만 파일로 분리해도 백업 내보내기는 폴더째 내보냄", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-03-10T10:00:00+09:00"));
  const s = sopungInitialState();
  s.settings.aerial = `asset:aerial-${"c".repeat(64)}.png`;
  await desktop(page, s);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const download = page
    .waitForEvent("download", { timeout: 1000 })
    .catch(() => null);
  await page
    .getByRole("button", { name: "백업 파일 내보내기", exact: true })
    .click();
  await expect(
    page.getByText(
      "보관 기록·사진 파일까지 함께 내보냈어요: D:/소풍백업/sopung-export",
    ),
  ).toBeVisible();
  expect(await download).toBeNull();
  const exported = await page.evaluate(
    () =>
      (window as unknown as { __archive: { exports: State[] } }).__archive
        .exports.length,
  );
  expect(exported).toBe(1);
});

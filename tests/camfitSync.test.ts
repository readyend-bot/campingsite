import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { importRows } from "../src/domain";
import { sopungInitialState } from "../src/sitePlan";
import {
  prepareCamfitProfile,
  previewCamfit,
  type CamfitDownload,
} from "../src/camfitSync";

const require = createRequire(import.meta.url);
const {
  CamfitSync,
  safeRoute,
  validProfile,
} = require("../electron/camfit-sync.cjs");
const download: CamfitDownload = {
  fileName: "예약목록.csv",
  base64: "",
  route: "https://admin.camfit.co.kr/reservations",
  exportLabels: ["엑셀 다운로드"],
  clickedLabel: "엑셀 다운로드",
};
const headers = [
  "예약번호",
  "단위번호",
  "예약자 이름",
  "연락처",
  "입실일",
  "퇴실일",
  "숙박 유형",
  "인원",
  "예약 상태",
  "지정 객실",
];
const row = [
  "CF-SYNC-1",
  "1",
  "동기화 검증 손님",
  "",
  "2027-01-01",
  "2027-01-03",
  "카라반",
  "2",
  "예약",
  "카라반 8",
];

test("동기화 명단의 반복·날짜 변경·취소는 배정을 보존하고 빠진 예약을 삭제하지 않음", () => {
  const table = [headers, row];
  const profile = prepareCamfitProfile(table, download, null);
  const s = sopungInitialState();
  const first = previewCamfit(table, profile);
  assert.deepEqual(first.errors, []);
  assert.equal(importRows(s, first.rows).added, 1);
  assert.equal(s.allocations.length, 1);
  const allocation = structuredClone(s.allocations[0]);
  assert.equal(importRows(s, first.rows).unchanged, 1);
  assert.equal(s.reservations.length, 1);
  const changed = [...row];
  changed[4] = "2027-01-02";
  changed[5] = "2027-01-04";
  importRows(s, previewCamfit([headers, changed], profile).rows);
  assert.equal(s.changes[0].type, "dates");
  assert.equal(s.reservations[0].arrival, "2027-01-01");
  assert.deepEqual(s.allocations[0], allocation);
  const cancelled = [...row];
  cancelled[8] = "취소";
  importRows(s, previewCamfit([headers, cancelled], profile).rows);
  assert.ok(s.changes.some((change) => change.type === "cancel"));
  assert.deepEqual(s.allocations[0], allocation);
  importRows(s, previewCamfit([headers], profile).rows);
  assert.equal(s.reservations.length, 1);
  assert.deepEqual(s.allocations[0], allocation);
});

test("새 상품·미확인 예약 상태·변한 열·연도 누락·단위 중복은 자동 반영을 차단", () => {
  const table = [headers, row];
  const profile = prepareCamfitProfile(table, download, null);
  for (const [index, value] of [
    [6, "럭셔리 카라반 특가"],
    [8, "결제 대기"],
    [4, "1/1"],
  ] as const) {
    const bad = [...row];
    bad[index] = value;
    assert.ok(previewCamfit([headers, bad], profile).errors.length);
  }
  assert.ok(
    previewCamfit([[...headers].reverse(), row], profile).errors.length,
  );
  assert.ok(previewCamfit([headers, row, row], profile).errors.length);
  const nextUnit = [...row];
  nextUnit[1] = "2";
  assert.deepEqual(previewCamfit([headers, row, nextUnit], profile).errors, []);
  profile.statuses["예약"] = "ignore";
  const repeated = prepareCamfitProfile(table, download, profile);
  assert.equal(repeated.statuses["예약"], "ignore");
  assert.equal(previewCamfit(table, repeated).ignored, 1);
  assert.equal(previewCamfit(table, repeated).rows.length, 0);
});

class Item extends EventEmitter {
  file = "";
  state = "progressing";
  size = 30;
  cancelled = false;
  constructor(public name = "../../예약목록.csv") {
    super();
  }
  getFilename() {
    return this.name;
  }
  getTotalBytes() {
    return this.size;
  }
  getReceivedBytes() {
    return this.size;
  }
  getState() {
    return this.state;
  }
  setSavePath(file: string) {
    this.file = file;
  }
  cancel() {
    this.cancelled = true;
    this.state = "cancelled";
    this.emit("done", {}, "cancelled");
  }
}
function connectorFixture(
  timeout = 1000,
  inspection = { clicked: false, matches: 0 },
) {
  const directory = mkdtempSync(path.join(tmpdir(), "sopung-sync-test-"));
  const isolated = new EventEmitter();
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    webContents: {
      getURL: () => download.route + "?token=never-save-this",
      executeJavaScript: async (script: string) =>
        script.includes("const last =")
          ? {
              exportLabels: download.exportLabels,
              clickedLabel: download.clickedLabel,
            }
          : inspection,
    },
  });
  const connector = new CamfitSync(directory, isolated, async () => window, {
    timeout,
  });
  return {
    directory,
    isolated,
    window,
    connector,
    clean: () => {
      connector.dispose();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("캠핏 창의 다운로드만 받으며 임시 파일·필터 쿼리를 보관하지 않음", async () => {
  const f = connectorFixture();
  try {
    const promise = f.connector.download();
    await nextTurn();
    const unrelated = new Item();
    f.isolated.emit(
      "will-download",
      {
        preventDefault() {
          assert.fail("일반 다운로드를 차단하면 안 됨");
        },
      },
      unrelated,
      {},
    );
    assert.equal(unrelated.file, "");
    const item = new Item();
    f.isolated.emit("will-download", {}, item, f.window.webContents);
    assert.ok(item.file);
    writeFileSync(item.file, "예약번호,예약자 이름\nTEST,검증\n");
    item.state = "completed";
    item.emit("done", {}, "completed");
    const result = await promise;
    assert.equal(result.fileName, "예약목록.csv");
    assert.equal(result.route, download.route);
    assert.match(
      Buffer.from(result.base64, "base64").toString("utf8"),
      /TEST,검증/,
    );
    for (let attempt = 0; attempt < 20 && existsSync(item.file); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(existsSync(item.file), false);
    const profile = prepareCamfitProfile([headers, row], result, null);
    f.connector.saveProfile({
      ...profile,
      password: "do-not-store",
      mapping: { ...profile.mapping, token: "do-not-store" },
    });
    const saved = readFileSync(
      path.join(f.directory, "camfit-sync.json"),
      "utf8",
    );
    assert.ok(!saved.includes("do-not-store"));
    assert.deepEqual(
      f.connector.profile(),
      JSON.parse(JSON.stringify(profile)),
    );
  } finally {
    f.clean();
  }
});

test("취소·중복 요청·타임아웃·잘못된 형식은 성공으로 처리하지 않음", async () => {
  const f = connectorFixture(50);
  try {
    const first = f.connector.download();
    await assert.rejects(f.connector.download(), /이미/);
    f.connector.cancel();
    await assert.rejects(first, /중단/);
    const second = f.connector.download();
    await nextTurn();
    let prevented = false;
    f.isolated.emit(
      "will-download",
      {
        preventDefault() {
          prevented = true;
        },
      },
      new Item("예약.xls"),
      f.window.webContents,
    );
    await assert.rejects(second, /CSV 또는 XLSX/);
    assert.equal(prevented, true);
    const third = f.connector.download();
    await assert.rejects(third, /첫 연결이 아직 끝나지 않았어요/);
    const fourth = f.connector.download();
    await nextTurn();
    f.window.emit("closed");
    await assert.rejects(fourth, /창을 닫아/);
    assert.equal(f.connector.profile(), null);
  } finally {
    f.clean();
  }
});

test("캠핏 대기 실패는 연결·경로·버튼·파일 수신 단계를 구별하고 민감한 주소를 출력하지 않음", async () => {
  const profile = prepareCamfitProfile([headers, row], download, null);
  const cases = [
    {
      inspection: { clicked: false, matches: 0 },
      expected: /버튼을.*찾지 못했어요/,
    },
    {
      inspection: { clicked: false, matches: 2 },
      expected: /여러 개여서 자동으로 누르지 않았어요/,
    },
    {
      inspection: { clicked: true, matches: 1 },
      expected: /버튼을 눌렀지만.*파일이 도착하지 않았어요/,
    },
    {
      inspection: { clicked: false, matches: 0 },
      route: "https://admin.camfit.co.kr/login?token=private-test-token",
      expected: /내보내기 화면이.*열리지 않았어요/,
    },
    {
      inspection: { clicked: false, matches: 0 },
      failInspection: true,
      expected: /버튼을 확인하지 못했어요/,
    },
    {
      inspection: { clicked: true, matches: 1 },
      downloading: true,
      expected: /받기 시작했지만 다운로드가 끝나지 않았어요/,
    },
  ];
  for (const entry of cases) {
    const f = connectorFixture(50, entry.inspection);
    try {
      f.connector.saveProfile(profile);
      if (entry.route) f.window.webContents.getURL = () => entry.route!;
      if (entry.failInspection)
        f.window.webContents.executeJavaScript = async () => {
          throw new Error("검증용 화면 준비 중");
        };
      const request = f.connector.download();
      if (entry.downloading) {
        await nextTurn();
        f.isolated.emit("will-download", {}, new Item(), f.window.webContents);
      }
      await assert.rejects(request, (error: Error) => {
        assert.match(error.message, entry.expected);
        assert.match(error.message, /기존 예약은 유지했어요/);
        assert.ok(!error.message.includes("private-test-token"));
        assert.ok(!error.message.includes("https://"));
        return true;
      });
      assert.equal(f.connector.profile().lastSync, "");
    } finally {
      f.clean();
    }
  }
});

test("외부 주소·중복 필수 열·위험한 버튼을 연결하지 않고 손상 설정 원본을 유지", () => {
  const f = connectorFixture();
  try {
    const profile = prepareCamfitProfile([headers, row], download, null);
    assert.equal(validProfile(profile), true);
    assert.equal(
      safeRoute("https://admin.camfit.co.kr/#!/reservations?token=secret"),
      "https://admin.camfit.co.kr/",
    );
    assert.equal(
      safeRoute("https://admin.camfit.co.kr/#/reservations"),
      "https://admin.camfit.co.kr/#/reservations",
    );
    assert.equal(
      safeRoute("https://admin.camfit.co.kr.evil.example/reservations"),
      null,
    );
    for (const value of [
      { ...profile, route: "https://evil.example/" },
      { ...profile, exportLabel: "예약 취소" },
      {
        ...profile,
        mapping: { ...profile.mapping, arrival: profile.mapping.departure },
      },
    ])
      assert.throws(() => f.connector.saveProfile(value));
    writeFileSync(path.join(f.directory, "camfit-sync.json"), "broken-profile");
    assert.equal(f.connector.profile(), null);
    assert.equal(
      readFileSync(path.join(f.directory, "camfit-sync.json"), "utf8"),
      "broken-profile",
    );
  } finally {
    f.clean();
  }
});

const fs = require("fs");
const path = require("path");
const os = require("os");
const { atomicWrite } = require("./repository.cjs");
const { allowedNavigation } = require("./camfit.cjs");
const {
  safeRoute,
  exportLabel,
  inspectionScript,
  metadataScript,
} = require("./camfit-page.cjs");

const MAX_BYTES = 8 * 1024 * 1024;
const FIELDS = [
  "externalId",
  "unit",
  "name",
  "phone",
  "arrival",
  "departure",
  "kind",
  "people",
  "status",
  "siteLabel",
];
const REQUIRED = [
  "externalId",
  "name",
  "arrival",
  "departure",
  "kind",
  "status",
];
function validProfile(value) {
  if (
    !value ||
    value.version !== 1 ||
    safeRoute(value.route) !== value.route ||
    !exportLabel(value.exportLabel)
  )
    return false;
  if (
    !Array.isArray(value.headers) ||
    !value.headers.length ||
    value.headers.length > 100 ||
    value.headers.some((h) => typeof h !== "string" || h.length > 500)
  )
    return false;
  if (
    !value.mapping ||
    FIELDS.some(
      (key) =>
        !Number.isInteger(value.mapping[key]) ||
        value.mapping[key] < -1 ||
        value.mapping[key] >= value.headers.length,
    )
  )
    return false;
  if (
    REQUIRED.some((key) => value.mapping[key] < 0) ||
    new Set(
      FIELDS.map((key) => value.mapping[key]).filter((index) => index >= 0),
    ).size !== FIELDS.filter((key) => value.mapping[key] >= 0).length
  )
    return false;
  const dictionary = (data, choices) =>
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data).length <= 500 &&
    Object.entries(data).every(
      ([key, item]) => key.length <= 500 && choices.includes(item),
    );
  return (
    dictionary(value.kinds, ["auto", "glamping", "caravan", "bungalow"]) &&
    dictionary(value.statuses, ["reserved", "cancelled", "ignore"]) &&
    (value.lastSync === "" ||
      (typeof value.lastSync === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.lastSync) &&
        Number.isFinite(Date.parse(value.lastSync))))
  );
}

function timeoutMessage(job) {
  const reason = {
    login:
      "캠핏 로그인이 아직 끝나지 않았어요. 캠핏 창에서 로그인과 추가 인증을 마친 뒤 다시 연결해 주세요.",
    navigating:
      "예약 목록으로 이동을 마치지 못했어요. 캠핏 창에서 예약 목록을 열고 다시 연결해 주세요.",
    "first-connection":
      "캠핏 첫 연결이 아직 끝나지 않았어요. 로그인 후 예약 목록에서 CSV·XLSX 내보내기를 직접 눌러 주세요.",
    "different-route":
      "저장한 예약 내보내기 화면이 현재 캠핏 창에 열리지 않았어요. 로그인 상태와 예약 목록을 확인한 뒤 CSV·XLSX 내보내기를 직접 눌러 주세요.",
    "missing-button":
      "저장한 내보내기 버튼을 현재 캠핏 화면에서 찾지 못했어요. 예약 목록에서 CSV·XLSX 내보내기를 직접 눌러 주세요.",
    "duplicate-buttons":
      "같은 이름의 내보내기 버튼이 여러 개여서 자동으로 누르지 않았어요. 원하는 예약 목록의 CSV·XLSX 내보내기를 직접 눌러 주세요.",
    "waiting-file":
      "캠핏 내보내기 버튼을 눌렀지만 CSV·XLSX 파일이 도착하지 않았어요. 캠핏 창의 추가 선택이나 다운로드 안내를 확인해 주세요.",
    downloading:
      "캠핏 예약 파일을 받기 시작했지만 다운로드가 끝나지 않았어요. 캠핏 창과 인터넷 연결을 확인해 주세요.",
    checking:
      "캠핏 화면의 내보내기 버튼을 확인하지 못했어요. 캠핏 창의 로딩 상태와 예약 목록을 확인해 주세요.",
  }[job.stage];
  return `${reason || "캠핏 화면 준비를 마치지 못했어요. 인터넷 연결과 캠핏 창을 확인해 주세요."} 기존 예약은 유지했어요.`;
}

class CamfitSync {
  constructor(
    directory,
    isolatedSession,
    getWindow,
    { timeout = 180000 } = {},
  ) {
    this.file = path.join(directory, "camfit-sync.json");
    this.session = isolatedSession;
    this.getWindow = getWindow;
    this.timeout = timeout;
    this.job = null;
    this.downloadListener = (event, item, contents) =>
      this.receive(event, item, contents);
    isolatedSession.on("will-download", this.downloadListener);
  }
  profile() {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return validProfile(value) ? value : null;
    } catch {
      return null;
    }
  }
  status() {
    return { stage: this.job?.stage || "idle" };
  }
  saveProfile(value) {
    if (!validProfile(value))
      throw new Error("캠핏 열 연결과 내보내기 버튼을 확인해 주세요.");
    // 정해진 설정 필드만 저장한다. 알 수 없는 필드·파일 내용은 저장하지 않는다.
    const clean = Object.fromEntries(
      [
        "version",
        "route",
        "exportLabel",
        "headers",
        "kinds",
        "statuses",
        "lastSync",
      ].map((key) => [key, value[key]]),
    );
    clean.mapping = Object.fromEntries(
      FIELDS.map((key) => [key, value.mapping[key]]),
    );
    atomicWrite(this.file, JSON.stringify(clean));
  }
  cancel(message = "캠핏 동기화를 중단했어요. 기존 예약은 유지했어요.") {
    if (this.job) this.finish(this.job, new Error(message));
  }
  finish(job, error, result) {
    if (this.job !== job) return;
    this.job = null;
    clearInterval(job.poll);
    clearTimeout(job.timer);
    job.window?.removeListener("closed", job.closed);
    if (
      job.item &&
      !job.item.isDestroyed?.() &&
      job.item.getState() !== "completed"
    )
      job.item.cancel();
    if (job.directory)
      fs.rm(
        job.directory,
        { recursive: true, force: true, maxRetries: 3 },
        () => {},
      );
    if (error) job.reject(error);
    else job.resolve(result);
  }
  download() {
    if (this.job)
      return Promise.reject(new Error("캠핏 명단을 이미 받고 있어요."));
    const profile = this.profile();
    return new Promise((resolve, reject) => {
      const job = {
        resolve,
        reject,
        window: null,
        item: null,
        attempted: false,
        checking: false,
        returnedToRoute: false,
        navigations: 0,
        stage: "opening",
      };
      this.job = job;
      job.timer = setTimeout(
        () => this.finish(job, new Error(timeoutMessage(job))),
        this.timeout,
      );
      const inspect = async () => {
        const window = job.window;
        if (
          this.job !== job ||
          job.checking ||
          job.item ||
          job.attempted ||
          !window ||
          window.isDestroyed() ||
          window.webContents.isLoadingMainFrame?.() ||
          !allowedNavigation(window.webContents.getURL())
        )
          return;
        job.checking = true;
        try {
          const sameRoute =
            profile && safeRoute(window.webContents.getURL()) === profile.route;
          const options = {
            label: sameRoute ? profile.exportLabel : null,
            route: profile?.route || null,
          };
          const inspection = await window.webContents.executeJavaScript(
            inspectionScript(options),
          );
          if (this.job !== job || job.item || inspection.blocked) return;
          if (inspection.login) {
            job.stage = "login";
            return;
          }
          if (profile && !sameRoute) {
            if (inspection.authenticated && !job.returnedToRoute) {
              job.returnedToRoute = true;
              job.stage = "navigating";
              await window.loadURL(profile.route);
            } else job.stage = "different-route";
            return;
          }
          if (profile || inspection.booking) {
            if (inspection.matches === 1) {
              // 클릭 후 화면이 전환되어 실행 결과를 받지 못해도 중복 실행하지 않는다.
              job.attempted = true;
              job.stage = "waiting-file";
              const action = await window.webContents.executeJavaScript(
                inspectionScript({
                  ...options,
                  action: "export",
                  label: profile?.exportLabel || inspection.label,
                }),
              );
              if (this.job !== job || job.item) return;
              if (!action.clicked) {
                job.attempted = false;
                job.stage = action.login ? "login" : "checking";
              }
            } else
              job.stage =
                inspection.matches > 1 ? "duplicate-buttons" : "missing-button";
            return;
          }
          // 첫 연결에는 확인 가능한 예약 메뉴 링크만 사용하고 두 단계 이상 추측하지 않는다.
          if (inspection.navigationMatches === 1 && job.navigations < 2) {
            job.navigations++;
            job.stage = "navigating";
            await window.webContents.executeJavaScript(
              inspectionScript({ action: "navigate" }),
            );
          } else job.stage = "first-connection";
        } catch {
          // 클릭을 요청한 뒤 생긴 오류는 다운로드를 기다린다. 같은 버튼을 다시 누르지 않는다.
          if (this.job === job && !job.item && !job.attempted)
            job.stage = "checking";
        } finally {
          job.checking = false;
        }
      };
      const attach = (window) => {
        if (this.job !== job || job.window) return;
        job.window = window;
        job.closed = () =>
          this.finish(
            job,
            new Error(
              "캠핏 창을 닫아 동기화를 중단했어요. 기존 예약은 유지했어요.",
            ),
          );
        window.once("closed", job.closed);
        job.poll = setInterval(() => void inspect(), 700);
      };
      void (async () => {
        try {
          // 창의 첫 loadURL 완료 전부터 파일을 받는다. 빠른 자동 다운로드도 놓치지 않는다.
          const window = await this.getWindow(profile?.route, attach);
          if (this.job !== job) return;
          attach(window);
          await inspect();
        } catch {
          this.finish(
            job,
            new Error(
              "캠핏 화면을 열지 못했어요. 인터넷 연결을 확인해 주세요. 기존 예약은 유지했어요.",
            ),
          );
        }
      })();
    });
  }
  receive(event, item, contents) {
    const job = this.job;
    if (
      !job ||
      !job.window ||
      contents !== job.window.webContents ||
      !allowedNavigation(contents.getURL()) ||
      job.item
    )
      return;
    const name = path.basename(item.getFilename());
    const extension = path.extname(name).toLowerCase();
    if (![".csv", ".xlsx"].includes(extension)) {
      event.preventDefault();
      this.finish(
        job,
        new Error(
          "캠핏에서 CSV 또는 XLSX 예약 명단을 내려받아 주세요. XLS 파일은 현재 자동 동기화 형식으로 지원하지 않아요.",
        ),
      );
      return;
    }
    if (item.getTotalBytes() > MAX_BYTES) {
      event.preventDefault();
      this.finish(job, new Error("8MB 이하의 예약 명단을 내려받아 주세요."));
      return;
    }
    try {
      job.directory = fs.mkdtempSync(path.join(os.tmpdir(), "sopung-camfit-"));
      job.item = item;
      job.stage = "downloading";
      job.route = safeRoute(contents.getURL());
      job.file = path.join(job.directory, `reservations${extension}`);
      item.setSavePath(job.file);
      job.metadata = contents
        .executeJavaScript(metadataScript())
        .catch(() => ({ exportLabels: [], clickedLabel: "" }));
      item.on("updated", () => {
        if (
          item.getReceivedBytes() > MAX_BYTES ||
          item.getTotalBytes() > MAX_BYTES
        )
          this.finish(
            job,
            new Error("8MB 이하의 예약 명단을 내려받아 주세요."),
          );
      });
      item.once("done", (_event, state) => {
        if (this.job !== job) return;
        void (async () => {
          try {
            if (state !== "completed")
              throw new Error(
                "캠핏 파일 다운로드가 끝나지 않았어요. 다시 동기화해 주세요.",
              );
            const size = fs.statSync(job.file).size;
            if (!size || size > MAX_BYTES)
              throw new Error("비어 있지 않은 8MB 이하 예약 명단이 필요해요.");
            const metadata = await job.metadata;
            if (this.job !== job) return;
            const exportLabels = metadata.exportLabels
              .filter(exportLabel)
              .slice(0, 20);
            this.finish(job, null, {
              fileName: name,
              base64: fs.readFileSync(job.file).toString("base64"),
              route: job.route,
              exportLabels,
              clickedLabel: exportLabels.includes(metadata.clickedLabel)
                ? metadata.clickedLabel
                : "",
            });
          } catch (error) {
            this.finish(job, error);
          }
        })();
      });
    } catch {
      event.preventDefault();
      this.finish(
        job,
        new Error(
          "캠핏 임시 파일을 저장하지 못했어요. PC의 저장 공간을 확인해 주세요.",
        ),
      );
    }
  }
  dispose() {
    this.cancel();
    this.session.removeListener("will-download", this.downloadListener);
  }
}
module.exports = { CamfitSync, safeRoute, exportLabel, validProfile };

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  session,
} = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const { Repository, atomicWrite, MAX_BYTES } = require("./repository.cjs");
const { readAuth } = require("./auth.cjs");
const { createLoginWindow } = require("./camfit.cjs");
const { CamfitSync } = require("./camfit-sync.cjs");

app.setName("Sopung Camp");
if (!app.isPackaged && process.env.SOPUNG_TEST_DIR)
  app.setPath("userData", process.env.SOPUNG_TEST_DIR);
let window,
  camfitWindow,
  camfitSync,
  repo,
  auth,
  authFile,
  unlocked = false,
  attempts = 0,
  blockedUntil = 0;
const entry = path.join(__dirname, "..", "dist", "index.html");
const entryURL = pathToFileURL(entry).href;
function derive(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, 310000, 32, "sha256").toString("hex");
}
function checkSender(event) {
  if (
    event.sender !== window?.webContents ||
    event.senderFrame.url.split("#")[0] !== entryURL
  )
    throw new Error("허용되지 않은 요청이에요.");
}
function handle(channel, handler, allowLocked = false) {
  ipcMain.handle(channel, async (event, ...args) => {
    checkSender(event);
    if (!allowLocked && !unlocked)
      throw new Error("잠금을 먼저 해제해 주세요.");
    return handler(...args);
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.whenReady().then(() => {
    const directory = app.getPath("userData");
    fs.mkdirSync(directory, { recursive: true });
    try {
      repo = new Repository(
        directory,
        !app.isPackaged && process.env.SOPUNG_TEST_DIR
          ? path.join(directory, "backups")
          : path.join(app.getPath("documents"), "Sopung Camp Backups"),
      );
    } catch (error) {
      dialog.showErrorBox(
        "백업 설정 파일을 읽지 못했어요",
        `예약 데이터와 기존 설정 파일은 그대로 두었습니다. ${path.join(directory, "preferences.json")} 파일을 확인해 주세요.\n\n${error.message}`,
      );
      app.quit();
      return;
    }
    authFile = path.join(directory, "lock.json");
    try {
      auth = readAuth(authFile);
    } catch {
      dialog.showErrorBox(
        "잠금 파일을 읽지 못했어요",
        "기존 파일을 유지했습니다. 데이터 폴더의 lock.json을 확인해 주세요.",
      );
      app.quit();
      return;
    }
    handle(
      "camp:status",
      () => ({
        configured: !!auth,
        unlocked,
        mode: auth?.mode || "pin",
        dataPath: directory,
        backupPath: repo.backupPath,
        lastBackup: repo.config.lastBackup || "",
        backupError: repo.backupError || "",
        dataBytes: repo.dataBytes(),
        dataLimit: MAX_BYTES,
        fileProblems: unlocked ? repo.fileProblems() : [],
      }),
      true,
    );
    handle(
      "camp:setup",
      (secret, mode) => {
        if (auth) throw new Error("이미 잠금이 설정되어 있어요.");
        if (
          typeof secret !== "string" ||
          (mode === "pin"
            ? !/^\d{6}$/.test(secret)
            : mode !== "password" || secret.length < 8 || secret.length > 128)
        )
          throw new Error(
            "PIN은 숫자 6자리, 비밀번호는 8자 이상으로 입력해 주세요.",
          );
        const salt = crypto.randomBytes(24).toString("hex");
        const nextAuth = { salt, hash: derive(secret, salt), mode };
        atomicWrite(authFile, JSON.stringify(nextAuth));
        auth = nextAuth;
        unlocked = true;
      },
      true,
    );
    handle(
      "camp:unlock",
      (secret) => {
        if (Date.now() < blockedUntil)
          throw new Error("여러 번 틀렸어요. 1분 후 다시 입력해 주세요.");
        if (!auth || typeof secret !== "string" || secret.length > 128)
          throw new Error("입력 내용을 확인해 주세요.");
        const correct = crypto.timingSafeEqual(
          Buffer.from(derive(secret, auth.salt), "hex"),
          Buffer.from(auth.hash, "hex"),
        );
        if (!correct) {
          attempts++;
          if (attempts >= 5) {
            attempts = 0;
            blockedUntil = Date.now() + 60000;
          }
          throw new Error("PIN 또는 비밀번호가 일치하지 않아요.");
        }
        attempts = 0;
        unlocked = true;
      },
      true,
    );
    const openCamfit = async (route, beforeLoad = () => {}) => {
      if (camfitWindow && !camfitWindow.isDestroyed()) {
        camfitWindow.show();
        camfitWindow.focus();
        beforeLoad(camfitWindow);
        if (route) await camfitWindow.loadURL(route);
        return camfitWindow;
      }
      const login = createLoginWindow(
        { BrowserWindow, session },
        window,
        route,
        beforeLoad,
      );
      camfitWindow = login.window;
      camfitWindow.on("closed", () => {
        if (camfitWindow === login.window) camfitWindow = null;
      });
      try {
        await login.loaded;
        if (!unlocked || login.window.isDestroyed()) {
          if (!login.window.isDestroyed()) login.window.destroy();
          throw new Error("잠금을 먼저 해제해 주세요.");
        }
        return login.window;
      } catch {
        if (!login.window.isDestroyed()) login.window.destroy();
        throw new Error(
          "캠핏 로그인 화면을 열지 못했어요. 인터넷 연결을 확인해 주세요.",
        );
      }
    };
    camfitSync = new CamfitSync(
      directory,
      session.fromPartition("persist:sopung-camfit"),
      openCamfit,
    );
    handle("camp:camfit-profile", () => camfitSync.profile());
    handle("camp:camfit-progress", () => camfitSync.status());
    handle("camp:camfit-download", () => camfitSync.download());
    handle("camp:camfit-profile-save", (profile) =>
      camfitSync.saveProfile(profile),
    );
    handle("camp:camfit-cancel", () => camfitSync.cancel());
    handle("camp:lock", () => {
      unlocked = false;
      camfitSync.cancel();
      camfitWindow?.destroy();
    });
    handle(
      "camp:quit",
      () => {
        setTimeout(() => app.quit(), 50);
      },
      true,
    );
    handle("camp:camfit-login", async () => {
      await openCamfit();
    });
    handle("camp:load", () => repo.load());
    handle("camp:save", (value) => repo.save(value));
    handle("camp:restore", (value) => repo.restore(value));
    handle("camp:backup", () => repo.backup());
    handle("camp:archive-commit", (next, files) => {
      const result = repo.commitArchive(next, files);
      // 새 보관 파일을 바로 백업 폴더에도 둔다. 실패해도 보관은 이미 저장되었다.
      try {
        repo.backup();
      } catch (e) {
        repo.backupError = e.message;
      }
      return { ...result, backupError: repo.backupError || "" };
    });
    handle("camp:archive-search", (query, offset) =>
      repo.searchArchives(query, offset),
    );
    handle("camp:archive-lookup", (pairs) => repo.lookupArchives(pairs));
    handle("camp:verify-attachments", (value) => repo.verifyAttachments(value));
    handle("camp:aerial-save", (dataUrl) => repo.saveAerial(dataUrl));
    handle("camp:aerial-read", (ref) => repo.readAerial(ref));
    handle("camp:pick-backup", async () => {
      const result = await dialog.showOpenDialog(window, {
        title: "복원할 백업 파일 선택",
        properties: ["openFile"],
        filters: [{ name: "소풍캠핑장 백업", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return repo.inspectBackup(result.filePaths[0]);
    });
    handle("camp:restore-backup", (token) => repo.restoreBackup(token));
    handle("camp:export-backup", async () => {
      const result = await dialog.showOpenDialog(window, {
        title: "백업을 내보낼 폴더 선택",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return repo.exportBackup(result.filePaths[0]);
    });
    handle("camp:choose-backup", async () => {
      const result = await dialog.showOpenDialog(window, {
        title: "백업 폴더 선택",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled) return null;
      repo.setBackupPath(result.filePaths[0]);
      return repo.backupPath;
    });
    handle(
      "camp:open-folder",
      async () => {
        const error = await shell.openPath(directory);
        if (error) throw new Error(error);
      },
      true,
    );
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
      callback({
        cancel:
          !details.url.startsWith("file:") &&
          !details.url.startsWith("data:") &&
          !details.url.startsWith("blob:") &&
          !details.url.startsWith("devtools:"),
      }),
    );
    window = new BrowserWindow({
      width: 1460,
      height: 980,
      minWidth: 960,
      minHeight: 680,
      title: "소풍캠핑장",
      backgroundColor: "#f5f6f8",
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (url.split("#")[0] !== entryURL) event.preventDefault();
    });
    window.once("ready-to-show", () => window.show());
    window.on("closed", () => {
      camfitSync.dispose();
      camfitWindow?.destroy();
    });
    window.loadFile(entry);
    try {
      repo.dailyBackup();
    } catch (e) {
      repo.backupError = e.message;
      dialog.showErrorBox("자동 백업을 확인해 주세요", e.message);
    }
    setInterval(() => {
      try {
        repo.dailyBackup();
        repo.backupError = "";
      } catch (e) {
        repo.backupError = e.message;
      }
    }, 60000).unref();
  });
  app.on("window-all-closed", () => app.quit());
}

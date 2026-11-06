const LOGIN_URL = "https://admin.camfit.co.kr/";
function allowedNavigation(value) {
  try {
    const url = new URL(value);
    return (
      url.origin === "https://admin.camfit.co.kr" &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
function createLoginWindow({ BrowserWindow, session }, owner, url = LOGIN_URL) {
  if (!allowedNavigation(url)) throw new Error("캠핏 주소를 확인해 주세요.");
  const isolated = session.fromPartition("persist:sopung-camfit");
  isolated.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  isolated.setPermissionCheckHandler(() => false);
  const login = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 850,
    minHeight: 620,
    parent: owner,
    title: "캠핏 캠지기센터",
    show: false,
    webPreferences: {
      session: isolated,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  login.setMenu(null);
  login.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  for (const eventName of ["will-navigate", "will-redirect"]) {
    login.webContents.on(eventName, (event, url) => {
      if (!allowedNavigation(url)) event.preventDefault();
    });
  }
  login.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  login.once("ready-to-show", () => login.show());
  return { window: login, loaded: login.loadURL(url) };
}
module.exports = { LOGIN_URL, allowedNavigation, createLoginWindow };

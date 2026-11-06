const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function atomicWrite(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(descriptor, contents, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temp, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function dayStamp() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}
const MAX_BYTES = 16 * 1024 * 1024;
const megabytes = (bytes) => (bytes / 1048576).toFixed(1);
function basicValidate(value) {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.demo !== "boolean" ||
    !value.settings ||
    ![
      "sites",
      "reservations",
      "allocations",
      "blocks",
      "changes",
      "activity",
    ].every((k) => Array.isArray(value[k]))
  )
    throw new Error(
      "저장 파일의 형식이 올바르지 않아요. 기존 파일을 확인해 주세요.",
    );
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > MAX_BYTES)
    throw new Error(
      `저장 파일이 너무 커요. ${megabytes(bytes)}MB로 한도 16MB를 넘어 저장하지 않았어요. 기존 파일은 그대로예요.`,
    );
  return bytes;
}
// 같은 날짜의 일일 백업이 이미 있으면 덮어쓰지 않고, 복원할 수 있는 파일인지 확인한다.
function checkBackup(file, stat) {
  if (!stat.isFile())
    throw new Error(
      `백업 폴더에 같은 이름의 폴더가 있어 오늘 자동 백업을 만들지 못했어요: ${path.basename(file)}. ‘지금 백업’으로 따로 저장할 수 있어요.`,
    );
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    basicValidate(value);
    return value;
  } catch {
    throw new Error(
      `오늘 자동 백업 파일을 읽을 수 없어 덮어쓰지 않았어요: ${path.basename(file)}. 파일을 확인하거나 ‘지금 백업’으로 따로 저장해 주세요.`,
    );
  }
}
// 지난 연도 보관 파일. 이름은 src/domain.ts의 ARCHIVE_FILE과 같은 규칙만 허용한다.
const ARCHIVE_FILE = /^sopung-archive-\d{4}-[0-9a-z]+-\d+\.json$/;
const ARCHIVE_KEYS = ["reservations", "allocations", "activity"];
const sha256 = (text) =>
  crypto.createHash("sha256").update(text, "utf8").digest("hex");
function checkArchive(ref, text) {
  const broken = () =>
    new Error(
      `보관 파일 ${ref.file}(${ref.year}년)의 내용이 저장 기록과 달라요. 백업 폴더의 archive 폴더에 있는 같은 이름의 파일로 바꾸거나 ‘백업 폴더에서 복원’을 사용해 주세요.`,
    );
  if (
    Buffer.byteLength(text, "utf8") !== ref.bytes ||
    sha256(text) !== ref.sha256
  )
    throw broken();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw broken();
  }
  if (
    !data ||
    data.format !== "sopung-archive" ||
    data.version !== 1 ||
    data.year !== ref.year ||
    !ARCHIVE_KEYS.every(
      (key) => Array.isArray(data[key]) && data[key].length === ref[key],
    )
  )
    throw broken();
  return data;
}
// 본 파일이 참조하는 별도 파일: 지난 연도 보관 파일(archive/)과 항공사진(assets/).
// 내용은 SHA-256으로 확인하고, 이름은 정해진 규칙만 허용한다.
const ASSET_REF = /^asset:(aerial-([a-f0-9]{64})\.(png|jpg|webp))$/;
function attachments(value) {
  const list = (Array.isArray(value?.archives) ? value.archives : []).map(
    (ref) => {
      if (!ref || typeof ref.file !== "string" || !ARCHIVE_FILE.test(ref.file))
        throw new Error("보관 파일 이름을 확인해 주세요.");
      return {
        folder: "archive",
        name: ref.file,
        label: `보관 파일 ${ref.file}(${ref.year}년)`,
        bytes: ref.bytes,
        check: (buffer) => checkArchive(ref, buffer.toString("utf8")),
      };
    },
  );
  const aerial = ASSET_REF.exec(value?.settings?.aerial || "");
  if (aerial)
    list.push({
      folder: "assets",
      name: aerial[1],
      label: `항공사진 파일 ${aerial[1]}`,
      check: (buffer) => {
        if (sha256(buffer) !== aerial[2])
          throw new Error(
            `항공사진 파일 ${aerial[1]}의 내용이 저장 기록과 달라요. 백업 폴더의 assets 폴더에 있는 같은 이름의 파일로 바꾸거나 ‘백업 폴더에서 복원’을 사용해 주세요.`,
          );
      },
    });
  return list;
}
const groupByReservation = (list) => {
  const map = new Map();
  for (const item of list)
    map.set(item.reservationId, [...(map.get(item.reservationId) || []), item]);
  return map;
};
class Repository {
  constructor(directory, defaultBackupPath) {
    this.directory = directory;
    this.file = path.join(directory, "camp-data.json");
    this.configFile = path.join(directory, "preferences.json");
    this.archiveDir = path.join(directory, "archive");
    this.archives = null;
    this.aerial = "";
    this.copied = new Map();
    this.defaultBackupPath = defaultBackupPath;
    this.config = fs.existsSync(this.configFile)
      ? JSON.parse(fs.readFileSync(this.configFile, "utf8"))
      : {};
    if (
      !this.config ||
      typeof this.config !== "object" ||
      Array.isArray(this.config) ||
      (this.config.backupPath !== undefined &&
        (typeof this.config.backupPath !== "string" ||
          !path.isAbsolute(this.config.backupPath))) ||
      (this.config.lastBackup !== undefined &&
        typeof this.config.lastBackup !== "string")
    )
      throw new Error("백업 설정의 폴더 경로와 날짜를 확인해 주세요.");
  }
  get backupPath() {
    return this.config.backupPath || this.defaultBackupPath;
  }
  saveConfig(config = this.config) {
    atomicWrite(this.configFile, JSON.stringify(config, null, 2));
  }
  recordBackup(stamp) {
    const previous = this.config;
    this.config = { ...previous, lastBackup: stamp };
    try {
      this.saveConfig();
    } catch (e) {
      this.config = previous;
      throw e;
    }
  }
  load() {
    if (!fs.existsSync(this.file)) {
      this.remember(null);
      return null;
    }
    const value = JSON.parse(fs.readFileSync(this.file, "utf8"));
    basicValidate(value);
    this.remember(value);
    return value;
  }
  // 지금 본 파일이 참조하는 보관 목록과 사진. 상태 확인·검색은 이것만 본다.
  remember(value) {
    this.archives = value?.archives || [];
    this.aerial = value?.settings?.aerial || "";
  }
  save(value) {
    const bytes = basicValidate(value);
    const old = this.load(); // 손상된 기존 파일을 조용히 덮어쓰지 않는다.
    if (old)
      atomicWrite(
        path.join(this.directory, "camp-data.previous.json"),
        JSON.stringify(old),
      );
    atomicWrite(this.file, JSON.stringify(value));
    this.remember(value);
    try {
      this.dailyBackup();
      this.backupError = "";
    } catch (e) {
      this.backupError = e.message;
    }
    return { backupError: this.backupError, bytes };
  }
  dataBytes() {
    return fs.statSync(this.file, { throwIfNoEntry: false })?.size || 0;
  }
  // 오늘 백업 파일을 만들거나 기존 파일을 확인한다. 확인한 파일은 바뀌기 전까지 다시 읽지 않는다.
  ensureDailyFile(file) {
    const key = (stat) => `${file}:${stat.size}:${stat.mtimeMs}:${stat.ino}`;
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    // 백업이 참조하는 보관 파일을 먼저 같은 백업 폴더의 archive/에 둔 뒤 본 백업을 쓴다.
    const refs = (value) => ({
      archives: value.archives,
      settings: { aerial: value.settings?.aerial },
    });
    if (!stat) {
      const saved = this.load();
      this.copyAttachments(path.dirname(file), saved);
      atomicWrite(file, JSON.stringify(saved));
      this.checkedBackup = { key: key(fs.statSync(file)), value: refs(saved) };
      return;
    }
    if (this.checkedBackup?.key !== key(stat))
      this.checkedBackup = {
        key: key(stat),
        value: refs(checkBackup(file, stat)),
      };
    // 확인한 일일 백업이라도 참조 파일 사본은 매번 확인해 빠진 것은 다시 만든다.
    this.copyAttachments(path.dirname(file), this.checkedBackup.value);
  }
  dailyBackup() {
    if (!fs.existsSync(this.file)) return;
    const stamp = dayStamp();
    this.ensureDailyFile(path.join(this.backupPath, `sopung-${stamp}.json`));
    // 파일 생성 뒤 설정 저장만 실패한 경우에도 다음 검사에서 기록을 보완한다.
    if (this.config.lastBackup !== stamp) this.recordBackup(stamp);
    this.backupError = "";
  }
  backup() {
    const value = this.load();
    if (!value) throw new Error("먼저 예약이나 자리를 저장해 주세요.");
    const file = path.join(
      this.backupPath,
      `sopung-${dayStamp()}-${Date.now()}.json`,
    );
    this.copyAttachments(this.backupPath, value);
    atomicWrite(file, JSON.stringify(value));
    this.recordBackup(dayStamp());
    this.backupError = "";
    return file;
  }
  restore(value) {
    basicValidate(value);
    if (fs.existsSync(this.file))
      atomicWrite(
        path.join(this.directory, `before-restore-${Date.now()}.json`),
        fs.readFileSync(this.file, "utf8"),
      );
    atomicWrite(this.file, JSON.stringify(value));
    this.remember(value);
    try {
      this.backup();
      this.backupError = "";
    } catch (e) {
      this.backupError = e.message;
    }
    return { backupError: this.backupError };
  }
  setBackupPath(directory) {
    if (path.resolve(directory) === path.resolve(this.directory))
      throw new Error("데이터 폴더와 다른 백업 폴더를 선택해 주세요.");
    const test = path.join(
      directory,
      `.sopung-write-${crypto.randomBytes(6).toString("hex")}`,
    );
    fs.writeFileSync(test, "", { flag: "wx" });
    fs.unlinkSync(test);
    // 새 폴더의 첫 백업 확인과 설정 저장이 모두 성공해야 경로를 바꾼다.
    const next = { ...this.config, backupPath: directory };
    if (fs.existsSync(this.file)) {
      const stamp = dayStamp();
      this.ensureDailyFile(path.join(directory, `sopung-${stamp}.json`));
      next.lastBackup = stamp;
    }
    this.saveConfig(next);
    this.config = next;
    this.backupError = "";
  }
  archiveFile(ref) {
    if (!ref || typeof ref.file !== "string" || !ARCHIVE_FILE.test(ref.file))
      throw new Error("보관 파일 이름을 확인해 주세요.");
    return path.join(this.archiveDir, ref.file);
  }
  readArchiveText(ref, file = this.archiveFile(ref)) {
    return this.readAttachment(
      attachments({ archives: [ref] })[0],
      file,
    ).toString("utf8");
  }
  readAttachment(
    item,
    file = path.join(this.directory, item.folder, item.name),
  ) {
    let buffer;
    try {
      buffer = fs.readFileSync(file);
    } catch {
      throw new Error(
        `${item.label}을 찾을 수 없어요. 백업 폴더의 ${item.folder} 폴더에서 같은 파일을 데이터 폴더의 ${item.folder} 폴더로 복사하거나 ‘백업 폴더에서 복원’을 사용해 주세요.`,
      );
    }
    item.check(buffer);
    return buffer;
  }
  readArchive(ref) {
    return checkArchive(ref, this.readArchiveText(ref));
  }
  currentArchives() {
    if (this.archives === null)
      try {
        this.load();
      } catch {
        this.archives = [];
      }
    return this.archives || [];
  }
  // 시작·상태 확인용: 파일 존재와 크기만 빠르게 본다. 내용은 읽을 때 SHA-256으로 확인한다.
  fileProblems(
    value = {
      archives: this.currentArchives(),
      settings: { aerial: this.aerial },
    },
  ) {
    return attachments(value).flatMap((item) => {
      const stat = fs.statSync(
        path.join(this.directory, item.folder, item.name),
        { throwIfNoEntry: false },
      );
      if (!stat || !stat.isFile()) return [`${item.label}이 없어요.`];
      if (item.bytes !== undefined && stat.size !== item.bytes)
        return [`${item.label}의 크기가 저장 기록과 달라요.`];
      return [];
    });
  }
  verifyAttachments(value) {
    return attachments(value).flatMap((item) => {
      try {
        this.readAttachment(item);
        return [];
      } catch (e) {
        return [e.message];
      }
    });
  }
  // 새 보관 파일을 모두 확인·기록한 뒤 마지막에 본 파일을 교체한다. 실패하면 이번 파일을 지운다.
  commitArchive(next, files) {
    basicValidate(next);
    const refs = Array.isArray(next.archives) ? next.archives : [];
    if (!Array.isArray(files) || !files.length)
      throw new Error("보관할 파일이 없어요.");
    const current = this.currentArchives();
    if (
      !current.every((r) =>
        refs.some((x) => x.file === r.file && x.sha256 === r.sha256),
      )
    )
      throw new Error(
        "저장된 보관 목록이 빠진 상태라 보관하지 않았어요. 화면을 다시 불러온 뒤 시도해 주세요.",
      );
    const prepared = files.map((item) => {
      const ref = refs.find((r) => r.file === item?.file);
      if (!ref || typeof item.text !== "string")
        throw new Error("보관 파일 목록을 확인해 주세요.");
      checkArchive(ref, item.text);
      const target = this.archiveFile(ref);
      if (fs.existsSync(target))
        throw new Error(
          `같은 이름의 보관 파일이 이미 있어 덮어쓰지 않았어요: ${ref.file}`,
        );
      return { target, text: item.text };
    });
    const problems = this.verifyAttachments({
      archives: refs.filter((r) => !files.some((f) => f.file === r.file)),
    });
    if (problems.length)
      throw new Error(
        `기존 보관 파일에 문제가 있어 새로 보관하지 않았어요. ${problems.join(" ")}`,
      );
    const written = [];
    try {
      for (const { target, text } of prepared) {
        atomicWrite(target, text);
        written.push(target);
      }
      return this.save(next);
    } catch (e) {
      for (const target of written) fs.rmSync(target, { force: true });
      throw e;
    }
  }
  // 한 번에 한 쪽만 보낸다. offset으로 모든 결과에 접근할 수 있다.
  searchArchives(query, offset = 0, limit = 100) {
    const normalize = (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[\s()+-]/g, "");
    const wanted = normalize(query);
    if (!wanted)
      throw new Error("보관 기록에서 찾을 이름이나 연락처를 입력해 주세요.");
    const results = [];
    for (const ref of this.currentArchives()) {
      const data = this.readArchive(ref);
      const allocations = groupByReservation(data.allocations);
      const activity = groupByReservation(data.activity);
      for (const reservation of data.reservations)
        if (
          [
            reservation.name,
            reservation.phone,
            reservation.vehicle,
            reservation.note,
          ].some((value) => normalize(value).includes(wanted))
        )
          results.push({
            year: data.year,
            reservation,
            allocations: allocations.get(reservation.id) || [],
            activity: activity.get(reservation.id) || [],
          });
    }
    results.sort(
      (a, b) =>
        b.reservation.arrival.localeCompare(a.reservation.arrival) ||
        a.reservation.id.localeCompare(b.reservation.id),
    );
    const start = Math.min(
      Math.max(0, Math.floor(Number(offset) || 0)),
      results.length,
    );
    return {
      total: results.length,
      offset: start,
      results: results.slice(start, start + limit),
    };
  }
  // 반복 가져오기용: 같은 경로·예약번호의 보관 예약을 찾는다. 보관 파일에 문제가 있으면 중단한다.
  lookupArchives(pairs) {
    const refs = this.currentArchives();
    if (!refs.length || !Array.isArray(pairs) || !pairs.length) return [];
    const wanted = new Set(pairs.map((pair) => JSON.stringify(pair)));
    const matches = [];
    for (const ref of refs) {
      const data = this.readArchive(ref);
      for (const r of data.reservations)
        if (wanted.has(JSON.stringify([r.source, r.externalId])))
          matches.push({
            year: data.year,
            reservation: Object.fromEntries(
              [
                "source",
                "externalId",
                "unit",
                "name",
                "phone",
                "kind",
                "people",
                "arrival",
                "departure",
                "status",
                "sourceArrival",
                "sourceDeparture",
                "sourceCancelled",
              ].map((key) => [key, r[key]]),
            ),
          });
    }
    return matches;
  }
  // 백업 폴더의 보관·사진 사본: 없으면 원본 SHA-256을 확인해 새로 만들고, 있으면 내용이 같은지 본다.
  // 확인 결과는 파일 크기·수정 시각·inode가 그대로일 때만 다시 쓴다.
  copyAttachments(directory, value) {
    for (const item of attachments(value)) {
      const target = path.join(directory, item.folder, item.name);
      const key = (stat) => `${stat.size}:${stat.mtimeMs}:${stat.ino}`;
      const stat = fs.statSync(target, { throwIfNoEntry: false });
      if (!stat) atomicWrite(target, this.readAttachment(item));
      else if (this.copied.get(target) === key(stat)) continue;
      else
        try {
          item.check(fs.readFileSync(target));
        } catch {
          throw new Error(
            `백업 폴더의 ${item.label} 사본이 저장 기록과 달라 덮어쓰지 않았어요. 파일을 확인해 주세요.`,
          );
        }
      this.copied.set(target, key(fs.statSync(target)));
    }
  }
  // 백업 폴더에서 복원: 백업 옆 archive/·assets/ 또는 데이터 폴더의 정상 파일을 모두 확인한다.
  // 확인한 백업 내용(SHA-256)을 토큰으로 묶어 다른 상태 복원에 쓰이지 않게 한다.
  inspectBackup(filePath) {
    let text, value;
    try {
      text = fs.readFileSync(filePath, "utf8");
      value = JSON.parse(text);
    } catch {
      throw new Error("백업 파일을 읽을 수 없어요. 파일을 확인해 주세요.");
    }
    basicValidate(value);
    const sources = attachments(value).map((item) => {
      for (const file of [
        path.join(path.dirname(filePath), item.folder, item.name),
        path.join(this.directory, item.folder, item.name),
      ])
        try {
          this.readAttachment(item, file);
          return { item, file };
        } catch {
          /* 다음 위치를 확인한다. */
        }
      throw new Error(
        `백업에 연결된 ${item.label}이 백업 폴더의 ${item.folder} 폴더에 없거나 내용이 달라요. 백업 폴더 전체를 함께 옮긴 뒤 다시 복원해 주세요. 지금 데이터는 바꾸지 않았어요.`,
      );
    });
    const token = sha256(text);
    this.pendingRestore = { token, value, sources };
    return { value, token };
  }
  // 첨부 파일 → 본 파일 순서로 교체한다. 내용이 다른 현재 파일은 <폴더>/replaced-<시각>/로 옮겨
  // 보존하고, 중간에 실패하면 새로 쓴 파일을 지우고 옮긴 파일과 본 파일을 그대로 되돌린다.
  restoreBackup(token) {
    const pending = this.pendingRestore;
    if (!pending || typeof token !== "string" || pending.token !== token)
      throw new Error("복원할 백업을 다시 선택해 주세요.");
    this.pendingRestore = null;
    const sources = pending.sources.map(({ item, file }) => ({
      item,
      buffer: this.readAttachment(item, file),
    }));
    const stamp = Date.now();
    const steps = [];
    try {
      for (const { item, buffer } of sources) {
        const target = path.join(this.directory, item.folder, item.name);
        const step = { target };
        if (fs.existsSync(target)) {
          try {
            item.check(fs.readFileSync(target));
            continue;
          } catch {
            const aside = path.join(
              this.directory,
              item.folder,
              `replaced-${stamp}`,
            );
            fs.mkdirSync(aside, { recursive: true });
            step.moved = path.join(aside, item.name);
            fs.renameSync(target, step.moved);
          }
        }
        steps.push(step);
        atomicWrite(target, buffer);
        step.wrote = true;
      }
      return this.restore(pending.value);
    } catch (e) {
      for (const step of steps.reverse()) {
        if (step.wrote) fs.rmSync(step.target, { force: true });
        if (step.moved) fs.renameSync(step.moved, step.target);
      }
      throw e;
    }
  }
  // 보관·사진 파일까지 들어 있는 백업 폴더를 만든다. 이 폴더의 JSON으로 다시 복원할 수 있다.
  exportBackup(directory) {
    const value = this.load();
    if (!value) throw new Error("먼저 예약이나 자리를 저장해 주세요.");
    const target = path.join(
      directory,
      `sopung-export-${dayStamp()}-${Date.now()}`,
    );
    for (const item of attachments(value))
      atomicWrite(
        path.join(target, item.folder, item.name),
        this.readAttachment(item),
      );
    atomicWrite(
      path.join(target, `sopung-${dayStamp()}.json`),
      JSON.stringify(value),
    );
    return target;
  }
  // 항공사진을 데이터 폴더 assets/의 불변 파일로 저장하고 본 파일에 넣을 참조를 돌려준다.
  saveAerial(dataUrl) {
    const match =
      typeof dataUrl === "string" &&
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        dataUrl,
      );
    if (!match) throw new Error("JPG·PNG·WebP 사진을 선택해 주세요.");
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > 8 * 1024 * 1024)
      throw new Error("8MB 이하의 사진을 선택해 주세요.");
    const ref = `asset:aerial-${sha256(buffer)}.${match[1] === "jpeg" ? "jpg" : match[1]}`;
    const item = attachments({ settings: { aerial: ref } })[0];
    const target = path.join(this.directory, item.folder, item.name);
    if (fs.existsSync(target))
      try {
        item.check(fs.readFileSync(target));
        return ref;
      } catch {
        const aside = path.join(
          this.directory,
          item.folder,
          `replaced-${Date.now()}`,
        );
        fs.mkdirSync(aside, { recursive: true });
        fs.renameSync(target, path.join(aside, item.name));
      }
    atomicWrite(target, buffer);
    return ref;
  }
  readAerial(ref) {
    const item = attachments({ settings: { aerial: ref } })[0];
    if (!item) throw new Error("항공사진 참조를 확인해 주세요.");
    const type = { png: "png", jpg: "jpeg", webp: "webp" }[
      path.extname(item.name).slice(1)
    ];
    return `data:image/${type};base64,${this.readAttachment(item).toString("base64")}`;
  }
}
module.exports = { Repository, atomicWrite, basicValidate, MAX_BYTES };

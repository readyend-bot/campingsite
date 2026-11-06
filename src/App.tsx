import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  DownloadSimple,
  FileArrowUp,
  GearSix,
  HouseLine,
  Info,
  ListBullets,
  LockKey,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  PencilSimple,
  Plus,
  Power,
  Printer,
  SignOut,
  SlidersHorizontal,
  Tent,
  Tree,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  AERIAL_ASSET,
  AREAS,
  DATA_LIMIT,
  KINDS,
  STATUS,
  addDays,
  allocationIndex,
  archiveCandidates,
  archivePlan,
  mondayOfWeek,
  dateLabel,
  assignmentPeriod,
  megabytes,
  emptyState,
  nowLocal,
  period,
  conflict,
  removeBlock,
  replaceState,
  resolveChange,
  saveSite,
  shortDate,
  siteStatus,
  siteKindLabel,
  storageNotice,
  sweep,
  today,
  update,
  validDate,
  validateState,
  weekdayLabel,
  type Reservation,
  type Site,
  type State,
} from "./domain";
import { demoState } from "./demo";
import {
  applyBundledLayout,
  BUNDLED_LAYOUT_DATE,
  bundledInitialState,
} from "./bundledLayout";
import {
  loadState,
  saveState,
  download,
  isDesktop,
  type ArchiveSearchResult,
} from "./storage";
import { Empty, ErrorBox, Field, Modal, Money, Tag } from "./components";
import { AreaDiagram, AreaLayoutEditor } from "./AreaLayout";
import { CampOverview } from "./CampOverview";
import { CamfitSyncForm } from "./CamfitSyncForm";
import type { CamfitProfile } from "./camfitSync";
import {
  AREA_CANVAS,
  SOPUNG_PLAN_ID,
  TERRACE_ORDER,
  applySopungPlan,
  sopungInitialState,
  upgradeSopungPlan,
} from "./sitePlan";
import {
  ArchivedDetail,
  AssignForm,
  BlockForm,
  GuestDetail,
  ImportForm,
  ReservationForm,
  SiteForm,
  type Mutate,
} from "./forms";

type Page = "map" | "guests" | "calendar" | "long" | "sites" | "settings";
type ModalState =
  | { type: "reservation" | "import" | "camfitSync" | "block" | "newSite" }
  | { type: "guest" | "editSite"; id: string }
  | { type: "archived"; index: number }
  | { type: "site"; id: string; day: string; calendar: boolean }
  | {
      type: "confirm";
      title: string;
      description: string;
      action: () => Promise<boolean>;
    }
  | null;
const NAV = [
  { id: "map", label: "자리 배정", icon: MapTrifold },
  { id: "guests", label: "예약 명단", icon: Users },
  { id: "calendar", label: "숙박 캘린더", icon: CalendarBlank },
  { id: "long", label: "장박·사용중지", icon: Tree },
  { id: "sites", label: "자리 편집", icon: SlidersHorizontal },
] as const;
const LEGEND = [
  { type: "empty", label: "빈자리" },
  { type: "assigned", label: "배정" },
  { type: "long", label: "장박" },
  { type: "disabled", label: "사용중지" },
];
export default function App() {
  const [ready, setReady] = useState(!isDesktop),
    [configured, setConfigured] = useState(false),
    [mode, setMode] = useState("pin"),
    [secret, setSecret] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(isDesktop);
  useEffect(() => {
    if (window.camp)
      window.camp
        .status()
        .then((s) => {
          setReady(s.unlocked);
          setConfigured(s.configured);
          setMode(s.mode);
          setLoading(false);
        })
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });
  }, []);
  if (ready)
    return (
      <Manager
        lock={async () => {
          await window.camp?.lock();
          setConfigured(true);
          setSecret("");
          setConfirm("");
          setReady(false);
        }}
      />
    );
  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="brand-icon">
          <Tent weight="fill" size={31} />
        </div>
        <h1>소풍캠핑장</h1>
        <p>
          {configured
            ? "오늘의 소풍을 시작해 볼까요?"
            : "시작하기 전에 잠금을 설정해 주세요."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (!configured && secret !== confirm) {
              setError("입력한 두 값이 달라요.");
              return;
            }
            setLoading(true);
            try {
              if (configured) await window.camp!.unlock(secret);
              else await window.camp!.setup(secret, mode);
              setReady(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {!configured && (
            <Field label="잠금 방식">
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setSecret("");
                  setConfirm("");
                }}
              >
                <option value="pin">숫자 6자리 PIN</option>
                <option value="password">일반 비밀번호 (8자 이상)</option>
              </select>
            </Field>
          )}
          <Field label={mode === "pin" ? "6자리 PIN" : "비밀번호"}>
            <input
              autoFocus
              type="password"
              inputMode={mode === "pin" ? "numeric" : "text"}
              required
              minLength={mode === "pin" ? 6 : 8}
              maxLength={mode === "pin" ? 6 : 128}
              value={secret}
              autoComplete={configured ? "current-password" : "new-password"}
              onChange={(e) => setSecret(e.target.value)}
            />
          </Field>
          {!configured && (
            <Field label="다시 한 번 입력">
              <input
                type="password"
                required
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          )}
          <ErrorBox message={error} />
          <button className="button primary full" disabled={loading}>
            {loading
              ? "확인 중…"
              : configured
                ? "잠금 해제"
                : "설정하고 시작하기"}
            <ArrowRight size={18} />
          </button>
        </form>
        <small>입력한 PIN·비밀번호는 암호화된 검증값으로 보관해요.</small>
        <button
          className="button secondary full exit-button"
          type="button"
          disabled={loading}
          onClick={() =>
            void window.camp!.quit().catch((e) => setError(e.message))
          }
        >
          <Power size={18} /> 프로그램 종료
        </button>
      </div>
    </div>
  );
}

// 보관·사진 파일이 연결된 백업은 이 PC에 같은 파일이 있을 때만 파일 선택으로 복원한다.
async function checkBackupFiles(data: State) {
  if (!data.archives?.length && !AERIAL_ASSET.test(data.settings.aerial))
    return;
  const problems = window.camp?.verifyAttachments
    ? await window.camp.verifyAttachments(data)
    : ["보관 기록·사진 파일이 연결된 백업은 설치 프로그램에서 복원해 주세요."];
  if (problems.length)
    throw new Error(
      `이 백업에 연결된 파일을 이 PC에서 확인하지 못했어요. ‘백업 폴더에서 복원’으로 백업 폴더의 파일을 선택해 주세요. ${problems.join(" ")}`,
    );
}
// 설치 프로그램은 사진 파일을 읽어 화면에만 쓴다. 저장 상태에는 참조만 둔다.
function useAerialSource(value: string) {
  const [source, setSource] = useState({ ref: "", url: "", error: "" });
  useEffect(() => {
    if (!AERIAL_ASSET.test(value)) return;
    let alive = true;
    (window.camp?.readAerial
      ? window.camp.readAerial(value)
      : Promise.reject(
          new Error("설치 프로그램에 저장된 사진이라 여기서는 볼 수 없어요."),
        )
    )
      .then((url) => alive && setSource({ ref: value, url, error: "" }))
      .catch(
        (e: Error) =>
          alive && setSource({ ref: value, url: "", error: e.message }),
      );
    return () => {
      alive = false;
    };
  }, [value]);
  if (!AERIAL_ASSET.test(value)) return { url: value, error: "" };
  return source.ref === value ? source : { url: "", error: "" };
}

function Manager({ lock }: { lock: () => Promise<void> }) {
  const [s, setState] = useState<State | null>(null),
    stateRef = useRef<State | null>(null),
    busyRef = useRef(false);
  const [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [backupWarning, setBackupWarning] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [savedAt, setSavedAt] = useState("");
  const [page, setPage] = useState<Page>("map"),
    [day, setDay] = useState(today()),
    [area, setArea] = useState("전체"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [listFilter, setListFilter] = useState("waiting"),
    [reservationFilter, setReservationFilter] = useState("all"),
    [view, setView] = useState("diagram"),
    [siteView, setSiteView] = useState("layout"),
    [modal, setModal] = useState<ModalState>(null);
  const [tick, setTick] = useState(0);
  const [camfitRevision, setCamfitRevision] = useState(0);
  const [dataBytes, setDataBytes] = useState(0),
    [listPage, setListPage] = useState(0),
    [guestPage, setGuestPage] = useState(0),
    todayRef = useRef(day);
  const [fileProblems, setFileProblems] = useState<string[]>([]),
    [archiveResults, setArchiveResults] = useState<{
      query: string;
      total: number;
      offset: number;
      results: ArchiveSearchResult[];
    } | null>(null);
  const reportBackup = (error?: string) =>
    setBackupWarning(
      error
        ? "데이터는 저장했지만 자동 백업을 만들지 못했어요. 설정에서 백업 폴더를 확인해 주세요."
        : "",
    );
  useEffect(() => {
    let alive = true;
    loadState()
      .then(async (data) => {
        const next = update(data, (draft) => {
          upgradeSopungPlan(draft);
          sweep(draft);
        });
        if (JSON.stringify(data) !== JSON.stringify(next)) {
          const result = await saveState(next);
          if (alive) reportBackup(result.backupError);
        }
        if (alive) {
          setState(next);
          stateRef.current = next;
        }
      })
      .catch((e) => {
        if (alive) setLoadError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let alive = true;
    window.camp
      ?.status()
      .then((status) => {
        if (!alive) return;
        reportBackup(status.backupError);
        setDataBytes(status.dataBytes || 0);
        setFileProblems(status.fileProblems || []);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [tick]);
  useEffect(() => {
    // 오늘을 보고 있었다면 자정 이후 새 오늘을 따라간다. 직접 고른 날짜는 그대로 둔다.
    const current = today();
    if (current === todayRef.current) return;
    const previous = todayRef.current;
    todayRef.current = current;
    setDay((selected) => (selected === previous ? current : selected));
  }, [tick]);
  useEffect(() => setListPage(0), [query, reservationFilter]);
  useEffect(() => setGuestPage(0), [query, listFilter, day]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const mutate: Mutate = async (op, message) => {
    if (busyRef.current || !stateRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const now = nowLocal();
      const next = update(stateRef.current, (draft) => {
        sweep(draft, now);
        op(draft);
        sweep(draft, now);
      });
      validateState(next);
      const result = await saveState(next);
      reportBackup(result.backupError);
      if (result.bytes) setDataBytes(result.bytes);
      stateRef.current = next;
      setState(next);
      setSavedAt(nowLocal());
      if (message) setToast(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  // 지난 연도 기록을 보관 파일로 옮긴다. 보관 파일 확인·기록과 본 파일 교체는 저장소가 함께 처리한다.
  const archiveRecords = async () => {
    if (busyRef.current || !stateRef.current || !window.camp?.commitArchive)
      return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const now = nowLocal();
      const current = update(stateRef.current, (d) => sweep(d, now));
      const plan = await archivePlan(current, now);
      validateState(plan.next);
      const result = await window.camp.commitArchive(plan.next, plan.files);
      reportBackup(result.backupError);
      if (result.bytes) setDataBytes(result.bytes);
      stateRef.current = plan.next;
      setState(plan.next);
      setSavedAt(nowLocal());
      setArchiveResults(null);
      setToast(
        `지난 연도 예약 ${plan.counts.reservations.length}건을 보관 파일로 옮겼어요.`,
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  const searchArchive = async (text = query, offset = 0) => {
    try {
      setError("");
      const result = await window.camp!.searchArchives!(text, offset);
      setArchiveResults({ query: text, ...result });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const archiveWarning = fileProblems.length
    ? `보관 기록·사진 파일을 확인해 주세요. ${fileProblems.join(" ")} 백업 폴더의 archive·assets 폴더에서 같은 파일을 데이터 폴더의 같은 폴더로 복사하거나 ‘백업 폴더에서 복원’을 사용해 주세요. 그동안 명단 가져오기와 새 보관은 하지 않아요.`
    : "";
  useEffect(() => {
    if (stateRef.current && !busyRef.current) {
      const n = update(stateRef.current, (d) => sweep(d));
      if (JSON.stringify(n) !== JSON.stringify(stateRef.current))
        void mutate((d) => sweep(d));
    }
  }, [tick]);
  if (loadError)
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <WarningCircle size={42} />
          <h2>저장된 데이터를 읽지 못했어요</h2>
          <ErrorBox message={loadError} />
          <p>
            기존 파일은 그대로 두었어요. 백업 파일과 저장 폴더를 확인해 주세요.
          </p>
          <button
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            다시 시도
          </button>
          <label className="button secondary">
            백업으로 복원
            <input
              type="file"
              hidden
              accept=".json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 16 * 1024 * 1024)
                    throw new Error("16MB 이하 파일을 선택해 주세요.");
                  const data: unknown = JSON.parse(await file.text());
                  validateState(data);
                  await checkBackupFiles(data);
                  if (
                    !window.confirm(
                      `자리 ${data.sites.length}개, 예약 ${data.reservations.length}건의 백업으로 복원할까요? 현재 파일은 별도로 보관해요.`,
                    )
                  )
                    return;
                  if (window.camp) await window.camp.restore(data);
                  else {
                    const old = localStorage.getItem("sopung-camp-v1");
                    if (old) download(old, `소풍-복원전-${Date.now()}.json`);
                    await saveState(data);
                  }
                  window.location.reload();
                } catch (e) {
                  setLoadError((e as Error).message);
                }
              }}
            />
          </label>
          {isDesktop && window.camp?.pickBackup && (
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  const picked = await window.camp!.pickBackup!();
                  if (!picked) return;
                  const data: State = picked.value;
                  validateState(data);
                  if (
                    !window.confirm(
                      `자리 ${data.sites.length}개, 예약 ${data.reservations.length}건, 보관 파일 ${(data.archives || []).length}개의 백업으로 복원할까요? 현재 파일은 별도로 보관해요.`,
                    )
                  )
                    return;
                  await window.camp!.restoreBackup!(picked.token);
                  window.location.reload();
                } catch (e) {
                  setLoadError((e as Error).message);
                }
              }}
            >
              백업 폴더에서 복원
            </button>
          )}
          {isDesktop && (
            <button
              className="button secondary"
              onClick={() =>
                void window
                  .camp!.openFolder()
                  .catch((e) => setLoadError(e.message))
              }
            >
              데이터 폴더 열기
            </button>
          )}
        </div>
      </div>
    );
  if (!s)
    return (
      <div className="loading-screen">
        <div className="skeleton" />
        <div className="skeleton" />
        <p>자리 현황을 불러오고 있어요…</p>
      </div>
    );
  const weekStart = mondayOfWeek(day);
  const sites = s.sites.filter((x) => !x.archived),
    activeSites = sites.filter((x) => area === "전체" || x.area === area);
  const selectedGuest = s.reservations.find((x) => x.id === selected);
  const summary = Object.fromEntries(
    LEGEND.map((x) => [
      x.type,
      sites.filter((site) => siteStatus(s, site.id, day).type === x.type)
        .length,
    ]),
  );
  const searchText = (value: string) =>
    value.toLowerCase().replace(/[\s()+-]/g, "");
  const matchesSearch = (r: Reservation) =>
    [r.name, r.phone, r.vehicle, r.note].some((x) =>
      searchText(x).includes(searchText(query)),
    );
  const relevantGuests = s.reservations.filter((r) =>
    query ? matchesSearch(r) : r.arrival <= day && r.departure >= day,
  );
  const waiting = relevantGuests.filter((r) => r.status === "waiting");
  const guestList = relevantGuests.filter(
    (r) => listFilter === "all" || r.status === listFilter,
  );
  const filteredReservations = s.reservations
    .filter(
      (r) =>
        (!query || matchesSearch(r)) &&
        (reservationFilter === "all" || r.status === reservationFilter),
    )
    .sort((a, b) => b.arrival.localeCompare(a.arrival));
  // 검색·상태 필터는 전체 예약에 적용하고, 화면에는 한 쪽씩 표시한다.
  const LIST_PAGE_SIZE = 100;
  const listPages = Math.max(
    1,
    Math.ceil(filteredReservations.length / LIST_PAGE_SIZE),
  );
  const shownPage = Math.min(listPage, listPages - 1);
  const pagedReservations = filteredReservations.slice(
    shownPage * LIST_PAGE_SIZE,
    (shownPage + 1) * LIST_PAGE_SIZE,
  );
  const allocationsByReservation =
    page === "guests" || page === "map" ? allocationIndex(s) : undefined;
  const assignedNow = (id: string) =>
    allocationsByReservation?.get(id)?.current;
  // 지도 옆 명단도 검색·상태 결과 전체에서 한 쪽(100명)씩 보여 준다.
  const guestPages = Math.max(1, Math.ceil(guestList.length / LIST_PAGE_SIZE));
  const shownGuestPage = Math.min(guestPage, guestPages - 1);
  const pagedGuests = guestList.slice(
    shownGuestPage * LIST_PAGE_SIZE,
    (shownGuestPage + 1) * LIST_PAGE_SIZE,
  );
  const close = () => {
    if (!busyRef.current) {
      setModal(null);
      setError("");
    }
  };
  const openGuest = (r: Reservation) => setModal({ type: "guest", id: r.id });
  const pickGuest = (id: string) => {
    setSelected(id);
    setPage("map");
    setArea("전체");
    close();
    const guest = s.reservations.find((r) => r.id === id);
    if (guest) setDay(guest.arrival < today() ? today() : guest.arrival);
  };
  const openSite = (site: Site, d = day, calendar = false) => {
    setModal({ type: "site", id: site.id, day: d, calendar });
  };
  const ask = (
    title: string,
    description: string,
    action: () => Promise<boolean>,
  ) => setModal({ type: "confirm", title, description, action });
  const searchBox = (placeholder = "이름, 연락처 검색") => (
    <label className="search-box">
      <MagnifyingGlass size={20} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button aria-label="검색 지우기" onClick={() => setQuery("")}>
          <X size={15} />
        </button>
      )}
    </label>
  );
  const areaTabs = (
    <div className="area-tabs" aria-label="동 선택">
      {["전체", ...AREAS].map((a) => (
        <button
          key={a}
          className={area === a ? "active" : ""}
          aria-pressed={area === a}
          onClick={() => setArea(a)}
        >
          {a === "전체" ? "전체" : `${a}동`}
        </button>
      ))}
    </div>
  );
  const legend = (
    <div className="legend">
      {LEGEND.map((x) => (
        <span key={x.type}>
          <i className={x.type} />
          {x.label}
        </span>
      ))}
    </div>
  );
  const tile = (site: Site) => {
    const st = siteStatus(s, site.id, day);
    const issue = selectedGuest
      ? conflict(
          s,
          site.id,
          assignmentPeriod(selectedGuest).start,
          period(selectedGuest).end,
          selectedGuest.id,
        ) || (site.kind !== selectedGuest.kind ? "숙박 유형이 달라요." : "")
      : "";
    return (
      <button
        key={site.id}
        className={`site-tile ${st.type} ${selectedGuest && issue ? "unavailable" : ""}`}
        aria-label={`${site.label} ${st.label}${st.name ? ` ${st.name}` : ""}`}
        title={
          selectedGuest && issue
            ? issue
            : `${site.label} · ${siteKindLabel(site)} · ${st.label}${st.name ? ` · ${st.name}` : ""}`
        }
        onClick={() => openSite(site)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("text/sopung-reservation")) {
            e.preventDefault();
            e.currentTarget.classList.add("drag-over");
          }
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("drag-over");
          const id = e.dataTransfer.getData("text/sopung-reservation");
          if (id) {
            setSelected(id);
            openSite(site);
          }
        }}
      >
        <strong>
          {s.sitePlan === SOPUNG_PLAN_ID && site.kind === "caravan"
            ? site.label.replace("카라반 ", "") + "호"
            : site.label}
        </strong>
        {site.kind !== "auto" && (
          <small className="site-type-label">
            {site.detail || KINDS[site.kind]}
          </small>
        )}
        <span>{st.name || st.label}</span>
        {st.type === "long" && (
          <Tree size={13} weight="fill" className="tile-icon" />
        )}
      </button>
    );
  };
  let modalContent: ReactNode = null,
    modalTitle = "",
    modalDescription: string | undefined,
    modalWide = false;
  if (modal) {
    if (modal.type === "reservation") {
      modalTitle = "새 예약 등록";
      modalContent = (
        <ReservationForm
          day={day}
          mutate={mutate}
          done={(id) => pickGuest(id)}
        />
      );
    }
    if (modal.type === "import") {
      modalTitle = "예약 명단 가져오기";
      modalWide = true;
      modalContent = <ImportForm mutate={mutate} close={close} />;
    }
    if (modal.type === "camfitSync") {
      modalTitle = "캠핏 예약 동기화";
      modalWide = true;
      modalContent = (
        <CamfitSyncForm
          mutate={mutate}
          close={close}
          completed={() => setCamfitRevision((value) => value + 1)}
        />
      );
    }
    if (modal.type === "block") {
      modalTitle = "장박·사용중지 등록";
      modalContent = <BlockForm s={s} mutate={mutate} close={close} />;
    }
    if (modal.type === "newSite" || modal.type === "editSite") {
      modalTitle = modal.type === "newSite" ? "새 자리 등록" : "자리 정보 수정";
      modalContent = (
        <SiteForm
          site={
            modal.type === "editSite"
              ? s.sites.find((x) => x.id === modal.id)
              : undefined
          }
          mutate={mutate}
          close={close}
        />
      );
    }
    if (modal.type === "guest") {
      const r = s.reservations.find((r) => r.id === modal.id);
      if (r) {
        modalTitle = "예약 상세";
        modalContent = (
          <GuestDetail
            key={r.id}
            r={r}
            s={s}
            mutate={mutate}
            close={close}
            select={pickGuest}
          />
        );
      }
    }
    if (modal.type === "site") {
      const site = sites.find((x) => x.id === modal.id);
      if (site) {
        const st = siteStatus(
          s,
          site.id,
          modal.day,
          modal.calendar ? `${modal.day}T14:00:00` : nowLocal(),
        );
        modalTitle = `${site.label} · ${siteKindLabel(site)}`;
        modalDescription = `${dateLabel(modal.day)}${modal.calendar ? " · 오후 2시 이후 이용 현황" : ""}`;
        if (st.type === "assigned")
          modalContent = (
            <GuestDetail
              key={st.reservation.id}
              r={st.reservation}
              s={s}
              mutate={mutate}
              close={close}
              select={pickGuest}
            />
          );
        else if (st.type === "long" || st.type === "disabled")
          modalContent = (
            <>
              <div className={`site-preview ${st.type}`}>
                <Tag tone={st.type === "long" ? "amber" : ""}>{st.label}</Tag>
                <h3>{st.name}</h3>
                <p>
                  {shortDate(st.block.start)} ~ {shortDate(st.block.end)}
                </p>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>연락처</dt>
                  <dd>{st.block.phone || "미등록"}</dd>
                </div>
                <div>
                  <dt>메모</dt>
                  <dd>{st.block.note || "없음"}</dd>
                </div>
              </dl>
              <button
                className="button secondary full"
                onClick={() =>
                  ask(
                    `${st.label}을 종료할까요?`,
                    "지금부터 빈자리로 전환해요. 이전 이용 기록은 유지해요.",
                    () =>
                      mutate(
                        (d) => removeBlock(d, st.block.id),
                        "종료하고 자리를 비웠어요.",
                      ),
                  )
                }
              >
                {st.label} 종료
              </button>
            </>
          );
        else
          modalContent = (
            <AssignForm
              site={site}
              s={s}
              day={modal.day}
              selected={selected}
              mutate={mutate}
              done={() => {
                setSelected("");
                close();
              }}
            />
          );
      }
    }
    if (modal.type === "archived") {
      const item = archiveResults?.results[modal.index];
      if (item) {
        modalTitle = "보관된 예약 상세";
        modalDescription = `${item.year}년 보관 기록 · 읽기 전용`;
        modalContent = <ArchivedDetail item={item} s={s} />;
      }
    }
    if (modal.type === "confirm") {
      const m = modal;
      modalTitle = m.title;
      modalContent = (
        <>
          <p className="confirm-copy">{m.description}</p>
          <div className="form-footer">
            <button className="button secondary" onClick={close}>
              돌아가기
            </button>
            <button
              className="button primary"
              onClick={async () => {
                if (await m.action()) close();
              }}
            >
              확인
            </button>
          </div>
        </>
      );
    }
  }
  return (
    <div className={`app-shell ${busy ? "saving" : ""}`} aria-busy={busy}>
      <aside className="sidebar">
        <a
          className="brand"
          aria-label="소풍캠핑장 홈"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("map");
          }}
        >
          <span className="brand-icon">
            <Tent weight="fill" size={28} />
          </span>
          <div>
            <strong>소풍</strong>
            <span>캠핑장 관리</span>
          </div>
        </a>
        <div className="workspace-label">우리 캠핑장</div>
        <nav>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-label={label}
              aria-current={page === id ? "page" : undefined}
              title={label}
              className={page === id ? "active" : ""}
              onClick={() => {
                setPage(id);
                setQuery("");
              }}
            >
              <Icon size={22} weight={page === id ? "fill" : "regular"} />
              <span>{label}</span>
              {id === "guests" && s.changes.length > 0 && (
                <b className="nav-count">{s.changes.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={page === "settings" ? "active" : ""}
            aria-label="설정"
            title="설정"
            onClick={() => setPage("settings")}
          >
            <GearSix size={22} />
            <span>설정</span>
          </button>
          {isDesktop && (
            <button
              aria-label="화면 잠금"
              title="화면 잠금"
              onClick={() => void lock().catch((e) => setError(e.message))}
              disabled={busy}
            >
              <LockKey size={22} />
              <span>화면 잠금</span>
            </button>
          )}
          {isDesktop && (
            <button
              aria-label="프로그램 종료"
              title={busy ? "저장이 끝나면 종료할 수 있어요" : "프로그램 종료"}
              disabled={busy}
              onClick={() => {
                if (!busyRef.current)
                  void window.camp!.quit().catch((e) => setError(e.message));
              }}
            >
              <Power size={22} />
              <span>프로그램 종료</span>
            </button>
          )}
          <div className="profile">
            <div className="avatar">소</div>
            <div>
              <strong>소풍캠핑장</strong>
              <small>관리실{isDesktop ? " PC" : " · 미리보기"}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <HouseLine size={18} />
            <span>소풍캠핑장</span>
            <span className="slash">/</span>
            <strong>운영 관리</strong>
          </div>
          <span className="save-status">
            <CheckCircle size={15} weight="fill" />
            {busy
              ? "저장 중…"
              : savedAt
                ? `${savedAt.slice(11, 16)} 저장됨`
                : isDesktop
                  ? "내 PC에 보관"
                  : "이 브라우저에 보관"}
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="heading-kicker">{dateLabel(day)}</div>
              <h1>
                {page === "settings"
                  ? "설정"
                  : NAV.find((x) => x.id === page)?.label}
              </h1>
            </div>
            <div className="header-actions">
              {["map", "guests", "calendar"].includes(page) && (
                <>
                  {isDesktop && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setModal({ type: "camfitSync" })}
                    >
                      <ArrowClockwise size={18} />
                      캠핏 동기화
                    </button>
                  )}
                  <button
                    className="button secondary print-button"
                    aria-label="인쇄"
                    title="인쇄"
                    onClick={() => window.print()}
                  >
                    <Printer size={18} />
                    <span>인쇄</span>
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setModal({ type: "import" })}
                  >
                    <FileArrowUp size={18} />
                    명단 가져오기
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: "reservation" })}
                  >
                    <Plus size={19} weight="bold" />
                    예약 등록
                  </button>
                </>
              )}
              {page === "long" && (
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "block" })}
                >
                  <Plus size={18} />
                  장박·사용중지 등록
                </button>
              )}
              {page === "sites" && (
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "newSite" })}
                >
                  <Plus size={18} />
                  자리 추가
                </button>
              )}
            </div>
          </div>
          {s.demo && (
            <div className="demo-notice">
              <span>
                <Info size={16} />
                <b>체험 데이터</b> 화면을 확인하기 위한 예시예요. 실제 예약·자리
                현황과 달라요.
              </span>
              <button
                onClick={() =>
                  ask(
                    "실제 운영을 시작할까요?",
                    "체험용 자리·예약·장박을 지우고 빈 상태로 시작해요. 실제 자리를 등록한 뒤 예약 명단을 가져와 주세요.",
                    () =>
                      mutate(
                        (d) => replaceState(d, emptyState()),
                        "실제 운영을 시작해요. 먼저 자리를 등록해 주세요.",
                      ),
                  )
                }
              >
                실제 운영 시작
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {s.sitePlan !== SOPUNG_PLAN_ID &&
            (page === "map" || page === "sites") && (
              <div className="plan-setup-notice">
                <div>
                  <strong>제공한 소풍캠핑장 도면을 적용할 수 있어요</strong>
                  <p>
                    7개 동 · 140자리 · 시설 위치와 객실 종류를 반영해요. 장박은
                    직접 등록해 주세요.
                  </p>
                </div>
                <button
                  className="button primary small"
                  disabled={busy}
                  onClick={() => {
                    const apply = () =>
                      mutate(
                        (d) =>
                          s.demo
                            ? replaceState(d, sopungInitialState())
                            : applySopungPlan(d),
                        "소풍캠핑장 도면을 반영했어요.",
                      );
                    if (s.demo)
                      ask(
                        "제공한 도면으로 실제 운영을 시작할까요?",
                        "체험용 예약·장박을 지우고 도면의 자리와 시설로 시작해요.",
                        apply,
                      );
                    else void apply();
                  }}
                >
                  소풍캠핑장 도면 적용
                </button>
              </div>
            )}
          {error && !modal && <ErrorBox message={error} />}
          {!modal && <ErrorBox message={backupWarning} />}
          {!modal && <ErrorBox message={storageNotice(dataBytes)} />}
          {!modal && <ErrorBox message={archiveWarning} />}
          {sites.length === 0 && ["map", "calendar", "long"].includes(page) ? (
            <div className="panel welcome">
              <Empty
                icon={<MapTrifold size={45} />}
                title="우리 캠핑장의 첫 자리를 등록해요"
                description="실제 운영 중인 자리를 등록하면 배치도와 예약 배정을 사용할 수 있어요."
              >
                <div className="row-actions">
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: "newSite" })}
                  >
                    <Plus size={18} />
                    자리 등록
                  </button>
                  {s.reservations.length === 0 && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        void mutate(
                          (d) => replaceState(d, demoState()),
                          "예시 데이터로 체험을 시작해요.",
                        )
                      }
                    >
                      예시로 둘러보기
                    </button>
                  )}
                </div>
              </Empty>
            </div>
          ) : (
            <>
              {page === "map" && (
                <>
                  <section
                    className="summary-strip"
                    aria-label="선택 날짜 자리 현황"
                  >
                    <div className="summary-total">
                      <span>전체 자리</span>
                      <strong>
                        {sites.length}
                        <small>자리</small>
                      </strong>
                    </div>
                    {LEGEND.map((x) => (
                      <div className="summary-item" key={x.type}>
                        <span>
                          <i className={`status-dot ${x.type}`} />
                          {x.label}
                        </span>
                        <strong>{summary[x.type]}</strong>
                      </div>
                    ))}
                    <div className="checkin-summary">
                      <div className="soft-icon">
                        <Users size={22} />
                      </div>
                      <div>
                        <span>도착을 기다려요</span>
                        <strong>
                          {waiting.length}
                          <small>팀</small>
                        </strong>
                      </div>
                    </div>
                  </section>
                  <div className="workspace-grid">
                    <section
                      className={`panel map-panel${s.sitePlan === SOPUNG_PLAN_ID && view === "diagram" ? " physical-map" : ""}`}
                    >
                      <div className="panel-toolbar">
                        <div className="date-picker">
                          <button
                            className="icon-button"
                            aria-label="이전 날짜"
                            onClick={() => setDay(addDays(day, -1))}
                          >
                            <CaretLeft size={18} />
                          </button>
                          <label>
                            <CalendarBlank size={19} />
                            <input
                              aria-label="현황 날짜"
                              type="date"
                              value={day}
                              onChange={(e) => {
                                // 다섯 자리 연도 등 계산할 수 없는 날짜는 적용하지 않는다.
                                if (validDate(e.target.value))
                                  setDay(e.target.value);
                              }}
                            />
                          </label>
                          <button
                            className="icon-button"
                            aria-label="다음 날짜"
                            onClick={() => setDay(addDays(day, 1))}
                          >
                            <CaretRight size={18} />
                          </button>
                          <button
                            className="today-button"
                            onClick={() => setDay(today())}
                          >
                            오늘
                          </button>
                        </div>
                        <div className="segmented">
                          <button
                            className={view === "diagram" ? "active" : ""}
                            onClick={() => setView("diagram")}
                          >
                            도식
                          </button>
                          <button
                            className={view === "aerial" ? "active" : ""}
                            onClick={() => setView("aerial")}
                          >
                            항공사진
                          </button>
                        </div>
                      </div>
                      {areaTabs}
                      {selectedGuest ? (
                        <div className="selection-banner">
                          <div>
                            <span className="selection-number">1</span>
                            <span>
                              <b>{selectedGuest.name}</b> 님이 머물 자리를
                              선택해 주세요
                              <small>
                                {shortDate(selectedGuest.arrival)} ~{" "}
                                {shortDate(selectedGuest.departure)} ·{" "}
                                {KINDS[selectedGuest.kind]}
                              </small>
                            </span>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="예약자 선택 취소"
                            onClick={() => setSelected("")}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="map-hint">
                          <MapPin size={16} />
                          <span>
                            예약자를 선택한 후 빈자리를 눌러 배정해 주세요.
                          </span>
                        </div>
                      )}
                      <div className="map-scroll">
                        {view === "diagram" ? (
                          <>
                            {s.sitePlan === SOPUNG_PLAN_ID &&
                              area === "전체" && (
                                <CampOverview
                                  s={s}
                                  day={day}
                                  onArea={setArea}
                                />
                              )}
                            {(s.sitePlan === SOPUNG_PLAN_ID
                              ? area === "전체"
                                ? []
                                : TERRACE_ORDER
                              : AREAS
                            )
                              .filter((a) => area === "전체" || a === area)
                              .map((a) => {
                                const group = activeSites.filter(
                                  (x) => x.area === a,
                                );
                                return (
                                  <div className="area-group" key={a}>
                                    {s.sitePlan === SOPUNG_PLAN_ID && (
                                      <div className="area-detail-nav">
                                        <button
                                          className="text-button"
                                          onClick={() => setArea("전체")}
                                        >
                                          <CaretLeft size={16} />
                                          전체 배치로
                                        </button>
                                        <span>
                                          동을 확인하고 자리를 선택해 주세요
                                        </span>
                                      </div>
                                    )}
                                    <div className="area-title">
                                      <h3>
                                        {a}동
                                        {s.sitePlan === SOPUNG_PLAN_ID &&
                                          " 상세 배치"}
                                      </h3>
                                      <span>
                                        {group.length > 0
                                          ? `${group.filter((x) => siteStatus(s, x.id, day).type === "empty").length}자리 비어 있어요`
                                          : "등록된 자리 없음"}
                                      </span>
                                      <button
                                        className="text-button area-layout-edit"
                                        aria-label={`${a}동 배치 수정`}
                                        onClick={() => {
                                          setArea(a);
                                          setSiteView("layout");
                                          setPage("sites");
                                        }}
                                      >
                                        <PencilSimple size={14} />
                                        배치 수정
                                      </button>
                                    </div>
                                    {group.length > 0 ? (
                                      <AreaDiagram
                                        area={a}
                                        sites={group}
                                        tile={tile}
                                        facilities={(s.facilities || []).filter(
                                          (f) => f.area === a,
                                        )}
                                        profile={
                                          s.sitePlan === SOPUNG_PLAN_ID
                                            ? AREA_CANVAS[a]
                                            : undefined
                                        }
                                      />
                                    ) : (
                                      <button
                                        className="unregistered-area"
                                        onClick={() => setPage("sites")}
                                      >
                                        현장 확인 후 자리를 등록해 주세요
                                        <Plus size={15} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                          </>
                        ) : (
                          <Aerial
                            s={s}
                            sites={activeSites}
                            onSite={openSite}
                            tile={tile}
                            goEdit={() => {
                              setSiteView("aerial");
                              setPage("sites");
                            }}
                          />
                        )}
                      </div>
                      <footer className="map-footer">
                        {legend}
                        <span>
                          {s.demo
                            ? "예시 도식 · 실제 위치와 달라요"
                            : s.sitePlan === SOPUNG_PLAN_ID
                              ? "제공 도면 기준 · 사이트와 시설 위치 편집 가능"
                              : "동별 배치 · 위치는 자리 편집에서 수정"}
                        </span>
                      </footer>
                    </section>
                    <section className="panel guests-panel">
                      <div className="guest-panel-heading">
                        <div>
                          <h2>
                            예약자 명단<span>{relevantGuests.length}</span>
                          </h2>
                          <p>도착한 손님부터 차근차근 배정해요.</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="전체 예약 명단 보기"
                          onClick={() => {
                            setPage("guests");
                            setListFilter("all");
                          }}
                        >
                          <ArrowRight size={20} />
                        </button>
                      </div>
                      {searchBox()}
                      <div className="guest-tabs">
                        {[
                          { key: "waiting", label: "도착 전" },
                          { key: "checkedIn", label: "입실" },
                          { key: "all", label: "전체" },
                        ].map((t) => (
                          <button
                            key={t.key}
                            className={listFilter === t.key ? "active" : ""}
                            onClick={() => setListFilter(t.key)}
                          >
                            {t.label}
                            <span>
                              {
                                relevantGuests.filter(
                                  (r) => t.key === "all" || r.status === t.key,
                                ).length
                              }
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="guest-list">
                        {guestList.length ? (
                          pagedGuests.map((r) => (
                            <div
                              key={r.id}
                              className={`guest-row ${selected === r.id ? "selected" : ""}`}
                              draggable={
                                r.status === "waiting" && !assignedNow(r.id)
                              }
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  "text/sopung-reservation",
                                  r.id,
                                );
                                setSelected(r.id);
                              }}
                            >
                              <button
                                className="guest-row-content"
                                onClick={() =>
                                  r.status === "waiting" && !assignedNow(r.id)
                                    ? setSelected(r.id)
                                    : openGuest(r)
                                }
                              >
                                <div
                                  className={`avatar ${r.status === "checkedIn" ? "blue-avatar" : ""}`}
                                >
                                  {r.name.slice(0, 1)}
                                </div>
                                <div>
                                  <div className="guest-row-name">
                                    <strong>{r.name}</strong>
                                    <span>{r.source}</span>
                                  </div>
                                  <p>
                                    {shortDate(r.arrival)} ~{" "}
                                    {shortDate(r.departure)}
                                    <i />
                                    {r.people}명
                                  </p>
                                  <small>
                                    {KINDS[r.kind]}
                                    {assignedNow(r.id)
                                      ? ` · ${s.sites.find((x) => x.id === assignedNow(r.id)?.siteId)?.label}`
                                      : " · 미배정"}
                                  </small>
                                </div>
                                {selected === r.id && (
                                  <CheckCircle
                                    className="selected-icon"
                                    size={20}
                                    weight="fill"
                                  />
                                )}
                              </button>
                              <button
                                className="guest-more"
                                aria-label={`${r.name} 상세 보기`}
                                onClick={() => openGuest(r)}
                              >
                                <CaretRight size={16} />
                              </button>
                              {r.note && <p className="guest-note">{r.note}</p>}
                            </div>
                          ))
                        ) : (
                          <Empty
                            icon={<MagnifyingGlass size={30} />}
                            title={
                              query
                                ? "검색 결과가 없어요"
                                : "이 상태의 예약이 없어요"
                            }
                            description={
                              query
                                ? "이름이나 연락처를 다시 확인해 주세요."
                                : "예약을 등록하거나 다른 상태를 선택해 주세요."
                            }
                          />
                        )}
                      </div>
                      {guestPages > 1 && (
                        <nav className="list-pager" aria-label="예약자 명단 쪽">
                          <button
                            className="button secondary small"
                            disabled={shownGuestPage === 0}
                            onClick={() => setGuestPage(shownGuestPage - 1)}
                          >
                            이전
                          </button>
                          <span>
                            {shownGuestPage + 1} / {guestPages}쪽 · 전체{" "}
                            {guestList.length}명
                          </span>
                          <button
                            className="button secondary small"
                            disabled={shownGuestPage === guestPages - 1}
                            onClick={() => setGuestPage(shownGuestPage + 1)}
                          >
                            다음
                          </button>
                        </nav>
                      )}
                      <footer className="guest-list-footer">
                        <Info size={15} />
                        예약자를 자리로 끌어다 놓을 수도 있어요.
                      </footer>
                    </section>
                  </div>
                </>
              )}
              {page === "guests" && (
                <section className="panel list-panel">
                  {s.changes.length > 0 && (
                    <div className="changes-panel">
                      <h2>
                        <WarningCircle size={21} />
                        확인할 예약 변경 {s.changes.length}건
                      </h2>
                      {s.changes.map((c) => {
                        const r = s.reservations.find(
                          (x) => x.id === c.reservationId,
                        )!;
                        return (
                          <div className="change-row" key={c.id}>
                            <div>
                              <strong>
                                {r.name} ·{" "}
                                {c.type === "cancel"
                                  ? "취소 접수"
                                  : "숙박 날짜 변경"}
                              </strong>
                              <p>
                                {c.type === "dates"
                                  ? `${shortDate(r.arrival)} ~ ${shortDate(r.departure)} → ${shortDate(c.arrival)} ~ ${shortDate(c.departure)}`
                                  : "확인 전까지 기존 배정을 유지해요."}
                              </p>
                            </div>
                            <div className="row-actions">
                              <button
                                className="button secondary small"
                                onClick={() =>
                                  ask(
                                    "기존 기록을 유지할까요?",
                                    "가져온 변경을 반영하지 않고 확인 목록에서 닫아요.",
                                    () =>
                                      mutate(
                                        (d) => resolveChange(d, c.id, false),
                                        "기존 기록을 유지했어요.",
                                      ),
                                  )
                                }
                              >
                                기존 유지
                              </button>
                              <button
                                className="button primary small"
                                onClick={() =>
                                  ask(
                                    "변경을 반영할까요?",
                                    c.type === "cancel"
                                      ? "예약을 취소하고 배정된 자리를 비워요."
                                      : "새 날짜 전체의 자리 겹침을 확인한 뒤 반영해요.",
                                    () =>
                                      mutate(
                                        (d) => resolveChange(d, c.id, true),
                                        "변경을 반영했어요.",
                                      ),
                                  )
                                }
                              >
                                확인 후 반영
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="list-toolbar">
                    {searchBox("이름, 연락처, 차량, 메모 검색")}
                    <select
                      aria-label="예약 상태 필터"
                      value={reservationFilter}
                      onChange={(e) => setReservationFilter(e.target.value)}
                    >
                      <option value="all">모든 상태</option>
                      {Object.entries(STATUS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <span>과거 예약까지 검색해요</span>
                    {(s.archives || []).length > 0 &&
                      window.camp?.searchArchives && (
                        <button
                          className="button secondary small"
                          disabled={!query.trim()}
                          onClick={() => void searchArchive(query)}
                        >
                          보관 기록에서 찾기
                        </button>
                      )}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>예약자</th>
                          <th>이용 기간</th>
                          <th>자리 · 유형</th>
                          <th>인원</th>
                          <th>경로</th>
                          <th>추가요금</th>
                          <th>상태</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {pagedReservations.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.name}</strong>
                              <small>{r.phone || "연락처 미등록"}</small>
                            </td>
                            <td>
                              {shortDate(r.arrival)} ~ {shortDate(r.departure)}
                              <small>{r.arrival.slice(0, 4)}년</small>
                            </td>
                            <td>
                              {s.sites.find(
                                (x) =>
                                  x.id ===
                                  (
                                    allocationsByReservation?.get(r.id)
                                      ?.current ||
                                    allocationsByReservation?.get(r.id)?.latest
                                  )?.siteId,
                              )?.label || "미배정"}
                              <small>{KINDS[r.kind]}</small>
                            </td>
                            <td>{r.people}명</td>
                            <td>{r.source}</td>
                            <td>
                              <Money value={r.fee} />
                              {r.fee > 0 && (
                                <small
                                  className={
                                    r.paid ? "green-text" : "amber-text"
                                  }
                                >
                                  {r.paid ? "결제 완료" : "미결제"}
                                </small>
                              )}
                            </td>
                            <td>
                              <Tag
                                tone={
                                  r.status === "checkedIn"
                                    ? "blue"
                                    : r.status === "waiting"
                                      ? "green"
                                      : ""
                                }
                              >
                                {STATUS[r.status]}
                              </Tag>
                            </td>
                            <td>
                              <button
                                className="button secondary small"
                                onClick={() => openGuest(r)}
                              >
                                상세
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filteredReservations.length && (
                      <Empty
                        title={
                          s.reservations.length
                            ? "검색 결과가 없어요"
                            : "아직 예약이 없어요"
                        }
                        description={
                          s.reservations.length
                            ? "검색어나 예약 상태 필터를 확인해 주세요."
                            : "명단을 가져오거나 새 예약을 등록해 주세요."
                        }
                      />
                    )}
                  </div>
                  {listPages > 1 && (
                    <nav className="list-pager" aria-label="예약 명단 쪽">
                      <button
                        className="button secondary small"
                        disabled={shownPage === 0}
                        onClick={() => setListPage(shownPage - 1)}
                      >
                        이전
                      </button>
                      <span>
                        {shownPage + 1} / {listPages}쪽 · 전체{" "}
                        {filteredReservations.length}건
                      </span>
                      <button
                        className="button secondary small"
                        disabled={shownPage === listPages - 1}
                        onClick={() => setListPage(shownPage + 1)}
                      >
                        다음
                      </button>
                    </nav>
                  )}
                  {archiveResults && (
                    <div className="archive-results">
                      <div className="list-toolbar">
                        <h2>
                          보관 기록 검색 · ‘{archiveResults.query}’{" "}
                          {archiveResults.total}건
                        </h2>
                        <span>
                          지난 연도 보관 파일에서 찾은 읽기 전용 기록이에요.
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setArchiveResults(null)}
                        >
                          닫기
                        </button>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>예약자</th>
                              <th>이용 기간</th>
                              <th>자리 · 유형</th>
                              <th>상태</th>
                              <th>보관 연도</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {archiveResults.results.map((item, index) => {
                              const r = item.reservation;
                              const last = [...item.allocations].sort((a, b) =>
                                b.start.localeCompare(a.start),
                              )[0];
                              return (
                                <tr key={`${item.year}-${r.id}`}>
                                  <td>
                                    <strong>{r.name}</strong>
                                    <small>{r.phone || "연락처 미등록"}</small>
                                  </td>
                                  <td>
                                    {shortDate(r.arrival)} ~{" "}
                                    {shortDate(r.departure)}
                                    <small>{r.arrival.slice(0, 4)}년</small>
                                  </td>
                                  <td>
                                    {s.sites.find((x) => x.id === last?.siteId)
                                      ?.label || "미배정"}
                                    <small>{KINDS[r.kind]}</small>
                                  </td>
                                  <td>
                                    <Tag>{STATUS[r.status]}</Tag>
                                  </td>
                                  <td>{item.year}년</td>
                                  <td>
                                    <button
                                      className="button secondary small"
                                      onClick={() =>
                                        setModal({ type: "archived", index })
                                      }
                                    >
                                      상세
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {!archiveResults.results.length && (
                          <Empty
                            title="보관 기록에서 찾지 못했어요"
                            description="이름이나 연락처를 다시 확인해 주세요."
                          />
                        )}
                      </div>
                      {archiveResults.total > LIST_PAGE_SIZE && (
                        <nav
                          className="list-pager"
                          aria-label="보관 기록 검색 쪽"
                        >
                          <button
                            className="button secondary small"
                            disabled={archiveResults.offset === 0}
                            onClick={() =>
                              void searchArchive(
                                archiveResults.query,
                                archiveResults.offset - LIST_PAGE_SIZE,
                              )
                            }
                          >
                            이전
                          </button>
                          <span>
                            {archiveResults.offset / LIST_PAGE_SIZE + 1} /{" "}
                            {Math.ceil(archiveResults.total / LIST_PAGE_SIZE)}쪽
                            · 전체 {archiveResults.total}건
                          </span>
                          <button
                            className="button secondary small"
                            disabled={
                              archiveResults.offset + LIST_PAGE_SIZE >=
                              archiveResults.total
                            }
                            onClick={() =>
                              void searchArchive(
                                archiveResults.query,
                                archiveResults.offset + LIST_PAGE_SIZE,
                              )
                            }
                          >
                            다음
                          </button>
                        </nav>
                      )}
                    </div>
                  )}
                </section>
              )}
              {page === "calendar" && (
                <section className="panel calendar-panel">
                  <div className="panel-toolbar">
                    <div className="date-picker">
                      <button
                        className="icon-button"
                        aria-label="이전 주"
                        onClick={() => setDay(addDays(weekStart, -7))}
                      >
                        <CaretLeft size={19} />
                      </button>
                      <strong>
                        {shortDate(weekStart)} ~{" "}
                        {shortDate(addDays(weekStart, 6))}
                      </strong>
                      <button
                        className="icon-button"
                        aria-label="다음 주"
                        onClick={() => setDay(addDays(weekStart, 7))}
                      >
                        <CaretRight size={19} />
                      </button>
                      <button
                        className="today-button"
                        onClick={() => setDay(today())}
                      >
                        이번 주
                      </button>
                    </div>
                    {legend}
                  </div>
                  {areaTabs}
                  <div className="table-wrap calendar-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">자리</th>
                          {Array.from({ length: 7 }, (_, i) =>
                            addDays(weekStart, i),
                          ).map((d) => {
                            const weekday = weekdayLabel(d);
                            const isToday = d === today();
                            return (
                              <th
                                key={d}
                                scope="col"
                                className={`calendar-day-header${isToday ? " is-today" : ""}`}
                                data-weekday={weekday}
                                aria-current={isToday ? "date" : undefined}
                                aria-label={`${dateLabel(d)}${isToday ? ", 오늘" : ""}`}
                              >
                                <div className="calendar-date">
                                  <time dateTime={d}>{shortDate(d)}</time>
                                  {isToday && (
                                    <span className="calendar-today">오늘</span>
                                  )}
                                </div>
                                <strong className="calendar-weekday">
                                  {weekday}
                                </strong>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {activeSites.map((site) => (
                          <tr key={site.id}>
                            <th scope="row">
                              {site.label}
                              <small>{KINDS[site.kind]}</small>
                            </th>
                            {Array.from({ length: 7 }, (_, i) => {
                              const d = addDays(weekStart, i),
                                st = siteStatus(s, site.id, d, `${d}T14:00:00`);
                              return (
                                <td key={d}>
                                  <button
                                    className={`calendar-cell ${st.type}`}
                                    aria-label={`${site.label}, ${dateLabel(d)}, ${st.name || st.label}${st.name ? `, ${st.label}` : ""}`}
                                    onClick={() => openSite(site, d, true)}
                                  >
                                    <span>{st.name || st.label}</span>
                                    {st.name && <small>{st.label}</small>}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="helper calendar-help">
                    날짜별 오후 2시 이후 이용 현황이에요. 예정된 이동은 완료
                    전까지 출발지와 도착지에 함께 표시돼요.
                  </p>
                </section>
              )}
              {page === "long" && (
                <section className="panel list-panel">
                  <div className="list-toolbar">
                    <h2>등록된 장박·사용중지</h2>
                    <span>기간이 끝나면 자동으로 빈자리가 돼요.</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>자리</th>
                          <th>구분</th>
                          <th>이름·사유</th>
                          <th>기간</th>
                          <th>연락처</th>
                          <th>메모</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {s.blocks.map((b) => (
                          <tr key={b.id}>
                            <td>
                              <strong>
                                {s.sites.find((x) => x.id === b.siteId)?.label}
                              </strong>
                            </td>
                            <td>
                              <Tag tone={b.type === "long" ? "amber" : ""}>
                                {b.type === "long" ? "장박" : "사용중지"}
                              </Tag>
                            </td>
                            <td>{b.name}</td>
                            <td>
                              {shortDate(b.start)} ~ {shortDate(b.end)}
                              <small>
                                {b.start.slice(0, 4)}년
                                {b.end <= nowLocal() ? " · 종료됨" : ""}
                              </small>
                            </td>
                            <td>{b.phone || "미등록"}</td>
                            <td>{b.note || "없음"}</td>
                            <td>
                              {b.end > nowLocal() && (
                                <button
                                  className="button secondary small"
                                  onClick={() =>
                                    ask(
                                      "이용을 종료할까요?",
                                      "지금부터 이 자리를 비우고 이전 기록은 유지해요.",
                                      () =>
                                        mutate(
                                          (d) => removeBlock(d, b.id),
                                          "종료했어요.",
                                        ),
                                    )
                                  }
                                >
                                  종료
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!s.blocks.length && (
                      <Empty
                        icon={<Tree size={36} />}
                        title="등록된 장박·사용중지가 없어요"
                        description="이름과 이용 기간을 등록하면 해당 자리에 다른 손님이 배정되지 않아요."
                      />
                    )}
                  </div>
                </section>
              )}
              {page === "sites" && (
                <>
                  {siteView !== "layout" && (
                    <div className="notice neutral">
                      <Info size={19} />
                      <span>
                        현장에서 확인한 자리만 등록해 주세요. 이름을 변경해도
                        이전 이용 기록과 연결은 유지돼요.
                      </span>
                    </div>
                  )}
                  <div
                    className="site-editor-tabs segmented"
                    aria-label="자리 편집 방식"
                  >
                    {[
                      { id: "layout", label: "동별 배치" },
                      { id: "list", label: "자리 목록" },
                      { id: "aerial", label: "항공사진 위치" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        aria-pressed={siteView === item.id}
                        className={siteView === item.id ? "active" : ""}
                        disabled={busy}
                        onClick={() => setSiteView(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {siteView === "layout" && (
                    <AreaLayoutEditor
                      s={s}
                      area={area === "전체" ? sites[0]?.area || "가" : area}
                      onArea={setArea}
                      mutate={mutate}
                      busy={busy}
                    />
                  )}
                  {siteView === "list" && (
                    <section className="panel list-panel">
                      {areaTabs}
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>자리 이름</th>
                              <th>동</th>
                              <th>유형</th>
                              <th>동별 위치</th>
                              <th>사진 위치</th>
                              <th>관리</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeSites.map((site) => (
                              <tr key={site.id}>
                                <td>
                                  <strong>{site.label}</strong>
                                </td>
                                <td>{site.area}동</td>
                                <td>{siteKindLabel(site)}</td>
                                <td>{site.layout ? "지정됨" : "미지정"}</td>
                                <td>
                                  {site.x === undefined ? "미지정" : "지정됨"}
                                </td>
                                <td>
                                  <div className="row-actions">
                                    <button
                                      className="button secondary small"
                                      onClick={() =>
                                        setModal({
                                          type: "editSite",
                                          id: site.id,
                                        })
                                      }
                                    >
                                      <PencilSimple size={14} />
                                      수정
                                    </button>
                                    <button
                                      className="text-button subtle"
                                      onClick={() =>
                                        ask(
                                          `${site.label} 자리를 삭제할까요?`,
                                          "사용 예정이 있는 자리는 삭제할 수 없어요. 과거 기록은 보관해요.",
                                          () =>
                                            mutate(
                                              (d) =>
                                                saveSite(d, {
                                                  ...site,
                                                  archived: true,
                                                }),
                                              "자리를 삭제했어요.",
                                            ),
                                        )
                                      }
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!activeSites.length && (
                          <Empty
                            title="등록된 자리가 없어요"
                            description="위의 자리 추가 버튼으로 시작해 주세요."
                          />
                        )}
                      </div>
                    </section>
                  )}
                  {siteView === "aerial" && (
                    <AerialEditor s={s} mutate={mutate} />
                  )}
                </>
              )}
              {page === "settings" && (
                <Settings
                  s={s}
                  mutate={mutate}
                  archive={archiveRecords}
                  ask={ask}
                  setError={setError}
                  reportBackup={reportBackup}
                  camfitRevision={camfitRevision}
                  syncCampfit={() => setModal({ type: "camfitSync" })}
                />
              )}
            </>
          )}
        </main>
        <div className="print-report">
          <h1>소풍캠핑장 · {dateLabel(day)}</h1>
          {s.demo && <p>체험 데이터 · 실제 운영 자료가 아닙니다.</p>}
          <h2>자리별 손님 명단</h2>
          <table>
            <thead>
              <tr>
                <th>자리</th>
                <th>상태</th>
                <th>이름</th>
                <th>연락처</th>
                <th>이용 기간</th>
                <th>인원 / 메모</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const st = siteStatus(s, site.id, day),
                  r = "reservation" in st ? st.reservation : null;
                return (
                  <tr key={site.id}>
                    <td>{site.label}</td>
                    <td>{st.label}</td>
                    <td>{st.name}</td>
                    <td>
                      {r?.phone || ("block" in st ? st.block?.phone : "")}
                    </td>
                    <td>{r ? `${r.arrival} ~ ${r.departure}` : ""}</td>
                    <td>{r ? `${r.people}명 / ${r.note}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h2>동별 배치도</h2>
          {(s.sitePlan === SOPUNG_PLAN_ID ? TERRACE_ORDER : AREAS).map((a) => (
            <div key={a} className="print-area">
              <h3>{a}동</h3>
              <AreaDiagram
                area={a}
                sites={sites.filter((x) => x.area === a)}
                facilities={(s.facilities || []).filter((f) => f.area === a)}
                profile={
                  s.sitePlan === SOPUNG_PLAN_ID ? AREA_CANVAS[a] : undefined
                }
                tile={tile}
              />
            </div>
          ))}
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={20} weight="fill" />
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          key={modal.type + ("id" in modal ? modal.id : "")}
          title={modalTitle}
          description={modalDescription}
          close={close}
          wide={modalWide}
        >
          {modalContent}
          <ErrorBox message={error} />
          <ErrorBox message={backupWarning} />
          <ErrorBox message={storageNotice(dataBytes)} />
          <ErrorBox message={archiveWarning} />
          {busy && (
            <p className="helper" role="status">
              저장 중이에요…
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function Aerial({
  s,
  sites,
  onSite,
  tile,
  goEdit,
}: {
  s: State;
  sites: Site[];
  onSite: (site: Site) => void;
  tile: (site: Site) => ReactNode;
  goEdit: () => void;
}) {
  const photo = useAerialSource(s.settings.aerial);
  if (!s.settings.aerial)
    return (
      <Empty
        icon={<MapPin size={40} />}
        title="항공사진을 등록해 주세요"
        description="사진을 올리고 자리 위치를 지정하면 실제 배치 위에서 관리할 수 있어요."
      >
        <button className="button secondary" onClick={goEdit}>
          사진과 위치 등록
          <ArrowRight size={17} />
        </button>
      </Empty>
    );
  return (
    <>
      <ErrorBox message={photo.error} />
      <div className="aerial-canvas">
        {photo.url && <img src={photo.url} alt="등록한 캠핑장 항공사진" />}
        {sites
          .filter((x) => x.x !== undefined && x.y !== undefined)
          .map((site) => (
            <div
              key={site.id}
              className="aerial-marker"
              style={{ left: `${site.x}%`, top: `${site.y}%` }}
              onDoubleClick={() => onSite(site)}
            >
              {tile(site)}
            </div>
          ))}
      </div>
      {sites.some((x) => x.x === undefined) && (
        <p className="helper">
          위치가 지정된 자리만 표시해요. 나머지는 자리 편집에서 위치를 지정해
          주세요.
        </p>
      )}
    </>
  );
}

function AerialEditor({ s, mutate }: { s: State; mutate: Mutate }) {
  const [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [replaced, setReplaced] = useState(false);
  const placed = s.sites.filter((x) => !x.archived && x.x !== undefined).length;
  const photo = useAerialSource(s.settings.aerial);
  return (
    <section className="panel aerial-editor">
      <div className="panel-toolbar">
        <div>
          <h2>항공사진과 자리 위치</h2>
          <p className="muted">
            자리를 고른 후 사진에서 해당 위치를 눌러 주세요.
          </p>
        </div>
        <label className="button secondary">
          <DownloadSimple size={18} />
          사진 선택
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (
                file.size > 4 * 1024 * 1024 ||
                !["image/png", "image/jpeg", "image/webp"].includes(file.type)
              ) {
                setError("4MB 이하의 JPG·PNG·WebP 사진을 선택해 주세요.");
                return;
              }
              setError("");
              const reader = new FileReader();
              reader.onload = async () => {
                try {
                  // 설치 프로그램은 사진을 별도 파일로 저장하고 본 파일에는 참조만 둔다.
                  // 사진만 바꾸고 기존 자리 위치는 지우지 않는다. 새 사진에서 운영자가 확인한다.
                  const dataUrl = String(reader.result);
                  const aerial = window.camp?.saveAerial
                    ? await window.camp.saveAerial(dataUrl)
                    : dataUrl;
                  setReplaced(
                    await mutate(
                      (d) => {
                        d.settings.aerial = aerial;
                      },
                      placed
                        ? "사진을 바꿨어요. 기존 자리 위치는 그대로 두었어요."
                        : "사진을 등록했어요. 자리 위치를 지정해 주세요.",
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>
      </div>
      <ErrorBox message={error || photo.error} />
      {window.camp?.saveAerial && s.settings.aerial.startsWith("data:") && (
        <div className="notice neutral">
          <span>
            이 사진은 저장 파일 안에 들어 있어요. 별도 파일로 옮기면 같은 사진과
            자리 위치를 그대로 두고 저장 파일이 가벼워져요.
          </span>
          <button
            className="button secondary small"
            onClick={async () => {
              try {
                const aerial = await window.camp!.saveAerial!(
                  s.settings.aerial,
                );
                await mutate((d) => {
                  d.settings.aerial = aerial;
                }, "사진을 별도 파일로 옮겼어요. 사진과 자리 위치는 그대로예요.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            사진을 별도 파일로 옮기기
          </button>
        </div>
      )}
      {replaced && placed > 0 && (
        <p className="notice amber">
          사진을 바꿨어요. 기존 위치 {placed}곳은 그대로 두었으니 새 사진에서
          자리 위치가 맞는지 확인하고, 다르면 자리를 골라 다시 지정해 주세요.
        </p>
      )}
      <Field label="위치를 지정할 자리">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">자리 선택</option>
          {s.sites
            .filter((x) => !x.archived)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
                {x.x === undefined ? " · 미지정" : " · 지정됨"}
              </option>
            ))}
        </select>
      </Field>
      {s.settings.aerial ? (
        <div
          className={`aerial-canvas editing ${selected ? "placing" : ""}`}
          onClick={(e) => {
            if (!selected) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.max(
                0,
                Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
              ),
              y = Math.max(
                0,
                Math.min(100, ((e.clientY - rect.top) / rect.height) * 100),
              );
            void mutate((d) => {
              const site = d.sites.find((s) => s.id === selected)!;
              site.x = x;
              site.y = y;
            }, "자리 위치를 저장했어요.");
          }}
        >
          {photo.url && (
            <img src={photo.url} alt="자리 위치 편집용 캠핑장 항공사진" />
          )}
          {s.sites
            .filter((x) => !x.archived && x.x !== undefined)
            .map((x) => (
              <span
                className={`position-marker ${selected === x.id ? "selected" : ""}`}
                key={x.id}
                style={{ left: `${x.x}%`, top: `${x.y}%` }}
              >
                {x.label}
              </span>
            ))}
        </div>
      ) : (
        <Empty
          title="아직 등록한 사진이 없어요"
          description="현장 배치를 확인할 수 있는 사진을 선택해 주세요."
        />
      )}
    </section>
  );
}

function Settings({
  s,
  mutate,
  archive,
  ask,
  setError,
  reportBackup,
  camfitRevision,
  syncCampfit,
}: {
  s: State;
  mutate: Mutate;
  archive: () => Promise<boolean>;
  ask: (
    title: string,
    description: string,
    action: () => Promise<boolean>,
  ) => void;
  setError: (s: string) => void;
  reportBackup: (error?: string) => void;
  camfitRevision: number;
  syncCampfit: () => void;
}) {
  const [camfitProfile, setCamfitProfile] = useState<CamfitProfile | null>(
    null,
  );
  const [exported, setExported] = useState("");
  const applyingLayout = useRef(false);
  // 단일 백업 파일 복원: 현재 데이터를 먼저 백업한 뒤 교체한다.
  const confirmRestore = (data: State) =>
    ask(
      "이 백업으로 복원할까요?",
      `자리 ${data.sites.filter((x) => !x.archived).length}개, 예약 ${data.reservations.length}건${data.demo ? "의 체험 데이터" : ""}으로 교체해요. 현재 데이터는 먼저 백업해요.`,
      async () => {
        try {
          if (window.camp) {
            if (await window.camp.load()) await window.camp.backup();
          } else download(JSON.stringify(s), `소풍-복원전-${Date.now()}.json`);
          return await mutate((d) => {
            replaceState(d, data);
            upgradeSopungPlan(d);
          }, "백업을 복원했어요.");
        } catch (e) {
          setError((e as Error).message);
          return false;
        }
      },
    );
  const candidates = archiveCandidates(s);
  const archiveYears = Object.entries(
    (s.archives || []).reduce<Record<number, number>>(
      (sum, ref) => ({
        ...sum,
        [ref.year]: (sum[ref.year] || 0) + ref.reservations,
      }),
      {},
    ),
  );
  const [time, setTime] = useState(s.settings.lateTime),
    [fee, setFee] = useState(
      s.settings.lateFee === null ? "" : String(s.settings.lateFee),
    );
  const [backup, setBackup] = useState<{
    dataPath: string;
    backupPath: string;
    lastBackup: string;
    backupError?: string;
    dataBytes?: number;
    dataLimit?: number;
  } | null>(null);
  useEffect(() => {
    window.camp
      ?.status()
      .then((status) => {
        setBackup(status);
        reportBackup(status.backupError);
      })
      .catch((e) => setError(e.message));
  }, [s]);
  useEffect(() => {
    let alive = true;
    window.camp
      ?.camfitProfile()
      .then((profile) => {
        if (alive) setCamfitProfile(profile);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [camfitRevision]);
  useEffect(() => {
    setTime(s.settings.lateTime);
    setFee(s.settings.lateFee === null ? "" : String(s.settings.lateFee));
  }, [s.settings.lateTime, s.settings.lateFee]);
  return (
    <div className="settings-grid">
      <section className="panel settings-section settings-full campfit-settings">
        <div>
          <h2>캠핏 예약 연결</h2>
          <p>
            캠핏 예약 목록의 CSV·XLSX 내보내기와 열 연결을 마쳐야 예약을 가져올
            수 있어요.
          </p>
        </div>
        <div className="row-actions">
          <Tag tone={camfitProfile ? "blue" : ""}>
            {camfitProfile ? "연결 설정됨" : "첫 파일 연결 필요"}
          </Tag>
          <button
            className="button secondary"
            disabled={!isDesktop}
            onClick={() =>
              void window
                .camp!.openCampfit()
                .catch((error) => setError(error.message))
            }
          >
            캠핏 로그인
          </button>
          <button
            className="button primary"
            disabled={!isDesktop}
            onClick={syncCampfit}
          >
            <ArrowClockwise size={18} />
            캠핏 동기화
          </button>
        </div>
        <p className="helper">
          처음 동기화할 때 캠핏 창에서 내보내기를 누르고 명단의 열을 확인해
          주세요. 연결 후에는 동기화 버튼으로 같은 형식의 명단을 가져와요.
          캠핏에 내보내기 기능이 있어야 사용할 수 있어요.
        </p>
        {camfitProfile?.lastSync && (
          <p className="helper">
            마지막 동기화:{" "}
            {new Date(camfitProfile.lastSync).toLocaleString("ko-KR")}
          </p>
        )}
      </section>
      <section className="panel settings-section">
        <h2>저장된 자리배치</h2>
        <p className="muted">
          {BUNDLED_LAYOUT_DATE}에 설치 파일에 포함한 140자리·15시설의 배치예요.
          새 PC에서는 이 배치로 시작해요.
        </p>
        <p className="helper">
          이 PC에도 적용하면 동별 자리 위치와 시설 위치·크기를 저장된 배치로
          맞춰요. 없는 자리는 추가하고, 삭제한 자리는 복구하지 않아요.
          예약·배정·장박과 항공사진은 유지해요.
        </p>
        <button
          className="button secondary"
          onClick={() =>
            ask(
              "저장된 자리배치를 적용할까요?",
              s.demo
                ? "체험용 자리·예약·장박을 지우고 저장된 140자리·15시설로 실제 운영을 시작해요."
                : "현재 데이터를 먼저 백업한 뒤 자리·시설의 위치와 크기를 설치 파일의 배치로 맞춰요. 예약·배정·장박은 유지해요.",
              async () => {
                if (applyingLayout.current) return false;
                applyingLayout.current = true;
                try {
                  if (window.camp) await window.camp.backup();
                  else
                    download(
                      JSON.stringify(s),
                      `소풍-배치적용전-${Date.now()}.json`,
                    );
                  return await mutate(
                    (draft) =>
                      s.demo
                        ? replaceState(draft, bundledInitialState())
                        : applyBundledLayout(draft),
                    "저장된 자리배치를 적용했어요.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                  return false;
                } finally {
                  applyingLayout.current = false;
                }
              },
            )
          }
        >
          저장된 자리배치 적용
        </button>
      </section>
      <section className="panel settings-section">
        <h2>입실·퇴실 시간</h2>
        <p className="muted">모든 숙박 유형에 같은 시간을 적용해요.</p>
        <div className="fixed-times">
          <div>
            <span>기본 입실</span>
            <strong>14:00</strong>
          </div>
          <ArrowRight size={21} />
          <div>
            <span>기본 퇴실</span>
            <strong>11:00</strong>
          </div>
        </div>
        <p className="helper">
          입실일 당일에는 오후 2시 전에도 입실할 수 있어요. 실제 입실 시각부터
          퇴실까지 다른 예약·장박·사용중지와 겹치지 않아야 해요.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await mutate((d) => {
              if (
                (time &&
                  (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
                    time <= "11:00")) ||
                (fee !== "" &&
                  (!Number.isFinite(Number(fee)) || Number(fee) < 0))
              )
                throw new Error(
                  "레이트 시각은 11시 이후, 요금은 0원 이상으로 입력해 주세요.",
                );
              d.settings.lateTime = time;
              d.settings.lateFee = fee === "" ? null : Number(fee);
            }, "공통 레이트 설정을 저장했어요.");
          }}
        >
          <h3>레이트 체크아웃</h3>
          <p className="helper">
            확인한 시간과 요금을 입력해 주세요. 이미 적용한 예약은 바뀌지
            않아요.
          </p>
          <div className="form-grid">
            <Field label="공통 종료 시각">
              <input
                type="time"
                min="11:01"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
            <Field label="기본 추가요금 (원)">
              <input
                type="number"
                min="0"
                placeholder="미설정"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </Field>
          </div>
          <button className="button primary" type="submit">
            시간·요금 저장
          </button>
        </form>
      </section>
      <section className="panel settings-section">
        <h2>데이터와 백업</h2>
        <p className="muted">
          예약과 자리 정보는 {isDesktop ? "이 PC의 데이터 폴더" : "이 브라우저"}
          에 저장해요.
        </p>
        {backup ? (
          <>
            <ErrorBox
              message={
                backup.backupError
                  ? `자동 백업을 만들지 못했어요. ${backup.backupError}`
                  : ""
              }
            />
            <dl className="detail-list">
              <div>
                <dt>저장 폴더</dt>
                <dd className="path">{backup.dataPath}</dd>
              </div>
              <div>
                <dt>자동 백업 폴더</dt>
                <dd className="path">{backup.backupPath}</dd>
              </div>
              <div>
                <dt>최근 백업 날짜</dt>
                <dd>{backup.lastBackup || "첫 저장 후 시작"}</dd>
              </div>
              <div>
                <dt>저장 데이터</dt>
                <dd>
                  {megabytes(backup.dataBytes || 0)}MB / 한도{" "}
                  {megabytes(backup.dataLimit || DATA_LIMIT)}MB (
                  {Math.floor(
                    ((backup.dataBytes || 0) /
                      (backup.dataLimit || DATA_LIMIT)) *
                      100,
                  )}
                  %)
                  <meter
                    aria-label="저장 데이터 사용량"
                    min={0}
                    max={backup.dataLimit || DATA_LIMIT}
                    low={(backup.dataLimit || DATA_LIMIT) * 0.75}
                    high={(backup.dataLimit || DATA_LIMIT) * 0.9}
                    optimum={0}
                    value={backup.dataBytes || 0}
                  />
                </dd>
              </div>
            </dl>
            <p className="helper">
              실행 중 매일 백업하고, 프로그램이 꺼져 있었으면 다음 실행 시
              백업해요. 업데이트해도 데이터 폴더는 유지해요.
            </p>
            <div className="row-actions">
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await window.camp!.backup();
                    const status = await window.camp!.status();
                    setBackup(status);
                    reportBackup(status.backupError);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                지금 백업
              </button>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await window.camp!.chooseBackup();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                  // 실패해도 실제 적용된 경로·백업 상태를 다시 읽어 표시한다.
                  try {
                    const status = await window.camp!.status();
                    setBackup(status);
                    reportBackup(status.backupError);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                백업 폴더 변경
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void window
                    .camp!.openFolder()
                    .catch((e) => setError(e.message))
                }
              >
                저장 폴더 열기
              </button>
            </div>
          </>
        ) : (
          <div className="notice neutral">
            브라우저 미리보기에서는 아래 버튼으로 백업 파일을 내려받을 수
            있어요. 매일 자동 백업은 설치형 프로그램에서 동작해요.
          </div>
        )}
        <div className="backup-actions">
          <button
            className="button secondary"
            onClick={async () => {
              // 보관·사진 파일이 있으면 본 파일만으로는 복원할 수 없으므로 폴더째 내보낸다.
              const attached =
                (s.archives || []).length > 0 ||
                AERIAL_ASSET.test(s.settings.aerial);
              if (!attached || !window.camp?.exportBackup)
                return download(JSON.stringify(s), `소풍-백업-${today()}.json`);
              try {
                const folder = await window.camp.exportBackup();
                if (folder) setExported(folder);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <DownloadSimple size={18} />
            백업 파일 내보내기
          </button>
          <label className="button secondary">
            <ArrowClockwise size={18} />
            백업 복원
            <input
              hidden
              type="file"
              accept=".json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 16 * 1024 * 1024)
                    throw new Error("16MB 이하의 백업 파일을 선택해 주세요.");
                  const data: unknown = JSON.parse(await file.text());
                  validateState(data);
                  await checkBackupFiles(data);
                  confirmRestore(data);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </label>
          {isDesktop && window.camp?.pickBackup && (
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  const picked = await window.camp!.pickBackup!();
                  if (!picked) return;
                  const data: State = picked.value;
                  validateState(data);
                  // 백업 폴더 복원은 저장소가 보관 파일과 본 파일을 한 번에 바꾼 뒤 다시 불러온다.
                  ask(
                    "백업 폴더에서 복원할까요?",
                    `자리 ${data.sites.filter((x) => !x.archived).length}개, 예약 ${data.reservations.length}건, 보관 파일 ${(data.archives || []).length}개로 교체해요. 현재 본 파일은 데이터 폴더에 before-restore 파일로, 내용이 다른 현재 보관 파일은 archive 폴더의 replaced 폴더로 옮겨 보관해요.`,
                    async () => {
                      try {
                        await window.camp!.restoreBackup!(picked.token);
                        window.location.reload();
                        return true;
                      } catch (e) {
                        setError((e as Error).message);
                        return false;
                      }
                    },
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              백업 폴더에서 복원
            </button>
          )}
        </div>
        {exported && (
          <p className="helper">
            보관 기록·사진 파일까지 함께 내보냈어요: {exported}. 폴더 전체를
            함께 옮겨 보관해 주세요.
          </p>
        )}
        <p className="helper">
          보관 파일이 있는 백업은 백업 폴더의 archive 폴더와 함께 있어야 복원할
          수 있어요. ‘백업 폴더에서 복원’으로 백업 파일을 고르면 같은 폴더의
          보관 파일까지 확인해요. 예전 단일 백업 파일도 그대로 복원할 수 있어요.
        </p>
      </section>
      <section className="panel settings-section">
        <h2>지난 연도 기록 보관</h2>
        <p className="muted">
          올해 이전에 끝난 퇴실·노쇼·취소 예약과 그 배정·변경 기록을 연도별 보관
          파일로 옮겨 저장 파일을 가볍게 해요. 지우지 않으며 예약 명단의 ‘보관
          기록에서 찾기’로 계속 볼 수 있어요.
        </p>
        {isDesktop && window.camp?.commitArchive ? (
          <>
            <dl className="detail-list">
              <div>
                <dt>보관할 수 있는 기록</dt>
                <dd>
                  예약 {candidates.reservations.length}건 · 배정{" "}
                  {candidates.allocations.length}건 · 변경 기록{" "}
                  {candidates.activity.length}건
                </dd>
              </div>
              <div>
                <dt>보관 파일</dt>
                <dd>
                  {archiveYears.length
                    ? archiveYears
                        .map(([year, count]) => `${year}년 예약 ${count}건`)
                        .join(" · ")
                    : "아직 없음"}
                </dd>
              </div>
            </dl>
            <p className="helper">
              도착 전·입실·이동 예정 예약, 확인하지 않은 원본 변경,
              장박·사용중지와 자리 정보는 옮기지 않아요. 보관 파일은 데이터
              폴더의 archive 폴더에 저장되고 자동·수동 백업에 함께 복사돼요.
            </p>
            <button
              className="button secondary"
              disabled={
                !candidates.reservations.length && !candidates.activity.length
              }
              onClick={() =>
                ask(
                  "지난 연도 기록을 보관할까요?",
                  `예약 ${candidates.reservations.length}건, 배정 ${candidates.allocations.length}건, 변경 기록 ${candidates.activity.length}건을 연도별 보관 파일로 옮겨요. 기록은 지우지 않고 ‘보관 기록에서 찾기’로 볼 수 있어요.`,
                  archive,
                )
              }
            >
              지난 연도 기록 보관
            </button>
          </>
        ) : (
          <div className="notice neutral">
            지난 연도 기록 보관은 설치 프로그램에서 사용할 수 있어요.
          </div>
        )}
      </section>
      <section className="panel settings-section settings-full">
        <h2>자리 색상 안내</h2>
        <div className="color-guide">
          {[
            {
              type: "empty",
              title: "빈자리",
              desc: "선택 날짜에 비어 있는 자리",
            },
            {
              type: "assigned",
              title: "배정된 자리",
              desc: "배정·입실·이동 예정이 있는 자리",
            },
            {
              type: "long",
              title: "장박 자리",
              desc: "등록한 장박 기간 동안 사용",
            },
            {
              type: "disabled",
              title: "사용중지",
              desc: "정비 등으로 배정할 수 없는 자리",
            },
          ].map((x) => (
            <div key={x.type}>
              <div className={`color-sample ${x.type}`}>
                <Tent size={23} />
              </div>
              <strong>{x.title}</strong>
              <small>{x.desc}</small>
            </div>
          ))}
        </div>
        <p className="helper">
          빈자리로 보여도 실제 배정 시에는 손님의 전체 숙박 기간을 다시
          확인해요.
        </p>
      </section>
    </div>
  );
}

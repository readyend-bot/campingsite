export const AREAS = ["가", "나", "다", "라", "마", "A", "B"] as const;
export const KINDS = {
  auto: "오토캠핑",
  glamping: "글램핑",
  caravan: "카라반",
  bungalow: "방갈로",
} as const;
export const STATUS = {
  waiting: "도착 전",
  checkedIn: "입실",
  checkedOut: "퇴실",
  noShow: "노쇼",
  cancelled: "취소",
} as const;
export type Kind = keyof typeof KINDS;
export type GuestStatus = keyof typeof STATUS;
export interface LayoutPoint {
  x: number;
  y: number;
}
export interface Site {
  id: string;
  label: string;
  area: string;
  kind: Kind;
  archived: boolean;
  x?: number;
  y?: number;
  layout?: LayoutPoint;
  detail?: string;
}
export const FACILITY_TYPES = {
  toilet: "화장실",
  sink: "개수대",
  shower: "샤워실·화장실",
  store: "매점",
  trampoline: "트램펄린",
  tableTennis: "탁구장",
  pool: "수영장",
  recycling: "분리수거장",
  path: "통로",
} as const;
export interface Facility {
  id: string;
  area: string;
  label: string;
  type: keyof typeof FACILITY_TYPES;
  layout?: LayoutPoint;
  width: number;
  height: number;
  location?: "approach";
}
export const siteKindLabel = (site: Site) =>
  `${KINDS[site.kind]}${site.detail ? ` · ${site.detail}` : ""}`;
export interface Reservation {
  id: string;
  name: string;
  phone: string;
  arrival: string;
  departure: string;
  kind: Kind;
  source: string;
  externalId: string;
  unit: string;
  people: number;
  vehicle: string;
  note: string;
  fee: number;
  paid: boolean;
  status: GuestStatus;
  lateTime: string;
  actualCheckout?: string;
  sourceArrival?: string;
  sourceDeparture?: string;
  sourceCancelled?: boolean;
}
export interface Allocation {
  id: string;
  reservationId: string;
  siteId: string;
  start: string;
  end: string;
  state: "active" | "planned" | "ended";
}
export interface Block {
  id: string;
  siteId: string;
  type: "long" | "disabled";
  name: string;
  phone: string;
  start: string;
  end: string;
  note: string;
}
export interface PendingChange {
  id: string;
  reservationId: string;
  type: "dates" | "cancel";
  arrival: string;
  departure: string;
}
export interface Activity {
  id: string;
  at: string;
  text: string;
  reservationId?: string;
}
// 지난 연도 기록 보관 파일(데이터 폴더 archive/). 본 저장 파일에는 목록만 둔다.
export interface ArchiveRef {
  file: string;
  year: number;
  reservations: number;
  allocations: number;
  activity: number;
  bytes: number;
  sha256: string;
}
export interface ArchiveFile {
  format: "sopung-archive";
  version: 1;
  year: number;
  reservations: Reservation[];
  allocations: Allocation[];
  activity: Activity[];
}
export interface State {
  version: 1;
  demo: boolean;
  sites: Site[];
  facilities?: Facility[];
  sitePlan?: string;
  archives?: ArchiveRef[];
  reservations: Reservation[];
  allocations: Allocation[];
  blocks: Block[];
  changes: PendingChange[];
  activity: Activity[];
  settings: { lateTime: string; lateFee: number | null; aerial: string };
}
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function nowLocal(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replace(" ", "T");
}
export const today = () => nowLocal().slice(0, 10);
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  // 잘못된 날짜나 네 자리 연도를 벗어난 결과로 화면 날짜를 만들지 않는다.
  const next = Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  return validDate(next) ? next : day;
}
export function mondayOfWeek(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return Number.isNaN(weekday) ? day : addDays(day, -((weekday + 6) % 7));
}
export const shortDate = (day: string) =>
  `${Number(day.slice(5, 7))}.${Number(day.slice(8, 10))}`;
const koreanDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
  timeZone: "Asia/Seoul",
});
const koreanWeekdayFormatter = new Intl.DateTimeFormat("ko-KR", {
  weekday: "long",
  timeZone: "Asia/Seoul",
});
export const dateLabel = (day: string) =>
  validDate(day)
    ? koreanDateFormatter.format(new Date(`${day}T12:00:00+09:00`))
    : "";
export const weekdayLabel = (day: string) =>
  validDate(day)
    ? koreanWeekdayFormatter.format(new Date(`${day}T12:00:00+09:00`))
    : "";
export const nights = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
export const overlaps = (a: string, b: string, c: string, d: string) =>
  a < b && c < d && a < d && c < b;
export const period = (
  r: Pick<Reservation, "arrival" | "departure" | "lateTime">,
) => ({
  start: `${r.arrival}T14:00:00`,
  end: `${r.departure}T${r.lateTime || "11:00"}:00`,
});
export function assignmentPeriod(
  r: Pick<Reservation, "arrival" | "departure" | "lateTime">,
  now = nowLocal(),
) {
  const p = period(r);
  return { ...p, start: r.arrival <= now.slice(0, 10) ? now : p.start };
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export const validTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const validTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value) &&
  validDate(value.slice(0, 10));
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function emptyState(): State {
  return {
    version: 1,
    demo: false,
    sites: [],
    reservations: [],
    allocations: [],
    blocks: [],
    changes: [],
    activity: [],
    settings: { lateTime: "", lateFee: null, aerial: "" },
  };
}
export function log(
  s: State,
  text: string,
  reservationId?: string,
  at = nowLocal(),
) {
  s.activity.unshift({ id: uid(), at, text, reservationId });
}
export function update(s: State, operation: (draft: State) => void): State {
  const next: State = JSON.parse(JSON.stringify(s));
  operation(next);
  return next;
}
export function replaceState(target: State, value: State) {
  const snapshot: State = JSON.parse(JSON.stringify(value));
  validateState(snapshot);
  // 백업에 없는 선택 필드도 제거하고 입력 원본과 참조를 공유하지 않는다.
  for (const key of Object.keys(target)) Reflect.deleteProperty(target, key);
  Object.assign(target, snapshot);
}
export function getReservation(s: State, id: string) {
  const r = s.reservations.find((r) => r.id === id);
  ensure(r, "예약을 찾을 수 없어요.");
  return r;
}
export function currentAllocation(s: State, id: string) {
  return s.allocations.find(
    (a) => a.reservationId === id && a.state === "active",
  );
}
export function latestAllocation(s: State, id: string) {
  return s.allocations
    .filter((a) => a.reservationId === id && a.state !== "planned")
    .sort(
      (a, b) => b.start.localeCompare(a.start) || b.end.localeCompare(a.end),
    )[0];
}
export function plannedMove(s: State, id: string) {
  return s.allocations.find(
    (a) => a.reservationId === id && a.state === "planned",
  );
}
// 예약 명단처럼 여러 예약을 한 번에 그릴 때 예약마다 배정 전체를 다시 찾지 않는다.
// currentAllocation·latestAllocation과 같은 기준으로 고른다.
export function allocationIndex(s: State) {
  const index = new Map<
    string,
    { current?: Allocation; latest?: Allocation }
  >();
  for (const a of s.allocations) {
    const entry = index.get(a.reservationId) || {};
    if (a.state === "active" && !entry.current) entry.current = a;
    const latest = entry.latest;
    if (
      a.state !== "planned" &&
      (!latest ||
        a.start > latest.start ||
        (a.start === latest.start && a.end > latest.end))
    )
      entry.latest = a;
    index.set(a.reservationId, entry);
  }
  return index;
}
export function conflict(
  s: State,
  siteId: string,
  start: string,
  end: string,
  ignoreReservation?: string,
  ignoreBlock?: string,
): string | null {
  const site = s.sites.find((x) => x.id === siteId);
  if (!site || site.archived) return "현재 사용할 수 없는 자리예요.";
  const block = s.blocks.find(
    (b) =>
      b.id !== ignoreBlock &&
      b.siteId === siteId &&
      overlaps(start, end, b.start, b.end),
  );
  if (block)
    return `${block.type === "long" ? "장박" : "사용중지"} 기간과 겹쳐요. (${shortDate(block.start)} ~ ${shortDate(block.end)})`;
  const allocation = s.allocations.find(
    (a) =>
      a.siteId === siteId &&
      a.reservationId !== ignoreReservation &&
      overlaps(start, end, a.start, a.end),
  );
  if (allocation)
    return `${getReservation(s, allocation.reservationId).name} 님의 이용 기간과 겹쳐요.`;
  return null;
}
export function siteStatus(
  s: State,
  siteId: string,
  day: string,
  now = nowLocal(),
) {
  const start = day === now.slice(0, 10) ? now : `${day}T14:00:00`;
  const end = `${addDays(day, 1)}T00:00:00`;
  const byStart = (a: { start: string }, b: { start: string }) =>
    a.start.localeCompare(b.start);
  const block = s.blocks
    .filter((b) => b.siteId === siteId && overlaps(start, end, b.start, b.end))
    .sort(byStart)[0];
  const allocation = s.allocations
    .filter((a) => a.siteId === siteId && overlaps(start, end, a.start, a.end))
    .sort(byStart)[0];
  // 같은 날의 후속 일정이 현재 이용 중인 손님을 가리지 않게 한다.
  if (block && (!allocation || block.start <= allocation.start))
    return {
      type: block.type,
      label: block.type === "long" ? "장박" : "사용중지",
      name: block.name,
      block,
    } as const;
  if (allocation) {
    const r = getReservation(s, allocation.reservationId);
    return {
      type: "assigned",
      label:
        allocation.state === "planned"
          ? "이동 예정"
          : r.status === "checkedIn"
            ? "입실"
            : "배정",
      name: r.name,
      reservation: r,
      allocation,
    } as const;
  }
  return { type: "empty", label: "빈자리", name: "" } as const;
}
export type ReservationInput = Pick<
  Reservation,
  | "name"
  | "phone"
  | "arrival"
  | "departure"
  | "kind"
  | "source"
  | "people"
  | "vehicle"
  | "note"
  | "fee"
  | "paid"
>;
export function addReservation(
  s: State,
  input: ReservationInput,
  externalId = "",
  unit = "1",
) {
  ensure(input.name.trim(), "예약자 이름을 입력해 주세요.");
  ensure(
    validDate(input.arrival) &&
      validDate(input.departure) &&
      input.arrival < input.departure,
    "퇴실일은 입실일보다 뒤여야 해요.",
  );
  ensure(Object.keys(KINDS).includes(input.kind), "숙박 유형을 확인해 주세요.");
  ensure(
    Number.isInteger(input.people) && input.people > 0,
    "인원은 1명 이상으로 입력해 주세요.",
  );
  ensure(
    Number.isFinite(input.fee) && input.fee >= 0,
    "추가요금을 확인해 주세요.",
  );
  const r: Reservation = {
    ...input,
    name: input.name.trim(),
    id: uid(),
    externalId,
    unit,
    status: "waiting",
    lateTime: "",
  };
  s.reservations.push(r);
  log(s, `${r.name} 님 예약을 등록했어요.`, r.id);
  return r;
}
export function assign(
  s: State,
  reservationId: string,
  siteId: string,
  checkIn = true,
  now = nowLocal(),
) {
  const r = getReservation(s, reservationId);
  const site = s.sites.find((x) => x.id === siteId);
  ensure(r.status === "waiting", "도착 전 예약에 자리를 배정할 수 있어요.");
  ensure(
    !currentAllocation(s, r.id),
    "이미 배정된 자리예요. 자리 이동을 이용해 주세요.",
  );
  ensure(
    site?.kind === r.kind,
    "예약한 숙박 유형과 같은 자리만 선택할 수 있어요.",
  );
  const p = period(r);
  if (checkIn) {
    ensure(
      now.slice(0, 10) >= r.arrival && now < p.end,
      "예약된 입실일 당일부터 퇴실 시각 전까지 입실할 수 있어요.",
    );
    p.start = now;
  }
  const issue = conflict(s, siteId, p.start, p.end, r.id);
  ensure(!issue, issue || "기간이 겹쳐요.");
  s.allocations.push({
    id: uid(),
    reservationId,
    siteId,
    ...p,
    state: "active",
  });
  if (checkIn) r.status = "checkedIn";
  log(
    s,
    `${r.name} 님을 ${site.label}에 ${checkIn ? "배정하고 입실 처리했어요." : "배정했어요."}`,
    r.id,
    now,
  );
}
export function checkInAssigned(s: State, id: string, now = nowLocal()) {
  const r = getReservation(s, id);
  const a = currentAllocation(s, id);
  ensure(r.status === "waiting" && a, "입실 처리할 배정이 없어요.");
  ensure(
    now.slice(0, 10) >= r.arrival && now < a.end,
    "예약된 입실일 당일부터 퇴실 시각 전까지 입실할 수 있어요.",
  );
  const start = now < a.start ? now : a.start;
  const issue = conflict(s, a.siteId, start, a.end, id);
  ensure(!issue, issue || "기간이 겹쳐요.");
  a.start = start;
  r.status = "checkedIn";
  log(s, `${r.name} 님이 입실했어요.`, id, now);
}
// Q15: 명단의 지정 객실(카라반·방갈로)은 자동 배치 후에도 입실 전에 바꾸거나 비울 수 있다.
const DESIGNATED: Kind[] = ["caravan", "bungalow"];
function waitingDesignated(s: State, id: string) {
  const r = getReservation(s, id);
  ensure(
    r.status === "waiting" && DESIGNATED.includes(r.kind),
    "입실 전 카라반·방갈로 예약만 객실을 바꾸거나 해제할 수 있어요.",
  );
  return r;
}
// 아직 시작하지 않은 입실 전 배정은 지우고, 이미 시작했으면 지금까지를 이력으로 남긴다.
function releaseHold(s: State, a: Allocation, now: string) {
  if (a.start >= now)
    s.allocations = s.allocations.filter((x) => x.id !== a.id);
  else {
    a.end = now < a.end ? now : a.end;
    a.state = "ended";
  }
}
export function assignWaitingRoom(
  s: State,
  id: string,
  siteId: string,
  now = nowLocal(),
) {
  const r = waitingDesignated(s, id);
  const current = currentAllocation(s, id);
  const site = s.sites.find((x) => x.id === siteId);
  ensure(
    site && !site.archived && site.kind === r.kind,
    "예약한 숙박 유형과 같은, 사용 중인 객실을 선택해 주세요.",
  );
  ensure(
    site.id !== current?.siteId,
    "지금 배정된 객실과 다른 객실을 선택해 주세요.",
  );
  const p = period(r);
  const start = p.start > now ? p.start : now;
  ensure(start < p.end, "퇴실 시각이 지나 객실을 배정할 수 없어요.");
  const issue = conflict(s, site.id, start, p.end, id);
  ensure(!issue, issue || "기간이 겹쳐요.");
  const from = current && s.sites.find((x) => x.id === current.siteId)?.label;
  if (current) releaseHold(s, current, now);
  s.allocations.push({
    id: uid(),
    reservationId: id,
    siteId: site.id,
    start,
    end: p.end,
    state: "active",
  });
  log(
    s,
    from
      ? `${r.name} 님의 객실을 ${from}에서 ${site.label}(으)로 바꿨어요. 입실 처리는 하지 않았어요.`
      : `${r.name} 님을 ${site.label}에 배정했어요. 입실 처리는 하지 않았어요.`,
    id,
    now,
  );
}
export function releaseWaitingRoom(s: State, id: string, now = nowLocal()) {
  const r = waitingDesignated(s, id);
  const current = currentAllocation(s, id);
  ensure(current, "해제할 객실 배정이 없어요.");
  const label = s.sites.find((x) => x.id === current.siteId)?.label;
  releaseHold(s, current, now);
  log(
    s,
    `${r.name} 님의 ${label} 배정을 해제했어요. 예약은 유지해요.`,
    id,
    now,
  );
}
export function finish(
  s: State,
  id: string,
  status: "checkedOut" | "noShow" | "cancelled",
  now = nowLocal(),
) {
  const r = getReservation(s, id);
  ensure(
    ["waiting", "checkedIn"].includes(r.status),
    "이미 종료된 예약이에요.",
  );
  r.status = status;
  r.actualCheckout = now;
  s.changes = s.changes.filter((c) => c.reservationId !== id);
  s.allocations = s.allocations.filter(
    (a) =>
      !(a.reservationId === id && (a.state === "planned" || a.start >= now)),
  );
  s.allocations
    .filter((a) => a.reservationId === id && a.state === "active")
    .forEach((a) => {
      a.end = now < a.end ? now : a.end;
      a.state = "ended";
    });
  log(s, `${r.name} 님을 ${STATUS[status]} 처리했어요.`, id, now);
}
export function sweep(s: State, now = nowLocal()) {
  s.allocations = s.allocations.filter((a) => {
    if (a.state === "planned" && a.end <= now) {
      log(
        s,
        "완료하지 않은 이동 예약을 퇴실 시각에 해제했어요.",
        a.reservationId,
        a.end,
      );
      return false;
    }
    return true;
  });
  s.allocations.forEach((a) => {
    if (a.end <= now && a.state !== "ended") a.state = "ended";
  });
  s.reservations.forEach((r) => {
    if (r.status === "checkedIn" && period(r).end <= now) {
      r.status = "checkedOut";
      r.actualCheckout = period(r).end;
      s.changes = s.changes.filter((c) => c.reservationId !== r.id);
      log(
        s,
        `${r.name} 님의 예정 퇴실 시각이 되어 자리를 비웠어요.`,
        r.id,
        period(r).end,
      );
    }
  });
}
export function scheduleMove(
  s: State,
  id: string,
  siteId: string,
  at: string,
  immediate: boolean,
  now = nowLocal(),
) {
  const r = getReservation(s, id);
  const a = currentAllocation(s, id);
  const target = s.sites.find((x) => x.id === siteId);
  ensure(r.status === "checkedIn" && a, "입실한 손님만 이동할 수 있어요.");
  ensure(
    !plannedMove(s, id),
    "등록된 이동을 완료하거나 취소한 뒤 다시 등록해 주세요.",
  );
  ensure(
    target && target.id !== a.siteId && target.kind === r.kind,
    "현재 자리와 다른, 같은 숙박 유형의 자리를 선택해 주세요.",
  );
  const start = immediate ? now : at;
  ensure(
    validTimestamp(start) && start >= now && start < a.end,
    "현재 시각 이후, 퇴실 시각 이전으로 이동일을 정해 주세요.",
  );
  const issue = conflict(s, siteId, start, a.end, id);
  ensure(!issue, issue || "기간이 겹쳐요.");
  s.allocations.push({
    id: uid(),
    reservationId: id,
    siteId,
    start,
    end: a.end,
    state: "planned",
  });
  if (immediate) completeMove(s, id, now);
  else log(s, `${r.name} 님의 ${target.label} 이동을 예약했어요.`, id, now);
}
export function completeMove(s: State, id: string, now = nowLocal()) {
  const a = currentAllocation(s, id);
  const p = plannedMove(s, id);
  ensure(a && p, "이동 예약이 없어요.");
  ensure(
    now >= p.start && now < p.end,
    "이동 예정 시각부터 퇴실 전까지 완료할 수 있어요.",
  );
  const issue = conflict(s, p.siteId, now, p.end, id);
  ensure(!issue, issue || "이동할 자리를 확인해 주세요.");
  a.end = now;
  a.state = "ended";
  p.start = now;
  p.state = "active";
  log(s, `${getReservation(s, id).name} 님의 자리 이동을 완료했어요.`, id, now);
}
export function cancelMove(s: State, id: string) {
  ensure(plannedMove(s, id), "이동 예약이 없어요.");
  s.allocations = s.allocations.filter(
    (a) => !(a.reservationId === id && a.state === "planned"),
  );
  log(s, "예정된 이동을 취소했어요.", id);
}
export function extendStay(
  s: State,
  id: string,
  departure: string,
  fee: number,
) {
  const r = getReservation(s, id);
  ensure(
    ["waiting", "checkedIn"].includes(r.status),
    "종료된 예약은 연장할 수 없어요.",
  );
  ensure(
    validDate(departure) && departure > r.departure,
    "현재 퇴실일보다 뒤의 날짜를 선택해 주세요.",
  );
  ensure(Number.isFinite(fee) && fee >= 0, "추가요금을 확인해 주세요.");
  const end = `${departure}T${r.lateTime || "11:00"}:00`;
  s.allocations
    .filter((a) => a.reservationId === id && a.state !== "ended")
    .forEach((a) => {
      const issue = conflict(s, a.siteId, a.start, end, id);
      ensure(!issue, issue || "연장 기간이 겹쳐요.");
      a.end = end;
    });
  r.departure = departure;
  r.fee += fee;
  if (fee > 0) r.paid = false;
  log(s, `${r.name} 님의 숙박을 ${shortDate(departure)}까지 연장했어요.`, id);
}
export function lateCheckout(s: State, id: string, fee: number) {
  const r = getReservation(s, id);
  ensure(r.status === "checkedIn", "입실한 손님에게 적용할 수 있어요.");
  ensure(!r.lateTime, "이미 레이트 체크아웃이 적용되어 있어요.");
  ensure(
    validTime(s.settings.lateTime) &&
      s.settings.lateTime > "11:00" &&
      s.settings.lateFee !== null,
    "설정에서 공통 레이트 종료 시각과 기본요금을 먼저 입력해 주세요.",
  );
  ensure(Number.isFinite(fee) && fee >= 0, "추가요금을 확인해 주세요.");
  const end = `${r.departure}T${s.settings.lateTime}:00`;
  s.allocations
    .filter((a) => a.reservationId === id && a.state !== "ended")
    .forEach((a) => {
      const issue = conflict(s, a.siteId, a.start, end, id);
      ensure(!issue, issue || "다음 예약과 겹쳐요.");
      a.end = end;
    });
  r.lateTime = s.settings.lateTime;
  r.fee += fee;
  if (fee > 0) r.paid = false;
  log(s, `${r.name} 님에게 ${r.lateTime} 레이트 체크아웃을 적용했어요.`, id);
}
export function addBlock(s: State, input: Omit<Block, "id">) {
  ensure(input.name.trim(), "이름 또는 사용중지 사유를 입력해 주세요.");
  ensure(
    validTimestamp(input.start) &&
      validTimestamp(input.end) &&
      input.start < input.end,
    "기간을 확인해 주세요.",
  );
  const issue = conflict(s, input.siteId, input.start, input.end);
  ensure(!issue, issue || "기간이 겹쳐요.");
  s.blocks.push({ ...input, id: uid() });
  log(
    s,
    `${s.sites.find((x) => x.id === input.siteId)?.label}에 ${input.type === "long" ? "장박" : "사용중지"}를 등록했어요.`,
  );
}
export function removeBlock(s: State, id: string, now = nowLocal()) {
  const b = s.blocks.find((x) => x.id === id);
  ensure(b, "등록 내역이 없어요.");
  if (b.start >= now) s.blocks = s.blocks.filter((x) => x.id !== id);
  else b.end = now < b.end ? now : b.end;
  log(
    s,
    `${b.name}의 ${b.type === "long" ? "장박" : "사용중지"}를 종료했어요.`,
  );
}
export function saveSite(s: State, input: Site) {
  ensure(
    input.label.trim() &&
      AREAS.includes(input.area as (typeof AREAS)[number]) &&
      Object.keys(KINDS).includes(input.kind),
    "자리 이름·동·유형을 확인해 주세요.",
  );
  ensure(
    !s.sites.some(
      (x) => x.id !== input.id && !x.archived && x.label === input.label.trim(),
    ),
    "같은 이름의 자리가 있어요.",
  );
  const existing = s.sites.find((x) => x.id === input.id);
  if (existing) {
    if (existing.kind !== input.kind || input.archived) {
      ensure(
        !s.allocations.some(
          (a) => a.siteId === input.id && a.end > nowLocal(),
        ) && !s.blocks.some((b) => b.siteId === input.id && b.end > nowLocal()),
        "사용 예정이 있는 자리는 유형 변경·삭제할 수 없어요.",
      );
    }
    const movedArea = existing.area !== input.area;
    Object.assign(existing, input, { label: input.label.trim() });
    if (movedArea) delete existing.layout;
  } else
    s.sites.push({
      ...input,
      id: input.id || uid(),
      label: input.label.trim(),
    });
  log(s, `${input.label} 자리 정보를 저장했어요.`);
}

function validLayout(value: unknown): value is LayoutPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as LayoutPoint;
  return (
    Number.isFinite(point.x) &&
    point.x >= 0 &&
    point.x <= 100 &&
    Number.isFinite(point.y) &&
    point.y >= 0 &&
    point.y <= 100
  );
}

export interface LayoutChange {
  siteId: string;
  position?: LayoutPoint;
}

export function saveAreaLayout(
  s: State,
  area: string,
  changes: LayoutChange[],
) {
  ensure(
    AREAS.includes(area as (typeof AREAS)[number]),
    "편집할 동을 확인해 주세요.",
  );
  const ids = new Set<string>();
  const targets = changes.map((change) => {
    const site = s.sites.find((x) => x.id === change.siteId);
    ensure(
      site && !site.archived && site.area === area,
      "해당 동에서 사용할 수 있는 자리를 선택해 주세요.",
    );
    ensure(!ids.has(site.id), "같은 자리의 위치가 중복되었어요.");
    ids.add(site.id);
    ensure(
      change.position === undefined || validLayout(change.position),
      "배치도 안의 위치를 선택해 주세요.",
    );
    return { site, position: change.position };
  });
  targets.forEach(({ site, position }) => {
    if (position) site.layout = { ...position };
    else delete site.layout;
  });
  if (targets.length)
    log(s, `${area}동의 자리 ${targets.length}개 위치를 저장했어요.`);
}

export function saveFacilityLayout(
  s: State,
  area: string,
  changes: { id: string; position?: LayoutPoint }[],
) {
  const ids = new Set<string>();
  const targets = changes.map((change) => {
    const facility = s.facilities?.find(
      (item) => item.id === change.id && item.area === area,
    );
    ensure(
      facility && !ids.has(change.id),
      "해당 동의 시설물을 확인해 주세요.",
    );
    ids.add(change.id);
    ensure(
      change.position === undefined || validLayout(change.position),
      "배치도 안의 위치를 선택해 주세요.",
    );
    return { facility, position: change.position };
  });
  targets.forEach(({ facility, position }) => {
    if (position) facility.layout = { ...position };
    else delete facility.layout;
  });
  if (targets.length)
    log(s, `${area}동 시설 ${targets.length}개의 위치를 저장했어요.`);
}

export interface ImportRow {
  source: string;
  externalId: string;
  unit: string;
  name: string;
  phone: string;
  arrival: string;
  departure: string;
  kind: Kind;
  people: number;
  cancelled: boolean;
  siteLabel: string;
}
// 보관 파일에 있는 같은 경로·예약번호의 예약. 가져오기 전에 저장소에서 찾아 넘긴다.
export interface ArchivedMatch {
  year: number;
  reservation: Pick<
    Reservation,
    | "source"
    | "externalId"
    | "unit"
    | "name"
    | "phone"
    | "kind"
    | "people"
    | "arrival"
    | "departure"
    | "status"
    | "sourceArrival"
    | "sourceDeparture"
    | "sourceCancelled"
  >;
}
export function importRows(
  s: State,
  rows: ImportRow[],
  archived: ArchivedMatch[] = [],
) {
  let added = 0,
    changed = 0,
    unchanged = 0;
  const warnings: string[] = [];
  const keys = new Set<string>();
  // 이번 가져오기 전의 같은 경로·예약번호 단위번호. 처음 함께 들어온 여러 자리는 경고하지 않는다.
  const knownUnits = new Map<string, Set<string>>();
  for (const r of [...s.reservations, ...archived.map((m) => m.reservation)]) {
    const key = JSON.stringify([r.source, r.externalId]);
    knownUnits.set(key, (knownUnits.get(key) || new Set()).add(r.unit));
  }
  rows.forEach((row) => {
    ensure(row.externalId.trim(), "예약번호가 없는 행은 가져올 수 없어요.");
    ensure(
      validDate(row.arrival) &&
        validDate(row.departure) &&
        row.arrival < row.departure,
      "숙박 날짜가 올바르지 않아요.",
    );
    const key = JSON.stringify([row.source, row.externalId, row.unit]);
    ensure(
      !keys.has(key),
      "파일 안에 같은 예약번호·단위번호가 있어요. 단위번호를 구분해 주세요.",
    );
    keys.add(key);
    const r = s.reservations.find(
      (r) =>
        r.source === row.source &&
        r.externalId === row.externalId &&
        r.unit === row.unit,
    );
    const old = r
      ? undefined
      : archived.find(
          ({ reservation: x }) =>
            x.source === row.source &&
            x.externalId === row.externalId &&
            x.unit === row.unit,
        );
    if (old) {
      // 보관된 지난 예약은 새로 만들지 않고 보관 기록도 바꾸지 않는다. 다르면 확인만 안내한다.
      const x = old.reservation;
      const cancelled = x.sourceCancelled ?? x.status === "cancelled";
      if (
        row.arrival !== (x.sourceArrival ?? x.arrival) ||
        row.departure !== (x.sourceDeparture ?? x.departure) ||
        row.cancelled !== cancelled ||
        row.name !== x.name ||
        row.phone !== x.phone ||
        row.kind !== x.kind ||
        row.people !== x.people
      )
        warnings.push(
          `${row.name}: ${old.year}년 보관 기록의 예약(${shortDate(x.arrival)} ~ ${shortDate(x.departure)}, ${STATUS[x.status]})과 원본 정보가 달라요. 보관 기록은 바꾸지 않았으니 ‘보관 기록 검색’으로 확인해 주세요.`,
        );
      unchanged++;
    } else if (r) {
      let needsReview = false;
      const active = ["waiting", "checkedIn"].includes(r.status);
      // 최신 원본에서 철회된 보류 알림이 잘못 적용되지 않도록 정리한다.
      const obsolete = s.changes.filter(
        (c) =>
          c.reservationId === r.id &&
          (!active ||
            (c.type === "cancel" && !row.cancelled) ||
            (c.type === "dates" &&
              (row.cancelled ||
                (row.arrival === r.arrival && row.departure === r.departure)))),
      );
      if (obsolete.length) {
        const ids = new Set(obsolete.map((c) => c.id));
        s.changes = s.changes.filter((c) => !ids.has(c.id));
        warnings.push(
          `${r.name}: 최신 명단에 맞춰 이전 변경 확인 ${obsolete.length}건을 해제했어요. 현재 예약과 배정은 유지했어요.`,
        );
        log(s, "최신 명단에서 철회된 변경 확인을 해제했어요.", r.id);
      }
      if (row.cancelled && !r.sourceCancelled && active) {
        s.changes = s.changes.filter((c) => c.reservationId !== r.id);
        s.changes.push({
          id: uid(),
          reservationId: r.id,
          type: "cancel",
          arrival: row.arrival,
          departure: row.departure,
        });
        needsReview = true;
      } else if (
        !row.cancelled &&
        (row.arrival !== r.sourceArrival ||
          row.departure !== r.sourceDeparture ||
          r.sourceCancelled) &&
        (row.arrival !== r.arrival || row.departure !== r.departure) &&
        active
      ) {
        s.changes = s.changes.filter(
          (c) => !(c.reservationId === r.id && c.type === "dates"),
        );
        s.changes.push({
          id: uid(),
          reservationId: r.id,
          type: "dates",
          arrival: row.arrival,
          departure: row.departure,
        });
        needsReview = true;
      }
      if (
        r.kind !== row.kind ||
        r.people !== row.people ||
        r.name !== row.name ||
        r.phone !== row.phone
      )
        warnings.push(
          `${r.name}: 원본 정보가 달라요. 이름 ${row.name}, 연락처 ${row.phone || "미등록"}, ${KINDS[row.kind]}, ${row.people}명. 기존 기록은 유지했으니 변경 내용을 확인해 주세요.`,
        );
      r.sourceArrival = row.arrival;
      r.sourceDeparture = row.departure;
      r.sourceCancelled = row.cancelled;
      if (needsReview) changed++;
      else unchanged++;
    } else {
      const created = addReservation(
        s,
        { ...row, vehicle: "", note: "", fee: 0, paid: false },
        row.externalId,
        row.unit,
      );
      created.sourceArrival = row.arrival;
      created.sourceDeparture = row.departure;
      created.sourceCancelled = row.cancelled;
      if (row.cancelled) created.status = "cancelled";
      const units = knownUnits.get(
        JSON.stringify([row.source, row.externalId]),
      );
      if (units)
        warnings.push(
          `${row.name}: 예약번호 ${row.externalId}에 기존 단위번호(${[...units].join(", ")})와 다른 단위번호 ${row.unit}가 새로 들어왔어요. 여러 자리 예약인지, 단위번호가 바뀐 것인지 확인해 주세요. 자동으로 합치거나 취소하지 않았어요.`,
        );
      if (
        !row.cancelled &&
        ["caravan", "bungalow"].includes(row.kind) &&
        row.siteLabel
      ) {
        // 같은 이름을 먼저 찾고, 없으면 공백 차이만 무시한 유일한 같은 유형 객실을 쓴다.
        const compact = (label: string) => label.replace(/\s+/g, "");
        const candidates = s.sites.filter(
          (x) => !x.archived && x.kind === row.kind,
        );
        const exact = candidates.filter((x) => x.label === row.siteLabel);
        const matches = exact.length
          ? exact
          : candidates.filter(
              (x) => compact(x.label) === compact(row.siteLabel),
            );
        const site = matches.length === 1 ? matches[0] : undefined;
        if (site) {
          try {
            assign(s, created.id, site.id, false);
          } catch (e) {
            warnings.push(
              `${row.name}: ${(e as Error).message} 미배정으로 가져왔어요.`,
            );
          }
        } else
          warnings.push(
            matches.length > 1
              ? `${row.name}: 지정 객실 ${row.siteLabel}에 해당하는 객실이 여러 개라 미배정으로 가져왔어요.`
              : `${row.name}: 지정 객실 ${row.siteLabel}을 찾지 못해 미배정으로 가져왔어요.`,
          );
      }
      if (
        s.reservations.some(
          (x) =>
            x.id !== created.id &&
            x.source !== row.source &&
            x.phone &&
            x.phone.replace(/\D/g, "") === row.phone.replace(/\D/g, "") &&
            x.arrival === row.arrival,
        )
      )
        warnings.push(
          `${row.name}: 다른 경로의 예약과 중복인지 확인해 주세요. 자동으로 합치지 않았어요.`,
        );
      added++;
    }
  });
  log(
    s,
    `명단 가져오기: 신규 ${added}건, 변경 확인 ${changed}건, 동일 ${unchanged}건.`,
  );
  return { added, changed, unchanged, warnings };
}
export function resolveChange(
  s: State,
  id: string,
  accept: boolean,
  now = nowLocal(),
) {
  const c = s.changes.find((x) => x.id === id);
  ensure(c, "확인할 변경이 없어요.");
  const r = getReservation(s, c.reservationId);
  if (accept && c.type === "cancel") finish(s, r.id, "cancelled", now);
  if (accept && c.type === "dates") {
    ensure(
      ["waiting", "checkedIn"].includes(r.status),
      "이미 종료된 예약은 날짜를 변경할 수 없어요.",
    );
    ensure(
      !plannedMove(s, r.id),
      "이동 예약을 먼저 취소한 뒤 날짜를 변경해 주세요.",
    );
    if (r.status === "checkedIn")
      ensure(
        c.arrival === r.arrival,
        "이미 입실한 예약의 입실일 변경은 현장 기록을 확인해 주세요.",
      );
    const p = period({ ...r, arrival: c.arrival, departure: c.departure });
    const a = currentAllocation(s, r.id);
    if (a) {
      // 입실 전 객실을 바꾼 뒤 남은 이전 배정 이력과 겹치지 않게 한다.
      const held = s.allocations
        .filter((x) => x.reservationId === r.id && x.state === "ended")
        .reduce((latest, x) => (x.end > latest ? x.end : latest), p.start);
      const start = r.status === "checkedIn" ? a.start : held;
      const at = (value: string) =>
        `${shortDate(value)} ${value.slice(11, 16)}`;
      ensure(
        start < p.end,
        `새 퇴실 시각(${at(p.end)})이 지금 자리의 이용 시작(${at(start)})보다 빨라 반영하지 않았어요. 자리 이동 이후의 날짜인지 확인하고, 손님이 이미 떠났다면 퇴실 처리를 해 주세요.`,
      );
      ensure(
        r.status !== "checkedIn" || p.end > now,
        `새 퇴실 시각(${at(p.end)})이 이미 지나 반영하면 바로 자동 퇴실돼요. 변경을 반영하지 않았어요. 손님이 떠났다면 퇴실 처리를 먼저 해 주세요.`,
      );
      const issue = conflict(s, a.siteId, start, p.end, r.id);
      ensure(!issue, issue || "변경 기간이 겹쳐요.");
      a.start = start;
      a.end = p.end;
    }
    r.arrival = c.arrival;
    r.departure = c.departure;
    log(s, `${r.name} 님의 숙박 날짜 변경을 반영했어요.`, r.id);
  }
  if (!accept)
    log(
      s,
      `${r.name} 님의 원본 변경을 반영하지 않고 기존 기록을 유지했어요.`,
      r.id,
    );
  s.changes = s.changes.filter((x) => x.id !== id);
}
export function validateState(value: unknown): asserts value is State {
  ensure(value && typeof value === "object", "올바른 백업 파일이 아니에요.");
  const s = value as State;
  ensure(
    s.version === 1 && typeof s.demo === "boolean",
    "이 버전에서 읽을 수 없는 백업이에요.",
  );
  for (const field of [
    "sites",
    "reservations",
    "allocations",
    "blocks",
    "changes",
    "activity",
  ] as const)
    ensure(
      Array.isArray(s[field]) && s[field].length < 200000,
      "백업 구조를 확인해 주세요.",
    );
  ensure(
    s.settings &&
      typeof s.settings.lateTime === "string" &&
      (!s.settings.lateTime ||
        (validTime(s.settings.lateTime) && s.settings.lateTime > "11:00")) &&
      (s.settings.lateFee === null ||
        (Number.isFinite(s.settings.lateFee) && s.settings.lateFee >= 0)) &&
      typeof s.settings.aerial === "string",
    "백업 설정을 확인해 주세요.",
  );
  ensure(
    !s.settings.aerial ||
      /^data:image\/(png|jpeg|webp);base64,/.test(s.settings.aerial) ||
      AERIAL_ASSET.test(s.settings.aerial),
    "항공사진 형식이 올바르지 않아요.",
  );
  ensure(
    s.sitePlan === undefined || typeof s.sitePlan === "string",
    "배치도 버전을 확인해 주세요.",
  );
  ensure(
    s.facilities === undefined ||
      (Array.isArray(s.facilities) && s.facilities.length < 2000),
    "시설 목록을 확인해 주세요.",
  );
  ensure(
    s.archives === undefined ||
      (Array.isArray(s.archives) &&
        s.archives.length < 2000 &&
        s.archives.every(validArchiveRef) &&
        new Set(s.archives.map((a) => a.file)).size === s.archives.length),
    "보관 파일 목록을 확인해 주세요.",
  );
  for (const list of [
    s.sites,
    s.reservations,
    s.allocations,
    s.blocks,
    s.changes,
    s.activity,
    s.facilities || [],
  ]) {
    const ids = new Set<string>();
    for (const item of list) {
      ensure(
        item &&
          typeof item.id === "string" &&
          item.id.trim() &&
          !ids.has(item.id),
        "중복되거나 잘못된 항목이 있어요.",
      );
      ids.add(item.id);
    }
  }
  s.sites.forEach((x) =>
    ensure(
      typeof x.label === "string" &&
        x.label.trim() &&
        AREAS.includes(x.area as (typeof AREAS)[number]) &&
        Object.keys(KINDS).includes(x.kind) &&
        typeof x.archived === "boolean" &&
        (x.x === undefined ||
          (Number.isFinite(x.x) && x.x >= 0 && x.x <= 100)) &&
        (x.y === undefined ||
          (Number.isFinite(x.y) && x.y >= 0 && x.y <= 100)) &&
        (x.layout === undefined || validLayout(x.layout)) &&
        (x.detail === undefined ||
          (typeof x.detail === "string" && x.detail.length <= 60)),
      "자리 정보를 확인해 주세요.",
    ),
  );
  (s.facilities || []).forEach((f) =>
    ensure(
      typeof f.label === "string" &&
        f.label.trim() &&
        AREAS.includes(f.area as (typeof AREAS)[number]) &&
        Object.keys(FACILITY_TYPES).includes(f.type) &&
        (f.location === undefined || f.location === "approach") &&
        (f.layout === undefined || validLayout(f.layout)) &&
        Number.isFinite(f.width) &&
        f.width > 0 &&
        f.width <= 100 &&
        Number.isFinite(f.height) &&
        f.height > 0 &&
        f.height <= 100,
      "시설 정보를 확인해 주세요.",
    ),
  );
  s.reservations.forEach((r) =>
    ensure(
      typeof r.name === "string" &&
        r.name.trim() &&
        typeof r.phone === "string" &&
        typeof r.note === "string" &&
        typeof r.vehicle === "string" &&
        typeof r.source === "string" &&
        typeof r.externalId === "string" &&
        typeof r.unit === "string" &&
        validDate(r.arrival) &&
        validDate(r.departure) &&
        r.arrival < r.departure &&
        Object.keys(KINDS).includes(r.kind) &&
        Object.keys(STATUS).includes(r.status) &&
        Number.isInteger(r.people) &&
        r.people > 0 &&
        Number.isFinite(r.fee) &&
        r.fee >= 0 &&
        typeof r.paid === "boolean" &&
        typeof r.lateTime === "string" &&
        (!r.lateTime || (validTime(r.lateTime) && r.lateTime > "11:00")) &&
        (r.actualCheckout === undefined || validTimestamp(r.actualCheckout)) &&
        (r.sourceArrival === undefined || validDate(r.sourceArrival)) &&
        (r.sourceDeparture === undefined || validDate(r.sourceDeparture)) &&
        (r.sourceCancelled === undefined ||
          typeof r.sourceCancelled === "boolean"),
      "예약 정보를 확인해 주세요.",
    ),
  );
  const reservationIds = new Set(s.reservations.map((r) => r.id));
  const siteIds = new Set(s.sites.map((x) => x.id));
  const reservationsById = new Map(s.reservations.map((r) => [r.id, r]));
  const sitesById = new Map(s.sites.map((site) => [site.id, site]));
  s.allocations.forEach((a) => {
    ensure(
      reservationIds.has(a.reservationId) &&
        siteIds.has(a.siteId) &&
        ["active", "planned", "ended"].includes(a.state) &&
        validTimestamp(a.start) &&
        validTimestamp(a.end) &&
        (a.state === "ended" ? a.start <= a.end : a.start < a.end),
      "배정 정보를 확인해 주세요.",
    );
    if (a.state !== "ended") {
      const r = reservationsById.get(a.reservationId)!;
      const site = sitesById.get(a.siteId)!;
      ensure(
        r.status === "waiting" || r.status === "checkedIn",
        "종료된 예약에 현재 배정 또는 이동 예약이 있어요.",
      );
      ensure(!site.archived, "삭제된 자리에 현재 배정이 있어요.");
      ensure(site.kind === r.kind, "예약과 배정 자리의 숙박 유형이 달라요.");
      ensure(
        a.state !== "planned" || r.status === "checkedIn",
        "입실하지 않은 예약에 이동 예약이 있어요.",
      );
    }
  });
  s.blocks.forEach((b) =>
    ensure(
      siteIds.has(b.siteId) &&
        ["long", "disabled"].includes(b.type) &&
        typeof b.name === "string" &&
        typeof b.phone === "string" &&
        typeof b.note === "string" &&
        validTimestamp(b.start) &&
        validTimestamp(b.end) &&
        b.start < b.end,
      "장박·사용중지 정보를 확인해 주세요.",
    ),
  );
  s.changes.forEach((c) =>
    ensure(
      reservationIds.has(c.reservationId) &&
        ["dates", "cancel"].includes(c.type) &&
        validDate(c.arrival) &&
        validDate(c.departure) &&
        c.arrival < c.departure,
      "변경 확인 내역을 확인해 주세요.",
    ),
  );
  s.activity.forEach((a) =>
    ensure(
      typeof a.text === "string" && validTimestamp(a.at),
      "변경 기록을 확인해 주세요.",
    ),
  );
  const active = new Set<string>(),
    planned = new Set<string>();
  for (const a of s.allocations) {
    if (a.state === "ended") continue;
    const ids = a.state === "active" ? active : planned;
    ensure(
      !ids.has(a.reservationId),
      "같은 예약에 중복 배정 또는 이동 예약이 있어요.",
    );
    ids.add(a.reservationId);
  }
  for (const id of planned)
    ensure(active.has(id), "출발지 배정이 없는 이동 예약이 있어요.");
  for (const r of s.reservations)
    ensure(
      r.status !== "checkedIn" || active.has(r.id),
      "입실한 예약의 현재 배정이 없어요.",
    );

  const visits = new Map<string, Allocation[]>();
  for (const a of s.allocations) {
    if (a.state === "planned" || a.start === a.end) continue;
    const list = visits.get(a.reservationId) || [];
    list.push(a);
    visits.set(a.reservationId, list);
  }
  for (const list of visits.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < list.length; i++)
      ensure(
        list[i - 1].end <= list[i].start,
        "한 예약의 실제 자리 이용 시간이 겹쳐요.",
      );
  }

  const intervals = new Map<string, { start: string; end: string }[]>();
  for (const item of [...s.allocations, ...s.blocks]) {
    if (item.start === item.end) continue;
    const list = intervals.get(item.siteId) || [];
    list.push(item);
    intervals.set(item.siteId, list);
  }
  for (const list of intervals.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < list.length; i++)
      ensure(
        list[i - 1].end <= list[i].start,
        "같은 자리의 배정·장박·사용중지 기간이 겹쳐요.",
      );
  }
}
// 설치 프로그램 저장소(electron/repository.cjs)와 같은 저장 한도. 한도를 넘기면 저장하지 않는다.
export const DATA_LIMIT = 16 * 1024 * 1024;
export const megabytes = (bytes: number) => (bytes / 1048576).toFixed(1);
// 한도 근처에서 계속 보여 줄 안내. 기록을 지우거나 잘라내지 않고, Q70의 지난 연도 보관과
// 저장 파일 안 항공사진의 분리 경로를 알려 준다. 올해 기록만으로 차면 담당자 확인을 안내한다.
export function storageNotice(bytes: number, limit = DATA_LIMIT) {
  if (!(bytes >= limit * 0.75)) return "";
  return `저장 데이터가 ${megabytes(bytes)}MB로 한도 ${megabytes(limit)}MB의 ${Math.floor((bytes / limit) * 100)}%예요. 한도를 넘으면 새 변경을 저장할 수 없어요. 기록은 지우지 않았어요. 설정 → ‘지난 연도 기록 보관’으로 지난 연도에 끝난 기록을 보관 파일로 옮기고, 저장 파일 안에 든 항공사진은 자리 편집 → 항공사진 위치 → ‘사진을 별도 파일로 옮기기’로 분리해 주세요. 그래도 올해 기록만으로 한도에 가까우면 기록이나 백업을 지우지 말고 프로그램 담당자에게 알려 주세요.`;
}
// 설치 프로그램은 항공사진을 데이터 폴더 assets/의 파일로 두고 본 파일에는 이 참조만 둔다.
export const AERIAL_ASSET = /^asset:aerial-[a-f0-9]{64}\.(png|jpg|webp)$/;
// 보관 파일 이름은 연도·생성 시각·부분 번호만 허용한다(다른 경로로 쓰지 않도록).
export const ARCHIVE_FILE = /^sopung-archive-\d{4}-[0-9a-z]+-\d+\.json$/;
function validArchiveRef(a: ArchiveRef) {
  return (
    !!a &&
    typeof a.file === "string" &&
    ARCHIVE_FILE.test(a.file) &&
    Number.isInteger(a.year) &&
    a.year >= 0 &&
    a.year <= 9999 &&
    [a.reservations, a.allocations, a.activity].every(
      (n) => Number.isInteger(n) && n >= 0,
    ) &&
    Number.isInteger(a.bytes) &&
    a.bytes > 0 &&
    typeof a.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(a.sha256)
  );
}
// 보관 대상: 올해(한국 시간) 이전에 끝난 퇴실·노쇼·취소 예약과 그 배정·기록,
// 예약과 연결되지 않은 지난 연도 기록. 도착 전·입실·이동 예정·미확인 변경과
// 장박·사용중지·자리·설정은 본 저장 파일에 남긴다.
export function archiveCandidates(s: State, now = nowLocal()) {
  const before = `${now.slice(0, 4)}-01-01`;
  const busy = new Set([
    ...s.changes.map((c) => c.reservationId),
    ...s.allocations
      .filter((a) => a.state !== "ended" || a.end >= before)
      .map((a) => a.reservationId),
  ]);
  const reservations = s.reservations.filter(
    (r) =>
      ["checkedOut", "noShow", "cancelled"].includes(r.status) &&
      r.departure < before &&
      (r.actualCheckout || "") < before &&
      !busy.has(r.id),
  );
  const ids = new Set(reservations.map((r) => r.id));
  return {
    reservations,
    allocations: s.allocations.filter((a) => ids.has(a.reservationId)),
    activity: s.activity.filter((a) =>
      a.reservationId ? ids.has(a.reservationId) : a.at < before,
    ),
  };
}
export const ARCHIVE_PART_BYTES = 8 * 1024 * 1024;
// 연도별 보관 파일 내용과 보관 뒤 본 저장 상태를 만든다. 파일은 저장소가 확인 후 쓴다.
export async function archivePlan(
  s: State,
  now = nowLocal(),
  partBytes = ARCHIVE_PART_BYTES,
) {
  const picked = archiveCandidates(s, now);
  ensure(
    picked.reservations.length || picked.activity.length,
    "보관할 지난 연도 기록이 없어요.",
  );
  const encoder = new TextEncoder();
  const size = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
  const byReservation = <T extends { reservationId?: string }>(list: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of list)
      if (item.reservationId)
        map.set(item.reservationId, [
          ...(map.get(item.reservationId) || []),
          item,
        ]);
    return map;
  };
  const allocations = byReservation(picked.allocations);
  const linked = byReservation(picked.activity);
  type Part = Omit<ArchiveFile, "format" | "version" | "year"> & {
    bytes: number;
  };
  const years = new Map<number, Part[]>();
  const add = (year: number, bytes: number, put: (part: Part) => void) => {
    const parts = years.get(year) || [];
    let part = parts[parts.length - 1];
    if (!part || (part.bytes + bytes > partBytes && part.bytes > 0)) {
      part = { reservations: [], allocations: [], activity: [], bytes: 0 };
      parts.push(part);
    }
    put(part);
    part.bytes += bytes;
    years.set(year, parts);
  };
  const ended = (r: Reservation) =>
    [r.departure, (r.actualCheckout || "").slice(0, 10)].sort()[1];
  for (const r of [...picked.reservations].sort(
    (a, b) =>
      ended(a).localeCompare(ended(b)) ||
      a.arrival.localeCompare(b.arrival) ||
      a.id.localeCompare(b.id),
  )) {
    const own = allocations.get(r.id) || [];
    const history = linked.get(r.id) || [];
    add(Number(ended(r).slice(0, 4)), size([r, own, history]), (part) => {
      part.reservations.push(r);
      part.allocations.push(...own);
      part.activity.push(...history);
    });
  }
  for (const a of picked.activity.filter((a) => !a.reservationId))
    add(Number(a.at.slice(0, 4)), size(a), (part) => part.activity.push(a));
  const stamp = Date.now().toString(36);
  const files: { file: string; text: string }[] = [];
  const refs: ArchiveRef[] = [];
  for (const [year, parts] of [...years].sort((a, b) => a[0] - b[0]))
    for (const [index, part] of parts.entries()) {
      const data: ArchiveFile = {
        format: "sopung-archive",
        version: 1,
        year,
        reservations: part.reservations,
        allocations: part.allocations,
        activity: part.activity,
      };
      const text = JSON.stringify(data);
      const bytes = encoder.encode(text);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const file = `sopung-archive-${String(year).padStart(4, "0")}-${stamp}-${index + 1}.json`;
      files.push({ file, text });
      refs.push({
        file,
        year,
        reservations: data.reservations.length,
        allocations: data.allocations.length,
        activity: data.activity.length,
        bytes: bytes.length,
        sha256: [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      });
    }
  const reservationIds = new Set(picked.reservations.map((r) => r.id));
  const activityIds = new Set(picked.activity.map((a) => a.id));
  const next = update(s, (draft) => {
    draft.reservations = draft.reservations.filter(
      (r) => !reservationIds.has(r.id),
    );
    draft.allocations = draft.allocations.filter(
      (a) => !reservationIds.has(a.reservationId),
    );
    draft.activity = draft.activity.filter((a) => !activityIds.has(a.id));
    draft.archives = [...(draft.archives || []), ...refs];
    log(
      draft,
      `지난 연도 기록을 보관 파일 ${refs.length}개로 옮겼어요. 예약 ${picked.reservations.length}건, 배정 ${picked.allocations.length}건, 변경 기록 ${picked.activity.length}건이에요.`,
      undefined,
      now,
    );
  });
  return { next, files, refs, counts: picked };
}

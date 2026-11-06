import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowSquareOut,
  Check,
  FileArrowUp,
  UploadSimple,
} from "@phosphor-icons/react";
import {
  AREAS,
  KINDS,
  STATUS,
  addDays,
  dateLabel,
  addReservation,
  assign,
  assignWaitingRoom,
  assignmentPeriod,
  addBlock,
  checkInAssigned,
  currentAllocation,
  latestAllocation,
  plannedMove,
  releaseWaitingRoom,
  completeMove,
  cancelMove,
  extendStay,
  lateCheckout,
  finish,
  importRows,
  log,
  nowLocal,
  period,
  conflict,
  saveSite,
  scheduleMove,
  shortDate,
  today,
  uid,
  validDate,
  weekdayLabel,
  type Kind,
  type Reservation,
  type ReservationInput,
  type Site,
  type State,
} from "./domain";
import { Field, ErrorBox, Tag, Money } from "./components";
import { archivedFor, download, type ArchiveSearchResult } from "./storage";
import {
  FIELDS,
  guessMapping,
  mapRows,
  readTable,
  type Mapping,
} from "./importer";

export type Mutate = (
  operation: (draft: State) => void,
  message?: string,
) => Promise<boolean>;
const noopSubmit = (event: FormEvent) => event.preventDefault();

export function ReservationForm({
  mutate,
  done,
  day,
}: {
  mutate: Mutate;
  done: (id: string) => void;
  day: string;
}) {
  const [v, set] = useState<ReservationInput>({
    name: "",
    phone: "",
    arrival: day,
    departure: addDays(day, 1),
    kind: "auto",
    source: "캠핏",
    people: 2,
    vehicle: "",
    note: "",
    fee: 0,
    paid: false,
  });
  const put = (key: keyof ReservationInput, value: string | number | boolean) =>
    set((p) => ({ ...p, [key]: value }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        let id = "";
        if (
          await mutate((s) => {
            id = addReservation(s, v).id;
          }, "예약을 등록했어요.")
        )
          done(id);
      }}
    >
      <div className="form-grid">
        <Field label="예약자 이름">
          <input
            autoFocus
            required
            value={v.name}
            onChange={(e) => put("name", e.target.value)}
            placeholder="이름을 입력해 주세요"
          />
        </Field>
        <Field label="연락처">
          <input
            type="tel"
            value={v.phone}
            onChange={(e) => put("phone", e.target.value)}
            placeholder="010-0000-0000"
          />
        </Field>
        <Field label="입실일" hint={dateLabel(v.arrival)}>
          <input
            required
            type="date"
            value={v.arrival}
            onChange={(e) => {
              const arrival = e.target.value;
              set((p) => ({
                ...p,
                arrival,
                departure:
                  validDate(arrival) && p.departure <= arrival
                    ? addDays(arrival, 1)
                    : p.departure,
              }));
            }}
          />
        </Field>
        <Field label="퇴실일" hint={dateLabel(v.departure)}>
          <input
            required
            type="date"
            min={validDate(v.arrival) ? addDays(v.arrival, 1) : undefined}
            value={v.departure}
            onChange={(e) => put("departure", e.target.value)}
          />
        </Field>
        <Field label="숙박 유형">
          <select value={v.kind} onChange={(e) => put("kind", e.target.value)}>
            {Object.entries(KINDS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="예약 경로">
          <select
            value={v.source}
            onChange={(e) => put("source", e.target.value)}
          >
            {["전화", "현장", "캠핏", "네이버"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="이용 인원">
          <input
            type="number"
            required
            min="1"
            value={v.people}
            onChange={(e) => put("people", Number(e.target.value))}
          />
        </Field>
        <Field label="차량번호">
          <input
            value={v.vehicle}
            onChange={(e) => put("vehicle", e.target.value)}
            placeholder="예: 12가 3456"
          />
        </Field>
        <Field label="추가요금 (원)">
          <input
            type="number"
            min="0"
            value={v.fee}
            onChange={(e) => put("fee", Number(e.target.value))}
          />
        </Field>
        <Field label="결제 여부">
          <select
            value={String(v.paid)}
            onChange={(e) => put("paid", e.target.value === "true")}
          >
            <option value="false">미결제</option>
            <option value="true">결제 완료</option>
          </select>
        </Field>
        <Field label="메모" wide>
          <textarea
            rows={2}
            value={v.note}
            onChange={(e) => put("note", e.target.value)}
            placeholder="자리 요청이나 기억할 내용을 남겨 주세요"
          />
        </Field>
      </div>
      <div className="form-footer">
        <span>기본 입실 14:00 · 퇴실 11:00</span>
        <button className="button primary" type="submit">
          예약 등록
          <ArrowRight size={18} />
        </button>
      </div>
    </form>
  );
}

export function GuestDetail({
  r,
  s,
  mutate,
  close,
  select,
}: {
  r: Reservation;
  s: State;
  mutate: Mutate;
  close: () => void;
  select: (id: string) => void;
}) {
  const a = currentAllocation(s, r.id),
    move = plannedMove(s, r.id);
  // Q15: 명단의 지정 객실은 입실 전에도 바꾸거나 비울 수 있다.
  const designated =
    r.status === "waiting" && (r.kind === "caravan" || r.kind === "bungalow");
  const assignedLabel = s.sites.find((x) => x.id === a?.siteId)?.label;
  const [mode, setMode] = useState("");
  const [target, setTarget] = useState(""),
    [moveDate, setMoveDate] = useState(addDays(today(), 1)),
    [immediate, setImmediate] = useState(true);
  const [departure, setDeparture] = useState(addDays(r.departure, 1)),
    [fee, setFee] = useState(s.settings.lateFee ?? 0);
  const [name, setName] = useState(r.name),
    [phone, setPhone] = useState(r.phone),
    [note, setNote] = useState(r.note),
    [vehicle, setVehicle] = useState(r.vehicle),
    [people, setPeople] = useState(r.people),
    [totalFee, setTotalFee] = useState(r.fee);
  const action = async (op: (draft: State) => void, text: string) => {
    if (await mutate(op, text)) {
      setMode("");
      close();
    }
  };
  return (
    <>
      <div className="guest-hero">
        <div className="avatar big">{r.name.slice(0, 1)}</div>
        <div>
          <h3>
            {r.name}
            <Tag tone={r.status === "checkedIn" ? "blue" : ""}>
              {STATUS[r.status]}
            </Tag>
          </h3>
          <p>{r.phone || "연락처 미등록"}</p>
        </div>
        <span className="guest-source">{r.source}</span>
      </div>
      <div className="stay-summary">
        <div>
          <small>입실</small>
          <strong>
            {shortDate(r.arrival)} <span>14:00</span>
          </strong>
          <small className="stay-weekday">
            {r.arrival.slice(0, 4)}년 · {weekdayLabel(r.arrival)}
          </small>
        </div>
        <ArrowRight size={20} />
        <div>
          <small>퇴실</small>
          <strong>
            {shortDate(r.departure)} <span>{r.lateTime || "11:00"}</span>
          </strong>
          <small className="stay-weekday">
            {r.departure.slice(0, 4)}년 · {weekdayLabel(r.departure)}
          </small>
        </div>
        <div className="assigned-label">
          {s.sites.find(
            (x) => x.id === (a || latestAllocation(s, r.id))?.siteId,
          )?.label || "미배정"}
          <small>{KINDS[r.kind]}</small>
        </div>
      </div>
      {move && (
        <div className="notice blue">
          {s.sites.find((x) => x.id === move.siteId)?.label} 이동 예정 ·{" "}
          {shortDate(move.start)} {move.start.slice(11, 16)}
          <div className="row-actions">
            <button
              className="text-button"
              onClick={() =>
                action((d) => completeMove(d, r.id), "이동을 완료했어요.")
              }
            >
              이동 완료
            </button>
            <button
              className="text-button subtle"
              onClick={() =>
                action((d) => cancelMove(d, r.id), "예정된 이동을 취소했어요.")
              }
            >
              이동 취소
            </button>
          </div>
        </div>
      )}
      <dl className="detail-list">
        <div>
          <dt>인원 · 차량</dt>
          <dd>
            {r.people}명 · {r.vehicle || "차량 미등록"}
          </dd>
        </div>
        <div>
          <dt>추가요금</dt>
          <dd>
            <Money value={r.fee} />{" "}
            {r.fee > 0 && (
              <Tag tone={r.paid ? "green" : "amber"}>
                {r.paid ? "결제 완료" : "미결제"}
              </Tag>
            )}
          </dd>
        </div>
        <div>
          <dt>메모</dt>
          <dd>{r.note || "남긴 메모가 없어요."}</dd>
        </div>
        {r.externalId && (
          <div>
            <dt>원본 예약번호</dt>
            <dd>
              {r.externalId} · {r.unit}번
            </dd>
          </div>
        )}
      </dl>
      {!mode && (
        <>
          <div className="guest-actions">
            {r.status === "waiting" &&
              (a ? (
                <button
                  className="button primary"
                  onClick={() =>
                    action((d) => checkInAssigned(d, r.id), "입실 처리했어요.")
                  }
                >
                  입실 처리
                </button>
              ) : (
                <button className="button primary" onClick={() => select(r.id)}>
                  자리 선택하기
                </button>
              ))}
            {designated && (
              <button
                className="button secondary"
                onClick={() => {
                  setTarget("");
                  setMode("room");
                }}
              >
                {a ? "객실 변경" : "객실 지정"}
              </button>
            )}
            {designated && a && (
              <button
                className="button secondary"
                onClick={() => setMode("release")}
              >
                배정 해제
              </button>
            )}
            {r.status === "checkedIn" && (
              <>
                <button
                  className="button primary"
                  onClick={() => setMode("move")}
                >
                  자리 이동
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    setFee(0);
                    setMode("extend");
                  }}
                >
                  숙박 연장
                </button>
                <button
                  className="button secondary"
                  disabled={Boolean(r.lateTime)}
                  onClick={() => {
                    setFee(s.settings.lateFee ?? 0);
                    setMode("late");
                  }}
                >
                  {r.lateTime ? "레이트 적용됨" : "레이트 체크아웃"}
                </button>
                <button
                  className="button secondary"
                  onClick={() => setMode("checkedOut")}
                >
                  퇴실 처리
                </button>
              </>
            )}
            <button
              className="button secondary"
              onClick={() => setMode("edit")}
            >
              정보·요금 수정
            </button>
            {r.fee > 0 && (
              <button
                className="button secondary"
                onClick={() =>
                  action(
                    (d) => {
                      const guest = d.reservations.find((x) => x.id === r.id)!;
                      guest.paid = !guest.paid;
                    },
                    r.paid ? "미결제로 변경했어요." : "결제 완료로 변경했어요.",
                  )
                }
              >
                {r.paid ? "미결제로 변경" : "결제 완료"}
              </button>
            )}
          </div>
          {r.status === "waiting" && (
            <div className="sub-actions">
              <button onClick={() => setMode("noShow")}>노쇼 처리</button>
              <button onClick={() => setMode("cancelled")}>예약 취소</button>
            </div>
          )}
        </>
      )}
      {mode && (
        <form
          className="action-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (mode === "move")
              await action(
                (d) =>
                  scheduleMove(
                    d,
                    r.id,
                    target,
                    `${moveDate}T14:00:00`,
                    immediate,
                  ),
                immediate ? "자리를 이동했어요." : "이동을 예약했어요.",
              );
            if (mode === "room")
              await action(
                (d) => assignWaitingRoom(d, r.id, target),
                a
                  ? "객실을 바꿨어요. 입실 처리는 하지 않았어요."
                  : "객실을 지정했어요. 입실 처리는 하지 않았어요.",
              );
            if (mode === "release")
              await action(
                (d) => releaseWaitingRoom(d, r.id),
                "객실 배정을 해제했어요. 예약은 그대로예요.",
              );
            if (mode === "extend")
              await action(
                (d) => extendStay(d, r.id, departure, fee),
                "숙박을 연장했어요.",
              );
            if (mode === "late")
              await action(
                (d) => lateCheckout(d, r.id, fee),
                "레이트 체크아웃을 적용했어요.",
              );
            if (["checkedOut", "noShow", "cancelled"].includes(mode))
              await action(
                (d) =>
                  finish(
                    d,
                    r.id,
                    mode as "checkedOut" | "noShow" | "cancelled",
                  ),
                "처리하고 배정된 자리를 비웠어요.",
              );
            if (mode === "edit")
              await action((d) => {
                if (
                  !name.trim() ||
                  !Number.isInteger(people) ||
                  people < 1 ||
                  !Number.isFinite(totalFee) ||
                  totalFee < 0
                )
                  throw new Error("이름, 인원과 추가요금을 확인해 주세요.");
                Object.assign(
                  d.reservations.find((x) => x.id === r.id)!,
                  {
                    name: name.trim(),
                    phone: phone.trim(),
                    note,
                    vehicle,
                    people,
                    fee: totalFee,
                    paid: totalFee > r.fee ? false : r.paid,
                  },
                );
                log(
                  d,
                  `${name.trim()} 님의 예약 정보·요금을 수정했어요.`,
                  r.id,
                );
              }, "정보를 저장했어요.");
          }}
        >
          {mode === "move" && (
            <>
              <h4>어느 자리로 이동할까요?</h4>
              <Field label="이동할 자리">
                <select
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">자리를 선택해 주세요</option>
                  {s.sites
                    .filter(
                      (x) =>
                        !x.archived && x.kind === r.kind && x.id !== a?.siteId,
                    )
                    .map((x) => {
                      const issue = conflict(
                        s,
                        x.id,
                        immediate ? nowLocal() : `${moveDate}T14:00:00`,
                        period(r).end,
                        r.id,
                      );
                      return (
                        <option key={x.id} value={x.id} disabled={!!issue}>
                          {x.label}
                          {issue ? " · 기간 겹침" : ""}
                        </option>
                      );
                    })}
                </select>
              </Field>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={immediate}
                  onChange={(e) => setImmediate(e.target.checked)}
                />
                지금 바로 이동
              </label>
              {!immediate && (
                <Field label="이동 예정일 (14:00)" hint={dateLabel(moveDate)}>
                  <input
                    required
                    type="date"
                    min={today()}
                    max={r.departure}
                    value={moveDate}
                    onChange={(e) => setMoveDate(e.target.value)}
                  />
                </Field>
              )}
            </>
          )}
          {mode === "room" && (
            <>
              <h4>{a ? "어느 객실로 바꿀까요?" : "어느 객실에 지정할까요?"}</h4>
              <Field label="객실">
                <select
                  required
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">객실을 선택해 주세요</option>
                  {(() => {
                    const p = period(r),
                      now = nowLocal(),
                      start = p.start > now ? p.start : now;
                    return s.sites
                      .filter(
                        (x) =>
                          !x.archived &&
                          x.kind === r.kind &&
                          x.id !== a?.siteId,
                      )
                      .map((x) => {
                        const issue = conflict(s, x.id, start, p.end, r.id);
                        return (
                          <option key={x.id} value={x.id} disabled={!!issue}>
                            {x.label}
                            {x.detail ? ` · ${x.detail}` : ""}
                            {issue ? " · 기간 겹침" : ""}
                          </option>
                        );
                      });
                  })()}
                </select>
              </Field>
              <p className="muted">
                입실 처리는 하지 않아요. 예약번호·날짜와 확인할 변경은 그대로
                유지해요.
              </p>
            </>
          )}
          {mode === "release" && (
            <div className="notice amber">
              {r.name} 님의 {assignedLabel} 배정을 해제할까요? 예약은 도착
              전으로 남고, 필요하면 다시 객실을 지정할 수 있어요.
            </div>
          )}
          {mode === "extend" && (
            <>
              <h4>숙박을 연장해요</h4>
              <Field label="새 퇴실일" hint={dateLabel(departure)}>
                <input
                  type="date"
                  required
                  min={addDays(r.departure, 1)}
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                />
              </Field>
            </>
          )}
          {mode === "late" && (
            <>
              <h4>레이트 체크아웃</h4>
              <p className="muted">
                {s.settings.lateTime
                  ? `퇴실일 ${s.settings.lateTime}까지 자리를 유지해요.`
                  : "설정에서 공통 레이트 종료 시각과 기본요금을 먼저 입력해 주세요."}
              </p>
            </>
          )}
          {["late", "extend"].includes(mode) && (
            <Field label="이번에 추가할 요금 (원)">
              <input
                type="number"
                min="0"
                required
                value={fee}
                onChange={(e) => setFee(Number(e.target.value))}
              />
            </Field>
          )}
          {["checkedOut", "noShow", "cancelled"].includes(mode) && (
            <div className="notice amber">
              {r.name} 님을 {STATUS[mode as keyof typeof STATUS]} 처리하고
              배정된 자리를 비울까요? 원래 예약과 이용 기록은 남아요.
            </div>
          )}
          {mode === "edit" && (
            <div className="form-grid">
              <Field label="예약자 이름">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="연락처">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="인원">
                <input
                  min="1"
                  type="number"
                  required
                  value={people}
                  onChange={(e) => setPeople(Number(e.target.value))}
                />
              </Field>
              <Field label="차량번호">
                <input
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                />
              </Field>
              <Field label="전체 추가요금 (원)">
                <input
                  type="number"
                  min="0"
                  required
                  value={totalFee}
                  onChange={(e) => setTotalFee(Number(e.target.value))}
                />
              </Field>
              <Field label="메모" wide>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>
          )}
          <div className="form-footer">
            <button
              className="button secondary"
              type="button"
              onClick={() => setMode("")}
            >
              돌아가기
            </button>
            <button
              type="submit"
              className={`button ${["checkedOut", "noShow", "cancelled"].includes(mode) ? "danger" : "primary"}`}
              disabled={
                mode === "late" &&
                (!s.settings.lateTime || s.settings.lateFee === null)
              }
            >
              확인
            </button>
          </div>
        </form>
      )}
      <details className="history">
        <summary>이 예약의 변경 기록</summary>
        {s.activity
          .filter((x) => x.reservationId === r.id)
          .slice(0, 20)
          .map((x) => (
            <p key={x.id}>
              <small>
                {shortDate(x.at)} {x.at.slice(11, 16)}
              </small>
              {x.text}
            </p>
          ))}
      </details>
    </>
  );
}

// 보관 기록 검색 결과의 읽기 전용 상세. 보관 파일은 화면에서 바꾸지 않는다.
export function ArchivedDetail({
  item,
  s,
}: {
  item: ArchiveSearchResult;
  s: State;
}) {
  const r = item.reservation;
  const at = (value: string) => `${shortDate(value)} ${value.slice(11, 16)}`;
  const label = (id: string) =>
    s.sites.find((x) => x.id === id)?.label || "확인할 수 없는 자리";
  const last = [...item.allocations].sort((a, b) =>
    b.start.localeCompare(a.start),
  )[0];
  return (
    <>
      <div className="guest-hero">
        <div className="avatar big">{r.name.slice(0, 1)}</div>
        <div>
          <h3>
            {r.name}
            <Tag>{STATUS[r.status]}</Tag>
          </h3>
          <p>{r.phone || "연락처 미등록"}</p>
        </div>
        <span className="guest-source">{r.source}</span>
      </div>
      <div className="stay-summary">
        <div>
          <small>입실</small>
          <strong>
            {shortDate(r.arrival)} <span>14:00</span>
          </strong>
          <small className="stay-weekday">
            {r.arrival.slice(0, 4)}년 · {weekdayLabel(r.arrival)}
          </small>
        </div>
        <ArrowRight size={20} />
        <div>
          <small>퇴실</small>
          <strong>
            {shortDate(r.departure)} <span>{r.lateTime || "11:00"}</span>
          </strong>
          <small className="stay-weekday">
            {r.departure.slice(0, 4)}년 · {weekdayLabel(r.departure)}
          </small>
        </div>
        <div className="assigned-label">
          {last ? label(last.siteId) : "미배정"}
          <small>{KINDS[r.kind]}</small>
        </div>
      </div>
      <p className="notice neutral">
        {item.year}년 보관 기록이에요. 읽기만 할 수 있고 운영 현황에는 포함하지
        않아요.
      </p>
      <dl className="detail-list">
        <div>
          <dt>배정 이력</dt>
          <dd>
            {item.allocations.length
              ? [...item.allocations]
                  .sort((a, b) => a.start.localeCompare(b.start))
                  .map(
                    (a) => `${label(a.siteId)} ${at(a.start)} ~ ${at(a.end)}`,
                  )
                  .join(" · ")
              : "배정 없음"}
          </dd>
        </div>
        <div>
          <dt>인원 · 차량</dt>
          <dd>
            {r.people}명 · {r.vehicle || "차량 미등록"}
          </dd>
        </div>
        <div>
          <dt>추가요금</dt>
          <dd>
            <Money value={r.fee} />{" "}
            {r.fee > 0 && (
              <Tag tone={r.paid ? "green" : "amber"}>
                {r.paid ? "결제 완료" : "미결제"}
              </Tag>
            )}
          </dd>
        </div>
        <div>
          <dt>메모</dt>
          <dd>{r.note || "남긴 메모가 없어요."}</dd>
        </div>
        {r.externalId && (
          <div>
            <dt>원본 예약번호</dt>
            <dd>
              {r.externalId} · {r.unit}번
            </dd>
          </div>
        )}
        {r.actualCheckout && (
          <div>
            <dt>처리 시각</dt>
            <dd>{at(r.actualCheckout)}</dd>
          </div>
        )}
      </dl>
      <details className="history" open>
        <summary>이 예약의 변경 기록</summary>
        {[...item.activity]
          .sort((a, b) => b.at.localeCompare(a.at))
          .map((x) => (
            <p key={x.id}>
              <small>{at(x.at)}</small>
              {x.text}
            </p>
          ))}
      </details>
    </>
  );
}

export function AssignForm({
  site,
  s,
  day,
  selected,
  mutate,
  done,
}: {
  site: Site;
  s: State;
  day: string;
  selected: string;
  mutate: Mutate;
  done: () => void;
}) {
  const [id, set] = useState(
    s.reservations.some(
      (x) =>
        x.id === selected &&
        x.kind === site.kind &&
        x.status === "waiting" &&
        !currentAllocation(s, x.id),
    )
      ? selected
      : "",
  );
  const r = s.reservations.find((x) => x.id === id);
  const issue =
    day !== today()
      ? "현장 배정·입실은 오늘 날짜에서 진행해 주세요."
      : r && (r.arrival > today() || period(r).end <= nowLocal())
        ? "예약된 입실일 당일부터 퇴실 시각 전까지 입실할 수 있어요."
        : r
          ? conflict(s, site.id, assignmentPeriod(r).start, period(r).end, r.id)
          : "";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await mutate(
            (d) => assign(d, id, site.id),
            "자리를 배정하고 입실 처리했어요.",
          )
        )
          done();
      }}
    >
      <div className="site-preview empty">
        <strong>{site.label}</strong>
        <Tag tone="green">빈자리</Tag>
        <p>
          {site.area}동 · {KINDS[site.kind]}
        </p>
      </div>
      <Field label="배정할 예약자">
        <select required value={id} onChange={(e) => set(e.target.value)}>
          <option value="">예약자를 선택해 주세요</option>
          {s.reservations
            .filter(
              (r) =>
                r.status === "waiting" &&
                r.kind === site.kind &&
                !currentAllocation(s, r.id),
            )
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {shortDate(r.arrival)} ~ {shortDate(r.departure)}
              </option>
            ))}
        </select>
      </Field>
      {r && (
        <p className="muted">
          {r.name} 님의 {shortDate(r.arrival)} ~ {shortDate(r.departure)} 전체
          이용 기간을 확인해요.
        </p>
      )}
      <ErrorBox message={issue || ""} />
      <div className="form-footer">
        <span>입실일 당일은 오후 2시 전에도 입실할 수 있어요.</span>
        <button className="button primary" disabled={!r || !!issue}>
          배정하고 입실
          <Check size={18} />
        </button>
      </div>
    </form>
  );
}

export function BlockForm({
  s,
  mutate,
  close,
  siteId = "",
}: {
  s: State;
  mutate: Mutate;
  close: () => void;
  siteId?: string;
}) {
  const [v, set] = useState({
    siteId,
    type: "long",
    name: "",
    phone: "",
    start: today(),
    end: addDays(today(), 30),
    note: "",
  });
  // 사용중지는 시작 시각을 고른다. 오늘은 지금, 다른 날은 0시가 기본이다. 장박은 기존대로 14시다.
  const [startTime, setStartTime] = useState(nowLocal().slice(11, 16));
  const put = (key: keyof typeof v, value: string) =>
    set((p) => ({ ...p, [key]: value }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await mutate(
            (d) =>
              addBlock(d, {
                ...v,
                type: v.type as "long" | "disabled",
                start: `${v.start}T${v.type === "disabled" ? startTime : "14:00"}:00`,
                end: `${v.end}T11:00:00`,
              }),
            "등록한 기간 동안 자리를 비워두지 않아요.",
          )
        )
          close();
      }}
    >
      <div className="form-grid">
        <Field label="구분">
          <select value={v.type} onChange={(e) => put("type", e.target.value)}>
            <option value="long">장박</option>
            <option value="disabled">사용중지</option>
          </select>
        </Field>
        <Field label="자리">
          <select
            required
            value={v.siteId}
            onChange={(e) => put("siteId", e.target.value)}
          >
            <option value="">자리 선택</option>
            {s.sites
              .filter((x) => !x.archived)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label={v.type === "long" ? "장박자 이름" : "사용중지 사유"}>
          <input
            required
            value={v.name}
            onChange={(e) => put("name", e.target.value)}
          />
        </Field>
        <Field label="연락처">
          <input
            type="tel"
            value={v.phone}
            onChange={(e) => put("phone", e.target.value)}
          />
        </Field>
        <Field label="시작일" hint={dateLabel(v.start)}>
          <input
            required
            type="date"
            value={v.start}
            onChange={(e) => {
              put("start", e.target.value);
              setStartTime(
                e.target.value === today() ? nowLocal().slice(11, 16) : "00:00",
              );
            }}
          />
        </Field>
        {v.type === "disabled" && (
          <Field
            label="시작 시각"
            hint="이미 지난 시간의 실제 이용 기록과 겹치면 등록할 수 없어요."
          >
            <input
              required
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
        )}
        <Field label="종료일" hint={dateLabel(v.end)}>
          <input
            required
            type="date"
            min={validDate(v.start) ? addDays(v.start, 1) : undefined}
            value={v.end}
            onChange={(e) => put("end", e.target.value)}
          />
        </Field>
        <Field label="메모" wide>
          <textarea
            value={v.note}
            onChange={(e) => put("note", e.target.value)}
          />
        </Field>
      </div>
      <div className="form-footer">
        <span>다른 이용 기간과 겹치면 등록되지 않아요.</span>
        <button className="button primary">등록하기</button>
      </div>
    </form>
  );
}

export function SiteForm({
  site,
  mutate,
  close,
}: {
  site?: Site;
  mutate: Mutate;
  close: () => void;
}) {
  const [v, set] = useState<Site>(
    site || { id: uid(), label: "", area: "가", kind: "auto", archived: false },
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await mutate((s) => saveSite(s, v), "자리 정보를 저장했어요."))
          close();
      }}
    >
      <div className="form-grid">
        <Field label="자리 이름">
          <input
            required
            autoFocus
            value={v.label}
            onChange={(e) => set((p) => ({ ...p, label: e.target.value }))}
            placeholder="예: 가1"
          />
        </Field>
        <Field label="동">
          <select
            value={v.area}
            onChange={(e) => set((p) => ({ ...p, area: e.target.value }))}
          >
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="숙박 유형">
          <select
            value={v.kind}
            onChange={(e) =>
              set((p) => ({ ...p, kind: e.target.value as Kind }))
            }
          >
            {Object.entries(KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="세부 유형">
          <input
            value={v.detail || ""}
            maxLength={60}
            onChange={(e) => set((p) => ({ ...p, detail: e.target.value }))}
            placeholder="예: 럭셔리, 골든, 스페셜3, 스파3"
          />
        </Field>
      </div>
      <div className="form-footer">
        <span>실제로 확인한 자리만 등록해 주세요.</span>
        <button className="button primary">자리 저장</button>
      </div>
    </form>
  );
}

export function ImportForm({
  mutate,
  close,
}: {
  mutate: Mutate;
  close: () => void;
}) {
  const [table, setTable] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Mapping | null>(null),
    [source, setSource] = useState("캠핏"),
    [fileName, setFileName] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof importRows> | null>(
    null,
  );
  const preview = useMemo(
    () =>
      mapping ? mapRows(table, mapping, source) : { rows: [], errors: [] },
    [table, mapping, source],
  );
  async function open(file?: File) {
    if (!file) return;
    setError("");
    setLoading(true);
    setTable([]);
    setMapping(null);
    setFileName("");
    try {
      const t = await readTable(file);
      if (t.length < 2) throw new Error("제목 행과 예약 행이 필요해요.");
      setTable(t);
      setMapping(guessMapping(t[0]));
      setFileName(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  if (result)
    return (
      <>
        <div className="import-success">
          <Check size={38} weight="bold" />
          <h3>명단을 가져왔어요</h3>
          <p>
            신규 {result.added}건 · 변경 확인 {result.changed}건 · 동일{" "}
            {result.unchanged}건
          </p>
        </div>
        {result.changed > 0 && (
          <p className="notice blue">
            취소·날짜 변경은 ‘예약 명단’에서 확인 후 반영해 주세요. 기존 배정은
            유지했어요.
          </p>
        )}
        {result.warnings.map((warning, i) => (
          <p className="notice amber" key={i}>
            {warning}
          </p>
        ))}
        <div className="form-footer">
          <span />
          <button className="button primary" onClick={close}>
            완료
          </button>
        </div>
      </>
    );
  return (
    <form onSubmit={noopSubmit}>
      <p className="muted">
        파일의 열을 연결하고 내용을 확인해 주세요. 한 자리는 한 행으로, 여러
        자리 예약은 단위번호로 구분해요.
      </p>
      <Field label="예약 경로">
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option>캠핏</option>
          <option>네이버</option>
          <option>직접 가져오기</option>
        </select>
      </Field>
      <label className={`upload-zone ${loading ? "loading" : ""}`}>
        <UploadSimple size={30} />
        <strong>
          {loading
            ? "파일을 읽고 있어요…"
            : fileName || "명단 파일을 선택해 주세요"}
        </strong>
        <span>CSV (UTF-8) 또는 XLSX · 최대 8MB · 첫 번째 시트</span>
        <input
          type="file"
          accept=".csv,.xlsx"
          disabled={loading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void open(file);
          }}
        />
      </label>
      <ErrorBox message={error} />
      {mapping && (
        <>
          <div className="mapping-grid">
            {Object.entries(FIELDS).map(([key, label]) => (
              <Field
                key={key}
                label={`${label}${["externalId", "name", "arrival", "departure", "kind"].includes(key) ? " *" : ""}`}
              >
                <select
                  value={mapping[key as keyof Mapping]}
                  onChange={(e) =>
                    setMapping((p) => ({
                      ...p!,
                      [key]: Number(e.target.value),
                    }))
                  }
                >
                  <option value="-1">연결 안 함</option>
                  {table[0].map((h, i) => (
                    <option value={i} key={i}>
                      {h || `${i + 1}열`}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <h4>가져오기 미리보기 · {preview.rows.length}건</h4>
          {preview.errors.length > 0 && (
            <ErrorBox message={preview.errors.slice(0, 5).join("\n")} />
          )}
          <div className="table-wrap import-preview">
            <table>
              <thead>
                <tr>
                  <th>예약번호</th>
                  <th>이름</th>
                  <th>유형</th>
                  <th>이용 기간</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.externalId} / {r.unit}
                    </td>
                    <td>{r.name}</td>
                    <td>{KINDS[r.kind]}</td>
                    <td>
                      {shortDate(r.arrival)} ~ {shortDate(r.departure)}
                    </td>
                    <td>{r.cancelled ? "취소" : "예약"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="helper">
            예약 상태 열을 연결하면 예약·예약 완료·취소·취소 완료를 구분해요.
            상태 열을 연결하지 않으면 모든 행을 예약으로 가져와요.
          </p>
          <p className="helper">
            이름이 같아도 자동으로 합치지 않아요. 다른 경로와의 중복은 가져온 뒤
            확인해 주세요.
          </p>
        </>
      )}
      <div className="form-footer">
        <button
          type="button"
          className="text-button"
          onClick={() =>
            download(
              "\uFEFF예약번호,단위번호,예약자 이름,연락처,입실일,퇴실일,숙박 유형,인원,예약 상태,지정 객실\nEXAMPLE-001,1,체험 손님,010-0000-0000," +
                today() +
                "," +
                addDays(today(), 2) +
                ",오토캠핑,2,예약,\n",
              "소풍-명단양식.csv",
              "text/csv;charset=utf-8",
            )
          }
        >
          <ArrowSquareOut size={17} />
          양식 받기
        </button>
        <button
          type="button"
          className="button primary"
          disabled={
            !preview.rows.length || preview.errors.length > 0 || loading
          }
          onClick={async () => {
            let res: ReturnType<typeof importRows> | null = null;
            let archived: Awaited<ReturnType<typeof archivedFor>>;
            try {
              // 보관된 지난 예약을 새로 만들지 않도록 먼저 찾는다.
              archived = await archivedFor(preview.rows);
            } catch (e) {
              setError((e as Error).message);
              return;
            }
            if (
              await mutate((s) => {
                res = importRows(s, preview.rows, archived);
              }, "명단을 저장했어요.")
            )
              setResult(res);
          }}
        >
          <FileArrowUp size={18} />
          {preview.rows.length}건 가져오기
        </button>
      </div>
    </form>
  );
}

import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, Check } from "@phosphor-icons/react";
import { KINDS, importRows, shortDate, type Kind } from "./domain";
import { FIELDS, readTable, type Mapping } from "./importer";
import { ErrorBox, Field } from "./components";
import type { Mutate } from "./forms";
import { archivedFor } from "./storage";
import {
  CAMFIT_PROGRESS,
  STATUS_CHOICES,
  camfitFile,
  columnValues,
  prepareCamfitProfile,
  previewCamfit,
  sameCamfitHeaders,
  syncRequired,
  type CamfitDownload,
  type CamfitProfile,
  type CamfitStatus,
  type CamfitStage,
} from "./camfitSync";

export function CamfitSyncForm({
  mutate,
  close,
  completed,
}: {
  mutate: Mutate;
  close: () => void;
  completed: () => void;
}) {
  const [table, setTable] = useState<string[][]>([]);
  const [download, setDownload] = useState<CamfitDownload | null>(null);
  const [profile, setProfile] = useState<CamfitProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmationReason, setConfirmationReason] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<CamfitStage>("opening");
  const [result, setResult] = useState<
    (ReturnType<typeof importRows> & { ignored: number }) | null
  >(null);
  const active = useRef(false);
  const committing = useRef(false);

  async function commit(data: string[][], config: CamfitProfile) {
    if (committing.current) return;
    const preview = previewCamfit(data, config);
    if (preview.errors.length) {
      setError(preview.errors.slice(0, 5).join("\n"));
      return;
    }
    if (!config.exportLabel) {
      setError("다음 동기화에 사용할 캠핏 내보내기 버튼을 선택해 주세요.");
      return;
    }
    committing.current = true;
    setLoading(true);
    setStage("saving");
    setError("");
    try {
      // 설정이 잘못되면 예약을 쓰기 전에 차단한다. 저장 실패 시 마지막 동기화 시각은 유지한다.
      await window.camp!.saveCamfitProfile(config);
      if (!active.current) return;
      let imported: ReturnType<typeof importRows> = {
        added: 0,
        changed: 0,
        unchanged: 0,
        warnings: [],
      };
      // 보관된 지난 예약을 새로 만들지 않도록 먼저 찾는다. 보관 파일 문제가 있으면 멈춘다.
      const archived = await archivedFor(preview.rows);
      if (!active.current) return;
      const saved = await mutate((state) => {
        imported = importRows(state, preview.rows, archived);
      }, "캠핏 예약 목록을 동기화했어요.");
      if (!saved) {
        setError(
          "예약 명단을 저장하지 못했어요. 아래 오류를 확인한 후 다시 시도해 주세요.",
        );
        return;
      }
      const next = { ...config, lastSync: new Date().toISOString() };
      try {
        await window.camp!.saveCamfitProfile(next);
      } catch {
        setError("예약은 저장했지만 마지막 동기화 시각을 저장하지 못했어요.");
      }
      setResult({ ...imported, ignored: preview.ignored });
      completed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      committing.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    let waitingForDownload = false;
    let progressTimer: ReturnType<typeof setInterval> | undefined;
    let readingProgress = false;
    active.current = true;
    void (async () => {
      // StrictMode의 초기 정리 후 살아 있는 화면에서만 실제 다운로드를 시작한다.
      await Promise.resolve();
      if (!alive || !window.camp) return;
      setLoading(true);
      setStage("opening");
      setError("");
      try {
        const previous = await window.camp.camfitProfile();
        if (!alive) return;
        waitingForDownload = true;
        const readProgress = async () => {
          if (!window.camp?.camfitProgress || readingProgress) return;
          readingProgress = true;
          try {
            const progress = await window.camp.camfitProgress();
            if (
              alive &&
              waitingForDownload &&
              Object.hasOwn(CAMFIT_PROGRESS, progress.stage)
            )
              setStage(progress.stage);
          } catch {
            // 진행 안내 조회 실패는 실제 파일 수신 작업을 중단하지 않는다.
          } finally {
            readingProgress = false;
          }
        };
        progressTimer = setInterval(() => void readProgress(), 500);
        const received = await window.camp.downloadCampfit();
        waitingForDownload = false;
        clearInterval(progressTimer);
        if (!alive) return;
        setStage("reading");
        const data = await readTable(camfitFile(received));
        if (!alive) return;
        if (!data.length || !data[0].length)
          throw new Error(
            "캠핏 명단에 제목 행이 없어요. 기존 예약은 유지했어요.",
          );
        const config = prepareCamfitProfile(data, received, previous);
        setConfirmationReason(
          previous && received.clickedLabel !== previous.exportLabel
            ? received.clickedLabel
              ? "이전에 연결한 내보내기와 달라요. 파일 내용을 확인한 뒤 연결해 주세요."
              : "어떤 내보내기로 받은 파일인지 확인하지 못했어요. 파일 내용을 확인한 뒤 연결해 주세요."
            : "",
        );
        setTable(data);
        setDownload(received);
        setProfile(config);
        const preview =
          previous && sameCamfitHeaders(data, previous)
            ? previewCamfit(data, previous)
            : null;
        if (
          previous &&
          preview &&
          !preview.errors.length &&
          received.route === previous.route &&
          received.clickedLabel === previous.exportLabel &&
          received.exportLabels.includes(previous.exportLabel)
        ) {
          await commit(data, { ...previous, route: received.route });
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        waitingForDownload = false;
        clearInterval(progressTimer);
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      active.current = false;
      clearInterval(progressTimer);
      if (waitingForDownload)
        void window.camp?.cancelCampfitSync().catch(() => {});
    };
  }, [attempt]);

  if (result)
    return (
      <>
        <div className="import-success">
          <Check size={38} weight="bold" />
          <h3>예약 목록을 동기화했어요</h3>
          <p>
            신규 {result.added}건 · 변경 확인 {result.changed}건 · 동일{" "}
            {result.unchanged}건
          </p>
          {result.ignored > 0 && <p>설정에 따라 제외 {result.ignored}건</p>}
        </div>
        {result.changed > 0 && (
          <p className="notice blue">
            취소·날짜 변경은 ‘예약 명단’에서 확인 후 반영해 주세요. 확인 전에는
            기존 배정을 유지해요.
          </p>
        )}
        {result.warnings.map((warning, index) => (
          <p className="notice amber" key={index}>
            {warning}
          </p>
        ))}
        <ErrorBox message={error} />
        <div className="form-footer">
          <span />
          <button className="button primary" onClick={close}>
            완료
          </button>
        </div>
      </>
    );

  if (!profile || !download)
    return (
      <div className="camfit-waiting">
        <ArrowClockwise size={32} className={loading ? "sync-spinning" : ""} />
        <h3 role="status" aria-live="polite">
          {loading ? CAMFIT_PROGRESS[stage] : "동기화를 마치지 못했어요"}
        </h3>
        <p>
          캠핏 창에서 로그인하면 예약 목록과 내보내기 버튼을 찾아 명단을 받아요.
          화면을 구별하기 어려우면 예약 목록을 열거나 원하는 내보내기 버튼을
          직접 눌러 주세요.
        </p>
        <p className="helper">
          처음 받은 파일은 열·상품·예약 상태를 한 번 확인해요. 연결 후 같은
          형식은 자동으로 반영하며, 저장을 마친 뒤 완료를 안내해요.
        </p>
        <ErrorBox message={error} />
        <div className="form-footer">
          {loading ? (
            <button
              className="button secondary"
              onClick={() =>
                void window.camp
                  ?.openCampfit()
                  .catch((e) => setError(e.message))
              }
            >
              캠핏 창 보기
            </button>
          ) : (
            <button
              className="button primary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              다시 연결
            </button>
          )}
          <button className="button secondary" onClick={close}>
            {loading ? "동기화 중단" : "닫기"}
          </button>
        </div>
      </div>
    );

  const preview = previewCamfit(table, profile);
  const valuesForKind = columnValues(table, profile.mapping.kind);
  const valuesForStatus = columnValues(table, profile.mapping.status);
  const changeMapping = (field: keyof Mapping, value: number) => {
    setProfile((p) => ({ ...p!, mapping: { ...p!.mapping, [field]: value } }));
    setError("");
  };
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      {confirmationReason && (
        <p className="notice amber">{confirmationReason}</p>
      )}
      <p className="notice blue">
        첫 명단의 열과 상품·예약 상태를 확인해 주세요. 한 번 연결하면 같은
        형식의 명단은 바로 동기화해요.
      </p>
      <p className="helper">
        {download.fileName} · {table.length - 1}행. 캠핏 예약 목록의 조회 조건에
        해당하는 예약만 가져와요. 목록에 없는 기존 예약은 삭제하지 않아요.
      </p>
      <Field label="캠핏 내보내기 버튼">
        <select
          value={profile.exportLabel}
          onChange={(e) =>
            setProfile((p) => ({ ...p!, exportLabel: e.target.value }))
          }
        >
          <option value="">버튼 선택</option>
          {download.exportLabels.map((label) => (
            <option value={label} key={label}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {!download.exportLabels.length && (
        <p className="notice amber">
          내보내기 버튼을 확인하지 못했어요. 캠핏 예약 목록에서 CSV·XLSX
          다운로드 버튼이 보이는지 확인해 주세요.
        </p>
      )}
      <div className="mapping-grid">
        {Object.entries(FIELDS).map(([key, label]) => (
          <Field
            key={key}
            label={`${label}${syncRequired.includes(key as (typeof syncRequired)[number]) ? " *" : ""}`}
          >
            <select
              value={profile.mapping[key as keyof Mapping]}
              onChange={(e) =>
                changeMapping(key as keyof Mapping, Number(e.target.value))
              }
            >
              <option value="-1">연결 안 함</option>
              {table[0].map((header, index) => (
                <option key={index} value={index}>
                  {header || `${index + 1}열`}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      {valuesForKind.length > 0 && (
        <>
          <h4>캠핏 상품의 숙박 유형</h4>
          <p className="helper">
            온라인 선착순 번호는 실제 자리 번호로 바꾸지 않아요. 지정 객실 열은
            실제 객실 이름일 때만 연결해 주세요.
          </p>
          <div className="mapping-grid">
            {valuesForKind.slice(0, 500).map((value) => (
              <Field key={value} label={`숙박 유형 · ${value || "빈 값"}`}>
                <select
                  value={
                    Object.prototype.hasOwnProperty.call(profile.kinds, value)
                      ? profile.kinds[value]
                      : ""
                  }
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p!,
                      kinds: { ...p!.kinds, [value]: e.target.value as Kind },
                    }))
                  }
                >
                  <option value="">유형 선택</option>
                  {Object.entries(KINDS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </>
      )}
      {valuesForStatus.length > 0 && (
        <>
          <h4>캠핏의 예약 상태</h4>
          <div className="mapping-grid">
            {valuesForStatus.slice(0, 500).map((value) => (
              <Field key={value} label={`예약 상태 · ${value || "빈 값"}`}>
                <select
                  value={
                    Object.prototype.hasOwnProperty.call(
                      profile.statuses,
                      value,
                    )
                      ? profile.statuses[value]
                      : ""
                  }
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p!,
                      statuses: {
                        ...p!.statuses,
                        [value]: e.target.value as CamfitStatus,
                      },
                    }))
                  }
                >
                  <option value="">처리 선택</option>
                  {Object.entries(STATUS_CHOICES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </>
      )}
      <h4>동기화 미리보기 · {preview.rows.length}건</h4>
      <ErrorBox message={error || preview.errors.slice(0, 5).join("\n")} />
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
            {preview.rows.slice(0, 8).map((row, index) => (
              <tr key={index}>
                <td>
                  {row.externalId} / {row.unit}
                </td>
                <td>{row.name}</td>
                <td>{KINDS[row.kind]}</td>
                <td>
                  {shortDate(row.arrival)} ~ {shortDate(row.departure)}
                </td>
                <td>{row.cancelled ? "취소" : "예약"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-footer">
        <button className="button secondary" disabled={loading} onClick={close}>
          돌아가기
        </button>
        <button
          className="button primary"
          disabled={
            loading ||
            !!preview.errors.length ||
            !profile.exportLabel ||
            table.length < 2
          }
          onClick={() => void commit(table, profile)}
        >
          <ArrowClockwise size={18} />
          {loading ? "저장 중…" : "연결하고 동기화"}
        </button>
      </div>
    </form>
  );
}

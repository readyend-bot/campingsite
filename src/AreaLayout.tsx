import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUUpLeft,
  GridFour,
  MapPin,
  MapTrifold,
} from "@phosphor-icons/react";
import {
  AREAS,
  KINDS,
  saveAreaLayout,
  saveFacilityLayout,
  siteKindLabel,
  type Facility,
  siteStatus,
  today,
  type LayoutChange,
  type LayoutPoint,
  type Site,
  type State,
} from "./domain";
import { Empty, ErrorBox, Field } from "./components";
import type { Mutate } from "./forms";
import {
  FacilityLayer,
  FacilitySymbol,
  PlanViewport,
  PlanStairLayer,
  planCanvasStyle,
  PlanApproachLayer,
} from "./PlanFeatures";
import { AREA_CANVAS, SOPUNG_PLAN_ID } from "./sitePlan";
type EditableItem = Site | Facility;

const samePoint = (a?: LayoutPoint, b?: LayoutPoint) =>
  a?.x === b?.x && a?.y === b?.y;
const clamp = (value: number) =>
  Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
const canvasStyle = (count: number, minimum: number): CSSProperties =>
  ({
    "--layout-min-width": `${Math.max(minimum, Math.ceil(Math.sqrt(count * 1.6)) * 106 + 108)}px`,
  }) as CSSProperties;

export function AreaDiagram({
  area,
  sites,
  tile,
  facilities = [],
  profile,
}: {
  area: string;
  sites: Site[];
  tile: (site: Site) => ReactNode;
  facilities?: Facility[];
  profile?: { width: number; height: number };
}) {
  const placed = sites.filter((site) => site.layout);
  const unplaced = sites.filter((site) => !site.layout);
  if (!placed.length && !facilities.length)
    return <div className="site-grid">{sites.map(tile)}</div>;
  return (
    <>
      <PlanViewport profile={profile}>
        <div
          className={`area-layout-canvas${profile ? " has-site-plan" : ""}`}
          style={
            profile ? planCanvasStyle(profile) : canvasStyle(sites.length, 560)
          }
          role="group"
          aria-label={`${area}동 배치도`}
        >
          <div className="area-layout-stage">
            <PlanApproachLayer facilities={facilities} />
            <FacilityLayer facilities={facilities} />
            {profile && <PlanStairLayer area={area} sites={sites} />}
            {placed.map((site) => (
              <div
                key={site.id}
                className="area-layout-marker"
                data-site-id={site.id}
                style={{
                  left: `${site.layout!.x}%`,
                  top: `${site.layout!.y}%`,
                }}
              >
                {tile(site)}
              </div>
            ))}
          </div>
        </div>
      </PlanViewport>
      {!!unplaced.length && (
        <div className="area-layout-unplaced">
          <p>위치 미지정 · {unplaced.length}개</p>
          <div className="site-grid">{unplaced.map(tile)}</div>
        </div>
      )}
    </>
  );
}

interface EditRecord {
  before: LayoutChange[];
  after: LayoutChange[];
}
interface Drag {
  siteId: string;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  fromTray: boolean;
  moved: boolean;
  position?: LayoutPoint;
}

export function AreaLayoutEditor({
  s,
  area,
  onArea,
  mutate,
  busy,
}: {
  s: State;
  area: string;
  onArea: (area: string) => void;
  mutate: Mutate;
  busy: boolean;
}) {
  const siteItems = s.sites.filter(
    (site) => !site.archived && site.area === area,
  );
  const facilityItems = (s.facilities || []).filter(
    (item) => item.area === area,
  );
  const [target, setTarget] = useState<"sites" | "facilities">("sites");
  const sites: EditableItem[] = target === "sites" ? siteItems : facilityItems;
  const profile = s.sitePlan === SOPUNG_PLAN_ID ? AREA_CANVAS[area] : undefined;
  const historyKey = `${area}:${target}`;
  const itemLabel = target === "sites" ? "사이트" : "시설";
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<{
    siteId: string;
    position: LayoutPoint;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Record<string, EditRecord[]>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const savingRef = useRef(false);
  const suppressClick = useRef(false);
  const active = sites.find((site) => site.id === selected);
  const disabled = busy || saving;
  const records = history[historyKey] || [];

  useEffect(() => {
    if (!sites.some((site) => site.id === selected))
      setSelected(sites[0]?.id || "");
    dragRef.current = null;
    setPreview(null);
    setError("");
  }, [area, target, sites.map((site) => site.id).join("|")]);

  async function commit(changes: LayoutChange[], undo = false) {
    if (disabled || savingRef.current) {
      setPreview(null);
      setError("저장 중이에요. 잠시 후 다시 위치를 옮겨 주세요.");
      return;
    }
    setError("");
    const changed = changes.filter(
      (change) =>
        !samePoint(
          sites.find((site) => site.id === change.siteId)?.layout,
          change.position,
        ),
    );
    if (!changed.length) {
      setPreview(null);
      return;
    }
    const before = changed.map((change) => ({
      siteId: change.siteId,
      position: sites.find((site) => site.id === change.siteId)?.layout,
    }));
    savingRef.current = true;
    setSaving(true);
    try {
      const ok = await mutate(
        (draft) => {
          if (undo) {
            const expected = records[records.length - 1]?.after || [];
            if (
              expected.some(
                (change) =>
                  !samePoint(
                    (target === "sites"
                      ? draft.sites
                      : draft.facilities || []
                    ).find((site) => site.id === change.siteId)?.layout,
                    change.position,
                  ),
              )
            )
              throw new Error(
                "자리 정보가 달라졌어요. 현재 배치를 확인한 뒤 다시 수정해 주세요.",
              );
          }
          if (target === "sites") saveAreaLayout(draft, area, changed);
          else
            saveFacilityLayout(
              draft,
              area,
              changed.map(({ siteId, position }) => ({ id: siteId, position })),
            );
        },
        undo ? `${area}동 배치를 되돌렸어요.` : `${area}동 배치를 저장했어요.`,
      );
      if (ok)
        setHistory((previous) => ({
          ...previous,
          [historyKey]: undo
            ? (previous[historyKey] || []).slice(0, -1)
            : [
                ...(previous[historyKey] || []),
                { before, after: changed },
              ].slice(-30),
        }));
      else
        setError(
          "배치를 저장하지 못했어요. 이전 위치를 유지했으니 다시 시도해 주세요.",
        );
    } finally {
      setPreview(null);
      savingRef.current = false;
      setSaving(false);
    }
  }

  function positionAt(
    clientX: number,
    clientY: number,
    offsetX = 0,
    offsetY = 0,
  ): LayoutPoint {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: clamp(((clientX - rect.left - offsetX) / rect.width) * 100),
      y: clamp(((clientY - rect.top - offsetY) / rect.height) * 100),
    };
  }
  function startDrag(
    event: PointerEvent<HTMLButtonElement>,
    site: EditableItem,
  ) {
    if (
      disabled ||
      savingRef.current ||
      event.button !== 0 ||
      !stageRef.current
    )
      return;
    setSelected(site.id);
    const rect = stageRef.current.getBoundingClientRect();
    dragRef.current = {
      siteId: site.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: site.layout
        ? event.clientX - (rect.left + (rect.width * site.layout.x) / 100)
        : 0,
      offsetY: site.layout
        ? event.clientY - (rect.top + (rect.height * site.layout.y) / 100)
        : 0,
      fromTray: !site.layout,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4
    )
      return;
    drag.moved = true;
    drag.position = positionAt(
      event.clientX,
      event.clientY,
      drag.offsetX,
      drag.offsetY,
    );
    setPreview({ siteId: drag.siteId, position: drag.position });
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) return;
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const rect = canvasRef.current!.getBoundingClientRect();
    if (
      drag.fromTray &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    ) {
      setPreview(null);
      return;
    }
    void commit([
      {
        siteId: drag.siteId,
        position: positionAt(
          event.clientX,
          event.clientY,
          drag.offsetX,
          drag.offsetY,
        ),
      },
    ]);
  }
  function nudge(dx: number, dy: number, site = active) {
    if (!site?.layout) return;
    void commit([
      {
        siteId: site.id,
        position: {
          x: clamp(site.layout.x + dx),
          y: clamp(site.layout.y + dy),
        },
      },
    ]);
  }
  function marker(site: EditableItem, fromTray = false) {
    const status =
      "kind" in site
        ? siteStatus(s, site.id, today())
        : { type: "facility", label: "시설" };
    return (
      <button
        type="button"
        key={site.id}
        className={`site-tile layout-edit-site ${status.type}${selected === site.id ? " is-selected" : ""}${preview?.siteId === site.id ? " is-dragging" : ""}`}
        data-site-id={site.id}
        aria-label={`${site.label} 위치 ${fromTray ? "지정" : "이동"}`}
        aria-pressed={selected === site.id}
        disabled={disabled}
        onPointerDown={(event) => startDrag(event, site)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          dragRef.current = null;
          setPreview(null);
        }}
        onLostPointerCapture={() => {
          if (dragRef.current) {
            dragRef.current = null;
            setPreview(null);
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
          setSelected(site.id);
        }}
        onKeyDown={(event) => {
          const steps: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          if (steps[event.key]) {
            event.preventDefault();
            const [dx, dy] = steps[event.key];
            nudge(
              dx * (event.shiftKey ? 5 : 1),
              dy * (event.shiftKey ? 5 : 1),
              site,
            );
          }
        }}
      >
        {!("kind" in site) && <FacilitySymbol type={site.type} size={16} />}
        <strong>
          {profile && "kind" in site && site.kind === "caravan"
            ? site.label.replace("카라반 ", "") + "호"
            : site.label}
        </strong>
        {"kind" in site && site.kind !== "auto" && (
          <small className="site-type-label">
            {site.detail || KINDS[site.kind]}
          </small>
        )}
        <span>{status.label}</span>
      </button>
    );
  }
  const placed = sites.filter(
    (site) => site.layout || preview?.siteId === site.id,
  );
  const unplaced = sites.filter((site) => !site.layout);
  return (
    <section className="panel area-layout-editor">
      <div className="layout-editor-heading">
        <div>
          <h2>동별 배치 수정</h2>
          <p>
            사이트를 실제 위치로 옮겨 주세요. 바꾼 위치는 자동으로 저장돼요.
          </p>
        </div>
        <span className="layout-save-state" role="status">
          {disabled ? "저장 중…" : "위치 자동 저장"}
        </span>
      </div>
      <div className="area-tabs" aria-label="배치를 수정할 동">
        {AREAS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={area === value}
            className={area === value ? "active" : ""}
            disabled={disabled || !!preview}
            onClick={() => onArea(value)}
          >
            {value}동
          </button>
        ))}
      </div>
      <div className="layout-target-tabs segmented" aria-label="위치 편집 대상">
        <button
          type="button"
          className={target === "sites" ? "active" : ""}
          aria-pressed={target === "sites"}
          disabled={disabled || !!preview}
          onClick={() => setTarget("sites")}
        >
          사이트 위치
        </button>
        <button
          type="button"
          className={target === "facilities" ? "active" : ""}
          aria-pressed={target === "facilities"}
          disabled={disabled || !!preview}
          onClick={() => setTarget("facilities")}
        >
          시설 위치
        </button>
      </div>
      {!sites.length ? (
        <Empty
          icon={<MapTrifold size={36} />}
          title={`${area}동에 등록된 ${target === "sites" ? "자리가" : "시설이"} 없어요`}
          description={
            target === "sites"
              ? "위의 자리 추가 버튼으로 실제 운영 중인 사이트를 등록해 주세요."
              : "도면 배치를 적용하면 사진에서 확인한 시설이 표시돼요."
          }
        />
      ) : (
        <>
          <div className="layout-editor-controls">
            <Field label={`이동할 ${itemLabel}`}>
              <select
                value={selected}
                disabled={disabled}
                onChange={(event) => setSelected(event.target.value)}
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.label}
                    {"kind" in site ? ` · ${siteKindLabel(site)}` : " · 시설"}
                    {site.layout ? "" : " · 위치 미지정"}
                  </option>
                ))}
              </select>
            </Field>
            <div
              className="layout-nudge"
              role="group"
              aria-label="선택 항목 미세 이동"
            >
              {[
                { Icon: ArrowLeft, label: "왼쪽으로 이동", dx: -1, dy: 0 },
                { Icon: ArrowUp, label: "위로 이동", dx: 0, dy: -1 },
                { Icon: ArrowDown, label: "아래로 이동", dx: 0, dy: 1 },
                { Icon: ArrowRight, label: "오른쪽으로 이동", dx: 1, dy: 0 },
              ].map(({ Icon, label, dx, dy }) => (
                <button
                  key={label}
                  type="button"
                  className="icon-button"
                  aria-label={label}
                  title={label}
                  disabled={disabled || !active?.layout}
                  onClick={() => nudge(dx, dy)}
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
            <div className="layout-editor-actions">
              {!active?.layout && (
                <button
                  type="button"
                  className="button secondary small"
                  disabled={disabled || !active}
                  onClick={() =>
                    active &&
                    void commit([
                      { siteId: active.id, position: { x: 50, y: 50 } },
                    ])
                  }
                >
                  <MapPin size={17} />
                  가운데 놓기
                </button>
              )}
              <button
                type="button"
                className="button secondary small"
                disabled={disabled || !records.length}
                onClick={() =>
                  void commit(records[records.length - 1].before, true)
                }
              >
                <ArrowUUpLeft size={17} />
                되돌리기
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={disabled}
                onClick={() => {
                  const columns = Math.ceil(Math.sqrt(sites.length * 1.6)),
                    rows = Math.ceil(sites.length / columns);
                  void commit(
                    sites.map((site, index) => ({
                      siteId: site.id,
                      position: {
                        x: (((index % columns) + 0.5) / columns) * 100,
                        y: ((Math.floor(index / columns) + 0.5) / rows) * 100,
                      },
                    })),
                  );
                }}
              >
                <GridFour size={17} />
                격자로 정렬
              </button>
              <button
                type="button"
                className="text-button"
                disabled={disabled || !active?.layout}
                onClick={() => active && void commit([{ siteId: active.id }])}
              >
                선택 위치 해제
              </button>
            </div>
          </div>
          <ErrorBox message={error} />
          <div className="layout-editor-workspace">
            <div className="layout-site-tray">
              <div>
                <strong>
                  위치 미지정 <span>{unplaced.length}</span>
                </strong>
                <p>
                  {unplaced.length
                    ? "끌어 놓거나 선택 후 배치도의 원하는 위치를 눌러 주세요."
                    : `모든 ${itemLabel}의 위치를 지정했어요. 배치도에서 다시 옮길 수 있어요.`}
                </p>
              </div>
              <div className="layout-tray-sites">
                {unplaced.map((site) => marker(site, true))}
              </div>
            </div>
            <div className="layout-canvas-column">
              <div className="layout-canvas-heading">
                <h3>
                  {area}동{" "}
                  <span>
                    {sites.length}
                    {target === "sites" ? "자리" : "개 시설"}
                  </span>
                </h3>
                <span>끌어서 이동 · 방향키로 미세 조정</span>
              </div>
              <PlanViewport profile={profile} initialFit={false}>
                <div
                  ref={canvasRef}
                  className={`area-layout-canvas is-editing${profile ? " has-site-plan" : ""}${preview ? " is-dragging" : ""}`}
                  style={
                    profile
                      ? planCanvasStyle(profile)
                      : canvasStyle(sites.length, 700)
                  }
                  role="group"
                  aria-label={`${area}동 위치 편집`}
                  onClick={(event) => {
                    if (
                      !selected ||
                      disabled ||
                      suppressClick.current ||
                      (event.target as HTMLElement).closest("button")
                    )
                      return;
                    void commit([
                      {
                        siteId: selected,
                        position: positionAt(event.clientX, event.clientY),
                      },
                    ]);
                  }}
                >
                  {!placed.length && (
                    <div className="layout-canvas-empty">
                      <MapPin size={34} />
                      <strong>실제 위치에 사이트를 놓아 주세요</strong>
                      <span>
                        처음에는 ‘격자로 정렬’을 누른 뒤 옮겨도 좋아요.
                      </span>
                    </div>
                  )}
                  <div ref={stageRef} className="area-layout-stage">
                    <PlanApproachLayer facilities={facilityItems} />
                    {profile && (
                      <PlanStairLayer area={area} sites={siteItems} />
                    )}
                    {target === "sites" ? (
                      <FacilityLayer facilities={facilityItems} />
                    ) : (
                      siteItems
                        .filter((site) => site.layout)
                        .map((site) => (
                          <div
                            key={site.id}
                            className="area-layout-marker layout-context-site"
                            style={{
                              left: `${site.layout!.x}%`,
                              top: `${site.layout!.y}%`,
                            }}
                          >
                            <div
                              className={`site-tile ${siteStatus(s, site.id, today()).type}`}
                            >
                              <strong>{site.label}</strong>
                            </div>
                          </div>
                        ))
                    )}
                    {placed.map((site) => {
                      const position =
                        preview?.siteId === site.id
                          ? preview.position
                          : site.layout!;
                      return (
                        <div
                          key={site.id}
                          className={`area-layout-marker${selected === site.id ? " is-selected" : ""}`}
                          style={{
                            left: `${position.x}%`,
                            top: `${position.y}%`,
                          }}
                        >
                          {site.layout ? (
                            marker(site)
                          ) : (
                            <div className="layout-drag-preview">
                              <strong>{site.label}</strong>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </PlanViewport>
            </div>
          </div>
          <p className="layout-editor-help">
            저장한 위치는 자리 배정 화면과 인쇄에 함께 반영돼요. 위치를 옮겨도
            손님의 자리 배정은 그대로 유지돼요.
          </p>
        </>
      )}
    </section>
  );
}

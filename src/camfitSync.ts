import { KINDS, type Kind } from "./domain";
import {
  FIELDS,
  guessMapping,
  mappingErrors,
  mapRows,
  type Mapping,
} from "./importer";

export type CamfitStatus = "reserved" | "cancelled" | "ignore";
export interface CamfitProfile {
  version: 1;
  route: string;
  exportLabel: string;
  headers: string[];
  mapping: Mapping;
  kinds: Record<string, Kind>;
  statuses: Record<string, CamfitStatus>;
  lastSync: string;
}
export interface CamfitDownload {
  fileName: string;
  base64: string;
  route: string;
  exportLabels: string[];
  clickedLabel: string;
}
export const syncRequired = [
  "externalId",
  "name",
  "arrival",
  "departure",
  "kind",
  "status",
] as const;
export const STATUS_CHOICES = {
  reserved: "예약으로 가져오기",
  cancelled: "취소로 가져오기",
  ignore: "가져오지 않기",
} as const;

export function columnValues(table: string[][], index: number) {
  if (index < 0) return [];
  return [
    ...new Set(
      table
        .slice(1)
        .filter((row) => row.some((cell) => cell.trim()))
        .map((row) => (row[index] || "").trim()),
    ),
  ];
}
export function prepareCamfitProfile(
  table: string[][],
  download: CamfitDownload,
  previous: CamfitProfile | null,
): CamfitProfile {
  const headers = table[0] || [];
  const mapping = previous
    ? (Object.fromEntries(
        Object.keys(FIELDS).map((key) => {
          const old = previous.headers[previous.mapping[key as keyof Mapping]];
          return [
            key,
            old !== undefined && headers.filter((h) => h === old).length === 1
              ? headers.indexOf(old)
              : -1,
          ];
        }),
      ) as Mapping)
    : guessMapping(headers);
  const kinds: Record<string, Kind> = Object.assign(
    Object.create(null),
    Object.fromEntries(
      (Object.keys(KINDS) as Kind[]).flatMap((kind) => [
        [kind, kind],
        [KINDS[kind], kind],
      ]),
    ),
    previous?.kinds,
  );
  const statuses: Record<string, CamfitStatus> = Object.assign(
    Object.create(null),
    Object.fromEntries(
      ["예약", "예약완료", "예약 완료", "reserved", "confirmed"].map(
        (status) => [status, "reserved"],
      ),
    ),
    Object.fromEntries(
      ["취소", "취소완료", "취소 완료", "cancelled", "canceled"].map(
        (status) => [status, "cancelled"],
      ),
    ),
    previous?.statuses,
  );
  for (const value of columnValues(table, mapping.kind)) {
    if (Object.prototype.hasOwnProperty.call(kinds, value)) continue;
    const kind = (Object.keys(KINDS) as Kind[]).find(
      (k) => k === value || KINDS[k] === value,
    );
    if (kind) kinds[value] = kind;
  }
  for (const value of columnValues(table, mapping.status)) {
    if (Object.prototype.hasOwnProperty.call(statuses, value)) continue;
    if (
      ["예약", "예약완료", "예약 완료", "reserved", "confirmed"].includes(
        value.toLowerCase(),
      )
    )
      statuses[value] = "reserved";
    if (
      ["취소", "취소완료", "취소 완료", "cancelled", "canceled"].includes(
        value.toLowerCase(),
      )
    )
      statuses[value] = "cancelled";
  }
  return {
    version: 1,
    route: download.route,
    exportLabel:
      download.clickedLabel ||
      (previous && download.exportLabels.includes(previous.exportLabel)
        ? previous.exportLabel
        : download.exportLabels.length === 1
          ? download.exportLabels[0]
          : ""),
    headers,
    mapping,
    kinds,
    statuses,
    lastSync: previous?.lastSync || "",
  };
}
export function sameCamfitHeaders(table: string[][], profile: CamfitProfile) {
  return JSON.stringify(table[0]) === JSON.stringify(profile.headers);
}
export function previewCamfit(table: string[][], profile: CamfitProfile) {
  const errors: string[] = [];
  if (!sameCamfitHeaders(table, profile))
    return {
      rows: [],
      errors: ["명단의 열이 달라졌어요. 열 연결을 다시 확인해 주세요."],
      ignored: 0,
    };
  if (table.length > 5001 || profile.headers.length > 100)
    return {
      rows: [],
      errors: ["한 번에 5,000행·100열까지 가져올 수 있어요."],
      ignored: 0,
    };
  errors.push(
    ...mappingErrors(profile.mapping, profile.headers.length, syncRequired),
  );
  if (errors.length) return { rows: [], errors, ignored: 0 };
  if (
    columnValues(table, profile.mapping.kind).length > 500 ||
    columnValues(table, profile.mapping.status).length > 500
  )
    return {
      rows: [],
      errors: [
        "숙박 유형 또는 예약 상태 열을 확인해 주세요. 서로 다른 값이 500개를 넘었어요.",
      ],
      ignored: 0,
    };
  const normalized = [table[0]];
  const lineNumbers = [1];
  let ignored = 0;
  table.slice(1).forEach((row, index) => {
    if (!row.some((cell) => cell.trim())) return;
    const rawStatus = (row[profile.mapping.status] || "").trim();
    const status = Object.prototype.hasOwnProperty.call(
      profile.statuses,
      rawStatus,
    )
      ? profile.statuses[rawStatus]
      : undefined;
    if (!status) {
      errors.push(
        `${index + 2}행: '${rawStatus || "빈 값"}'의 예약 상태를 선택해 주세요.`,
      );
      return;
    }
    if (status === "ignore") {
      ignored++;
      return;
    }
    const rawKind = (row[profile.mapping.kind] || "").trim();
    const kind = Object.prototype.hasOwnProperty.call(profile.kinds, rawKind)
      ? profile.kinds[rawKind]
      : undefined;
    if (!kind) {
      errors.push(
        `${index + 2}행: '${rawKind || "빈 값"}'의 숙박 유형을 선택해 주세요.`,
      );
      return;
    }
    const cells = [...row];
    cells[profile.mapping.kind] = kind;
    cells[profile.mapping.status] = status === "cancelled" ? "취소" : "예약";
    normalized.push(cells);
    lineNumbers.push(index + 2);
  });
  const result = mapRows(normalized, profile.mapping, "캠핏");
  errors.push(
    ...result.errors.map((error) =>
      error.replace(
        /^(\d+)행:/,
        (_match, line) => `${lineNumbers[Number(line) - 1]}행:`,
      ),
    ),
  );
  return { rows: result.rows, errors, ignored };
}

export function camfitFile(download: CamfitDownload) {
  if (
    !/\.(?:csv|xlsx)$/i.test(download.fileName) ||
    download.base64.length > Math.ceil((8 * 1024 * 1024) / 3) * 4
  )
    throw new Error("8MB 이하의 CSV·XLSX 명단이 필요해요.");
  const bytes = Uint8Array.from(atob(download.base64), (char) =>
    char.charCodeAt(0),
  );
  return new File([bytes], download.fileName);
}

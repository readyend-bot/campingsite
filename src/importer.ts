import { KINDS, validDate, type ImportRow, type Kind } from "./domain";
export const FIELDS = {
  externalId: "예약번호",
  unit: "단위번호",
  name: "예약자 이름",
  phone: "연락처",
  arrival: "입실일",
  departure: "퇴실일",
  kind: "숙박 유형",
  people: "인원",
  status: "예약 상태",
  siteLabel: "지정 객실",
} as const;
export type Mapping = Record<keyof typeof FIELDS, number>;
const requiredFields = [
  "externalId",
  "name",
  "arrival",
  "departure",
  "kind",
] as const;
export function mappingErrors(
  mapping: Mapping,
  columns: number,
  required: readonly (keyof Mapping)[] = requiredFields,
) {
  const errors: string[] = [];
  const connected: number[] = [];
  for (const field of Object.keys(FIELDS) as (keyof Mapping)[]) {
    const index = mapping[field];
    if (
      !Number.isInteger(index) ||
      index < -1 ||
      index >= columns ||
      (index === -1 && required.includes(field))
    )
      errors.push(`${FIELDS[field]} 열을 연결해 주세요.`);
    if (Number.isInteger(index) && index >= 0 && index < columns)
      connected.push(index);
  }
  if (new Set(connected).size < connected.length)
    errors.push(
      "각 항목은 서로 다른 열에 연결해 주세요. 같은 열이 중복 연결되었어요.",
    );
  return errors;
}
const aliases: Record<keyof Mapping, string[]> = {
  externalId: ["예약번호", "예약id", "예약코드"],
  unit: ["단위번호", "배정단위"],
  name: ["예약자이름", "예약자", "이름", "성함"],
  phone: ["연락처", "전화번호", "휴대폰번호"],
  arrival: ["입실일", "체크인", "입실날짜"],
  departure: ["퇴실일", "체크아웃", "퇴실날짜"],
  kind: ["숙박유형", "유형"],
  people: ["인원", "인원수"],
  status: ["예약상태", "상태"],
  siteLabel: ["지정객실", "객실번호", "호수"],
};
export function guessMapping(headers: string[]): Mapping {
  return Object.fromEntries(
    Object.keys(FIELDS).map((k) => [
      k,
      headers.findIndex((h) =>
        aliases[k as keyof Mapping].includes(
          h.replace(/\s/g, "").toLowerCase(),
        ),
      ),
    ]),
  ) as Mapping;
}
export function parseCSV(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted)
    throw new Error("CSV의 따옴표가 닫히지 않았어요. 파일을 확인해 주세요.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export async function readTable(file: File): Promise<string[][]> {
  if (file.size > 8 * 1024 * 1024)
    throw new Error("8MB 이하의 명단 파일을 선택해 주세요.");
  if (/\.csv$/i.test(file.name)) {
    const bytes = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(
        "CSV는 UTF-8 형식으로 저장해 주세요. XLSX 파일로도 가져올 수 있어요.",
      );
    }
    const rows = parseCSV(text);
    if (rows.length > 5001 || rows.some((row) => row.length > 100))
      throw new Error("한 번에 5,000행·100열까지 가져올 수 있어요.");
    return rows;
  }
  if (!/\.xlsx$/i.test(file.name))
    throw new Error(
      "CSV 또는 XLSX 파일을 선택해 주세요. XLS 파일은 XLSX로 다시 저장해 주세요.",
    );
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file, 1);
  if (!rows.length) throw new Error("첫 번째 시트에 명단이 없어요.");
  if (rows.length > 5001 || rows.some((row) => row.length > 100))
    throw new Error("한 번에 5,000행·100열까지 가져올 수 있어요.");
  return rows.map((row) =>
    row.map((cell) =>
      cell instanceof Date
        ? cell.toISOString().slice(0, 10)
        : String(cell ?? ""),
    ),
  );
}
function normalizeDate(text: string) {
  const m = text
    .trim()
    .match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})(?:\.?|[ T].*)$/);
  return m
    ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
    : text.trim();
}
export function mapRows(
  table: string[][],
  mapping: Mapping,
  source: string,
): { rows: ImportRow[]; errors: string[] } {
  const rows: ImportRow[] = [],
    errors: string[] = [];
  const keys = new Set<string>();
  if (table.length > 5001)
    return { rows, errors: ["한 번에 5,000행까지 가져올 수 있어요."] };
  if (table.some((cells) => cells.length > 100))
    return { rows, errors: ["한 번에 100열까지 가져올 수 있어요."] };
  errors.push(...mappingErrors(mapping, table[0]?.length || 0));
  if (errors.length) return { rows, errors };
  table.slice(1).forEach((cells, index) => {
    if (!cells.some((c) => c.trim())) return;
    const get = (field: keyof Mapping) => (cells[mapping[field]] || "").trim();
    const kind = (Object.keys(KINDS) as Kind[]).find(
      (k) => k === get("kind") || KINDS[k] === get("kind"),
    );
    const arrival = normalizeDate(get("arrival")),
      departure = normalizeDate(get("departure"));
    const people = Number(get("people") || 1);
    const status = get("status").replace(/\s/g, "").toLowerCase();
    const cancelled = ["취소", "취소완료", "cancelled", "canceled"].includes(
      status,
    );
    const reserved = ["예약", "예약완료", "reserved", "confirmed"].includes(
      status,
    );
    const key = JSON.stringify([get("externalId"), get("unit") || "1"]);
    if (!get("externalId") || !get("name"))
      errors.push(`${index + 2}행: 예약번호와 이름이 필요해요.`);
    else if (
      !validDate(arrival) ||
      !validDate(departure) ||
      arrival >= departure
    )
      errors.push(
        `${index + 2}행: 연도가 포함된 입·퇴실 날짜를 확인해 주세요.`,
      );
    else if (!kind)
      errors.push(
        `${index + 2}행: 유형은 오토캠핑·글램핑·카라반·방갈로 중 하나여야 해요.`,
      );
    else if (!Number.isInteger(people) || people < 1)
      errors.push(`${index + 2}행: 인원을 확인해 주세요.`);
    else if (mapping.status >= 0 && !cancelled && !reserved)
      errors.push(
        `${index + 2}행: 예약 상태 '${get("status") || "빈 값"}'를 확인해 주세요. 예약·취소 여부가 명확한 명단이 필요해요.`,
      );
    else if (keys.has(key))
      errors.push(
        `${index + 2}행: 예약번호가 반복돼요. 여러 자리 예약은 단위번호 열로 구분해 주세요.`,
      );
    else {
      keys.add(key);
      rows.push({
        source,
        externalId: get("externalId"),
        unit: get("unit") || "1",
        name: get("name"),
        phone: get("phone"),
        arrival,
        departure,
        kind,
        people,
        cancelled,
        siteLabel: get("siteLabel"),
      });
    }
  });
  return { rows, errors };
}

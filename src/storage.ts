import { demoState } from "./demo";
import {
  validateState,
  type Activity,
  type Allocation,
  type ArchivedMatch,
  type ImportRow,
  type Reservation,
  type State,
} from "./domain";
import type { CamfitProfile, CamfitDownload } from "./camfitSync";
import { bundledInitialState } from "./bundledLayout";
const KEY = "sopung-camp-v1";
export interface DesktopBridge {
  status(): Promise<{
    configured: boolean;
    unlocked: boolean;
    mode: "pin" | "password";
    dataPath: string;
    backupPath: string;
    lastBackup: string;
    backupError?: string;
    dataBytes?: number;
    dataLimit?: number;
    fileProblems?: string[];
  }>;
  setup(secret: string, mode: string): Promise<void>;
  unlock(secret: string): Promise<void>;
  lock(): Promise<void>;
  load(): Promise<State | null>;
  save(state: State): Promise<{ backupError?: string; bytes?: number }>;
  restore(state: State): Promise<{ backupError?: string }>;
  backup(): Promise<string>;
  // 지난 연도 보관(0.1.13). 이전 브리지·시험용 브리지에는 없을 수 있다.
  commitArchive?(
    next: State,
    files: { file: string; text: string }[],
  ): Promise<{ backupError?: string; bytes?: number }>;
  searchArchives?(
    query: string,
    offset?: number,
  ): Promise<{
    total: number;
    offset: number;
    results: ArchiveSearchResult[];
  }>;
  lookupArchives?(pairs: [string, string][]): Promise<ArchivedMatch[]>;
  verifyAttachments?(value: State): Promise<string[]>;
  saveAerial?(dataUrl: string): Promise<string>;
  readAerial?(ref: string): Promise<string>;
  pickBackup?(): Promise<{ value: State; token: string } | null>;
  restoreBackup?(token: string): Promise<{ backupError?: string }>;
  exportBackup?(): Promise<string | null>;
  chooseBackup(): Promise<string | null>;
  openFolder(): Promise<void>;
  openCampfit(): Promise<void>;
  camfitProfile(): Promise<CamfitProfile | null>;
  downloadCampfit(): Promise<CamfitDownload>;
  saveCamfitProfile(profile: CamfitProfile): Promise<void>;
  cancelCampfitSync(): Promise<void>;
  quit(): Promise<void>;
}
export interface ArchiveSearchResult {
  year: number;
  reservation: Reservation;
  allocations: Allocation[];
  activity: Activity[];
}
declare global {
  interface Window {
    camp?: DesktopBridge;
  }
}
export const isDesktop = Boolean(window.camp);
let pendingDesktopLoad: Promise<State> | undefined;
async function loadDesktop(bridge: DesktopBridge) {
  const data = await bridge.load();
  if (data !== null) {
    validateState(data);
    return data;
  }
  // 신규 PC에는 배포 시 포함한 편집 배치를 준비한다.
  // 기존 파일(빈 상태 포함)은 운영자가 편집한 데이터로 유지한다.
  const initial = bundledInitialState();
  validateState(initial);
  await bridge.save(initial);
  return initial;
}
export async function loadState() {
  if (window.camp) {
    // StrictMode의 중복 불러오기에서도 신규 도면은 한 번만 생성·저장한다.
    pendingDesktopLoad ||= loadDesktop(window.camp).finally(() => {
      pendingDesktopLoad = undefined;
    });
    return pendingDesktopLoad;
  }
  const data = JSON.parse(localStorage.getItem(KEY) || "null");
  if (data) {
    validateState(data);
    return data;
  }
  return demoState();
}
export async function saveState(s: State) {
  validateState(s);
  if (window.camp) return await window.camp.save(s);
  else localStorage.setItem(KEY, JSON.stringify(s));
  return {};
}
export function download(
  content: string,
  filename: string,
  type = "application/json",
) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// 가져오기 전에 같은 경로·예약번호의 보관 예약을 찾는다. 보관 파일에 문제가 있으면 오류로 멈춘다.
export async function archivedFor(rows: ImportRow[]) {
  if (!window.camp?.lookupArchives || !rows.length) return [];
  const pairs = [
    ...new Set(rows.map((r) => JSON.stringify([r.source, r.externalId]))),
  ].map((pair) => JSON.parse(pair) as [string, string]);
  return window.camp.lookupArchives(pairs);
}

# 윈도우 8 이상 지원 검토

기술 조사일: 2026-09-28. 구현 상태 갱신: 2026-11-06 · 0.1.15. 단계: **Windows 실제 설치 검증 전**.

## 이번 버전의 구현

0.1.15는 현재 Mac에 저장된 자리·시설 배치를 신규 설치에 포함하고 기존 PC에서 백업 후 같은 배치를 적용하는 설정을 추가했다. 운영 테스트 99개·관련 UI 14개·타입/형식 검사·빌드와 Mac Electron 22 실행 검증을 통과했다. x64·ia32 통합 설치 파일의 두 패키지 제품 파일이 각각 134개 모두 작업본과 일치한다. Electron 22.3.27 / Chromium 108 고정과 Windows 8·8.1·10·11 지원 목표를 유지하며, 이 결과는 Windows 실기기 검증을 대신하지 않는다. [설치 배치·검증 기록](bundled-layout-2026-11-06.md).

2026-10-10 사용자가 Windows 설치와 캠핏 로그인·엑셀 내려받기 후 완료 실패를 보고했다. 해당 PC의 Windows 버전·오류 문구는 미확인이다. 0.1.14는 신규 PC의 확정 도면 자동 준비와 캠핏 일반 다운로드 링크 인식·실패 단계 안내를 수정했다. 테스트 95개·UI 49개·타입/형식/빌드와 Mac Electron 22 검증을 통과하고 Windows x64·ia32 설치 파일을 생성했다. Electron 22.3.27과 Windows 8·8.1·10·11 지원 목표는 유지한다. 이 결과를 Windows 실기기·실제 캠핏 동기화 통과로 보지 않는다. [조사와 사용 안내](windows-install-investigation-2026-10-10.md).

React UI를 Electron **22.3.27 / Chromium 108** 안에서 실행한다. 최신 Electron으로 최소 OS를 올리지 않고 Windows 8 목표를 유지했다. Windows x64·ia32 통합 NSIS 설치 파일을 빌드한다. 실제 Windows 8·8.1·10·11 설치·실행 검증은 남아 있다.

현재 Mac에서 같은 Electron 버전으로 PIN 설정·잠금, 파일 저장, 자동 백업, 재실행 후 보존과 XLSX 가져오기를 테스트했다. 이는 Windows 버전별 호환성 검증을 대체하지 않는다.

Electron 22는 공급자의 보안 지원이 **2023년 10월 10일 종료**되었다. 로컬 업무 창은 외부 페이지 이동을 차단하고 sandbox·contextIsolation을 켰지만, 이것이 구형 실행기의 취약점을 모두 해결한다는 뜻은 아니다. 실제 운영 배포 전 유지보수 방침이 필요하다. Windows 8 지원을 유지하면서 다른 네이티브 구현으로 옮기는 선택도 후속 검토 대상이다. [Electron 공식 지원 일정](https://www.electronjs.org/docs/latest/tutorial/electron-timelines), [Electron 22의 구성과 Windows 지원 범위](https://www.electronjs.org/blog/electron-22-0)

0.1.5는 사용자가 Windows 설치 후 로그인할 수 있도록 별도의 캠핏 창을 제공한다. 이 창만 `https://admin.camfit.co.kr`로 이동하며 별도 영속 세션을 사용한다. Node·preload·예약 파일 IPC를 제공하지 않고 팝업·다른 사이트 이동·장치 권한을 차단한다. 앱 잠금 시 창을 종료한다. 로그인 세션은 PC의 별도 브라우저 저장 영역에 보관되며 예약 JSON 백업에는 포함되지 않는다. **이 격리 방식은 Electron 22의 지원 종료 위험을 없애지 않는다.** 실제 캠핏 인증·예약 조회와 각 Windows 버전의 사이트 호환성은 미검증이다. 0.1.8에서 CSV/XLSX 내보내기 기반 버튼 동기화를 추가했다. 첫 파일의 열·상품·상태를 확인해 연결하고 다음 버튼 요청에서 같은 화면의 내보내기를 수신한다. 모의 화면으로 Mac Electron 22의 다운로드·반복 수신·원본 보존·종료는 검증했지만 실제 캠핏 인증·내보내기·Windows 호환성은 확인하지 않았다. [연결 범위](camfit-sync-2026-10-06.md).

아래 .NET 검토는 초기 조사 기록이다. 이번 구현이 .NET 앱이라는 뜻이 아니다.

## 0.1.13 수정의 검증 범위

0.1.13은 Claude 독립 검토 후속 수정과 사용자 결정 Q70(지난 연도 보관·과거 검색)·항공사진 파일 분리를 포함한다. Electron 22.3.27 / Chromium 108 고정과 Windows 8·8.1·10·11 목표는 바꾸지 않았다.

0.1.13에서 확인한 것:

- 운영 단위 테스트 88개.
- Playwright 화면 테스트 49개(데스크톱 브리지는 메모리 모의 구현).
- 형식·타입 검사와 `npm run build`.
- Mac Electron 22.3.27 / Chromium 108 `test:desktop`. 기존 운영에 보관·사진·손상 파일 백업 폴더 복원을 더해 확인했다.
- Electron 22의 Node 16.17.1로 실행한 저장소 독립 검증.
- `npm run dist:win` x64·ia32 통합 NSIS 설치 파일 `release/Sopung-Camp-Setup-0.1.13.exe`.
  - 144,513,029바이트, SHA-256 `1fa576ddd44dba4d4c0dcc69c8e38e1ac84af5987534d9373e281cc7ada8f307`.
  - 두 패키지 모두 버전 0.1.13이고 제품 파일 134개가 바이트 단위로 일치한다.
  - PE 형식은 x64·ia32다.

이는 Mac에서의 실행기·패키지 확인이다. Windows 8·8.1·10·11에서 설치·실행이 통과했다는 뜻이 아니다. 설치 파일에는 여전히 코드 서명이 없다.

보안 검사는 개발 의존성을 빼면 0개, 전체로는 높음 2·보통 8개 항목이며 0.1.12와 같다. Electron은 실제 실행기라 0개를 보안 문제 없음으로 보지 않는다. 메인 프로세스 코드는 Electron 22의 Node 16.17에 있는 API만 쓴다.

실제 Windows에서 추가로 확인할 것:

- 문서 폴더가 OneDrive로 동기화되는지. 백업과 그 `archive/`·`assets/` 사본이 클라우드로 올라갈 수 있다.
- 백신·색인 프로그램이 파일을 잡고 있을 때 원자적 이름 교체가 실패하는지.
- 폴더 선택 대화상자로 ‘백업 폴더에서 복원’·‘백업 파일 내보내기’가 동작하는지.
- 한국어 날짜 입력 칸에서 연도 입력이 어떻게 처리되는지.
- 1366×768·125% 배율에서 첫 창 크기와 종료 버튼이 보이는지.

## 0.1.12 재검토 결과

운영 테스트 60개·UI 38개와 Mac Electron 22 실행 검증을 통과했고 Windows x64·ia32 통합 설치 파일을 생성했다. 각 아키텍처의 제품 파일 134개가 최종 코드·빌드와 일치하고 실행 파일 형식도 확인했다. 이 결과를 Windows에서의 설치·실행 통과로 표현하지 않는다. [전체 재검토와 설치 파일](final-review-2026-10-08.md).

2026-10-08 보안 검사에서 개발 도구 의존성 `http-cache-semantics`·`source-map-js`를 갱신했다. `npm audit --omit=dev`는 0개지만 전체 검사는 높음 2개·보통 8개의 취약 의존성 항목을 보고한다. Electron은 개발 의존성으로 분류돼도 실제 설치 실행기로 포함되므로 앱 전체가 보안 검사 0개라는 뜻이 아니다. 남은 항목은 구형 Electron과 설치·빌드 도구 계열을 포함한다.

Electron 22의 보안 지원 종료와 Windows 8·8.1 지원 범위는 [공식 Windows 지원 종료 안내](https://www.electronjs.org/blog/windows-7-to-8-1-deprecation-notice)에서 확인했다. 강제 최신 Electron 갱신은 Windows 8 지원 조건을 충족하지 못하므로 적용하지 않았다. 실행기의 알려진 취약점은 [Electron 공식 보안 권고](https://github.com/electron/electron/security/advisories/GHSA-6r2x-8pq8-9489)에서도 확인할 수 있다. Windows 8 지원을 유지할 실행 기반·보안 유지보수 방안과 서명 인증서 검토는 남아 있다.

## 사용자 확정 조건

Q45에서 사용자가 “윈도우 8 이상으로 해줘”라고 지정했다. 지원 목표에 윈도우 8·8.1·10·11을 포함한다. 실제 관리실 PC가 윈도우 8이라는 뜻은 아니다. 윈도우 8을 제외하고 8.1부터 지원하는 것으로 해석하지 않는다.

기존의 관리실 PC 한 대, 설치형 프로그램, 로컬 데이터, 같은 PC 내 자동 백업, 설치 파일로 업데이트하는 결정과 함께 적용한다.

## 공식 자료에서 확인한 내용

| 기술 | 확인한 호환 범위 | 이 프로젝트에서의 해석 |
|---|---|---|
| .NET Framework 4.6.1 | 공식 오프라인 설치 안내에 Windows 8·8.1·10이 포함됨 | Windows 8용 데스크톱 프로그램의 실행 기반 후보로 검토 가능 |
| .NET Framework 4.x | 후속 버전은 이전 버전 대상 앱과의 호환성을 제공하되 동작 차이가 생길 수 있음 | 최신 윈도우에서 기존 호환 런타임을 사용하는 경로와 실제 앱 동작을 검증해야 함 |
| Electron | 23부터 Windows 7·8·8.1을 지원하지 않음 | 최신 Electron을 기본값으로 선택하면 현재 지원 목표를 충족하지 못함 |
| WebView2 | Windows 7·8·8.1을 지원하는 마지막 런타임은 109 | 최신 WebView2를 전제로 하는 구성은 Windows 8 목표와 맞지 않음 |

근거: Microsoft의 [.NET Framework 4.6.1 설치 안내](https://support.microsoft.com/en-us/servicing/dotnetframework/2017/01/the-net-framework-4-6-1-offline-installer-for-windows), [.NET Framework 버전 호환성](https://learn.microsoft.com/en-us/dotnet/framework/migration-guide/version-compatibility), Electron의 [구형 Windows 지원 범위 안내](https://www.electronjs.org/blog/windows-7-to-8-1-deprecation-notice), Microsoft의 [Edge·WebView2 지원 범위 안내](https://blogs.windows.com/msedgedev/2022/12/09/microsoft-edge-and-webview2-ending-support-for-windows-7-and-windows-8-8-1/).

Windows 11에는 버전에 따라 .NET Framework 4.8 또는 4.8.1이 포함된다. 다만 이것만으로 모든 외부 라이브러리와 이 프로그램의 호환성을 보장할 수는 없다. [Microsoft 시스템 요구 사항](https://learn.microsoft.com/en-us/dotnet/framework/get-started/system-requirements)

## 기획에 반영할 기술 선택 기준

초기 조사에서는 Windows 8에서 실행 가능한 .NET Framework 구성을 후보로 검토했다. 현재 구현은 위의 Electron 구성으로 진행했으며, 아래 원칙은 운영체제와 의존성 호환성을 검증할 때 계속 적용한다.

- Windows 8에서 실행 가능한 버전과 API 범위를 먼저 확인한다. 목표 운영체제, 빌드 대상, 실제 설치되는 런타임을 구분한다.
- Excel 읽기, 데이터 저장, 이미지 표시, 인쇄, 잠금, 설치 프로그램까지 모든 의존성의 최소 운영체제를 확인한다.
- 새 윈도우에서는 설치된 호환 런타임을 활용하는 경로를 검토한다. 구형 런타임을 모든 PC에 강제로 설치하는 것으로 정하지 않는다.
- 런타임의 실행 호환성과 공급자의 현재 유지보수는 별개다. 이전 버전을 선택할 때는 공식 지원 정책과 필요한 수정·배포 방식을 함께 검토한다.
- 현재 설치 파일은 x64·ia32를 포함하는 통합 NSIS 파일이다. 대상 PC에서 올바른 아키텍처가 선택되는지 실제 설치로 확인해야 한다.
- 현재 개발 환경에서 Windows 실행 검증을 했다고 간주하지 않는다. 각 운영체제 테스트 환경을 별도로 확보해야 한다.

## 배포 전 검증 계획

| 대상 | 설치·실행 검증 | 업무 기능 검증 |
|---|---|---|
| Windows 8 | 초기 설치, 필요한 런타임 설치, 최초 실행 | 예약 명단 가져오기, 배치도·캘린더, 이동·입퇴실, 인쇄, 백업·복구 |
| Windows 8.1 | 초기 설치와 최초 실행 | 동일 업무 흐름 |
| Windows 10 | 초기 설치와 기존 런타임 사용 | 동일 업무 흐름 |
| Windows 11 | 초기 설치와 기존 런타임 사용 | 동일 업무 흐름 |

각 대상에서 새 설치 파일로 업데이트한 뒤 기존 데이터와 설정이 유지되는지도 확인한다. 위 표는 실행할 검증 계획이며 현재 통과 결과가 아니다.

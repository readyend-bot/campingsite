const { allowedNavigation } = require("./camfit.cjs");

function safeRoute(value) {
  if (!allowedNavigation(value)) return null;
  const url = new URL(value);
  const hash = /^#\/[\w/.-]*$/.test(url.hash) ? url.hash : "";
  return url.origin + url.pathname + hash;
}
function exportLabel(value) {
  return (
    typeof value === "string" &&
    value.length <= 80 &&
    /^(?:엑셀|excel|csv)(?:\s*(?:파일|로))?(?:\s*(?:다운로드|내려받기|내보내기|저장))?$|^(?:예약|예약\s*(?:내역|목록|명단))\s*(?:엑셀\s*)?(?:다운로드|내려받기|내보내기)$/i.test(
      value.trim(),
    )
  );
}

// 예약 내용·입력값·쿠키를 읽지 않고 화면의 역할·제목·버튼만 확인한다.
const pageHelpers = `
  const allowedNavigation = ${allowedNavigation.toString()};
  const safeRoute = ${safeRoute.toString()};
  const eligible = ${exportLabel.toString()};
  const caption = el => (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
  const visible = el => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  const controls = 'button,[role="button"],[role="menuitem"],a[download],a[href]';
  const candidates = () => Array.from(document.querySelectorAll(controls)).filter(el => visible(el) && eligible(caption(el)));
  if (!window.__sopungExportListener) {
    window.__sopungExportListener = true;
    document.addEventListener('click', event => {
      const el = event.target instanceof Element && event.target.closest(controls);
      if (el && eligible(caption(el))) window.__sopungLastExport = { label: caption(el), time: Date.now() };
    }, true);
  }
`;

function inspectionScript({
  action = "inspect",
  label = null,
  route = null,
} = {}) {
  return `(() => {
    ${pageHelpers}
    if (!allowedNavigation(location.href)) return { blocked: true };
    const action = ${JSON.stringify(action)};
    const label = ${JSON.stringify(label)};
    const route = ${JSON.stringify(route)};
    const normalized = el => caption(el).replace(/\\s+/g, '').toLowerCase();
    const shown = selector => Array.from(document.querySelectorAll(selector)).filter(visible);
    const login = shown('input[type="password"]').length > 0 || shown(controls).some(el => /^(?:로그인|login|sign in)$/i.test(caption(el)));
    const headings = shown('th,[role="columnheader"]').map(normalized);
    const booking = headings.includes('예약번호') && headings.some(text => ['입실일', '체크인', '예약자', '예약자이름'].includes(text));
    const authenticated = !login && (booking || shown(controls).some(el => /^(?:로그아웃|logout|sign out)$/i.test(caption(el))));
    const buttons = candidates().filter(el => !label || caption(el) === label);
    const links = shown('a[href]').filter(el => /^(?:전체)?예약(?:목록|내역|관리)$/.test(normalized(el)) && allowedNavigation(el.href) && el.href !== location.href && el.target !== '_blank' && !el.hasAttribute('download'));
    const state = { login, booking, authenticated, matches: buttons.length, label: buttons.length === 1 ? caption(buttons[0]) : '', navigationMatches: links.length, clicked: false, navigated: false };
    if (login) return state;
    if (action === 'export' && buttons.length === 1 && (route ? safeRoute(location.href) === route : booking)) {
      buttons[0].click();
      state.clicked = true;
    }
    if (action === 'navigate' && !booking && links.length === 1) {
      links[0].click();
      state.navigated = true;
    }
    return state;
  })()`;
}

function metadataScript() {
  return `(() => { ${pageHelpers} const last = window.__sopungLastExport; return { exportLabels: [...new Set(candidates().map(caption).concat(last && Date.now() - last.time < 30000 ? [last.label] : []))], clickedLabel: last && Date.now() - last.time < 30000 ? last.label : '' }; })()`;
}

module.exports = { safeRoute, exportLabel, inspectionScript, metadataScript };

// 화면 표시용 서식 도우미

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const p2 = (n) => String(n).padStart(2, '0');

// 기기 현지 시간 기준 오늘 'YYYY-MM-DD'
export function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
}

// ISO 시각 → 현지 'YYYY-MM-DD'
export function localDateOf(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : todayStr(d);
}

function parts(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d, w: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

export const weekdayOf = (s) => WEEKDAYS[parts(s).w];
export const fmtLong = (s) => { const { m, d, w } = parts(s); return `${m}월 ${d}일 ${WEEKDAYS[w]}`; }; // 11월 20일 금
const otherYear = (s, today) => s.slice(0, 4) !== String(today || todayStr()).slice(0, 4);
// 올해면 "11월 20일", 아니면 "2028년 10월 19일"
export const fmtKo = (s, today) => { const { y, m, d } = parts(s); return otherYear(s, today) ? `${y}년 ${m}월 ${d}일` : `${m}월 ${d}일`; };
// 올해면 "11/20", 아니면 "2025/11/20"
export const fmtMD = (s, today) => { const { y, m, d } = parts(s); return otherYear(s, today) ? `${y}/${m}/${p2(d)}` : `${m}/${p2(d)}`; };
// 올해면 "11/5", 아니면 "2027/1/5"
export const fmtMDShort = (s, today) => { const { y, m, d } = parts(s); return otherYear(s, today) ? `${y}/${m}/${d}` : `${m}/${d}`; };
export const compactDate = (s) => s.replaceAll('-', ''); // 20261120

// 화면 머리글: "읽기와 사고 · 1번째 백독" (몇 번째인지는 시작일 순으로 계산한 값)
export function projectLine(project, ordinal) {
  if (!project) return '';
  return ordinal ? `${project.name} · ${ordinal}번째 백독` : project.name;
}

export const fmtDot = (s) => (s ? s.replaceAll('-', '.') : ''); // 2026.11.20

export function pct(cur, total) {
  const t = Number(total) || 0;
  return t > 0 ? Math.round((Math.min(cur, t) / t) * 100) : 0;
}

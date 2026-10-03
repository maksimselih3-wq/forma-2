// Где живёт приложение:
//  - на GitHub Pages (или открыт файлом) — ходим напрямую на сервер Railway;
//  - на своём домене (российский сервер) — всё через тот же адрес: сервер сам перешлёт /api на Railway.
//    Так приложение открывается в России без VPN и прокси.
const SELF_HOSTED = !/github\.io$/.test(location.hostname) && location.protocol !== 'file:';
const API_BASE = SELF_HOSTED ? '' : 'https://forma-production-9c7a.up.railway.app';

const tg = window.Telegram?.WebApp;

// Автообновление: Telegram иногда держит старую версию страницы в кэше.
// При запуске смотрим свежий index.html — если там версия новее, один раз перезагружаемся на неё.
(function checkFreshVersion() {
  try {
    const me = document.querySelector('script[src*="app.js"]');
    const cur = Number((/[?&]v=(\d+)/.exec(me?.getAttribute('src') || '') || [])[1] || 0);
    if (!cur || !window.fetch) return;
    fetch(`index.html?nocache=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((html) => {
        const fresh = Number((/app\.js\?v=(\d+)/.exec(html) || [])[1] || 0);
        if (!fresh || fresh <= cur) return;
        let tried = null;
        try { tried = sessionStorage.getItem('forma_reload_v'); } catch (e) { /* нет хранилища */ }
        if (tried === String(fresh)) return; // уже пробовали — не зацикливаемся
        try { sessionStorage.setItem('forma_reload_v', String(fresh)); } catch (e) { /* ничего */ }
        const url = new URL(window.location.href);
        url.searchParams.set('v', String(fresh)); // другой адрес — кэш не подсунет старую страницу
        window.location.replace(url.toString()); // хэш с данными Telegram сохраняется
      })
      .catch(() => {});
  } catch (e) { /* не страшно — просто работаем на текущей версии */ }
})();

// ---------- Тема: тёмная / светлая / как в Telegram ----------
const THEME_KEY = 'forma_theme';
function themePref() {
  try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'auto' ? v : 'dark'; } catch (e) { return 'dark'; }
}
function applyTheme() {
  const pref = themePref();
  const light = pref === 'light' || (pref === 'auto' && window.Telegram?.WebApp?.colorScheme === 'light');
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  const bg = light ? '#f3f4ef' : '#0a0c11';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  try { window.Telegram?.WebApp?.setHeaderColor(bg); window.Telegram?.WebApp?.setBackgroundColor(bg); } catch (e) {}
  try { window.Telegram?.WebApp?.setBottomBarColor?.(bg); } catch (e) {}
}
function setThemePref(v) {
  try { localStorage.setItem(THEME_KEY, v); } catch (e) {}
  applyTheme();
  if (typeof haptic === 'function') haptic('select');
  // графики и карточки, нарисованные кодом, перерисуем под новые цвета
  try { renderCharts?.(); } catch (e) {}
}
applyTheme();
try { tg?.onEvent?.('themeChanged', applyTheme); } catch (e) {}
if (tg) {
  tg.ready();
  tg.expand();
  // шапка и фон Telegram в цвет приложения (если версия Telegram это умеет)
  // цвета шапки Telegram задаёт applyTheme() ниже — под выбранную тему
}

let currentUser = null;
let justSavedDate = null; // дата, которую только что сохранили (для заголовка «Запись сохранена»)

// Все мои записи (для календаря, статистики и карточки «запись уже есть»)
let myWorkouts = [];
let workoutsByDate = {}; // 'ГГГГ-ММ-ДД' -> список записей дня (основная + вторая тренировка)

// Номер тренировки, которую сейчас заполняем на главной: 1 — основная, 2 — вторая за день
let entrySession = 1;
// Новые записи — только за сегодня и вчера (так серия остаётся честной)
const MAX_BACKFILL_DAYS = 1;

// Дата, за которую сейчас заполняется форма на главном экране
let entryDate = null;

// ---------- Мелкие утилиты ----------
const $ = (id) => document.getElementById(id);

// Защита от «сломанной» вёрстки, если в тексте есть кавычки или < >
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Наши иконки (вместо обычных смайликов) ----------
// Рисуются SVG, цвета берут градиенты из index.html (gLime, gFire, gPurple...).
const ICONS = {
  pin: '<path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.2-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" fill="url(#gLime)"/>',
  mountain: '<path d="M3 19l6.5-11 4 6.5 2.5-3.5L21 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 10.5l1.5 1.5 1.5-1.5" fill="none" stroke="url(#gLime)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  locate: '<circle cx="12" cy="12" r="3.2" fill="url(#gLime)"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="url(#gLime)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  rocket: '<path d="M14.5 3.5c3 .1 5.3 1.4 6 2.1.7.7 2 3 2.1 6-.1.2-3.6 4.4-7.3 6.9l-4.3-4.3c2.5-3.7 6.7-7.2 6.9-7.3Z" transform="translate(-2 1)" fill="url(#gLime)"/><circle cx="15.2" cy="8.8" r="1.7" fill="#0b0d10"/><path d="M8.2 12.3 5 12.9l-2 2.6 4 .6M11.7 15.8l-.6 3.2-2.6 2-.6-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.2 17.8c-1 .3-2 1.3-2.3 3 1.7-.3 2.7-1.3 3-2.3" fill="none" stroke="#ffb84d" stroke-width="1.6" stroke-linecap="round"/>',
  flame: '<path d="M12.3 2.5c.4 2.5-.7 4.2-2.1 5.8C8.7 10 7 11.8 7 14.8a5 5 0 0 0 10 0c0-2.3-1-4-2.4-5.4.1 1.5-.4 2.7-1.4 3.3.3-3.8-.1-7.3-.9-10.2Z" fill="url(#gFire)"/><path d="M12 19.8a2.5 2.5 0 0 1-2.5-2.6c0-1.5 1.1-2.5 2.1-3.7.2 1 .8 1.6 1.5 2 .8.5 1.4 1.1 1.4 1.9a2.5 2.5 0 0 1-2.5 2.4Z" fill="#fff3b8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="13" y="13" width="4.2" height="4.2" rx="1.3" fill="url(#gLime)"/>',
  week: '<rect x="3.5" y="5" width="17" height="15.5" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="7" y="13.4" width="10" height="3.4" rx="1.7" fill="url(#gLime)"/>',
  runner: '<circle cx="15" cy="4.6" r="2.2" fill="url(#gLime)"/><path d="M13.6 8.2 11.6 13.4M13.6 8.2 10 9.4 8 11.8M13.6 8.2l2.6 2.8 2.8.4M11.6 13.4l3.2 2.2-.8 4.4M11.6 13.4 9.6 17l-4 .6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  moon: '<path d="M19.5 14.8A7.8 7.8 0 0 1 9.2 4.5a7.8 7.8 0 1 0 10.3 10.3Z" fill="url(#gPurple)"/><path d="M15.5 3.5h3.2l-3.2 3.4h3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  dumbbell: '<path d="M8 12h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="3.8" y="7.5" width="4.4" height="9" rx="1.6" fill="url(#gLime)"/><rect x="15.8" y="7.5" width="4.4" height="9" rx="1.6" fill="url(#gLime)"/><path d="M2 10.5v3M22 10.5v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  heart: '<path d="M12 20.3S3.5 15.4 3.5 9.3A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.5 2.5c0 6.1-8.5 11-8.5 11Z" fill="url(#gHeart)"/><path d="M6.5 12.2h3l1.3-2.4 2.2 4.6 1.4-2.2h3.1" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  sparkle: '<path d="M10.5 3c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7Z" fill="url(#gSpark)"/><path d="M18.5 14c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3Z" fill="url(#gLime)"/>',
  check: '<circle cx="12" cy="12" r="9.5" fill="url(#gLime)"/><path d="M7.6 12.3l3 3 5.8-6" fill="none" stroke="#0b0d10" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  gift: '<rect x="4" y="10.5" width="16" height="10" rx="2.5" fill="url(#gPurple)"/><rect x="3" y="7" width="18" height="4.4" rx="1.6" fill="url(#gLime)"/><path d="M12 7v13.5" stroke="#fff" stroke-opacity=".85" stroke-width="2"/><path d="M12 7c-1.2-2.6-4.6-3.6-5.4-1.8C6 6.6 8.8 7 12 7Zm0 0c1.2-2.6 4.6-3.6 5.4-1.8.6 1.4-2.2 1.8-5.4 1.8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  diamond: '<path d="M7 4h10l4 5-9 11L3 9l4-5Z" fill="url(#gPurple)"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" stroke-linejoin="round"/>',
  lock: '<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="10.5" width="14" height="10" rx="3" fill="url(#gLime)"/><circle cx="12" cy="15.5" r="1.6" fill="#0b0d10"/>',
  trophy: '<path d="M7 6H4.5v1.2A3.3 3.3 0 0 0 7.6 10.5M17 6h2.5v1.2a3.3 3.3 0 0 1-3.1 3.3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 3.5h10v5a5 5 0 0 1-10 0v-5Z" fill="url(#gGold)"/><path d="M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
  share: '<path d="M12 15V4M8 7.5 12 3.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  pen: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.8 1.8 0 0 0 1.8 1.6h5.6a1.8 1.8 0 0 0 1.8-1.6L17.5 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="url(#gLime)"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17.5" cy="6" r="2.6" fill="url(#gLime)"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.4c-.5.4-1.2 0-1.2-.6V16A2.5 2.5 0 0 1 4 13.5v-7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9" cy="10" r="1.2" fill="url(#gLime)"/><circle cx="12" cy="10" r="1.2" fill="url(#gLime)"/><circle cx="15" cy="10" r="1.2" fill="url(#gLime)"/>',
  people: '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="16.5" cy="9" r="2.5" fill="url(#gLime)"/>',
  target: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="1.8" fill="url(#gLime)"/>',
  ticket: '<path d="M3.5 8a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 8v2a2 2 0 0 0 0 4v2a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16v-2a2 2 0 0 0 0-4V8Z" fill="url(#gGold)"/><path d="M14.5 7v10" stroke="#0b0d10" stroke-opacity=".4" stroke-width="1.4" stroke-dasharray="1.6 1.6"/>',
  info: '<circle cx="12" cy="12" r="9.5" fill="url(#gPurple)"/><path d="M12 11v5.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.4" fill="#fff"/>',
  warn: '<path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.4 12.9a2 2 0 0 1-1.7 3H4.6a2 2 0 0 1-1.7-3l7.4-12.9Z" fill="url(#gGold)"/><path d="M12 9v4.6" stroke="#0b0d10" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.8" r="1.3" fill="#0b0d10"/>',
};

function ico(name, cls = '') {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Все элементы с data-ico="имя" получают нашу иконку
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-ico]').forEach((el) => {
    if (el.dataset.icoDone) return;
    el.dataset.icoDone = '1';
    el.insertAdjacentHTML('afterbegin', ico(el.dataset.ico));
  });
}

// Цвет по шкале 1–10: красный → жёлтый → зелёный (или наоборот, если reverse)
function scaleColor(v, reverse = false) {
  const t = (Math.min(Math.max(v, 1), 10) - 1) / 9;
  const hue = Math.round((reverse ? 1 - t : t) * 110);
  // в светлой теме цвет темнее — иначе жёлтые цифры не читаются на белом
  const light = document.documentElement.dataset.theme === 'light';
  return `hsl(${hue}, ${light ? '80%, 38%' : '85%, 60%'})`;
}

// Фирменная синяя галочка — только у этих аккаунтов (username без @, маленькими буквами)
const VERIFIED_USERNAMES = ['maksimshelikh'];
const VERIFIED_BADGE =
  '<svg class="verified" viewBox="0 0 24 24" aria-label="Подтверждённый аккаунт"><path fill="#2AABEE" d="M12 1.5l2.4 1.9 3-.4 1.1 2.8 2.8 1.1-.4 3 1.9 2.4-1.9 2.4.4 3-2.8 1.1-1.1 2.8-3-.4L12 22.5l-2.4-1.9-3 .4-1.1-2.8-2.8-1.1.4-3L1.2 12l1.9-2.4-.4-3 2.8-1.1 1.1-2.8 3 .4z"/><path d="M7.6 12.4l3 3 5.9-6.1" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function isVerified(username) {
  return !!username && VERIFIED_USERNAMES.includes(String(username).toLowerCase().replace(/^@/, ''));
}

// ---------- Даты ----------
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function pad2(n) { return String(n).padStart(2, '0'); }
function nowRoundedTime(shiftMin = 0) { const d = new Date(Date.now() + shiftMin * 60000); const m = Math.round(d.getMinutes() / 5) * 5; d.setMinutes(m, 0, 0); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
// Сколько дней назад была дата 'ГГГГ-ММ-ДД' (0 — сегодня)
function daysAgo(dateStr) {
  const t = Date.parse(localDateStr() + 'T00:00:00Z'), d = Date.parse(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(d) ? Math.round((t - d) / 86400000) : 9999;
}
function addMinutesToTime(t, add) { const parts = String(t).split(':').map(Number); const x = (((parts[0] * 60 + parts[1] + add) % 1440) + 1440) % 1440; return pad2(Math.floor(x / 60)) + ':' + pad2(x % 60); }

// Дата по часам телефона в формате 'ГГГГ-ММ-ДД'
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(str, n) {
  const d = parseDateStr(str);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function normDate(v) { return String(v).slice(0, 10); }

// «19 сентября» (+ год, если он не текущий)
function formatDayMonth(str) {
  const d = parseDateStr(str);
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('ru-RU', opts);
}

// «вт, 22 сентября»
function formatWithWeekday(str) {
  const d = parseDateStr(str);
  const opts = { weekday: 'short', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('ru-RU', opts);
}

// «сегодня» / «вчера» / «19 сентября»
function relativeDateLabel(str) {
  const today = localDateStr();
  if (str === today) return 'сегодня';
  if (str === addDays(today, -1)) return 'вчера';
  return formatDayMonth(str);
}

// Понедельник текущей недели
function mondayOf(str) {
  const d = parseDateStr(str);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return localDateStr(d);
}

// ---------- API ----------
async function api(path, options = {}) {
  // не ждём сервер бесконечно: если связи нет (например, сайт заблокирован), через 20 секунд — ошибка,
  // и приложение покажет понятное сообщение вместо вечной заставки
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), options.timeout || 20000) : null;
  let res;
  try {
    const { timeout, ...fetchOptions } = options;
    res = await fetch(API_BASE + path, {
    ...fetchOptions,
    signal: ctrl ? ctrl.signal : undefined,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': tg?.initData || '',
      'X-Client-Date': localDateStr(), // сервер узнаёт, какое «сегодня» у пользователя
      ...(options.headers || {}),
    },
  });
  } catch (e) {
    const err = new Error(`Нет связи с сервером (${path})`);
    err.network = true;
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch {}
    const err = new Error(data?.error || `API ${path} -> ${res.status}`);
    err.data = data;
    throw err;
  }
  return res.json();
}

// ---------- Переключение экранов + подсветка нижней панели ----------
const ALL_SCREENS = ['mainScreen', 'profileScreen', 'friendsScreen', 'friendProfileScreen', 'insightsScreen', 'chatScreen', 'editScreen', 'groupScreen', 'memberScreen', 'settingsScreen', 'runScreen', 'healthScreen', 'giftsScreen'];
// какая кнопка нижней панели подсвечивается на «вложенных» экранах
const NAV_PARENT = { friendProfileScreen: 'friendsScreen', groupScreen: 'friendsScreen', memberScreen: 'friendsScreen', settingsScreen: 'profileScreen', healthScreen: 'profileScreen', giftsScreen: 'profileScreen', runScreen: 'friendsScreen' };
const TAB_SCREENS = ['mainScreen', 'chatScreen', 'insightsScreen', 'friendsScreen', 'profileScreen'];
const tabHistory = []; // какие вкладки открывались — чтобы жест «назад» вёл туда, откуда пришёл
function showScreen(targetId) {
  if (TAB_SCREENS.includes(targetId) && tabHistory[tabHistory.length - 1] !== targetId) {
    tabHistory.push(targetId);
    if (tabHistory.length > 20) tabHistory.shift();
  }
  ALL_SCREENS.forEach((id) => {
    const el = $(id);
    if (el) el.classList.toggle('hidden', id !== targetId);
  });
  document.querySelectorAll('.bottom-nav [data-screen]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === (NAV_PARENT[targetId] || targetId));
  });
  document.body.classList.toggle('chat-open', targetId === 'chatScreen');
  try { moveNavIndicator(targetId); animateScreenIn(targetId); } catch (e) {}
  document.body.dataset.screen = targetId; // для стилей: например, в своём профиле прячем огонёк и аватарку в шапке
  window.scrollTo(0, 0);
  setTimeout(() => { try { updateMiniHead(); } catch (e) {} }, 0);
}

// =====================================================================
//  ФОРМА ЗАПИСИ — одна и та же для «новой записи» и «редактирования»
// =====================================================================
// ---------- Дистанция: можно писать «10 км» ----------
// «400» → 400, «10 км» → 10000, «1,5 км» → 1500, «10k» → 10000
function parseDistance(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const t = String(v).toLowerCase().replace(',', '.').replace(/\s+/g, '');
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(/км|km|k$/.test(t) ? n * 1000 : n);
}
// Для поля ввода: 10000 → «10 км», 1500 → «1,5 км», 400 → «400»
function distInput(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'string' && !/^\d+$/.test(v.trim())) return v; // человек уже написал «10 км»
  const m = Number(v);
  return m >= 1000 && m % 100 === 0 ? `${String(m / 1000).replace('.', ',')} км` : String(m);
}
// Для текста записи: 10000 → «10 км», 400 → «400м»
function distLabel(m) {
  m = Number(m);
  return m >= 1000 && m % 100 === 0 ? `${String(m / 1000).replace('.', ',')} км` : `${m}м`;
}

// ---------- Время отрезка: «1'» = минута, «30"» = секунды ----------
function looksLikeDuration(v) {
  return typeof v === 'string' && /['"′″’”]|мин|сек|:/i.test(v);
}
// «1'» → 60, «30"» → 30, «1'30"» → 90, «1:30» → 90, «2 мин» → 120
function parseDuration(v) {
  if (v == null || v === '') return null;
  const t = String(v).toLowerCase().replace(',', '.').replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/\s+/g, '');
  let sec = 0;
  const hms = t.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hms) sec = hms[3] != null ? (+hms[1]) * 3600 + (+hms[2]) * 60 + (+hms[3]) : (+hms[1]) * 60 + (+hms[2]);
  else {
    const m = t.match(/(\d+(?:\.\d+)?)(?:'|мин)/);
    const s2 = t.match(/(\d+(?:\.\d+)?)(?:"|сек|с$)/) || (m && t.match(/(?:'|мин)(\d{1,2})$/));
    sec = (m ? parseFloat(m[1]) * 60 : 0) + (s2 ? parseFloat(s2[1]) : 0);
  }
  return sec > 0 && sec <= 36000 ? Math.round(sec) : null;
}
// 60 → «1'», 90 → «1'30"», 30 → «30"»
function durLabel(sec) {
  sec = Math.round(Number(sec) || 0);
  const m = Math.floor(sec / 60), r = sec % 60;
  return m ? `${m}'${r ? pad2(r) + '"' : ''}` : `${r}"`;
}

// ---------- Старты и личные рекорды ----------
const COMP_DISCIPLINES = ['60 м', '100 м', '200 м', '400 м', '800 м', '1500 м', '3000 м', '5000 м', '10 000 м',
  '60 м с/б', '100 м с/б', '110 м с/б', '400 м с/б', '3000 м с/п', 'Полумарафон', 'Марафон',
  'Длина', 'Тройной', 'Высота', 'Шест', 'Ядро', 'Диск', 'Копьё', 'Молот'];

// Прыжки и метания — «больше = лучше» (метры), бег — «меньше = лучше» (время)
const FIELD_EVENT_RE = /прыж|длин|тройн|высот|шест|ядр|диск|копь|молот|метан|толк/i;
function higherIsBetter(discipline) { return FIELD_EVENT_RE.test(discipline || ''); }
// «10.95» → 10.95, «1:58.4» → 118.4, «7,12 м» → 7.12
function parseResult(result, discipline) {
  const token = String(result || '').replace(/,/g, '.').match(/\d[\d:.]*/)?.[0];
  if (!token) return null;
  if (higherIsBetter(discipline)) { const n = parseFloat(token); return Number.isFinite(n) ? n : null; }
  const parts = token.split(':').map(Number);
  if (parts.some((x) => !Number.isFinite(x))) return null;
  return parts.reduce((acc, x) => acc * 60 + x, 0);
}
function disciplineKey(d) {
  return String(d || '').toLowerCase().replace(/метр(ов|а)?/g, 'м').replace(/\s+/g, '').replace(/ё/g, 'е');
}
// Лучший результат в каждой дисциплине (по моим записям)
// Рекорды, внесённые вручную (без записи старта), — в том же виде, что и записи-старты
let myManualRecords = [];
function manualAsWorkouts() {
  return myManualRecords.map((r) => ({
    id: 'm' + r.id, manual_id: r.id, manual: true, date: r.date || '1900-01-01',
    competition: { discipline: r.discipline, result: r.result, name: r.note || '' },
  }));
}
function bestResults(list = [...myWorkouts, ...manualAsWorkouts()]) {
  const best = {};
  list.forEach((w) => {
    const c = w.competition;
    if (!c?.discipline || !c?.result) return;
    const v = parseResult(c.result, c.discipline);
    if (v == null) return;
    const key = disciplineKey(c.discipline);
    const cur = best[key];
    if (!cur || (higherIsBetter(c.discipline) ? v > cur.value : v < cur.value)) best[key] = { value: v, w };
  });
  return best;
}
// Этот старт — личный рекорд? (лучше всех прошлых стартов в этой дисциплине; первый старт тоже рекорд)
function isPersonalBest(w) {
  const c = w?.competition;
  if (!c?.discipline || !c?.result) return false;
  const v = parseResult(c.result, c.discipline);
  if (v == null) return false;
  const others = [...myWorkouts, ...manualAsWorkouts()].filter((x) => x.id !== w.id && x.date <= w.date);
  const prev = bestResults(others)[disciplineKey(c.discipline)];
  return !prev || (higherIsBetter(c.discipline) ? v > prev.value : v < prev.value);
}
function competitionLine(c) {
  if (!c) return '';
  return [c.name, [c.discipline, c.result].filter(Boolean).join(' — '), c.place ? `${c.place} место` : ''].filter(Boolean).join(' · ');
}
function entryKindLabel(w) {
  if (w.type === 'rest') return 'Отдых';
  if (w.competition) return 'Старт';
  return w.session > 1 ? 'Вторая тренировка' : 'Тренировка';
}
function entryKindIco(w) { return w.type === 'rest' ? 'moon' : w.competition ? 'trophy' : 'runner'; }

const FORM_TEMPLATE = `
  <section class="card smart-card">
    <div class="card-label">${ico('sparkle')}Умный ввод</div>
    <div class="card-hint smart-hint">Опиши тренировку своими словами — Fom сам разложит всё по полям ниже.</div>
    <textarea data-f="smartText" rows="4" placeholder="Например: разминка 3 км + СБУ, 6×400 по 65 сек отдых 2 мин, присед 5×5 80 кг, пульс ср 150 макс 182, в паузах до 110. Было тяжело."></textarea>
    <button type="button" class="smart-btn" data-f="smartBtn">Разложить по полям</button>
    <div class="status-msg" data-f="smartStatus"></div>
  </section>

  <button type="button" class="repeat-btn" data-f="repeatBtn">↻ Повторить прошлую тренировку</button>

  <div class="segmented seg-3" data-f="typeSwitch">
    <button type="button" class="seg-btn active" data-type="training">${ico('runner')} Тренировка</button>
    <button type="button" class="seg-btn" data-type="competition">${ico('trophy')} Старт</button>
    <button type="button" class="seg-btn" data-type="rest">${ico('moon')} Отдых</button>
  </div>

  <section class="card comp-card hidden" data-f="compFields">
    <div class="card-label">${ico('trophy')}Старт</div>
    <input type="text" data-f="compName" maxlength="80" placeholder="Соревнование: например, Первенство города" />
    <div class="card-label comp-sub">Дисциплина</div>
    <div class="comp-chips" data-f="compChips"></div>
    <input type="text" data-f="compDiscipline" maxlength="40" placeholder="Или напиши свою" />
    <div class="comp-row">
      <label class="hr-field"><span>Результат</span><input type="text" data-f="compResult" maxlength="20" inputmode="decimal" placeholder="10.95" /></label>
      <label class="hr-field"><span>Место <i class="optional">необяз.</i></span><input type="number" data-f="compPlace" inputmode="numeric" min="1" max="9999" placeholder="—" /></label>
    </div>
    <div class="muted hr-hint">Бег — в секундах или мин:сек (1:58.4), прыжки и метания — в метрах (7.12). Лучший результат в каждой дисциплине попадёт в «Рекорды» профиля.</div>
  </section>

  <div data-f="trainingFields">
    <section class="card">
      <div class="card-label">Разминка</div>
      <textarea data-f="warmup" rows="2" placeholder="Например: 3 км трусцой + суставная"></textarea>
    </section>

    <section class="card">
      <div class="card-head">
        <div class="card-label">${ico('runner')}Беговая работа</div>
        <div class="card-hint">метры или время (1', 30") · кол-во · время/темп · отдых</div>
      </div>
      <div data-f="setsList"></div>
      <button type="button" class="add-btn" data-f="addSet">+ Добавить отрезок</button>
    </section>

    <section class="card">
      <div class="card-head">
        <div class="card-label">${ico('dumbbell')}Силовая / ОФП</div>
        <div class="card-hint">упражнение · подходы × повторы · вес</div>
      </div>
      <div data-f="exList"></div>
      <button type="button" class="add-btn" data-f="addEx">+ Добавить упражнение</button>
    </section>

    <section class="card">
      <div class="card-label">Заминка</div>
      <textarea data-f="cooldown" rows="2" placeholder="Необязательно"></textarea>
    </section>

    <section class="card">
      <div class="card-label">Как прошло</div>
      <div class="slider-row">
        <div class="slider-top"><span>Самочувствие</span><b data-f="feelingNum"><span data-f="feelingVal">5</span>/10</b></div>
        <input type="range" class="range-good" data-f="feeling" min="1" max="10" value="5" />
        <div class="slider-scale"><span>плохо</span><span>отлично</span></div>
      </div>
      <div class="slider-row">
        <div class="slider-top"><span>Нагрузка (RPE)</span><b data-f="rpeNum"><span data-f="rpeVal">5</span>/10</b></div>
        <input type="range" class="range-load" data-f="rpe" min="1" max="10" value="5" />
        <div class="slider-scale"><span>очень легко</span><span>на пределе</span></div>
        <div class="muted slider-hint">RPE — насколько тяжело далась тренировка по твоим ощущениям.</div>
      </div>
    </section>

    <div class="opt-chips" data-f="optChips">
      <span class="opt-chips-label">Можно добавить:</span>
      <button type="button" class="chip opt-chip" data-opt="time">${ico('clock')} Время</button>
      <button type="button" class="chip opt-chip" data-opt="place">${ico('pin')} Место</button>
      <button type="button" class="chip opt-chip" data-opt="pulse">${ico('heart')} Пульс</button>
    </div>

    <section class="card time-card opt-card hidden" data-f="timeCard">
      <div class="card-head">
        <div class="card-label">${ico('clock')}Время тренировки</div>
        <div class="card-hint">необязательно · Fom поймёт, когда тебе лучше тренироваться</div>
      </div>
      <div class="wt-row">
        <button type="button" class="wt-btn" data-f="startBtn"><span>Начало</span><b data-f="startLabel">—:—</b></button>
        <span class="wt-dash">—</span>
        <button type="button" class="wt-btn" data-f="endBtn"><span>Конец</span><b data-f="endLabel">—:—</b></button>
        <button type="button" class="wt-clear hidden" data-f="timeClear" aria-label="Убрать время">✕</button>
      </div>
    </section>

    <section class="card place-card opt-card hidden" data-f="placeCard">
      <div class="card-head">
        <div class="card-label">${ico('pin')}Где тренировался</div>
        <div class="card-hint">необязательно · Fom учтёт высоту над уровнем моря</div>
      </div>
      <div class="place-input-wrap">
        <input type="text" data-f="placeInput" maxlength="80" placeholder="Город или стадион: Кисловодск, Манеж…" autocomplete="off" />
        <button type="button" class="wt-clear hidden" data-f="placeClear" aria-label="Убрать место">✕</button>
      </div>
      <div class="place-suggest hidden" data-f="placeSuggest"></div>
      <div class="comp-chips place-chips" data-f="placeChips"></div>
      <div class="place-row">
        <label class="hr-field place-alt"><span>${ico('mountain')}Высота, м</span><input type="number" inputmode="numeric" data-f="placeAlt" min="-500" max="6000" placeholder="—" /></label>
        <label class="toggle-row place-camp">
          <input type="checkbox" data-f="placeCamp" />
          <span class="toggle"></span>
          <span>Я на сборе</span>
        </label>
      </div>
      <div class="muted hr-hint" data-f="placeHint">Выбери город из подсказки — высота подставится сама. Для стадиона в горах можно поправить её вручную.</div>
    </section>

    <section class="card opt-card hidden" data-f="pulseCard">
      <div class="card-label">${ico('heart')}Пульс, уд/мин <span class="optional">необязательно</span></div>
      <div class="hr-row">
        <label class="hr-field"><span>Средний</span><input type="number" inputmode="numeric" data-f="hrAvg" min="30" max="250" placeholder="—" /></label>
        <label class="hr-field"><span>Макс.</span><input type="number" inputmode="numeric" data-f="hrMax" min="30" max="250" placeholder="—" /></label>
        <label class="hr-field"><span>Мин. в паузах</span><input type="number" inputmode="numeric" data-f="hrMin" min="30" max="250" placeholder="—" /></label>
      </div>
      <div class="muted hr-hint">Мин. в паузах — насколько низко пульс опускался в отдыхе между отрезками. Чем ниже, тем лучше восстановление.</div>
    </section>
  </div>

  <section class="card">
    <div class="card-label">Заметки</div>
    <textarea data-f="notes" rows="2" placeholder="Как прошло, что заметил..."></textarea>
    <div class="vis-block">
      <div class="vis-label">Кто видит запись</div>
      <div class="segmented seg-3 vis-seg" data-f="visSeg">
        <button type="button" class="seg-btn" data-vis="private">${ico('lock')} Только я</button>
        <button type="button" class="seg-btn" data-vis="public">${ico('people')} Все друзья</button>
        <button type="button" class="seg-btn" data-vis="custom">${ico('eye')} Выбрать</button>
      </div>
      <button type="button" class="vis-picked hidden" data-f="visPicked"></button>
    </div>
  </section>
`;

function createWorkoutForm(root, { getDate = () => null } = {}) {
  root.innerHTML = FORM_TEMPLATE;
  const f = (name) => root.querySelector(`[data-f="${name}"]`);

  let type = 'training';
  let mode = 'training'; // training | competition | rest
  let sets = [];      // беговые отрезки: { distance_m, reps, time_or_pace, rest_between }
  let exercises = []; // силовая/ОФП:     { name, sets, reps, weight }
  // время тренировки «ЧЧ:ММ» (или null)
  let startTime = null, endTime = null;
  function paintTimes() {
    f('startLabel').textContent = startTime || '—:—';
    f('endLabel').textContent = endTime || '—:—';
    f('startBtn').classList.toggle('set', !!startTime);
    f('endBtn').classList.toggle('set', !!endTime);
    f('timeClear').classList.toggle('hidden', !startTime && !endTime);
    if (typeof syncOptional === 'function' && f('optChips')) try { syncOptional(); } catch (e) { /* ещё не готово */ }
  }
  f('startBtn').addEventListener('click', () => openTimePicker({
    title: 'Начало тренировки', value: startTime || nowRoundedTime(-90),
    onDone: (t) => { startTime = t; paintTimes(); },
  }));
  f('endBtn').addEventListener('click', () => openTimePicker({
    title: 'Конец тренировки', value: endTime || (startTime ? addMinutesToTime(startTime, 90) : nowRoundedTime(0)),
    onDone: (t) => { endTime = t; if (!startTime) startTime = addMinutesToTime(t, -90); paintTimes(); },
  }));
  f('timeClear').addEventListener('click', () => { startTime = null; endTime = null; paintTimes(); });

  // --- необязательные блоки (время, место, пульс): свёрнуты в кнопки, раскрываются по нажатию или если в них есть данные ---
  const optOpen = { time: false, place: false, pulse: false };
  function optHasData(k) {
    if (k === 'time') return !!(startTime || endTime);
    if (k === 'place') return !!(f('placeInput').value.trim() || f('placeAlt').value || f('placeCamp').checked);
    return !!(f('hrAvg').value || f('hrMax').value || f('hrMin').value);
  }
  function syncOptional() {
    const cards = { time: 'timeCard', place: 'placeCard', pulse: 'pulseCard' };
    let any = false;
    Object.keys(cards).forEach((k) => {
      const open = optOpen[k] || optHasData(k);
      f(cards[k]).classList.toggle('hidden', !open);
      f('optChips').querySelector(`[data-opt="${k}"]`).classList.toggle('hidden', open);
      if (!open) any = true;
    });
    f('optChips').classList.toggle('hidden', !any);
  }
  f('optChips').querySelectorAll('.opt-chip').forEach((b) => b.addEventListener('click', () => {
    optOpen[b.dataset.opt] = true;
    syncOptional();
    const card = f({ time: 'timeCard', place: 'placeCard', pulse: 'pulseCard' }[b.dataset.opt]);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (b.dataset.opt === 'time') f('startBtn').click();
    if (b.dataset.opt === 'place') setTimeout(() => f('placeInput').focus(), 250);
  }));

  // --- место тренировки: название, координаты, высота, сбор ---
  let placeGeo = null; // { lat, lon } — если место выбрано из подсказки или «где я сейчас»
  let placeTimer = null, placeSeq = 0;
  function placeData() {
    const alt = parseInt(f('placeAlt').value, 10);
    return {
      place: f('placeInput').value.trim() || null,
      place_lat: placeGeo?.lat ?? null, place_lon: placeGeo?.lon ?? null,
      altitude_m: Number.isFinite(alt) ? alt : null,
      camp: f('placeCamp').checked,
    };
  }
  function setPlace(w) {
    f('placeInput').value = w?.place || '';
    f('placeAlt').value = w?.altitude_m ?? '';
    f('placeCamp').checked = !!w?.camp;
    placeGeo = w?.place_lat != null && w?.place_lon != null ? { lat: w.place_lat, lon: w.place_lon } : null;
    f('placeSuggest').classList.add('hidden');
    paintPlace();
  }
  function paintPlace() {
    f('placeClear').classList.toggle('hidden', !f('placeInput').value && !f('placeAlt').value);
    syncOptional();
    // быстрые варианты: мои прошлые места (по частоте) + «где я сейчас»
    const seen = {};
    (typeof myWorkouts !== 'undefined' ? myWorkouts : []).forEach((w) => {
      if (!w.place) return;
      const k = w.place.toLowerCase();
      if (!seen[k]) seen[k] = { n: 0, w };
      seen[k].n++;
    });
    const cur = f('placeInput').value.trim().toLowerCase();
    const recent = Object.values(seen).sort((a, b) => b.n - a.n).slice(0, 4).map((x) => x.w);
    f('placeChips').innerHTML = recent.map((w, i) => `<button type="button" class="chip${w.place.toLowerCase() === cur ? ' active' : ''}" data-i="${i}">${esc(w.place)}${w.altitude_m != null && w.altitude_m >= 500 ? ` · ${w.altitude_m} м` : ''}</button>`).join('')
      + `<button type="button" class="chip chip-ico" data-f="placeHere">${ico('locate')}Где я сейчас</button>`;
    f('placeChips').querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
      const w = recent[+b.dataset.i];
      setPlace({ ...w, camp: f('placeCamp').checked || !!w.camp });
    }));
    f('placeHere').addEventListener('click', placeHere);
  }
  function showSuggest(list) {
    const box = f('placeSuggest');
    if (!list.length) { box.classList.add('hidden'); return; }
    box.innerHTML = list.map((p, i) => `<button type="button" class="place-opt" data-i="${i}"><b>${esc(p.name)}</b><span>${esc(p.region || '')}${p.elevation != null ? ` · ${p.elevation} м` : ''}</span></button>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.place-opt').forEach((b) => b.addEventListener('click', () => {
      const p = list[+b.dataset.i];
      f('placeInput').value = p.name;
      if (p.elevation != null) f('placeAlt').value = p.elevation;
      placeGeo = { lat: p.lat, lon: p.lon };
      if (p.elevation != null && p.elevation >= 1000) f('placeCamp').checked = true;
      box.classList.add('hidden');
      paintPlace();
    }));
  }
  f('placeInput').addEventListener('input', () => {
    placeGeo = null;
    paintPlace();
    clearTimeout(placeTimer);
    const q = f('placeInput').value.trim();
    if (q.length < 3) { f('placeSuggest').classList.add('hidden'); return; }
    const my = ++placeSeq;
    placeTimer = setTimeout(async () => {
      try {
        const { places } = await api('/api/geo/search?q=' + encodeURIComponent(q), { timeout: 9000 });
        if (my === placeSeq) showSuggest(places || []);
      } catch (e) { if (my === placeSeq) f('placeSuggest').classList.add('hidden'); }
    }, 450);
  });
  f('placeInput').addEventListener('blur', () => setTimeout(() => f('placeSuggest').classList.add('hidden'), 250));
  f('placeAlt').addEventListener('input', paintPlace);
  f('placeClear').addEventListener('click', () => setPlace({ camp: f('placeCamp').checked }));
  async function placeHere() {
    const hint = f('placeHint');
    const old = hint.textContent;
    hint.textContent = 'Определяю, где ты…';
    const done = async (lat, lon) => {
      try {
        const { place } = await api(`/api/geo/reverse?lat=${lat}&lon=${lon}`, { timeout: 12000 });
        f('placeInput').value = place.name;
        if (place.elevation != null) f('placeAlt').value = place.elevation;
        placeGeo = { lat: place.lat, lon: place.lon };
        if (place.elevation != null && place.elevation >= 1000) f('placeCamp').checked = true;
        hint.textContent = old;
        paintPlace();
      } catch (err) { hint.textContent = err.data?.error || 'Не получилось определить место — впиши его сам.'; }
    };
    const fail = () => { hint.textContent = 'Нет доступа к геопозиции — впиши место сам или разреши доступ в настройках.'; };
    // в Telegram — через его геолокацию (если есть), иначе через браузер
    const lm = tg?.LocationManager;
    if (lm && typeof lm.init === 'function' && typeof lm.getLocation === 'function') {
      try {
        lm.init(() => {
          if (!lm.isLocationAvailable) return browserGeo();
          lm.getLocation((loc) => (loc ? done(loc.latitude, loc.longitude) : fail()));
        });
        return;
      } catch (e) { /* ниже — браузер */ }
    }
    browserGeo();
    function browserGeo() {
      if (!navigator.geolocation) return fail();
      navigator.geolocation.getCurrentPosition((p) => done(p.coords.latitude, p.coords.longitude), fail, { timeout: 12000, maximumAge: 600000 });
    }
  }
  paintPlace();

  // кто видит запись: private — только я, public — все друзья, custom — выбранные друзья (visTo — их id)
  let vis = 'private';
  let visTo = [];

  function setVisibility(v, list) {
    vis = v === 'public' || v === 'custom' ? v : 'private';
    visTo = vis === 'custom' && Array.isArray(list) ? list.map(Number) : [];
    if (vis === 'custom' && !visTo.length) vis = 'private';
    paintVisibility();
  }
  async function paintVisibility() {
    f('visSeg').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.vis === vis));
    const picked = f('visPicked');
    picked.classList.toggle('hidden', vis !== 'custom');
    if (vis !== 'custom') return;
    const friends = await getFriendsCached().catch(() => []);
    const names = visTo.map((id) => friends.find((x) => x.id === id)).filter(Boolean).map((x) => x.first_name || x.username || 'друг');
    const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` и ещё ${names.length - 3}` : '');
    picked.innerHTML = `${ico('eye')} Видят: <b>${esc(shown || `${visTo.length} чел.`)}</b> <span class="vis-edit">изменить</span>`;
  }
  f('visSeg').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.vis !== 'custom') { vis = b.dataset.vis; paintVisibility(); return; }
    openFriendPicker(visTo, (ids) => { if (ids.length) { vis = 'custom'; visTo = ids; } paintVisibility(); });
  }));
  f('visPicked').addEventListener('click', () => openFriendPicker(visTo, (ids) => {
    if (ids.length) visTo = ids; else vis = 'private';
    paintVisibility();
  }));
  paintVisibility();

  function setType(t) {
    mode = t === 'rest' ? 'rest' : t === 'competition' ? 'competition' : 'training';
    type = mode === 'rest' ? 'rest' : 'training';
    f('typeSwitch').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.type === mode));
    f('trainingFields').classList.toggle('hidden', type !== 'training');
    f('compFields').classList.toggle('hidden', mode !== 'competition');
  }

  // --- старт: быстрый выбор дисциплины ---
  function paintCompChips() {
    const cur = f('compDiscipline').value.trim();
    f('compChips').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.textContent === cur));
  }
  f('compChips').innerHTML = COMP_DISCIPLINES.map((d) => `<button type="button" class="chip">${esc(d)}</button>`).join('');
  f('compChips').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    f('compDiscipline').value = f('compDiscipline').value.trim() === c.textContent ? '' : c.textContent;
    paintCompChips();
  }));
  f('compDiscipline').addEventListener('input', paintCompChips);
  function setCompetition(c) {
    f('compName').value = c?.name || '';
    f('compDiscipline').value = c?.discipline || '';
    f('compResult').value = c?.result || '';
    f('compPlace').value = c?.place || '';
    paintCompChips();
  }

  // --- повторить прошлую тренировку ---
  f('repeatBtn').addEventListener('click', () => openRepeatSheet((w) => {
    setData({ ...w, notes: '', competition: null, visibility: vis, visible_to: visTo, start_time: null, end_time: null });
    setType('training');
    f('smartStatus').textContent = '';
  }));
  f('typeSwitch').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => setType(b.dataset.type)));

  // --- беговые отрезки ---
  function renderSets() {
    const list = f('setsList');
    list.innerHTML = '';
    sets.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <input type="text" inputmode="decimal" placeholder="м / км / 1'" value="${esc(distInput(s.distance_m))}" data-k="distance_m" />
        <input type="number" inputmode="numeric" placeholder="Кол-во" value="${esc(s.reps)}" data-k="reps" />
        <input type="text" placeholder="Время" value="${esc(s.time_or_pace)}" data-k="time_or_pace" />
        <input type="text" placeholder="Отдых" value="${esc(s.rest_between)}" data-k="rest_between" />
        <button type="button" class="row-del" aria-label="Удалить">✕</button>`;
      row.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => { sets[i][inp.dataset.k] = inp.value; }));
      row.querySelector('.row-del').addEventListener('click', () => { sets.splice(i, 1); renderSets(); });
      list.appendChild(row);
    });
  }
  f('addSet').addEventListener('click', () => {
    sets.push({ distance_m: '', reps: '', time_or_pace: '', rest_between: '' });
    renderSets();
  });

  // --- силовая / ОФП ---
  function renderExercises() {
    const list = f('exList');
    list.innerHTML = '';
    exercises.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'ex-row';
      row.innerHTML = `
        <div class="ex-top">
          <input type="text" placeholder="Упражнение (присед, выпрыгивания, барьеры...)" value="${esc(e.name)}" data-k="name" />
          <button type="button" class="row-del" aria-label="Удалить">✕</button>
        </div>
        <div class="ex-bottom">
          <input type="number" inputmode="numeric" placeholder="Подходы" value="${esc(e.sets)}" data-k="sets" />
          <input type="text" placeholder="Повторы" value="${esc(e.reps)}" data-k="reps" />
          <input type="text" placeholder="Вес, кг" value="${esc(e.weight)}" data-k="weight" />
        </div>`;
      row.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => { exercises[i][inp.dataset.k] = inp.value; }));
      row.querySelector('.row-del').addEventListener('click', () => { exercises.splice(i, 1); renderExercises(); });
      list.appendChild(row);
    });
  }
  f('addEx').addEventListener('click', () => {
    exercises.push({ name: '', sets: '', reps: '', weight: '' });
    renderExercises();
    const inputs = f('exList').querySelectorAll('.ex-top input');
    inputs[inputs.length - 1]?.focus();
  });

  // --- ползунки ---
  // цвет цифры: самочувствие — чем выше, тем зеленее; нагрузка — чем выше, тем краснее
  function paintSlider(k) {
    const v = Number(f(k).value);
    f(k + 'Val').textContent = v;
    f(k + 'Num').style.color = scaleColor(v, k === 'rpe');
  }
  ['feeling', 'rpe'].forEach((k) => {
    f(k).addEventListener('input', () => paintSlider(k));
    paintSlider(k);
  });

  function setSlider(k, v) {
    f(k).value = v || 5;
    paintSlider(k);
  }

  // --- умный ввод: текст → Fom → поля формы ---
  function applyParsed(p) {
    setType(p.type);
    if (p.warmup) f('warmup').value = p.warmup;
    if (p.cooldown) f('cooldown').value = p.cooldown;
    if (p.notes) f('notes').value = f('notes').value ? `${f('notes').value}\n${p.notes}` : p.notes;
    if (p.rpe) setSlider('rpe', p.rpe);
    if (p.feeling) setSlider('feeling', p.feeling);
    if (p.hr_avg) f('hrAvg').value = p.hr_avg;
    if (p.hr_max) f('hrMax').value = p.hr_max;
    if (p.hr_min) f('hrMin').value = p.hr_min;
    syncOptional();
    if (p.start_time) { startTime = p.start_time; endTime = p.end_time || endTime; paintTimes(); }
    if (p.place && !f('placeInput').value.trim()) { f('placeInput').value = p.place; placeGeo = null; paintPlace(); }
    if (Array.isArray(p.sets) && p.sets.length) {
      sets = p.sets.map((s) => ({
        distance_m: s.duration_s ? durLabel(s.duration_s) : (s.distance_m ?? ''), reps: s.reps ?? '', time_or_pace: s.time_or_pace ?? '', rest_between: s.rest_between ?? '',
      }));
      renderSets();
    }
    if (Array.isArray(p.exercises) && p.exercises.length) {
      exercises = p.exercises.map((e) => ({
        name: e.name ?? '', sets: e.sets ?? '', reps: e.reps ?? '', weight: e.weight ?? '',
      }));
      renderExercises();
    }
  }

  // --- файл с часов: читаем в телефоне → сводку кругов отдаём Fom → он раскладывает по полям ---
  // Кнопка «С часов» пока скрыта (выгрузка из Garmin слишком неудобна) — код оставлен на будущее
  if (f('watchBtn')) f('watchHelp').addEventListener('click', openWatchHelp);
  if (f('watchBtn')) f('watchBtn').addEventListener('click', () => f('watchFile').click());
  if (f('watchFile')) f('watchFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const status = f('smartStatus');
    f('watchBtn').disabled = true;
    status.textContent = 'Читаю файл с часов...';
    try {
      const w = await readWatchFile(file);
      status.textContent = 'Fom раскладывает круги по полям...';
      const { parsed } = await api('/api/workouts/parse', { method: 'POST', body: JSON.stringify({ text: w.text, source: 'watch' }), timeout: 60000 });
      applyParsed({ ...parsed, type: 'training' });
      setType(mode === 'competition' ? 'competition' : 'training');
      // пульс берём прямо из файла — он точнее
      if (w.hrAvg) f('hrAvg').value = w.hrAvg;
      if (w.hrMax) f('hrMax').value = w.hrMax;
      if (w.hrMin) f('hrMin').value = w.hrMin;
      growAll(root);
      const d = getDate();
      status.textContent = 'Готово! Проверь поля и добавь самочувствие и RPE.' +
        (w.date && d && w.date !== d ? ` Внимание: файл от ${formatDayMonth(w.date)}, а запись — за ${formatDayMonth(d)}.` : '');
      haptic('success');
    } catch (err) {
      console.error(err);
      status.textContent = err.data?.error || err.message || 'Не получилось прочитать файл.';
      haptic('error');
    } finally {
      f('watchBtn').disabled = false;
    }
  });

  f('smartBtn').addEventListener('click', async () => {
    const text = f('smartText').value.trim();
    const status = f('smartStatus');
    if (!text) {
      status.textContent = 'Сначала напиши, как прошла тренировка 🙂';
      return;
    }
    f('smartBtn').disabled = true;
    status.textContent = 'Fom разбирает текст...';
    try {
      const { parsed } = await api('/api/workouts/parse', { method: 'POST', body: JSON.stringify({ text }), timeout: 60000 });
      applyParsed(parsed);
      growAll(root);
      status.textContent = 'Готово! Проверь поля ниже и сохрани запись.';
    } catch (err) {
      console.error(err);
      status.textContent = err.data?.error || 'Не получилось разобрать. Попробуй ещё раз.';
    } finally {
      f('smartBtn').disabled = false;
    }
  });

  function setData(w) {
      setType(w.type === 'rest' ? 'rest' : w.competition ? 'competition' : 'training');
      setCompetition(w.competition);
      f('warmup').value = w.warmup || '';
      f('cooldown').value = w.cooldown || '';
      f('notes').value = w.notes || '';
      setVisibility(w.visibility, w.visible_to);
      startTime = w.start_time || null; endTime = w.end_time || null; paintTimes();
      setPlace(w);
      setSlider('feeling', w.feeling);
      setSlider('rpe', w.rpe);
      f('hrAvg').value = w.hr_avg ?? '';
      f('hrMax').value = w.hr_max ?? '';
      f('hrMin').value = w.hr_min ?? '';
      sets = (Array.isArray(w.sets) ? w.sets : []).map((s) => ({
        distance_m: s.duration_s ? durLabel(s.duration_s) : (s.distance_m ?? ''), reps: s.reps ?? '', time_or_pace: s.time_or_pace ?? '', rest_between: s.rest_between ?? '',
      }));
      exercises = (Array.isArray(w.exercises) ? w.exercises : []).map((e) => ({
        name: e.name ?? '', sets: e.sets ?? '', reps: e.reps ?? '', weight: e.weight ?? '',
      }));
      renderSets();
      renderExercises();
      syncOptional();
      growAll(root);
  }

  return {
    get type() { return type; },
    get mode() { return mode; },
    // что не так с заполнением (или пусто, если всё хорошо)
    problem() {
      if (mode === 'competition' && (!f('compDiscipline').value.trim() || !f('compResult').value.trim())) {
        return 'Укажи дисциплину и результат старта 🏆';
      }
      return '';
    },
    getPayload() {
      return {
        competition: mode === 'competition' ? {
          name: f('compName').value, discipline: f('compDiscipline').value,
          result: f('compResult').value, place: f('compPlace').value,
        } : null,
        type,
        warmup: f('warmup').value,
        cooldown: f('cooldown').value,
        feeling: Number(f('feeling').value),
        rpe: Number(f('rpe').value),
        notes: f('notes').value,
        visibility: vis,
        visible_to: vis === 'custom' ? visTo : [],
        start_time: startTime,
        end_time: endTime,
        ...(type === 'training' ? placeData() : { place: null, altitude_m: null, camp: false }),
        // в поле «метры» можно написать время («1'», «30"») — тогда это отрезок по времени
        sets: type === 'training' ? sets.map((x) => {
          const dur = looksLikeDuration(x.distance_m) ? parseDuration(x.distance_m) : null;
          return { ...x, duration_s: dur, distance_m: dur ? null : parseDistance(x.distance_m) };
        }) : [],
        exercises: type === 'training' ? exercises : [],
        hr_avg: f('hrAvg').value,
        hr_max: f('hrMax').value,
        hr_min: f('hrMin').value,
      };
    },
    setData,
    reset() {
      // на сборе место и высота переносятся из последней записи (если она не старше 3 дней)
      const lastCamp = (typeof myWorkouts !== 'undefined' ? myWorkouts : []).find((w) => w.type === 'training');
      const keep = lastCamp && lastCamp.camp && daysAgo(lastCamp.date) <= 3
        ? { place: lastCamp.place, place_lat: lastCamp.place_lat, place_lon: lastCamp.place_lon, altitude_m: lastCamp.altitude_m, camp: true } : {};
      optOpen.time = false; optOpen.place = false; optOpen.pulse = false;
      this.setData({ type: 'training', visibility: vis, visible_to: visTo, ...keep });
      f('smartText').value = '';
      f('smartStatus').textContent = '';
      growAll(root);
    },
  };
}

const mainForm = createWorkoutForm($('mainFormFields'), { getDate: () => entryDate });
const editForm = createWorkoutForm($('editFormFields'), { getDate: () => currentEditWorkout?.date });

// ---------- Заставка ----------
// Убираем заставку, когда надпись дописана (~1.4 c) и данные загрузились (но не дольше 4 c)
let splashGone = false;
function hideSplash() {
  if (splashGone) return;
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, 1400 - (Date.now() - (window.__splashStart || 0)));
  splashGone = true;
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 400);
  }, wait);
}
setTimeout(hideSplash, 4000); // запасной вариант, если сервер долго отвечает

// ---------- Инициализация ----------
async function init() {
  setEntryDate(localDateStr());
  showScreen('mainScreen');
  try {
    // start_param — если приложение открыли по ссылке-приглашению
    const { user } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ start_param: tg?.initDataUnsafe?.start_param || '' }) });
    currentUser = user;
    $('shareCalendarToggle').checked = user.share_calendar !== false;
    $('showRecordsToggle').checked = user.show_records !== false;
    $('reminderToggle').checked = user.remind_enabled !== false;
    $('digestToggle').checked = user.digest_on_pref !== false;
    $('partnersNotifyToggle').checked = user.partners_notify !== false;
    renderMySport();
    updateAvatar();
    updateFriendsBadge();
    setInterval(updateFriendsBadge, 60000); // раз в минуту проверяем новые реакции и заявки
    updateStats();
    await loadMyWorkouts();
    renderEntryState();
    loadGiveaway();
    loadAthleteProfile();
    loadMorning();
    loadStarts();
    loadManualRecords();
    loadGoals();
    // достижения: через пару секунд, когда подгрузятся анкета и утренние отметки
    setTimeout(() => { achievementsReady = true; renderAchievements(); }, 2500);
    // новичку — короткое знакомство с приложением
    if (!myWorkouts.length && !tourStorage()) setTimeout(openTour, 1500);
    // открыли по ссылке-приглашению в группу — предложим вступить
    const joinCode = pendingJoinCode();
    if (joinCode) setTimeout(() => joinGroupFlow(joinCode), 1700);
    // открыли по кнопке «Открыть пробежку» из бота (?run=12)
    const runId = parseInt(new URLSearchParams(location.search).get('run'), 10);
    if (runId > 0 && !joinCode) setTimeout(() => openRun(runId), 1200);
  } catch (err) {
    console.error('Login failed', err);
    $('statusMsg').textContent = 'Не удалось связаться с сервером. Попробуй открыть приложение ещё раз.';
    hideSplash();
    setTimeout(async () => {
      const again = await showDialog({
        icon: 'warn',
        title: 'Нет связи с Forma',
        text: err.network
          ? 'Сервер не отвечает. Проверь интернет. В России без VPN приложение пока может не открываться — включи VPN и попробуй снова.'
          : 'Сервер ответил ошибкой. Попробуй ещё раз через минуту.',
        ok: 'Повторить',
        cancel: 'Закрыть',
      });
      if (again) location.reload();
    }, 1500);
    return;
  }
  hideSplash();
}

async function loadMyWorkouts() {
  const { workouts, streak } = await api('/api/workouts');
  myWorkouts = workouts.map((w) => ({ ...w, date: normDate(w.date) }));
  workoutsByDate = {};
  myWorkouts.forEach((w) => { (workoutsByDate[w.date] = workoutsByDate[w.date] || []).push(w); });
  Object.values(workoutsByDate).forEach((list) => list.sort((a, b) => (a.session || 1) - (b.session || 1)));
  if (currentUser && streak) {
    currentUser.current_streak = streak.current;
    currentUser.longest_streak = streak.longest;
  }
  updateStats();
}

function applyStreak(streak) {
  if (!currentUser || !streak) return;
  currentUser.current_streak = streak.current;
  currentUser.longest_streak = streak.longest;
  updateStats();
}

// Цифры в шапке, на главной и в профиле
function updateStats() {
  const cur = currentUser?.current_streak ?? 0;
  const best = currentUser?.longest_streak ?? 0;
  const monday = mondayOf(localDateStr());
  const weekTrainings = myWorkouts.filter((w) => w.type === 'training' && w.date >= monday).length;
  const total = myWorkouts.filter((w) => w.type === 'training').length;
  const monthStart = localDateStr().slice(0, 8) + '01';
  const monthTrainings = myWorkouts.filter((w) => w.type === 'training' && w.date >= monthStart).length;
  const from30 = addDays(localDateStr(), -29);
  const last30 = myWorkouts.filter((w) => w.type === 'training' && w.date >= from30).length;

  $('streakCurrent').textContent = cur;
  $('statStreak').textContent = cur;
  $('statWeek').textContent = weekTrainings;
  $('statMonth').textContent = monthTrainings;
  $('profileStreak').textContent = cur;
  $('profileMonth').textContent = last30;
  $('profileTotal').textContent = total;
  // рекорд серии — не отдельной плиткой, а маленькой меткой в профиле
  const pno = currentUser?.pioneer_no;
  $('profilePioneer').innerHTML = pno ? `${ico('rocket')} Первопроходец №${pno}` : '';
  $('profilePioneer').classList.toggle('hidden', !pno);
  $('profileRecord').innerHTML = `${ico('trophy')} рекорд ${best} дн.`;
  $('profileRecord').classList.toggle('hidden', best < 2);
  try { renderChallenges(); } catch (e) {}
}

// ---------- Аватар: своё фото → фото из Telegram → значок ----------
function getAvatarUrl() {
  return currentUser?.avatar_data || tg?.initDataUnsafe?.user?.photo_url || '';
}

function updateAvatar() {
  const url = getAvatarUrl();
  const img = $('avatarImg');
  if (url) {
    img.src = url;
    img.classList.remove('hidden');
    $('avatarFallback').classList.add('hidden');
  } else {
    img.classList.add('hidden');
    $('avatarFallback').classList.remove('hidden');
  }
  const hero = $('profileHero');
  hero.style.backgroundImage = url ? `url("${url}")` : '';
  hero.classList.toggle('no-photo', !url);
  $('photoResetBtn').classList.toggle('hidden', !currentUser?.avatar_data);
}

// ---------- Выбор даты записи ----------
function setEntryDate(dateStr) {
  const today = localDateStr();
  const minDate = addDays(today, -MAX_BACKFILL_DAYS);
  if (!dateStr || dateStr > today) dateStr = today; // в будущее писать нельзя
  if (dateStr < minDate) dateStr = minDate;        // и слишком далеко в прошлое тоже
  entrySession = 1;

  entryDate = dateStr;

  const input = $('entryDate');
  input.max = today;
  input.min = minDate;
  input.value = dateStr;

  $('entryTitle').textContent = `Запись за ${relativeDateLabel(dateStr)}`;

  document.querySelectorAll('.date-picker-row .chip').forEach((chip) => {
    const chipDate = addDays(today, -Number(chip.dataset.shift));
    chip.classList.toggle('active', chipDate === dateStr);
  });

  $('statusMsg').textContent = '';
  if (dateStr !== justSavedDate) justSavedDate = null;

  renderEntryState();
}

// Главный экран в двух состояниях:
//  - на выбранную дату записи ещё нет → показываем форму;
//  - запись уже есть (или только что сохранена) → прячем форму и показываем карточку с итогом.
function renderEntryState() {
  const list = workoutsByDate[entryDate] || [];
  const form = $('entryForm');
  const done = $('entryDone');
  const label = relativeDateLabel(entryDate);

  // режим «вторая тренировка»: форма только для тренировки, без «Отдыха»
  $('mainFormFields').classList.toggle('second-mode', entrySession === 2);

  if (!list.length || entrySession === 2) {
    done.classList.add('hidden');
    form.classList.remove('hidden');
    $('entryTitle').textContent = entrySession === 2 ? `Вторая тренировка за ${label}` : `Запись за ${label}`;
    $('entryBackBtn')?.classList.toggle('hidden', entrySession !== 2);
    return;
  }

  $('entryTitle').textContent = `Запись за ${label}`;
  form.classList.add('hidden');
  done.classList.remove('hidden');

  $('doneTitle').innerHTML = ico('check') + esc(
    justSavedDate === entryDate ? `Запись за ${label} сохранена` : `За ${label} запись уже есть`);

  // каждая запись дня — отдельный блок со своими кнопками
  const box = $('doneList');
  box.innerHTML = '';
  list.forEach((w) => {
    const block = document.createElement('div');
    block.className = 'done-block';
    const pb = w.competition && isPersonalBest(w);
    const title = w.type === 'rest' ? 'День отдыха' : w.competition ? 'Старт' : list.length > 1 ? `Тренировка ${w.session || 1}` : 'Тренировка';
    block.innerHTML = `
      <div class="done-block-title">${ico(entryKindIco(w))}${esc(title)}${pb ? '<span class="pb-badge">Личный рекорд!</span>' : ''}</div>
      <div class="done-summary"></div>
      ${w.ai_feedback ? '<div class="ai-box"><div class="ai-box-title"><span class="fom-badge">F</span> Fom</div><div class="fb"></div></div>' : ''}
      <div class="btn-row">
        <button type="button" class="ghost-btn share">${ico('share')} Поделиться</button>
        <button type="button" class="ghost-btn edit">${ico('pen')} Изменить</button>
      </div>`;
    block.querySelector('.done-summary').textContent = buildDetailLines(w).join('\n');
    if (w.ai_feedback) block.querySelector('.fb').textContent = w.ai_feedback;
    block.querySelector('.share').addEventListener('click', () => shareWorkout(w));
    block.querySelector('.edit').addEventListener('click', () => openEditScreen(w.id, 'mainScreen'));
    box.appendChild(block);
  });

  // вторую тренировку можно добавить, если первая — тренировка и второй ещё нет
  const canAdd = list.length === 1 && list[0].type === 'training';
  $('doneAddBtn').classList.toggle('hidden', !canAdd);
}

document.querySelectorAll('.date-picker-row .chip').forEach((chip) => {
  chip.addEventListener('click', () => setEntryDate(addDays(localDateStr(), -Number(chip.dataset.shift))));
});
$('entryDate').addEventListener('change', (e) => setEntryDate(e.target.value));

$('doneAddBtn').addEventListener('click', () => {
  entrySession = 2;
  mainForm.reset();
  renderEntryState();
  window.scrollTo(0, 0);
});
$('entryBackBtn')?.addEventListener('click', () => {
  entrySession = 1;
  renderEntryState();
});

// ---------- Сохранение новой записи ----------
$('saveBtn').addEventListener('click', async () => {
  const statusEl = $('statusMsg');
  const saveBtn = $('saveBtn');
  const problem = mainForm.problem();
  if (problem) { $('statusMsg').textContent = problem; haptic('warning'); return; }
  const payload = { date: entryDate, session: entrySession, ...mainForm.getPayload() };
  if (entrySession === 2) payload.type = 'training';

  saveBtn.disabled = true;
  statusEl.textContent = payload.type === 'training' ? 'Сохраняю, Fom смотрит тренировку...' : 'Сохраняю...';

  try {
    const result = await api('/api/workouts', { method: 'POST', body: JSON.stringify(payload), timeout: 60000 });
    applyStreak(result.streak);

    // обновляем список записей — из него рисуется карточка «сохранено», календарь и цифры
    try {
      await loadMyWorkouts();
    } catch (e) {
      const w = { ...result.workout, date: normDate(result.workout.date) };
      (workoutsByDate[w.date] = workoutsByDate[w.date] || []).push(w);
    }

    statusEl.textContent = '';
    const savedW = myWorkouts.find((x) => x.id === result.workout?.id);
    if (savedW && isPersonalBest(savedW)) {
      haptic('heavy');
      setTimeout(() => haptic('success'), 180);
      showDialog({ icon: 'trophy', title: 'Личный рекорд! 🎉', text: `${savedW.competition.discipline} — ${savedW.competition.result}. Так держать!`, ok: 'Ура!' });
    } else {
      haptic('success');
    }
    justSavedDate = entryDate;
    entrySession = 1;
    setTimeout(renderAchievements, 900); // вдруг открылось новое достижение
    loadGiveaway(); // серия могла вырасти — обновим статус розыгрышей
    mainForm.reset();
    renderEntryState();
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    haptic('error');
    statusEl.textContent = err.data?.error || 'Ошибка сохранения. Попробуй ещё раз.';
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------- Профиль + календарь ----------
let calMonth = new Date(); // какой месяц показывает календарь

async function loadProfileScreen() {
  const tgUser = tg?.initDataUnsafe?.user;
  const name = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') || currentUser?.first_name || 'Спортсмен';
  const uname = tgUser?.username || currentUser?.username;
  $('profileName').innerHTML = esc(name) + (isVerified(uname) ? VERIFIED_BADGE : '');
  $('profileUsername').textContent = uname ? '@' + uname : 'спортсмен';
  updateAvatar();

  renderCalendar(); // сразу рисуем по тому, что уже загружено
  renderHistory();
  renderRecords();
  renderAchievements();
  renderStarts();

  // число друзей — метка в профиле, по нажатию открывается список друзей
  api('/api/friends')
    .then(({ friends }) => {
      $('profileFriends').innerHTML = friendsLabel(friends.length);
      $('profileFriends').classList.remove('hidden');
    })
    .catch((err) => console.error('Friends count failed', err));

  try {
    await loadMyWorkouts();
    renderCalendar();
    renderHistory();
    renderRecords();
  } catch (err) {
    console.error('Failed to load history', err);
  }
}

function renderCalendar() {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const today = localDateStr();
  const now = new Date();

  $('calTitle').textContent = `${MONTHS[m]} ${y}`;
  $('calNext').disabled = y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());

  const grid = $('calGrid');
  grid.innerHTML = '';

  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // понедельник — первый день недели
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('span');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }

  let trainings = 0;
  let rests = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = localDateStr(new Date(y, m, d));
    const dayList = workoutsByDate[ds] || [];
    const w = dayList[0];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell';
    cell.textContent = d;

    if (w) {
      cell.classList.add(w.type === 'training' ? 'has-training' : 'has-rest');
      if (dayList.length > 1) cell.classList.add('double'); // две тренировки за день
      if (dayList.some((x) => x.competition)) cell.classList.add('has-comp'); // старт
      dayList.forEach((x) => { if (x.type === 'training') trainings++; else rests++; });
    }
    if (ds === today) cell.classList.add('today');

    if (ds > today) {
      cell.classList.add('future');
      cell.disabled = true;
    } else {
      if (!w && ds < addDays(today, -MAX_BACKFILL_DAYS)) cell.classList.add('too-old');
      cell.addEventListener('click', () => {
        if (w) {
          openEditScreen(w.id, 'profileScreen');
        } else if (ds >= addDays(today, -MAX_BACKFILL_DAYS)) {
          setEntryDate(ds); // пустой день — форма новой записи на эту дату
          showScreen('mainScreen');
        } else {
          showDialog({ icon: 'calendar', title: 'Только сегодня и вчера', text: 'Новую запись можно добавить только за сегодня или за вчера. Уже сделанные записи можно открыть и поправить.' });
        }
      });
    }
    grid.appendChild(cell);
  }

  $('calSummary').textContent =
    trainings + rests === 0
      ? 'В этом месяце записей пока нет.'
      : `За месяц: тренировок — ${trainings}, дней отдыха — ${rests}.`;
}

// Список «Последние записи» убран — всё есть в календаре. Функция осталась на случай, если вернём.
function renderHistory() {
  const list = $('historyList');
  if (!list) return;
  list.innerHTML = '';
  if (myWorkouts.length === 0) {
    list.innerHTML = '<div class="empty-hint">Записей пока нет.</div>';
    return;
  }
  myWorkouts.slice(0, 10).forEach((w) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item';
    const isTraining = w.type === 'training';
    const bits = [];
    if (isTraining && Array.isArray(w.sets) && w.sets.length) bits.push('бег');
    if (isTraining && Array.isArray(w.exercises) && w.exercises.length) bits.push('ОФП');
    if (isTraining && w.rpe) bits.push(`RPE ${w.rpe}`);
    item.innerHTML = `
      <span class="history-ico ${isTraining ? 'tr' : 'rs'}">${ico(isTraining ? 'runner' : 'moon')}</span>
      <span class="history-main">
        <span class="history-date">${esc(formatWithWeekday(w.date))}</span>
        <span class="history-sub">${isTraining ? (w.session > 1 ? 'Вторая тренировка' : 'Тренировка') : 'Отдых'}${bits.length ? ' · ' + esc(bits.join(' · ')) : ''}</span>
      </span>
      <span class="history-arrow">›</span>`;
    item.addEventListener('click', () => openEditScreen(w.id, 'profileScreen'));
    list.appendChild(item);
  });
}

$('calPrev').addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  renderCalendar();
});
$('calNext').addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  renderCalendar();
});

function openProfile() {
  calMonth = new Date(); // при каждом открытии — текущий месяц
  showScreen('profileScreen');
  loadProfileScreen();
}
$('profileBtn').addEventListener('click', openProfile);
$('profileNavBtn').addEventListener('click', openProfile);

// ---------- Смена фото профиля ----------
$('photoBtn').addEventListener('click', () => $('photoSheet').classList.remove('hidden'));
$('photoCancelBtn').addEventListener('click', () => $('photoSheet').classList.add('hidden'));
$('photoSheet').addEventListener('click', (e) => {
  if (e.target === $('photoSheet')) $('photoSheet').classList.add('hidden');
});
$('photoPickBtn').addEventListener('click', () => {
  $('photoSheet').classList.add('hidden');
  $('photoInput').click();
});
$('photoResetBtn').addEventListener('click', async () => {
  $('photoSheet').classList.add('hidden');
  try {
    await api('/api/auth/avatar', { method: 'POST', body: JSON.stringify({ image: null }) });
    currentUser.avatar_data = null;
    updateAvatar();
  } catch (err) {
    console.error(err);
    alertMsg('Не удалось вернуть фото. Попробуй ещё раз.');
  }
});

// ---------- Наше окно-сообщение (вместо системного alert / confirm) ----------
// showDialog({ icon, title, text, ok, cancel, danger }) → Promise: true — нажали «ок», false — отмена
let dialogResolve = null;
function showDialog({ icon = '', title = '', text = '', ok = 'Понятно', cancel = '', danger = false } = {}) {
  if (dialogResolve) dialogResolve(false); // предыдущее окно закрываем
  $('dlgIcon').innerHTML = icon ? ico(icon) : '';
  $('dlgIcon').classList.toggle('hidden', !icon);
  $('dlgTitle').textContent = title;
  $('dlgTitle').classList.toggle('hidden', !title);
  $('dlgText').textContent = text;
  $('dlgText').classList.toggle('hidden', !text);
  const btns = $('dlgBtns');
  btns.innerHTML = '';
  return new Promise((resolve) => {
    dialogResolve = resolve;
    const close = (val) => {
      if (dialogResolve !== resolve) return;
      dialogResolve = null;
      $('dialog').classList.add('closing');
      setTimeout(() => $('dialog').classList.add('hidden'), 160);
      resolve(val);
    };
    if (cancel) {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'dlg-btn'; c.textContent = cancel;
      c.addEventListener('click', () => close(false));
      btns.appendChild(c);
    }
    const o = document.createElement('button');
    o.type = 'button'; o.className = 'dlg-btn main' + (danger ? ' danger' : ''); o.textContent = ok;
    o.addEventListener('click', () => close(true));
    btns.appendChild(o);
    $('dialog').onclick = (e) => { if (e.target === $('dialog')) close(false); };
    $('dialog').classList.remove('hidden', 'closing');
    haptic(danger || icon === 'calendar' || icon === 'warn' ? 'warning' : icon === 'info' ? 'error' : 'light');
  });
}
function alertMsg(text) { return showDialog({ icon: 'info', text }); }
function confirmAsk(opts) { return showDialog({ cancel: 'Отмена', ...opts }); }
function dialogOpen() { return !$('dialog').classList.contains('hidden'); }
function closeDialog() { if (dialogResolve) { const r = dialogResolve; dialogResolve = null; $('dialog').classList.add('hidden'); r(false); } }

// =====================================================================
//  ДРУЗЬЯ: лента, профиль друга, реакции, комментарии, активность
// =====================================================================
const REACTIONS = ['🔥', '👏', '💪', '🚀'];

// ---------- Вибрация (отклик телефона на нажатия и жесты) ----------
// kind: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' — толчок;
//       'success' | 'warning' | 'error' — «уведомление»; 'select' — лёгкий щелчок выбора.
let lastHaptic = 0;
function haptic(kind = 'light') {
  const now = Date.now();
  if (now - lastHaptic < 35) return; // две вибрации подряд от одного нажатия — не нужно
  lastHaptic = now;
  try {
    const h = tg?.HapticFeedback;
    if (!h) return;
    if (kind === 'select') h.selectionChanged();
    else if (kind === 'success' || kind === 'warning' || kind === 'error') h.notificationOccurred(kind);
    else h.impactOccurred(kind);
  } catch (e) {}
}

// «только что», «5 мин», «3 ч», «вчера», «19 сентября»
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  const day = localDateStr(new Date(iso));
  if (day === addDays(localDateStr(), -1)) return 'вчера';
  return formatDayMonth(day);
}

// «1 друг», «3 друга», «12 друзей»
function friendsLabel(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${ico('people')} ${n} друг`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${ico('people')} ${n} друга`;
  return `${ico('people')} ${n} друзей`;
}

// Имя полностью: имя + фамилия из Telegram (если фамилии нет — только имя, если и его нет — @username)
function personName(u) {
  const full = [u?.first_name, u?.last_name].filter(Boolean).join(' ');
  return full || (u?.username ? '@' + u.username : 'Спортсмен');
}

// Имя + синяя галочка (если положена)
function nameHtml(u) {
  return esc(personName(u)) + (isVerified(u?.username) ? VERIFIED_BADGE : '');
}

// Ссылка на фото человека (своё — сразу, друга — через сервер с проверкой, что вы друзья)
function avatarSrc(u) {
  if (!u) return '';
  if (currentUser && u.id === currentUser.id) return getAvatarUrl();
  if (!u.avatar_v) return '';
  return `${API_BASE}/api/friends/avatar/${u.id}?v=${u.avatar_v}&auth=${encodeURIComponent(tg?.initData || '')}`;
}

// Кружок с фото; если фото нет или не загрузилось — первая буква имени
function avatarHtml(u, extra = '') {
  const letter = esc(personName(u).replace('@', '').slice(0, 1).toUpperCase());
  const src = avatarSrc(u);
  return `<span class="friend-ava ${extra}">${letter}${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
}

// «тренировался сегодня / вчера / 3 дн. назад»
function lastTrainingLabel(date) {
  if (!date) return 'пока без тренировок';
  const d = normDate(date);
  const today = localDateStr();
  if (d === today) return 'тренировался сегодня 💪';
  if (d === addDays(today, -1)) return 'тренировался вчера';
  const days = Math.round((parseDateStr(today) - parseDateStr(d)) / 86400000);
  return days < 30 ? `тренировался ${days} дн. назад` : `последняя тренировка ${formatDayMonth(d)}`;
}

// ---------- Карточка тренировки (лента и профиль друга) ----------
function buildWorkoutCard(w, { showAuthor = true } = {}) {
  const card = document.createElement('article');
  card.className = 'card wk-card';
  card.id = 'wk-' + w.id;
  const isMine = currentUser && w.user_id === currentUser.id;
  // RPE и самочувствие показываем цветными значками, поэтому в тексте их не повторяем
  const lines = buildDetailLines(w).filter((l) => !l.startsWith('Самочувствие') && !l.startsWith('RPE'));
  const chips = [];
  // личный рекорд на старте — заметный значок, чтобы друзья сразу видели и ставили 🔥
  if (w.competition && (w.is_pb || (isMine && isPersonalBest(w)))) chips.push(`<span class="wk-chip pb-chip">${ico('trophy')} Личный рекорд</span>`);
  if (w.rpe) chips.push(`<span class="wk-chip" style="color:${scaleColor(w.rpe, true)}">RPE ${esc(w.rpe)}</span>`);
  if (w.feeling) chips.push(`<span class="wk-chip" style="color:${scaleColor(w.feeling)}">😊 ${esc(w.feeling)}/10</span>`);

  card.innerHTML = `
    <div class="wk-head">
      ${showAuthor ? avatarHtml(w.author) : ''}
      <div class="wk-head-main">
        ${showAuthor ? `<button type="button" class="wk-author">${nameHtml(w.author)}${isMine ? ' <span class="muted">· ты</span>' : ''}</button>` : ''}
        <div class="wk-date">${esc(formatWithWeekday(normDate(w.date)))} · ${ico(entryKindIco(w))} ${entryKindLabel(w)}</div>
      </div>
    </div>
    ${chips.length ? `<div class="wk-chips">${chips.join('')}</div>` : ''}
    ${lines.length ? `<div class="wk-body">${esc(lines.join('\n'))}</div>` : ''}`;

  const authorBtn = card.querySelector('.wk-author');
  if (authorBtn) authorBtn.addEventListener('click', () => (isMine ? openProfile() : openFriendProfile(w.user_id)));
  card.appendChild(buildSocial(w));
  return card;
}

// ---------- Реакции + комментарии под тренировкой ----------
function buildSocial(w, { openThread = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'social';
  wrap.innerHTML = `<div class="react-bar"></div><div class="thread hidden"></div>`;
  const bar = wrap.querySelector('.react-bar');
  const thread = wrap.querySelector('.thread');

  function renderBar() {
    bar.innerHTML = '';
    REACTIONS.forEach((emoji) => {
      const n = w.reactions?.[emoji] || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'react-btn' + (w.my_reaction === emoji ? ' mine' : '') + (n ? ' has' : '');
      b.innerHTML = `<span class="react-emoji">${emoji}</span>${n ? `<b>${n}</b>` : ''}`;
      b.addEventListener('click', () => toggleReaction(emoji, b));
      bar.appendChild(b);
    });
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'react-btn comment-btn' + (thread.classList.contains('hidden') ? '' : ' mine');
    c.innerHTML = `<span class="react-emoji">💬</span>${w.comments_count ? `<b>${w.comments_count}</b>` : ''}`;
    c.addEventListener('click', () => {
      thread.classList.toggle('hidden');
      renderBar();
      if (!thread.classList.contains('hidden')) loadThread();
    });
    bar.appendChild(c);
  }

  async function toggleReaction(emoji, btn) {
    haptic();
    const before = { reactions: { ...(w.reactions || {}) }, my_reaction: w.my_reaction };
    // сразу показываем результат, не дожидаясь сервера
    const r = { ...(w.reactions || {}) };
    if (w.my_reaction) r[w.my_reaction] = Math.max(0, (r[w.my_reaction] || 1) - 1);
    if (w.my_reaction === emoji) {
      w.my_reaction = null;
    } else {
      r[emoji] = (r[emoji] || 0) + 1;
      w.my_reaction = emoji;
    }
    Object.keys(r).forEach((k) => { if (!r[k]) delete r[k]; });
    w.reactions = r;
    renderBar();
    if (w.my_reaction === emoji) bar.children[REACTIONS.indexOf(emoji)]?.classList.add('pop');
    try {
      const res = await api(`/api/friends/workouts/${w.id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });
      w.reactions = res.reactions;
      w.my_reaction = res.my_reaction;
      renderBar();
      if (!thread.classList.contains('hidden')) loadThread();
    } catch (err) {
      console.error(err);
      Object.assign(w, before);
      renderBar();
    }
  }

  async function loadThread() {
    thread.innerHTML = '<div class="muted thread-loading">Загружаю...</div>';
    try {
      const { reactions, comments } = await api(`/api/friends/workouts/${w.id}/social`);
      w.comments_count = comments.length;
      renderBar();
      thread.innerHTML = '';

      if (reactions.length) {
        const who = document.createElement('div');
        who.className = 'who-reacted';
        who.innerHTML = reactions.map((r) => `<span>${r.emoji} ${nameHtml(r)}</span>`).join('');
        thread.appendChild(who);
      }

      comments.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'comment';
        row.innerHTML = `
          ${avatarHtml(c, 'small')}
          <div class="comment-main">
            <div class="comment-top"><b>${nameHtml(c)}</b><span class="muted">${esc(timeAgo(c.created_at))}</span></div>
            <div class="comment-text">${esc(c.text)}</div>
          </div>
          ${c.can_delete ? '<button type="button" class="comment-del" aria-label="Удалить">✕</button>' : ''}`;
        row.querySelector('.comment-del')?.addEventListener('click', async () => {
          if (!(await confirmAsk({ icon: 'trash', title: 'Удалить комментарий?', ok: 'Удалить', danger: true }))) return;
          try {
            await api(`/api/friends/comments/${c.comment_id}`, { method: 'DELETE' });
            loadThread();
          } catch (err) { console.error(err); }
        });
        thread.appendChild(row);
      });

      if (!reactions.length && !comments.length) {
        const empty = document.createElement('div');
        empty.className = 'muted thread-empty';
        empty.textContent = 'Пока тихо. Напиши первым 👇';
        thread.appendChild(empty);
      }

      const form = document.createElement('div');
      form.className = 'comment-form';
      form.innerHTML = `
        <input type="text" maxlength="500" placeholder="Комментарий..." autocomplete="off" />
        <button type="button" class="send-btn small" aria-label="Отправить">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M3.4 20.4 21.85 12.5a.55.55 0 0 0 0-1L3.4 3.6a.5.5 0 0 0-.7.6L5 11l9 1-9 1-2.3 6.8a.5.5 0 0 0 .7.6Z"/></svg>
        </button>`;
      const input = form.querySelector('input');
      const send = async () => {
        const text = input.value.trim();
        if (!text) return;
        input.disabled = true;
        try {
          await api(`/api/friends/workouts/${w.id}/comments`, { method: 'POST', body: JSON.stringify({ text }) });
          haptic();
          await loadThread();
        } catch (err) {
          console.error(err);
          input.disabled = false;
        }
      };
      form.querySelector('button').addEventListener('click', send);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      thread.appendChild(form);
    } catch (err) {
      console.error(err);
      thread.innerHTML = '<div class="muted thread-loading">Не удалось загрузить комментарии.</div>';
    }
  }

  if (openThread) thread.classList.remove('hidden');
  renderBar();
  if (openThread) loadThread();
  return wrap;
}

// ---------- Значок на кнопке «Друзья»: новые реакции, комментарии, заявки ----------
async function updateFriendsBadge() {
  try {
    const res = await api('/api/friends/activity/count');
    const unread = res.unread || 0;
    const requests = res.requests || 0;
    const total = unread + requests;
    const badge = $('friendsBadge');
    badge.textContent = total > 9 ? '9+' : total;
    badge.classList.toggle('hidden', total === 0);
    const rb = $('requestsBadge');
    rb.textContent = requests;
    rb.classList.toggle('hidden', requests === 0);
  } catch (err) {
    console.error('Badge failed', err);
  }
}

// ---------- Экран «Друзья»: вкладки ----------
let friendsTab = 'feed';
let feedCursor = null;

function setFriendsTab(tab) {
  friendsTab = tab;
  document.querySelectorAll('#friendsTabs .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('feedTab').classList.toggle('hidden', tab !== 'feed');
  $('runsTab').classList.toggle('hidden', tab !== 'runs');
  $('listTab').classList.toggle('hidden', tab !== 'list');
  $('groupsTab').classList.toggle('hidden', tab !== 'groups');
  if (tab === 'feed') loadFeedTab();
  else if (tab === 'runs') loadRunsTab();
  else if (tab === 'groups') loadGroupsTab();
  else loadFriendsList();
}
document.querySelectorAll('#friendsTabs .seg-btn').forEach((b) => b.addEventListener('click', () => setFriendsTab(b.dataset.tab)));

$('friendsBtn').addEventListener('click', () => {
  showScreen('friendsScreen');
  setFriendsTab(friendsTab);
});

// ---------- Лента ----------
async function loadFeedTab() {
  loadActivity();
  feedCursor = null;
  $('feedList').innerHTML = '';
  await loadFeedPage();
}

async function loadFeedPage() {
  const status = $('feedStatus');
  const more = $('feedMoreBtn');
  status.textContent = 'Загружаю ленту...';
  more.classList.add('hidden');
  try {
    const qs = feedCursor ? `?before_date=${feedCursor.date}&before_id=${feedCursor.id}` : '';
    const { workouts } = await api('/api/friends/feed' + qs);
    status.textContent = '';
    workouts.forEach((w) => $('feedList').appendChild(buildWorkoutCard(w)));
    if (workouts.length) {
      const last = workouts[workouts.length - 1];
      feedCursor = { date: normDate(last.date), id: last.id };
    }
    more.classList.toggle('hidden', workouts.length < 15);
    if (!$('feedList').children.length) {
      $('feedList').innerHTML = `
        <div class="card empty-feed">
          <div class="empty-feed-ico">👟</div>
          <div class="empty-feed-title">Лента пока пустая</div>
          <div class="muted">Здесь появляются открытые тренировки — твои и друзей. Включи «Показывать друзьям» в записи, а друзей добавь во вкладке «Друзья».</div>
        </div>`;
    }
  } catch (err) {
    console.error(err);
    status.textContent = 'Не удалось загрузить ленту.';
  }
}
$('feedMoreBtn').addEventListener('click', loadFeedPage);

// ---------- Активность: реакции и комментарии к моим тренировкам ----------
async function loadActivity() {
  try {
    const { items } = await api('/api/friends/activity');
    const card = $('activityCard');
    const list = $('activityList');
    list.innerHTML = '';
    card.classList.toggle('hidden', items.length === 0);
    items.slice(0, 8).forEach((a) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'activity-item' + (a.unread ? ' unread' : '');
      const what = a.kind === 'reaction'
        ? `поставил(а) ${a.emoji} твоей тренировке за ${esc(formatDayMonth(normDate(a.date)))}`
        : `: «${esc(a.text.length > 80 ? a.text.slice(0, 80) + '…' : a.text)}»`;
      row.innerHTML = `
        ${avatarHtml(a, 'small')}
        <span class="activity-text"><b>${nameHtml(a)}</b>${a.kind === 'reaction' ? ' ' : ''}${what}</span>
        <span class="muted activity-time">${esc(timeAgo(a.created_at))}</span>`;
      row.addEventListener('click', () => openEditScreen(a.workout_id, 'friendsScreen'));
      list.appendChild(row);
    });
    updateFriendsBadge(); // после просмотра новые события считаются прочитанными
  } catch (err) {
    console.error('Activity failed', err);
  }
}

// ---------- Список друзей и заявки ----------
async function loadFriendsList() {
  const statusEl = $('friendRequestStatus');
  statusEl.textContent = '';

  try {
    const [{ requests }, { friends }] = await Promise.all([api('/api/friends/requests'), api('/api/friends')]);

    const reqList = $('incomingRequestsList');
    reqList.innerHTML = '';
    $('incomingRequestsBlock').classList.toggle('hidden', requests.length === 0);
    requests.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'friend-item';
      div.innerHTML = `
        ${avatarHtml(r)}
        <span class="friend-name">${nameHtml(r)} <span class="muted">${r.username ? '@' + esc(r.username) : ''}</span></span>
        <span class="friend-actions">
          <button class="mini-btn accept" type="button">Принять</button>
          <button class="mini-btn decline" type="button">✕</button>
        </span>`;
      div.querySelector('.accept').addEventListener('click', async () => {
        haptic('medium');
        await api('/api/friends/accept', { method: 'POST', body: JSON.stringify({ friendshipId: r.friendship_id }) });
        loadFriendsList();
        updateFriendsBadge();
      });
      div.querySelector('.decline').addEventListener('click', async () => {
        await api('/api/friends/decline', { method: 'POST', body: JSON.stringify({ friendshipId: r.friendship_id }) });
        loadFriendsList();
        updateFriendsBadge();
      });
      reqList.appendChild(div);
    });

    const friendsList = $('friendsList');
    friendsList.innerHTML = '';
    if (friends.length === 0) {
      friendsList.innerHTML = '<div class="empty-hint">Пока нет друзей — добавь кого-нибудь по username выше.</div>';
    } else {
      friends.forEach((fr) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'friend-item clickable';
        btn.innerHTML = `
          ${avatarHtml(fr)}
          <span class="friend-name">${nameHtml(fr)}
            <span class="friend-sub">${fr.sport ? esc(sportLabel(fr, { short: true })) + ' · ' : ''}${esc(lastTrainingLabel(fr.last_training))}</span>
          </span>
          <span class="friend-streak">${ico('flame')} ${esc(fr.current_streak ?? 0)}</span>
          <span class="history-arrow">›</span>`;
        btn.addEventListener('click', () => openFriendProfile(fr.id));
        friendsList.appendChild(btn);
      });
    }
  } catch (err) {
    console.error('Failed to load friends', err);
    statusEl.textContent = 'Не удалось загрузить друзей.';
  }
}

$('sendRequestBtn').addEventListener('click', async () => {
  const input = $('friendUsernameInput');
  const statusEl = $('friendRequestStatus');
  const username = input.value.trim();
  if (!username) return;

  statusEl.textContent = 'Отправляю...';
  try {
    await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ username }) });
    statusEl.textContent = 'Заявка отправлена ✓';
    input.value = '';
  } catch (err) {
    statusEl.textContent = err.message || 'Не удалось отправить заявку.';
  }
});

// ---------- Профиль друга ----------
let fpData = null;       // что пришло с сервера
let fpMonth = new Date(); // какой месяц показывает календарь друга
let fpReturnScreen = 'friendsScreen';

async function openFriendProfile(userId, returnTo) {
  fpReturnScreen = returnTo || (document.querySelector('.screen:not(.hidden)')?.id === 'profileScreen' ? 'profileScreen' : 'friendsScreen');
  showScreen('friendProfileScreen');
  fpData = null;
  fpMonth = new Date();
  $('fpWorkouts').innerHTML = '';
  $('fpStatus').textContent = 'Загружаю профиль...';
  $('fpName').textContent = '';
  $('fpHeadName').textContent = '';
  $('fpCalGrid').innerHTML = '';

  try {
    fpData = await api(`/api/friends/${userId}/profile`);
    const u = fpData.user;
    const isMe = currentUser && u.id === currentUser.id;
    $('fpStatus').textContent = '';
    $('fpHeadName').innerHTML = nameHtml(u);
    $('fpName').innerHTML = nameHtml(u);
    $('fpEyebrow').textContent = sportLabel(u) || (isMe ? 'Так тебя видят друзья' : 'Друг');
    $('fpUsername').textContent = u.username ? '@' + u.username : 'спортсмен';
    $('fpStreak').textContent = u.current_streak ?? 0;
    $('fpMonth').textContent = fpData.stats?.last30 ?? 0;
    $('fpTotal').textContent = fpData.stats?.total ?? 0;
    $('fpPioneer').innerHTML = u.pioneer_no ? `${ico('rocket')} Первопроходец №${esc(u.pioneer_no)}` : '';
    $('fpPioneer').classList.toggle('hidden', !u.pioneer_no);
    $('fpRecord').innerHTML = `${ico('trophy')} рекорд ${esc(u.longest_streak ?? 0)} дн.`;
    $('fpRecord').classList.toggle('hidden', (u.longest_streak ?? 0) < 2);
    $('fpRemoveBtn').classList.toggle('hidden', isMe);
    $('fpFriends').innerHTML = friendsLabel(fpData.stats?.friends ?? 0);
    $('fpFriends').classList.toggle('hidden', fpData.stats?.friends == null);

    const src = avatarSrc(u);
    const hero = $('fpHero');
    hero.style.backgroundImage = src ? `url("${src}")` : '';
    hero.classList.toggle('no-photo', !src);

    $('fpCalHelp').textContent = u.share_calendar === false && !isMe
      ? 'Отмечены только открытые тренировки. Нажми на день — покажем её.'
      : 'Нажми на отмеченный день — покажем тренировку. Закрытые дни видны без подробностей.';

    renderFpCalendar();
    renderFpRecords(fpData.records, isMe, u);

    const list = $('fpWorkouts');
    if (!fpData.workouts.length) {
      list.innerHTML = `<div class="empty-hint">${isMe ? 'У тебя пока нет открытых тренировок.' : 'Открытых тренировок пока нет.'}</div>`;
    } else {
      fpData.workouts.forEach((w) => list.appendChild(buildWorkoutCard(w, { showAuthor: false })));
    }
  } catch (err) {
    console.error(err);
    $('fpStatus').textContent = err.data?.error || 'Не удалось загрузить профиль.';
  }
}

// Личные рекорды друга (или «как меня видят друзья»)
function renderFpRecords(records, isMe, u) {
  const card = $('fpRecordsCard');
  const box = $('fpRecordsList');
  const list = Array.isArray(records) ? records.slice() : [];
  const order = (d) => { const i = COMP_DISCIPLINES.findIndex((x) => disciplineKey(x) === disciplineKey(d)); return i < 0 ? 999 : i; };
  list.sort((a, b) => order(a.discipline) - order(b.discipline));
  // у друга без рекордов (или если он их скрыл) блок не показываем; себе — показываем с подсказкой
  card.classList.toggle('hidden', !isMe && !list.length);
  if (!list.length) {
    box.innerHTML = `<div class="muted records-empty">${isMe
      ? (u.show_records === false ? 'Ты скрыл рекорды — друзья их не видят. Включить можно в «Приватности».' : 'Отметь «Старт» в записи — лучший результат в каждой дисциплине увидят друзья.')
      : ''}</div>`;
    return;
  }
  box.innerHTML = list.map((r) => `
    <div class="record-row">
      <span class="record-disc">${esc(r.discipline)}</span>
      <span class="record-main">
        <b class="record-res">${esc(r.result)}</b>
        <span class="record-sub">${esc(formatDayMonth(r.date))}${r.name ? ' · ' + esc(r.name) : ''}</span>
      </span>
    </div>`).join('') + (isMe && u.show_records === false ? '<div class="muted records-empty">Сейчас друзья их не видят — включить можно в «Приватности».</div>' : '');
}

function renderFpCalendar() {
  if (!fpData) return;
  // по дате: главная запись дня (для цвета) + id всех открытых мне записей этого дня
  const byDate = {};
  fpData.days.forEach((d) => {
    const k = normDate(d.date);
    const cur = byDate[k] || (byDate[k] = { ...d, ids: [] });
    if (d.type === 'training') cur.type = 'training';
    if (d.public && d.id) { cur.public = true; cur.ids.push(d.id); }
  });

  const y = fpMonth.getFullYear();
  const m = fpMonth.getMonth();
  const today = localDateStr();
  const now = new Date();
  $('fpCalTitle').textContent = `${MONTHS[m]} ${y}`;
  $('fpCalNext').disabled = y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());

  const grid = $('fpCalGrid');
  grid.innerHTML = '';
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('span');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }

  let trainings = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = localDateStr(new Date(y, m, d));
    const day = byDate[ds];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell readonly';
    cell.textContent = d;
    if (day) {
      cell.classList.add(day.type === 'training' ? 'has-training' : 'has-rest');
      if (day.type === 'training') trainings++;
      if (!day.public) cell.classList.add('locked');
    }
    if (ds === today) cell.classList.add('today');
    if (ds > today) cell.classList.add('future');

    if (day?.public && day.ids.length) {
      // нажал на открытый день — показываем тренировку прямо в окошке (даже если она старая и её нет в списке ниже)
      cell.addEventListener('click', () => openFriendDay(ds, day.ids));
    } else {
      cell.disabled = true;
    }
    grid.appendChild(cell);
  }
  const fu = fpData.user || {};
  const hidden = fu.share_calendar === false && fu.id !== currentUser?.id;
  $('fpCalSummary').textContent = trainings
    ? `Тренировок за месяц: ${trainings}`
    : hidden
      ? `У ${fu.first_name || fu.username || 'друга'} календарь скрыт от друзей — видны только тренировки, которые открыты для тебя.`
      : 'В этом месяце тренировок не видно.';
  $('fpCalSummary').classList.toggle('cal-hidden-note', !trainings && hidden);
}

async function openFriendDay(dateStr, ids) {
  const sheet = $('daySheet');
  $('dayTitle').textContent = formatWithWeekday(dateStr);
  const list = $('dayList');
  list.innerHTML = '<div class="muted center">Загружаю…</div>';
  sheet.classList.remove('hidden');
  const cards = [];
  for (const id of ids) {
    try {
      const { workout } = await api(`/api/friends/workouts/${id}`);
      cards.push(buildWorkoutCard({ ...workout, date: normDate(workout.date) }, { showAuthor: false }));
    } catch (err) { /* закрытая или удалённая — пропускаем */ }
  }
  list.innerHTML = cards.length ? '' : '<div class="empty-hint">Эту тренировку сейчас не открыть.</div>';
  cards.forEach((c) => list.appendChild(c));
}
$('dayClose').addEventListener('click', () => $('daySheet').classList.add('hidden'));
$('daySheet').addEventListener('click', (e) => { if (e.target === $('daySheet')) $('daySheet').classList.add('hidden'); });

$('fpCalPrev').addEventListener('click', () => {
  fpMonth = new Date(fpMonth.getFullYear(), fpMonth.getMonth() - 1, 1);
  renderFpCalendar();
});
$('fpCalNext').addEventListener('click', () => {
  fpMonth = new Date(fpMonth.getFullYear(), fpMonth.getMonth() + 1, 1);
  renderFpCalendar();
});

$('fpBackBtn').addEventListener('click', () => {
  if (fpReturnScreen === 'profileScreen') openProfile();
  else {
    showScreen('friendsScreen');
    setFriendsTab(friendsTab);
  }
});

$('fpRemoveBtn').addEventListener('click', async () => {
  if (!fpData) return;
  if (!(await confirmAsk({ icon: 'people', title: 'Удалить из друзей?', text: `${personName(fpData.user)} больше не будет видеть твою ленту, а ты — его.`, ok: 'Удалить', danger: true }))) return;
  try {
    await api(`/api/friends/${fpData.user.id}`, { method: 'DELETE' });
    showScreen('friendsScreen');
    setFriendsTab('list');
  } catch (err) {
    console.error(err);
    $('fpStatus').textContent = 'Не удалось удалить.';
  }
});

// ---------- Приватность в своём профиле ----------
$('profileFriends').addEventListener('click', () => {
  showScreen('friendsScreen');
  setFriendsTab('list');
});

$('shareCalendarToggle').addEventListener('change', async (e) => {
  const share = e.target.checked;
  try {
    await api('/api/friends/settings', { method: 'POST', body: JSON.stringify({ share_calendar: share }) });
    if (currentUser) currentUser.share_calendar = share;
  } catch (err) {
    console.error(err);
    e.target.checked = !share;
    alertMsg('Не удалось сохранить настройку.');
  }
});
// ---------- Экран «Настройки» ----------
$('settingsBtn').addEventListener('click', () => { haptic(); paintThemeSeg(); showScreen('settingsScreen'); });
$('settingsBackBtn').addEventListener('click', () => showScreen('profileScreen'));
for (const [id, key] of [['digestToggle', 'digest'], ['partnersNotifyToggle', 'partners']]) {
  $(id).addEventListener('change', async (e) => {
    const on = e.target.checked;
    try {
      await api('/api/auth/notify', { method: 'POST', body: JSON.stringify({ [key]: on }) });
    } catch (err) {
      console.error(err);
      e.target.checked = !on;
      alertMsg('Не удалось сохранить настройку.');
    }
  });
}
$('themeSeg').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
  setThemePref(b.dataset.themePick);
  paintThemeSeg();
}));
function paintThemeSeg() {
  const pref = themePref();
  $('themeSeg').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.themePick === pref));
}

$('showRecordsToggle').addEventListener('change', async (e) => {
  const show = e.target.checked;
  try {
    await api('/api/friends/settings', { method: 'POST', body: JSON.stringify({ show_records: show }) });
    if (currentUser) currentUser.show_records = show;
  } catch (err) {
    console.error(err);
    e.target.checked = !show;
    alertMsg('Не удалось сохранить настройку.');
  }
});
$('previewProfileBtn').addEventListener('click', () => {
  if (currentUser) openFriendProfile(currentUser.id, 'settingsScreen');
});

// ---------- Разбор нагрузки ----------
let selectedInsightPeriod = 'week';

async function loadInsight() {
  const loadingEl = $('insightLoading');
  const emptyEl = $('insightEmpty');
  const boxEl = $('insightBox');

  loadingEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');
  boxEl.classList.add('hidden');

  try {
    const { insight, workoutsCount } = await api(`/api/insights?period=${selectedInsightPeriod}`, { timeout: 60000 });
    loadingEl.classList.add('hidden');

    if (!insight || workoutsCount === 0) {
      emptyEl.textContent = 'Пока недостаточно записей за этот период.';
      emptyEl.classList.remove('hidden');
      return;
    }

    $('insightText').innerHTML = renderMarkdownBold(insight);
    boxEl.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to load insight', err);
    loadingEl.classList.add('hidden');
    emptyEl.textContent = 'Не удалось получить разбор. Попробуй ещё раз.';
    emptyEl.classList.remove('hidden');
  }
}

$('insightsBtn').addEventListener('click', () => { showScreen('insightsScreen'); renderCharts(); });

document.querySelectorAll('#insightsScreen .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#insightsScreen .seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedInsightPeriod = btn.dataset.period;
  });
});

$('refreshInsightBtn').addEventListener('click', loadInsight);

// ---------- Чат с Fom ----------
let chatHistory = []; // { role: 'user'|'assistant', content } — хранится только пока открыто приложение

function renderMarkdownBold(text) {
  // Простой рендер **жирного** текста без сторонних библиотек
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderChatMessages() {
  const container = $('chatMessages');
  container.innerHTML = '';
  if (chatHistory.length === 0) {
    container.innerHTML =
      '<div class="chat-empty">Привет! Я Fom, твой помощник 👋<br />Спроси про свои тренировки — например, «сколько я бегал на этой неделе?» или «не перегружаюсь ли я?»</div>';
    return;
  }
  chatHistory.forEach((msg) => {
    const div = document.createElement('div');
    div.className = `chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`;
    div.innerHTML = renderMarkdownBold(msg.content);
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = $('chatInput');
  const message = input.value.trim();
  if (!message) return;

  chatHistory.push({ role: 'user', content: message });
  renderChatMessages();
  input.value = '';
  growChatInput();

  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'chat-bubble assistant typing';
  loadingBubble.textContent = 'Fom думает...';
  $('chatMessages').appendChild(loadingBubble);
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;

  try {
    const { reply, left } = await api('/api/chat', {
      timeout: 60000,
      method: 'POST',
      body: JSON.stringify({ message, history: chatHistory.slice(0, -1) }),
    });
    chatHistory.push({ role: 'assistant', content: reply || 'Не смог ответить, попробуй переформулировать.' });
    renderChatLimit(left);
  } catch (err) {
    console.error('Chat failed', err);
    if (err.data?.left === 0) {
      chatHistory.pop(); // сообщение не ушло — вернём текст в поле
      input.value = message;
      growChatInput();
      renderChatLimit(0);
      chatHistory.push({ role: 'assistant', content: err.data.error });
    } else {
      chatHistory.push({ role: 'assistant', content: 'Ошибка связи с сервером. Попробуй ещё раз.' });
    }
  }
  renderChatMessages();
}

// Сколько сообщений Fom осталось сегодня (лимит 7 в день)
function renderChatLimit(left) {
  const el = $('chatLimit');
  if (left == null) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.classList.toggle('empty', left === 0);
  el.textContent = left === 0
    ? 'Сообщения на сегодня закончились — Fom снова ответит завтра'
    : `Осталось сообщений сегодня: ${left}`;
}
async function loadChatLimit() {
  try { const { left } = await api('/api/chat/limit'); renderChatLimit(left); } catch (e) {}
}

$('chatBtn').addEventListener('click', () => {
  showScreen('chatScreen');
  renderChatMessages();
  loadChatLimit();
});
$('chatSendBtn').addEventListener('click', sendChatMessage);
// Кнопка отправки не забирает фокус у поля: клавиатура остаётся открытой, экран не прыгает
// и нажатие не «теряется» (как в мессенджерах)
$('chatSendBtn').addEventListener('mousedown', (e) => e.preventDefault());
// Поле растёт вниз по мере текста (до ~5 строк, дальше прокрутка) — как в мессенджерах.
// На компьютере Enter отправляет, Shift+Enter — новая строка; на телефоне Enter — новая строка, отправка — кнопкой.
function growChatInput() {
  const el = $('chatInput');
  el.style.height = 'auto';
  const full = el.scrollHeight + (el.offsetHeight - el.clientHeight); // + рамка
  el.style.height = `${Math.min(full, 132)}px`;
  el.classList.toggle('scrolling', full > 132);
}
const CHAT_ENTER_SENDS = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)').matches : false;
$('chatInput').addEventListener('input', growChatInput);
$('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && CHAT_ENTER_SENDS && !e.isComposing) {
    e.preventDefault();
    sendChatMessage();
  }
});

// ---------- Кнопка «+» внизу — новая запись ----------
$('homeBtn').addEventListener('click', () => {
  showScreen('mainScreen');
  renderEntryState();
});

// ---------- Текст записи (карточка на главной и «Поделиться») ----------
function formatExercise(e) {
  let line = e.name || '';
  if (e.sets && e.reps) line += ` ${e.sets}×${e.reps}`;
  else if (e.sets) line += ` ${e.sets} подх.`;
  else if (e.reps) line += ` ×${e.reps}`;
  if (e.weight) line += `, ${e.weight}${/^[\d.,]+$/.test(String(e.weight)) ? ' кг' : ''}`;
  return line.trim();
}

function buildDetailLines(w) {
  const lines = [];
  if (w.type === 'training' && w.competition) lines.push(`🏆 ${competitionLine(w.competition)}`);
  if (w.type === 'training' && w.start_time) lines.push(`🕒 ${w.start_time}${w.end_time ? '–' + w.end_time : ''}`);
  if (w.type === 'training' && (w.place || w.altitude_m != null)) lines.push(`📍 ${w.place || 'Место'}${w.altitude_m != null && w.altitude_m >= 300 ? ` · ${w.altitude_m} м` : ''}${w.camp ? ' · сбор' : ''}`);
  if (w.type === 'training') {
    if (w.warmup) lines.push(`Разминка: ${w.warmup}`);
    const setLines = (Array.isArray(w.sets) ? w.sets : [])
      .map((s) => {
        const parts = [];
        if (s.duration_s) parts.push(`по ${durLabel(s.duration_s)}`);
        else if (s.distance_m) parts.push(distLabel(s.distance_m));
        if (s.reps) parts.push(`x${s.reps}`);
        if (s.time_or_pace) parts.push(s.time_or_pace);
        if (s.rest_between) parts.push(`отдых ${s.rest_between}`);
        return parts.join(' ');
      })
      .filter(Boolean);
    if (setLines.length) {
      lines.push('Беговая работа:');
      setLines.forEach((l, i) => lines.push(`${i + 1}. ${l}`));
    }
    const exLines = (Array.isArray(w.exercises) ? w.exercises : []).map(formatExercise).filter(Boolean);
    if (exLines.length) {
      lines.push('Силовая / ОФП:');
      exLines.forEach((l, i) => lines.push(`${i + 1}. ${l}`));
    }
    if (w.cooldown) lines.push(`Заминка: ${w.cooldown}`);
    const pulse = [];
    if (w.hr_avg) pulse.push(`ср. ${w.hr_avg}`);
    if (w.hr_max) pulse.push(`макс. ${w.hr_max}`);
    if (w.hr_min) pulse.push(`мин. в паузах ${w.hr_min}`);
    if (pulse.length) lines.push(`❤️ Пульс: ${pulse.join(' · ')} уд/мин`);
    if (w.rpe) lines.push(`RPE: ${w.rpe}/10`);
  }
  if (w.feeling) lines.push(`Самочувствие: ${w.feeling}/10`);
  if (w.notes) lines.push(`Заметка: ${w.notes}`);
  return lines;
}

function buildShareText(w) {
  const lines = [];
  lines.push(w.type === 'rest' ? '😴 День отдыха' : w.competition ? (isPersonalBest(w) ? '🏆 Старт — личный рекорд!' : '🏆 Старт') : w.session > 1 ? '🏃 Вторая тренировка' : '🏃 Тренировка');
  lines.push(`📅 ${formatWithWeekday(normDate(w.date))}`);
  lines.push(...buildDetailLines(w));
  // ссылка на бота — Telegram сделает её кликабельной, друг сразу откроет Forma
  lines.push('', '— записано в Forma 👉 t.me/forma2ko5_bot');
  return lines.join('\n');
}

// «Поделиться» открывает окно с карточкой для сторис; текстом — отдельная кнопка там же
function shareWorkout(w) { openShareSheet(w); }

function shareWorkoutText(w) {
  const text = buildShareText(w);
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('')}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
  else window.open(shareUrl, '_blank');
}

// ---------- Редактирование записи ----------
let currentEditWorkout = null;
let editReturnScreen = 'profileScreen'; // куда вернуться по стрелке «назад»

// Реакции и комментарии друзей под своей записью (если запись открыта друзьям или под ней уже что-то есть)
async function renderEditSocial(workout) {
  const card = $('editSocialCard');
  const box = $('editSocial');
  box.innerHTML = '';
  card.classList.add('hidden');
  try {
    const { reactions, comments } = await api(`/api/friends/workouts/${workout.id}/social`);
    if (workout.visibility === 'private' && !reactions.length && !comments.length) return;
    const counts = {};
    let mine = null;
    reactions.forEach((r) => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      if (r.id === currentUser?.id) mine = r.emoji;
    });
    box.appendChild(buildSocial(
      { id: workout.id, user_id: workout.user_id, reactions: counts, my_reaction: mine, comments_count: comments.length },
      { openThread: true }
    ));
    card.classList.remove('hidden');
  } catch (err) {
    console.error('Social failed', err);
  }
}

async function openEditScreen(workoutId, returnTo = 'profileScreen') {
  editReturnScreen = returnTo;
  showScreen('editScreen');
  $('editSocialCard').classList.add('hidden');
  $('editStatusMsg').textContent = 'Загружаю...';

  try {
    const { workout } = await api(`/api/workouts/${workoutId}`);
    workout.date = normDate(workout.date);
    currentEditWorkout = workout;
    $('editDateLabel').textContent = formatWithWeekday(workout.date);
    editForm.setData(workout);
    renderEditFeedback(workout);
    $('editStatusMsg').textContent = '';
    renderEditSocial(workout);

    // если за день две тренировки — переключатель между ними
    const sameDay = workoutsByDate[workout.date] || [];
    const sw = $('editSessionSwitch');
    sw.innerHTML = '';
    sw.classList.toggle('hidden', sameDay.length < 2);
    sameDay.forEach((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn' + (w.id === workout.id ? ' active' : '');
      b.innerHTML = w.type === 'rest' ? `${ico('moon')} Отдых` : w.competition ? `${ico('trophy')} Старт` : `${ico('runner')} Тренировка ${w.session || 1}`;
      b.addEventListener('click', () => { if (w.id !== workout.id) openEditScreen(w.id, editReturnScreen); });
      sw.appendChild(b);
    });
  } catch (err) {
    console.error('Failed to load workout', err);
    $('editStatusMsg').textContent = 'Не удалось загрузить запись.';
  }
}

function leaveEditScreen() {
  showScreen(editReturnScreen);
  if (editReturnScreen === 'profileScreen') loadProfileScreen();
  else if (editReturnScreen === 'friendsScreen') setFriendsTab(friendsTab);
  else renderEntryState();
}

// Список записей поменялся — перерисовываем то, что видно (главная, профиль), чтобы нигде не остался старый отзыв
function refreshAfterWorkoutChange() {
  try { renderEntryState(); } catch (e) { /* главная ещё не готова */ }
  try { if (!$('profileScreen').classList.contains('hidden')) loadProfileScreen(); } catch (e) { /* ничего */ }
}
$('editFbRefresh').addEventListener('click', async () => {
  if (!currentEditWorkout) return;
  const btn = $('editFbRefresh');
  btn.disabled = true;
  $('editFeedbackText').textContent = 'Fom заново смотрит тренировку…';
  try {
    const { ai_feedback } = await api(`/api/workouts/${currentEditWorkout.id}/feedback`, { method: 'POST', timeout: 60000 });
    currentEditWorkout.ai_feedback = ai_feedback;
    renderEditFeedback(currentEditWorkout, true);
    $('editStatusMsg').textContent = 'Fom обновил отзыв ✓';
    try { await loadMyWorkouts(); refreshAfterWorkoutChange(); } catch (e) { console.error(e); }
  } catch (err) {
    $('editFeedbackText').textContent = currentEditWorkout.ai_feedback || '';
    $('editStatusMsg').textContent = err.data?.error || 'Не получилось — попробуй ещё раз.';
  } finally {
    btn.disabled = false;
  }
});

// Отзыв Fom на экране редактирования — после изменений он обновляется
function renderEditFeedback(w, fresh = false) {
  const box = $('editFeedback');
  box.classList.toggle('hidden', !(w && w.type === 'training' && w.ai_feedback));
  if (!w?.ai_feedback) return;
  $('editFeedbackText').textContent = w.ai_feedback;
  if (fresh) { box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); }
}

$('editBackBtn').addEventListener('click', leaveEditScreen);

$('editSaveBtn').addEventListener('click', async () => {
  if (!currentEditWorkout) return;
  const statusEl = $('editStatusMsg');
  const problem = editForm.problem();
  if (problem) { statusEl.textContent = problem; haptic('warning'); return; }
  statusEl.textContent = 'Сохраняю… Fom заново смотрит тренировку';
  const oldFeedback = currentEditWorkout.ai_feedback || '';

  try {
    const result = await api(`/api/workouts/${currentEditWorkout.id}`, {
      method: 'PUT',
      body: JSON.stringify(editForm.getPayload()),
      timeout: 60000,
    });
    currentEditWorkout = { ...currentEditWorkout, ...result.workout, date: normDate(result.workout.date) };
    const st = result.feedback_status;
    const updatedFb = st === 'updated' || (!st && result.workout.ai_feedback && result.workout.ai_feedback !== oldFeedback);
    statusEl.textContent = updatedFb ? 'Сохранено ✓ Fom обновил отзыв'
      : st === 'failed' ? 'Сохранено ✓ Fom не успел обновить отзыв — нажми «Обновить отзыв»'
      : 'Сохранено ✓';
    renderEditFeedback(currentEditWorkout, updatedFb);
    haptic('success');
    renderEditSocial(currentEditWorkout);
    try { await loadMyWorkouts(); refreshAfterWorkoutChange(); } catch (e) { console.error(e); }
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Ошибка сохранения. Попробуй ещё раз.';
  }
});

$('editShareBtn').addEventListener('click', () => {
  if (currentEditWorkout) shareWorkout({ ...currentEditWorkout, ...editForm.getPayload() });
});

$('editDeleteBtn').addEventListener('click', async () => {
  if (!currentEditWorkout) return;
  if (!(await confirmAsk({ icon: 'trash', title: 'Удалить запись?', text: 'Это нельзя будет отменить.', ok: 'Удалить', danger: true }))) return;

  const statusEl = $('editStatusMsg');
  statusEl.textContent = 'Удаляю...';
  try {
    const result = await api(`/api/workouts/${currentEditWorkout.id}`, { method: 'DELETE' });
    applyStreak(result.streak);
    await loadMyWorkouts();
    currentEditWorkout = null;
    leaveEditScreen();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Не удалось удалить запись.';
  }
});

// ---------- Обрезка фото перед загрузкой ----------
// Показываем фото в квадратном окне: двигаешь пальцем, увеличиваешь ползунком или двумя пальцами.
// В профиль попадает ровно то, что видно в окне (квадрат 400×400).
const crop = { img: null, url: '', w: 0, h: 0, view: 0, base: 1, zoom: 1, x: 0, y: 0, pointers: new Map(), pinch: null };

function cropScale() { return crop.base * crop.zoom; }

// Не даём фото «уехать» — окно всегда полностью закрыто картинкой
function cropClamp() {
  const s = cropScale();
  crop.x = Math.min(0, Math.max(crop.view - crop.w * s, crop.x));
  crop.y = Math.min(0, Math.max(crop.view - crop.h * s, crop.y));
}

function cropRender() {
  cropClamp();
  const s = cropScale();
  const img = $('cropImg');
  img.style.width = `${crop.w * s}px`;
  img.style.height = `${crop.h * s}px`;
  img.style.transform = `translate(${crop.x}px, ${crop.y}px)`;
}

// Меняем увеличение так, чтобы точка (cx, cy) внутри окна осталась на месте
function cropSetZoom(z, cx = crop.view / 2, cy = crop.view / 2) {
  const before = cropScale();
  crop.zoom = Math.min(4, Math.max(1, z));
  const after = cropScale();
  crop.x = cx - ((cx - crop.x) * after) / before;
  crop.y = cy - ((cy - crop.y) * after) / before;
  $('cropZoom').value = crop.zoom;
  cropRender();
}

function openCropper(file) {
  const url = URL.createObjectURL(file);
  const img = $('cropImg');
  img.onload = () => {
    crop.url = url;
    crop.w = img.naturalWidth;
    crop.h = img.naturalHeight;
    $('cropSheet').classList.remove('hidden');
    crop.view = $('cropView').clientWidth;
    crop.base = crop.view / Math.min(crop.w, crop.h); // фото закрывает окно целиком
    crop.zoom = 1;
    crop.x = (crop.view - crop.w * crop.base) / 2;   // по центру
    crop.y = (crop.view - crop.h * crop.base) / 2;
    $('cropZoom').value = 1;
    cropRender();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alertMsg('Не удалось открыть фото. Попробуй другое.');
  };
  img.src = url;
}

function closeCropper() {
  $('cropSheet').classList.add('hidden');
  if (crop.url) URL.revokeObjectURL(crop.url);
  crop.url = '';
  crop.pointers.clear();
  crop.pinch = null;
}

// Вырезаем видимый квадрат в JPEG 400×400 (и ужимаем, пока не станет меньше ~90 КБ)
function cropToJpeg(size = 400) {
  const s = cropScale();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage($('cropImg'), -crop.x / s, -crop.y / s, crop.view / s, crop.view / s, 0, 0, size, size);
  let quality = 0.85;
  let data = canvas.toDataURL('image/jpeg', quality);
  while (data.length > 90000 && quality > 0.3) {
    quality -= 0.1;
    data = canvas.toDataURL('image/jpeg', quality);
  }
  return data;
}

// Перетаскивание одним пальцем и «щипок» двумя
const cropView = $('cropView');
cropView.addEventListener('pointerdown', (e) => {
  cropView.setPointerCapture(e.pointerId);
  crop.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (crop.pointers.size === 2) {
    const [a, b] = [...crop.pointers.values()];
    crop.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: crop.zoom };
  }
});
cropView.addEventListener('pointermove', (e) => {
  const prev = crop.pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  crop.pointers.set(e.pointerId, cur);
  if (crop.pointers.size === 2 && crop.pinch) {
    const [a, b] = [...crop.pointers.values()];
    const rect = cropView.getBoundingClientRect();
    const cx = (a.x + b.x) / 2 - rect.left;
    const cy = (a.y + b.y) / 2 - rect.top;
    cropSetZoom((crop.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / crop.pinch.dist, cx, cy);
  } else if (crop.pointers.size === 1) {
    crop.x += cur.x - prev.x;
    crop.y += cur.y - prev.y;
    cropRender();
  }
});
['pointerup', 'pointercancel'].forEach((ev) => cropView.addEventListener(ev, (e) => {
  crop.pointers.delete(e.pointerId);
  if (crop.pointers.size < 2) crop.pinch = null;
}));
$('cropZoom').addEventListener('input', (e) => cropSetZoom(Number(e.target.value)));
$('cropCancelBtn').addEventListener('click', closeCropper);

$('cropSaveBtn').addEventListener('click', async () => {
  const btn = $('cropSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Сохраняю...';
  try {
    const image = cropToJpeg();
    const { avatar_data } = await api('/api/auth/avatar', { method: 'POST', body: JSON.stringify({ image }) });
    currentUser.avatar_data = avatar_data;
    updateAvatar();
    closeCropper();
  } catch (err) {
    console.error(err);
    alertMsg(err.data?.error || 'Не удалось загрузить фото. Попробуй другое.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Готово';
  }
});

$('photoInput').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) openCropper(file);
});

// ---------- Компактная шапка профиля при прокрутке ----------
// Листаешь профиль вниз — большое фото уезжает, а сверху появляется полоска:
// имя и цифры слева, маленький кружок с фото справа.
function miniHeadSource() {
  const screen = document.querySelector('.screen:not(.hidden)')?.id;
  if (screen === 'profileScreen') {
    return {
      hero: $('profileHero'),
      name: $('profileName').innerHTML,
      stats: `${ico('flame')} ${esc($('profileStreak').textContent)} · ${ico('calendar')} ${esc($('profileMonth').textContent)} · ${ico('runner')} ${esc($('profileTotal').textContent)}`,
      ava: getAvatarUrl(),
      letter: (currentUser?.first_name || '?').slice(0, 1).toUpperCase(),
    };
  }
  if (screen === 'friendProfileScreen' && fpData) {
    return {
      hero: $('fpHero'),
      name: $('fpName').innerHTML,
      stats: `${ico('flame')} ${esc($('fpStreak').textContent)} · ${ico('calendar')} ${esc($('fpMonth').textContent)} · ${ico('runner')} ${esc($('fpTotal').textContent)}`,
      ava: avatarSrc(fpData.user),
      letter: personName(fpData.user).replace('@', '').slice(0, 1).toUpperCase(),
    };
  }
  return null;
}

let miniHeadKey = '';
function updateMiniHead() {
  const head = $('miniHead');
  const src = miniHeadSource();
  if (!src) {
    head.style.opacity = 0;
    head.classList.remove('shown');
    return;
  }
  const rect = src.hero.getBoundingClientRect();
  // 0 — фото целиком на экране, 1 — фото уехало наверх
  const p = Math.min(1, Math.max(0, (150 - rect.bottom) / 110));
  head.style.opacity = p;
  head.style.transform = `translateY(${(1 - p) * -14}px)`;
  head.classList.toggle('shown', p > 0.5);
  $('miniAva').style.transform = `scale(${0.5 + p * 0.5})`;

  const key = src.name + src.stats + src.ava;
  if (key !== miniHeadKey) {
    miniHeadKey = key;
    $('miniName').innerHTML = src.name;
    $('miniStats').innerHTML = src.stats;
    $('miniAva').innerHTML = src.ava ? `<img src="${esc(src.ava)}" alt="" onerror="this.remove()">` : esc(src.letter);
  }
}
window.addEventListener('scroll', updateMiniHead, { passive: true });
$('miniHead').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ---------- Жест «назад»: провести пальцем слева направо в любом месте экрана ----------
// Короткое случайное движение не считается: нужно протянуть заметно (примерно треть экрана).
function goBack() {
  const screen = document.querySelector('.screen:not(.hidden)')?.id;
  if (dialogOpen()) return closeDialog();
  if (!$('tour').classList.contains('hidden')) return;
  if (!$('startSheet').classList.contains('hidden')) return closeStartSheet();
  if (!$('shareSheet').classList.contains('hidden')) return closeShareSheet();
  if (!$('watchSheet').classList.contains('hidden')) return closeWatchHelp();
  if (!$('repeatSheet').classList.contains('hidden')) return closeRepeatSheet();
  if (!$('cropSheet').classList.contains('hidden')) return closeCropper();
  if (!$('photoSheet').classList.contains('hidden')) return $('photoSheet').classList.add('hidden');
  if (!$('sportSheet').classList.contains('hidden')) return closeSportSheet();
  if (!$('giftSheet').classList.contains('hidden')) return $('giftSheet').classList.add('hidden');
  if (!$('athleteSheet').classList.contains('hidden')) return closeAthleteSheet();
  if (screen === 'editScreen') return $('editBackBtn').click();
  if (!$('groupCreateSheet').classList.contains('hidden')) return $('groupCreateSheet').classList.add('hidden');
  if (!$('groupJoinSheet').classList.contains('hidden')) return $('groupJoinSheet').classList.add('hidden');
  if (!$('friendPickSheet').classList.contains('hidden')) return $('friendPickCancel').click();
  if (!$('recordSheet').classList.contains('hidden')) return closeRecordSheet();
  if (!$('citySheet').classList.contains('hidden')) return $('cityCancel').click();
  if (!$('daySheet').classList.contains('hidden')) return $('dayClose').click();
  if (!$('goalSheet').classList.contains('hidden')) return $('gCancel').click();
  if (!$('weightSheet').classList.contains('hidden')) return $('wCancel').click();
  if (!$('timeSheet').classList.contains('hidden')) return $('tpCancel').click();
  if (!$('runSheet').classList.contains('hidden')) return $('rnCancel').click();
  if (screen === 'runScreen') return $('runBackBtn').click();
  if (!$('mealSheet').classList.contains('hidden')) return $('mealCancel').click();
  if (!$('bloodSheet').classList.contains('hidden')) return $('bloodCancel').click();
  if (!$('bloodViewSheet').classList.contains('hidden')) return $('bvClose').click();
  if (screen === 'healthScreen') return $('healthBackBtn').click();
  if (screen === 'giftsScreen') return $('giftsBackBtn').click();
  if (screen === 'settingsScreen') return $('settingsBackBtn').click();
  if (screen === 'memberScreen') return $('memberBackBtn').click();
  if (screen === 'groupScreen') return $('groupBackBtn').click();
  if (screen === 'friendProfileScreen') return $('fpBackBtn').click();
  // обычные вкладки: возвращаемся на предыдущую, а если её нет — на главную
  tabHistory.pop();
  const prev = tabHistory.pop() || 'mainScreen';
  if (prev === screen) return;
  document.querySelector(`.bottom-nav [data-screen="${prev}"]`)?.click();
}

const swipe = { active: false, x: 0, y: 0, dx: 0, decided: false, horizontal: false };
const SWIPE_BLOCKERS = 'input, textarea, .crop-view, .sheet, .dlg, .tour';

document.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1 || e.target.closest(SWIPE_BLOCKERS)) { swipe.active = false; return; }
  const t = e.touches[0];
  Object.assign(swipe, { active: true, x: t.clientX, y: t.clientY, dx: 0, decided: false, horizontal: false });
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!swipe.active) return;
  const t = e.touches[0];
  const dx = t.clientX - swipe.x;
  const dy = t.clientY - swipe.y;
  if (!swipe.decided && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
    swipe.decided = true;
    swipe.horizontal = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5; // только вправо и почти горизонтально
    if (!swipe.horizontal) swipe.active = false;
  }
  if (!swipe.horizontal) return;
  swipe.dx = Math.max(0, dx);
  const need = Math.max(90, window.innerWidth * 0.3);
  const p = Math.min(1, swipe.dx / need);
  const arrow = $('swipeBack');
  arrow.style.opacity = p;
  arrow.style.transform = `translate(${-40 + p * 56}px, -50%) scale(${0.7 + p * 0.3})`;
  arrow.classList.toggle('ready', p >= 1);
}, { passive: true });

document.addEventListener('touchend', () => {
  if (!swipe.active || !swipe.horizontal) { swipe.active = false; return; }
  swipe.active = false;
  const need = Math.max(90, window.innerWidth * 0.3);
  const arrow = $('swipeBack');
  arrow.style.opacity = 0;
  arrow.style.transform = 'translate(-40px, -50%) scale(0.7)';
  arrow.classList.remove('ready');
  if (swipe.dx >= need) {
    haptic();
    goBack();
  }
});


// ---------- «Назад» на компьютере ----------
// Мак: двумя пальцами по тачпаду вправо (как «назад» в Safari). Тачпад присылает это как
// горизонтальную прокрутку, поэтому копим её и показываем ту же стрелку, что и на телефоне.
const pad = { sum: 0, timer: null, locked: false };
const PAD_NEED = 140;           // сколько «протянуть», чтобы сработало
const PAD_SKIP = '.comp-chips, .tour-track, .crop-view, .chart-table, .profile-tags, .sheet, .dlg';

function padArrow(p) {
  const arrow = $('swipeBack');
  arrow.style.opacity = p;
  arrow.style.transform = `translate(${-40 + p * 56}px, -50%) scale(${0.7 + p * 0.3})`;
  arrow.classList.toggle('ready', p >= 1);
}
function padReset() {
  pad.sum = 0;
  padArrow(0);
}

window.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2) return;   // обычная прокрутка вверх-вниз
  if (e.target.closest?.(PAD_SKIP)) return;                     // там своя горизонтальная прокрутка
  clearTimeout(pad.timer);
  pad.timer = setTimeout(() => { pad.locked = false; padReset(); }, 220); // палец отпустили — сброс
  if (pad.locked) return; // уже сработало — ждём конца жеста
  pad.sum = Math.max(0, pad.sum - e.deltaX); // пальцы вправо → deltaX отрицательный
  const p = Math.min(1, pad.sum / PAD_NEED);
  padArrow(p);
  if (p >= 1) {
    pad.locked = true;
    haptic();
    goBack();
    setTimeout(padReset, 120);
  }
}, { passive: true });

// Клавиши: Esc закрывает окно или шторку, Cmd/Ctrl + [ и Alt + ← — «назад».
// Боковая кнопка мыши «назад» тоже работает.
document.addEventListener('keydown', (e) => {
  const typing = e.target.matches?.('input, textarea');
  if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === '[') || (e.altKey && e.key === 'ArrowLeft')) {
    if (typing && e.key !== 'Escape') return;
    if (typing) { e.target.blur(); return; }
    e.preventDefault();
    goBack();
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 3) { e.preventDefault(); goBack(); }
});

// ---------- Дисциплина в профиле (Forma — только для лёгкой атлетики) ----------
// Вид спорта всегда «Лёгкая атлетика», человек выбирает только свою дисциплину.
const ATHLETICS = ['🏃', 'Лёгкая атлетика'];
const DISCIPLINE_CHIPS = ['Спринт', 'Барьерный бег', 'Средние дистанции', 'Длинные дистанции', 'Прыжки', 'Метания', 'Многоборье', 'Спортивная ходьба'];

// «🏃 Лёгкая атлетика · Спринт» (или пусто, если человек ещё ничего не указал)
function sportLabel(u, { short = false } = {}) {
  if (!u?.sport && !u?.discipline) return '';
  if (short) return `${ATHLETICS[0]} ${u.discipline || ATHLETICS[1]}`;
  return `${ATHLETICS[0]} ${ATHLETICS[1]}${u.discipline ? ' · ' + u.discipline : ''}`;
}

function renderMySport() {
  const tag = $('profileSport');
  const label = sportLabel(currentUser);
  tag.textContent = label || '＋ Укажи дисциплину';
  tag.classList.toggle('empty', !label);
}

let sportDraft = { discipline: '' };

function renderSportSheet() {
  const chips = $('disciplineChips');
  chips.innerHTML = '';
  DISCIPLINE_CHIPS.forEach((d) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip' + (sportDraft.discipline === d ? ' active' : '');
    c.textContent = d;
    c.addEventListener('click', () => {
      sportDraft.discipline = sportDraft.discipline === d ? '' : d;
      $('disciplineInput').value = sportDraft.discipline;
      renderSportSheet();
    });
    chips.appendChild(c);
  });
  $('sportClearBtn').classList.toggle('hidden', !currentUser?.sport && !currentUser?.discipline);
}

function openSportSheet() {
  sportDraft = { discipline: currentUser?.discipline || '' };
  $('disciplineInput').value = sportDraft.discipline;
  renderSportSheet();
  $('sportSheet').classList.remove('hidden');
}
function closeSportSheet() { $('sportSheet').classList.add('hidden'); }

async function saveSport(sport, discipline) {
  try {
    const res = await api('/api/auth/sport', { method: 'POST', body: JSON.stringify({ sport, discipline }) });
    currentUser.sport = res.sport;
    currentUser.discipline = res.discipline;
    renderMySport();
    closeSportSheet();
    haptic('success');
  } catch (err) {
    console.error(err);
    alertMsg(err.data?.error || 'Не удалось сохранить. Попробуй ещё раз.');
  }
}

$('profileSport').addEventListener('click', openSportSheet);
$('sportCancelBtn').addEventListener('click', closeSportSheet);
$('sportSheet').addEventListener('click', (e) => { if (e.target === $('sportSheet')) closeSportSheet(); });
$('disciplineInput').addEventListener('input', (e) => {
  sportDraft.discipline = e.target.value;
  $('disciplineChips').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.textContent === e.target.value.trim()));
});
$('sportSaveBtn').addEventListener('click', () => saveSport('athletics', sportDraft.discipline.trim()));
$('sportClearBtn').addEventListener('click', () => saveSport(null, null));


// ---------- Синяя галочка: по нажатию всплывает подпись ----------
const VERIFIED_TIP = 'Ряльный 2ko5';
let badgeTipTimer = null;

function showBadgeTip(badge) {
  let tip = document.getElementById('badgeTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'badgeTip';
    tip.className = 'badge-tip';
    document.body.appendChild(tip);
  }
  tip.textContent = VERIFIED_TIP;
  tip.classList.remove('show');
  const r = badge.getBoundingClientRect();
  // ставим над галочкой, но не даём вылезти за края экрана
  tip.style.visibility = 'hidden';
  tip.style.display = 'block';
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  const above = r.top - h - 10 > 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${above ? r.top - h - 10 : r.bottom + 10}px`;
  tip.style.setProperty('--arrow-x', `${r.left + r.width / 2 - left}px`);
  tip.classList.toggle('below', !above);
  tip.style.visibility = '';
  void tip.offsetWidth;
  tip.classList.add('show');
  haptic();
  clearTimeout(badgeTipTimer);
  badgeTipTimer = setTimeout(hideBadgeTip, 2200);
}
function hideBadgeTip() {
  document.getElementById('badgeTip')?.classList.remove('show');
}
// Ловим нажатие раньше всех, чтобы тап по галочке не открывал профиль или запись
document.addEventListener('click', (e) => {
  const badge = e.target.closest?.('.verified');
  if (badge) {
    e.preventDefault();
    e.stopPropagation();
    showBadgeTip(badge);
  } else {
    hideBadgeTip();
  }
}, true);
window.addEventListener('scroll', hideBadgeTip, { passive: true });

// ---------- Розыгрыши подарков ----------
let giftData = null;

// «1 билет», «2 билета», «5 билетов»
function ticketsLabel(n) {
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'билет' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'билета' : 'билетов';
  return `${ico('ticket')} ${n} ${w}`;
}

// «через 2 дн 5 ч», «через 3 ч», «через 25 мин»
function untilLabel(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'подводим итоги…';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `итоги через ${d} дн ${h % 24} ч`;
  if (h >= 1) return `итоги через ${h} ч`;
  return `итоги через ${Math.max(1, Math.floor(ms / 60000))} мин`;
}

function winnerName(w) {
  return [w.first_name, w.last_name].filter(Boolean).join(' ') || (w.username ? '@' + w.username : 'Спортсмен');
}

// Какие подарки могут выпасть — крутятся в «барабане» на карточке розыгрыша
// Неделя — простые подарки и недорогие коллекционные; месяц — крутые, включая коллекционные (NFT) подарки Telegram
const GIFT_POOL = {
  week: [['🧸', 'Мишка'], ['💝', 'Сердце'], ['🎁', 'Подарок'], ['🌹', 'Роза'],
    ['🍭', 'Lol Pop'], ['🍬', 'Candy Cane'], ['📅', 'Desk Calendar'], ['🍜', 'Instant Ramen'],
    ['🧁', 'Whip Cupcake'], ['🕯️', 'B-Day Candle'], ['🃏', 'Jester Hat'], ['🧤', 'Snow Mittens']],
  month: [['💰', 'Swag Bag'], ['🚬', 'Snoop Cigar'], ['🎤', 'Snoop Dogg'], ['🤟', 'Westside Sign'],
    ['🚗', 'Low Rider'], ['🎭', 'Mask'], ['🦅', "Khabib's Papakha"],
    ['🎂', 'Торт'], ['💐', 'Букет'], ['🚀', 'Ракета'], ['🍾', 'Шампанское'], ['🏆', 'Кубок'], ['💍', 'Кольцо'], ['💎', 'Алмаз']],
};
const giftSlotIndex = { week: 0, month: 0 };

// Настоящие картинки коллекционных подарков — с Fragment (официальная площадка Telegram).
// Адрес картинки коллекции: название маленькими буквами без пробелов и знаков («Khabib's Papakha» → khabibspapakha).
// У обычных подарков (мишка, торт…) публичных картинок нет — для них остаётся значок.
const GIFT_IMAGE_NAMES = new Set(['Lol Pop', 'Candy Cane', 'Desk Calendar', 'Instant Ramen', 'Whip Cupcake',
  'B-Day Candle', 'Jester Hat', 'Snow Mittens', 'Swag Bag', 'Snoop Cigar', 'Snoop Dogg', 'Westside Sign',
  'Low Rider', 'Mask', "Khabib's Papakha"]);
function giftSlug(name) { return name.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function giftImageUrls(name) {
  if (!GIFT_IMAGE_NAMES.has(name)) return [];
  const slug = giftSlug(name);
  const remote = [`https://fragment.com/file/gifts/${slug}/thumb.webp`, `https://nft.fragment.com/gift/${slug}-1.webp`];
  // на своём домене картинки подарков идут через наш сервер (fragment.com в России открывается не у всех)
  return SELF_HOSTED ? [`/api/asset/gift/${slug}.webp`, ...remote] : remote;
}
// Какие картинки реально загрузились (иначе показываем значок, чтобы барабан не был пустым)
const giftImageOk = {};
function preloadGiftImages() {
  Object.values(GIFT_POOL).flat().forEach(([, name]) => {
    const urls = giftImageUrls(name);
    const tryUrl = (i) => {
      if (i >= urls.length) return;
      const img = new Image();
      img.onload = () => { giftImageOk[name] = urls[i]; };
      img.onerror = () => tryUrl(i + 1);
      img.src = urls[i];
    };
    tryUrl(0);
  });
}
preloadGiftImages();
// Содержимое ячейки барабана: картинка подарка или значок
function giftSlotHtml(emoji, name) {
  return giftImageOk[name]
    ? `<img src="${esc(giftImageOk[name])}" alt="${esc(name)}" draggable="false">`
    : esc(emoji);
}
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Показать следующий подарок в барабане (с анимацией прокрутки)
function spinSlot(slot, fast = false) {
  const kind = slot.dataset.kind;
  const pool = GIFT_POOL[kind];
  giftSlotIndex[kind] = (giftSlotIndex[kind] + 1) % pool.length;
  const [emoji, name] = pool[giftSlotIndex[kind]];
  const old = slot.querySelector('.gift-slot-item:not(.out)');
  const item = document.createElement('span');
  item.className = 'gift-slot-item' + (REDUCED_MOTION ? '' : fast ? ' in fast' : ' in');
  item.innerHTML = giftSlotHtml(emoji, name);
  slot.appendChild(item);
  if (old) {
    if (REDUCED_MOTION) old.remove();
    else { old.classList.add('out'); if (fast) old.classList.add('fast'); setTimeout(() => old.remove(), fast ? 120 : 380); }
  }
  const nameEl = slot.closest('.gift-row')?.querySelector('.gift-slot-name');
  if (nameEl) nameEl.textContent = name;
}

// Нажал на барабан — он быстро прокручивается и останавливается на случайном подарке
function spinSlotFast(slot) {
  if (slot.dataset.spinning) return;
  slot.dataset.spinning = '1';
  haptic();
  const turns = 8 + Math.floor(Math.random() * GIFT_POOL[slot.dataset.kind].length);
  let i = 0;
  const step = () => {
    spinSlot(slot, i < turns - 2);
    i++;
    if (i < turns) setTimeout(step, 60 + i * i * 2.2);
    else { delete slot.dataset.spinning; haptic('medium'); }
  };
  step();
}

setInterval(() => {
  if (document.hidden) return;
  document.querySelectorAll('.gift-slot').forEach((slot) => { if (!slot.dataset.spinning) spinSlot(slot); });
}, 1300);

function renderGiveaway() {
  if (!giftData) return;
  $('giftCard').classList.remove('hidden');
  $('giftStreak').innerHTML = `Твоя честная серия: <b>${esc(giftData.honest_streak)} дн.</b> ${ico('flame')}`;
  $('giftsEntrySub').textContent = `Твоя честная серия: ${giftData.honest_streak} дн. · подарки за неделю и месяц`;
  const rows = $('giftRows');
  rows.innerHTML = '';
  ['week', 'month'].forEach((kind) => {
    const g = giftData[kind];
    if (!g) return;
    const progress = Math.min(100, Math.round((giftData.honest_streak / g.min_streak) * 100));
    const [emoji, name] = GIFT_POOL[kind][giftSlotIndex[kind]];
    const row = document.createElement('div');
    row.className = `gift-row ${kind}` + (g.eligible ? ' in' : '');
    row.innerHTML = `
      <div class="gift-row-top">
        <button type="button" class="gift-slot" data-kind="${kind}" aria-label="Какие подарки могут выпасть"><span class="gift-slot-item">${giftSlotHtml(emoji, name)}</span></button>
        <div class="gift-row-main">
          <div class="gift-title">${ico(kind === 'week' ? 'flame' : 'diamond')} ${esc(kind === 'week' ? 'Неделя' : 'Месяц')} <span class="muted">· ${esc(g.prize)}</span></div>
          <div class="gift-maybe">Может выпасть: <b class="gift-slot-name">${esc(name)}</b></div>
          <div class="gift-when">${esc(untilLabel(g.draw_at))}</div>
        </div>
        ${g.eligible ? `<span class="gift-badge">${ticketsLabel(Number(g.tickets) || 0)}</span>` : ''}
      </div>
      ${g.eligible
        ? `<div class="gift-status ok">${ico('check')} Ты участвуешь</div>`
        : `<div class="gift-bar"><i style="width:${progress}%"></i></div>
           <div class="gift-status">Ещё ${esc(g.need_days)} дн. честной серии — и ты в игре</div>`}`;
    row.querySelector('.gift-slot').addEventListener('click', (e) => spinSlotFast(e.currentTarget));
    rows.appendChild(row);
  });
}

async function loadGiveaway() {
  try {
    giftData = await api('/api/bot/giveaway');
    renderGiveaway();
  } catch (err) {
    console.error('Giveaway failed', err);
  }
}

function openGiftSheet() {
  const box = $('giftWinners');
  box.innerHTML = '';
  ['week', 'month'].forEach((kind) => {
    const g = giftData?.[kind];
    if (!g?.last_winners?.length) return;
    const block = document.createElement('div');
    block.className = 'gift-winners';
    block.innerHTML = `<div class="card-label">${ico(kind === 'week' ? 'flame' : 'diamond')} Последние победители · ${kind === 'week' ? 'неделя' : 'месяц'}</div>` +
      g.last_winners.map((w) => `<div class="gift-winner">${ico('trophy')} ${esc(winnerName(w))}${w.username ? ` <span class="muted">@${esc(w.username)}</span>` : ''} <span class="muted">· серия ${esc(w.streak)} дн.</span></div>`).join('');
    box.appendChild(block);
  });
  $('giftSheet').classList.remove('hidden');
}
$('giftRulesBtn').addEventListener('click', openGiftSheet);
// Розыгрыши живут на своей странице (вход из профиля), чтобы не мешать записи тренировки
$('giftsEntry').addEventListener('click', async () => {
  haptic();
  showScreen('giftsScreen');
  await loadGiveaway();
  $('giftsEmpty').classList.toggle('hidden', !$('giftCard').classList.contains('hidden'));
});
$('giftsBackBtn').addEventListener('click', () => showScreen('profileScreen'));
$('giftCloseBtn').addEventListener('click', () => $('giftSheet').classList.add('hidden'));
$('giftSheet').addEventListener('click', (e) => { if (e.target === $('giftSheet')) $('giftSheet').classList.add('hidden'); });
setInterval(renderGiveaway, 60000); // обновляем «итоги через…»

// ---------- Анкета спортсмена (видит только сам человек и Fom) ----------
let athleteProfile = {};
const LEVEL_NAMES = { beginner: 'новичок', amateur: 'любитель', ranked: 'разрядник', kms: 'КМС', ms: 'МС и выше' };

function yearsWord(n) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? 'год' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'года' : 'лет';
}

function renderAthleteSummary() {
  const p = athleteProfile || {};
  const parts = [];
  if (p.sex) parts.push(p.sex === 'f' ? 'Ж' : 'М');
  if (p.birth_year) { const a = new Date().getFullYear() - p.birth_year; parts.push(`${a} ${yearsWord(a)}`); }
  if (p.height_cm) parts.push(`${p.height_cm} см`);
  if (p.weight_kg) parts.push(`${Number(p.weight_kg)} кг`);
  if (p.rest_hr) parts.push(`пульс в покое ${p.rest_hr}`);
  if (p.experience_years != null) parts.push(`стаж ${p.experience_years} ${yearsWord(p.experience_years)}`);
  if (p.level) parts.push(LEVEL_NAMES[p.level]);
  const filled = parts.length || p.records || p.goal || p.injuries;
  $('athleteSummary').innerHTML = filled
    ? [esc(parts.join(' · ')), p.goal ? `${ico('target')} ${esc(p.goal)}` : ''].filter(Boolean).join('<br>')
    : 'Рост, вес, возраст, стаж и цели — чтобы Fom понимал, с кем имеет дело.';
  $('athleteEditBtn').textContent = filled ? 'Изменить' : 'Заполнить';
}

async function loadAthleteProfile() {
  try {
    const { profile } = await api('/api/auth/athlete');
    athleteProfile = profile || {};
    renderAthleteSummary();
  } catch (err) {
    console.error('Athlete profile failed', err);
  }
}

let afSex = null;
let afLevel = null;
function paintAthleteChoices() {
  $('afSex').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.sex === afSex));
  $('afLevel').querySelectorAll('.chip').forEach((b) => b.classList.toggle('active', b.dataset.level === afLevel));
}
$('afSex').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
  afSex = afSex === b.dataset.sex ? null : b.dataset.sex; paintAthleteChoices();
}));
$('afLevel').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
  afLevel = afLevel === b.dataset.level ? null : b.dataset.level; paintAthleteChoices();
}));

function openAthleteSheet() {
  const p = athleteProfile || {};
  afSex = p.sex || null;
  afLevel = p.level || null;
  $('afBirth').value = p.birth_year ?? '';
  $('afHeight').value = p.height_cm ?? '';
  $('afWeight').value = p.weight_kg != null ? Number(p.weight_kg) : '';
  $('afRestHr').value = p.rest_hr ?? '';
  $('afExp').value = p.experience_years ?? '';
  $('afRecords').value = p.records || '';
  $('afGoal').value = p.goal || '';
  $('afInjuries').value = p.injuries || '';
  paintAthleteChoices();
  $('athleteSheet').classList.remove('hidden');
  growAll($('athleteSheet'));
}
function closeAthleteSheet() { $('athleteSheet').classList.add('hidden'); }

$('athleteEditBtn').addEventListener('click', openAthleteSheet);
$('afCancelBtn').addEventListener('click', closeAthleteSheet);
$('athleteSheet').addEventListener('click', (e) => { if (e.target === $('athleteSheet')) closeAthleteSheet(); });
$('afSaveBtn').addEventListener('click', async () => {
  const btn = $('afSaveBtn');
  btn.disabled = true;
  try {
    const { profile } = await api('/api/auth/athlete', {
      method: 'POST',
      body: JSON.stringify({
        sex: afSex, level: afLevel,
        birth_year: $('afBirth').value, height_cm: $('afHeight').value, weight_kg: $('afWeight').value,
        rest_hr: $('afRestHr').value, experience_years: $('afExp').value,
        records: $('afRecords').value, goal: $('afGoal').value, injuries: $('afInjuries').value,
      }),
    });
    athleteProfile = profile;
    renderAthleteSummary();
    renderAchievements();
    closeAthleteSheet();
    haptic('success');
  } catch (err) {
    console.error(err);
    alertMsg(err.data?.error || 'Не удалось сохранить анкету.');
  } finally {
    btn.disabled = false;
  }
});

// =====================================================================
//  КЛАВИАТУРА, ПОЛЯ ВВОДА, ЗУМ
// =====================================================================
// Пока печатаешь — нижняя панель прячется, чтобы не висела над клавиатурой
const TYPING_SEL = 'textarea, input:not([type=checkbox]):not([type=range]):not([type=radio]):not([type=file]):not([type=date])';
function updateKeyboardState() {
  const a = document.activeElement;
  const typing = !!a && !!a.matches && a.matches(TYPING_SEL);
  document.body.classList.toggle('kb-open', typing);
  if (typing && document.body.classList.contains('chat-open')) {
    // в чате держим окно прижатым к верху, а сообщения — прокрученными вниз
    setTimeout(() => { window.scrollTo(0, 0); $('chatMessages').scrollTop = $('chatMessages').scrollHeight; }, 60);
  }
}
document.addEventListener('focusin', updateKeyboardState);
document.addEventListener('focusout', () => setTimeout(updateKeyboardState, 60));

// Реальная видимая высота экрана (без клавиатуры) — для чата
function updateAppHeight() {
  const h = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
}
window.visualViewport?.addEventListener('resize', updateAppHeight);
window.addEventListener('resize', updateAppHeight);
try { tg?.onEvent?.('viewportChanged', updateAppHeight); } catch (e) {}
updateAppHeight();

// Поле текста растёт вместе с текстом, а не прячет его внутри
function autoGrow(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  if (!el.offsetParent) { el.style.height = ''; return; } // скрытое поле не трогаем
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}
function growAll(root) { root.querySelectorAll('textarea').forEach(autoGrow); }

// Пишешь в конце длинного текста — страница сама подкручивается, чтобы строка была видна
function keepCaretVisible(el) {
  if (el.selectionEnd !== el.value.length) return;
  const vv = window.visualViewport;
  const bottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
  const over = el.getBoundingClientRect().bottom - (bottom - 16);
  if (over > 0) window.scrollBy(0, over);
}
document.addEventListener('input', (e) => {
  if (e.target.tagName !== 'TEXTAREA' || e.target.id === 'chatInput') return;
  autoGrow(e.target);
  keepCaretVisible(e.target);
});
document.addEventListener('focusin', (e) => { if (e.target.tagName === 'TEXTAREA' && e.target.id !== 'chatInput') autoGrow(e.target); });

// Запрещаем увеличивать страницу двумя пальцами (в обрезке фото щипок работает сам по себе)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.scale && e.scale !== 1) e.preventDefault(); }, { passive: false });
try { tg?.disableVerticalSwipes?.(); } catch (e) {}

// =====================================================================
//  ЗНАКОМСТВО С ПРИЛОЖЕНИЕМ (один раз для новичка + кнопка в профиле)
// =====================================================================
const TOUR_KEY = 'forma_tour_done';
const TOUR_SLIDES = [
  { art: '<span class="tour-logo">Forma<span class="logo-dot"></span></span>', title: 'Привет! Это Forma',
    text: 'Дневник тренировок с помощником Fom. Покажу за 20 секунд, как тут всё устроено.' },
  { icon: 'sparkle', title: 'Запись за минуту',
    text: 'Нажми «+» внизу и заполни поля. Или просто опиши тренировку своими словами в «Умном вводе» — Fom сам разложит всё по полям.' },
  { art: '<span class="fom-badge tour-fom">F</span>', title: 'Fom — твой помощник',
    text: 'После тренировки Fom даёт короткий отзыв: объём, темп, пульс, восстановление. В «Разборе» — итоги недели и месяца, во вкладке Fom — чат.' },
  { icon: 'flame', title: 'Держи серию',
    text: 'Каждый записанный день — тренировка или отдых — продлевает серию. Записывать можно только за сегодня и вчера. За серию от 7 дней — розыгрыши подарков.' },
  { icon: 'people', title: 'Друзья',
    text: 'Добавляй друзей по @username, смотри их открытые тренировки, ставь реакции. Что показывать друзьям — решаешь ты.' },
  { icon: 'lock', title: 'Расскажи о себе',
    text: 'Укажи свою дисциплину и заполни анкету в профиле — так Fom поймёт, с кем имеет дело. Анкету видишь только ты и Fom.', extra: true },
];
let tourIndex = 0;

function tourStorage(set) {
  try {
    if (set) localStorage.setItem(TOUR_KEY, '1');
    return localStorage.getItem(TOUR_KEY) === '1';
  } catch (e) { return false; }
}

function openTour() {
  const track = $('tourTrack');
  track.innerHTML = TOUR_SLIDES.map((sl) => `
    <div class="tour-slide">
      <div class="tour-art">${sl.art || ico(sl.icon)}</div>
      <div class="tour-title">${esc(sl.title)}</div>
      <div class="tour-text">${esc(sl.text)}</div>
      ${sl.extra ? '<button type="button" class="ghost-btn tour-fill" id="tourFillBtn">Заполнить профиль сейчас</button>' : ''}
    </div>`).join('');
  $('tourDots').innerHTML = TOUR_SLIDES.map(() => '<i></i>').join('');
  $('tourFillBtn').addEventListener('click', () => {
    closeTour();
    openProfile();
    setTimeout(() => (currentUser?.sport ? openAthleteSheet() : openSportSheet()), 250);
  });
  tourIndex = 0;
  $('tour').classList.remove('hidden', 'closing');
  track.scrollLeft = 0;
  paintTour();
}

function paintTour() {
  $('tourDots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === tourIndex));
  $('tourNext').textContent = tourIndex === TOUR_SLIDES.length - 1 ? 'Начать' : 'Дальше';
}

function closeTour() {
  tourStorage(true);
  $('tour').classList.add('closing');
  setTimeout(() => $('tour').classList.add('hidden'), 250);
}

$('tourTrack').addEventListener('scroll', () => {
  const t = $('tourTrack');
  const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
  if (i !== tourIndex) { tourIndex = i; paintTour(); haptic(); }
}, { passive: true });
$('tourNext').addEventListener('click', () => {
  if (tourIndex >= TOUR_SLIDES.length - 1) return closeTour();
  const t = $('tourTrack');
  t.scrollTo({ left: (tourIndex + 1) * t.clientWidth, behavior: 'smooth' });
});
$('tourSkip').addEventListener('click', closeTour);
$('tourAgainBtn').addEventListener('click', openTour);

// Удалить все мои данные (два подтверждения: действие необратимо)
$('deleteAccountBtn').addEventListener('click', async () => {
  if (!(await confirmAsk({ icon: 'trash', title: 'Удалить все данные?', text: 'Исчезнут все записи, анализы, друзья, группы и пробежки. Вернуть их будет нельзя.', ok: 'Продолжить', danger: true }))) return;
  if (!(await confirmAsk({ icon: 'trash', title: 'Точно удалить?', text: 'Это последнее подтверждение.', ok: 'Удалить навсегда', danger: true }))) return;
  try {
    await api('/api/auth/me', { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
    await alertMsg('Готово: все твои данные удалены.');
    try { tg?.close(); } catch (e) { /* не страшно */ }
  } catch (err) { alertMsg(err.data?.error || 'Не получилось удалить. Попробуй ещё раз.'); }
});

// =====================================================================
//  ВЕЧЕРНЕЕ НАПОМИНАНИЕ (настройка в профиле)
// =====================================================================
$('reminderToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  try {
    await api('/api/auth/reminder', { method: 'POST', body: JSON.stringify({ enabled }) });
    if (currentUser) currentUser.remind_enabled = enabled;
    haptic();
  } catch (err) {
    console.error(err);
    e.target.checked = !enabled;
    alertMsg('Не удалось сохранить настройку. Попробуй ещё раз.');
  }
});

// =====================================================================
//  ВИБРАЦИЯ НА НАЖАТИЯ И ЖЕСТЫ
// =====================================================================
// Переключатели, фишки, вкладки, дни календаря — лёгкий «щелчок выбора»,
// обычные кнопки — лёгкий толчок, кнопка «+» — чуть сильнее.
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, .cal-cell, .history-item, .toggle-row, a');
  if (!el || el.disabled) return;
  if (el.matches('.nav-plus')) return haptic('medium');
  if (el.matches('.seg-btn, .chip, .nav-btn, .cal-cell, .sport-chip, .toggle-row, [data-shift]')) return haptic('select');
  haptic('light');
}); // «всплытие»: особая вибрация кнопки (реакция, барабан) срабатывает первой

// Ползунки самочувствия и нагрузки — щелчок на каждом делении
document.addEventListener('input', (e) => {
  if (e.target.matches('input[type="range"]') && !e.target.classList.contains('crop-zoom')) haptic('select');
});

// Поддержка — чат с автором в Telegram
const SUPPORT_USERNAME = 'w_m9ik';
$('supportBtn').addEventListener('click', () => {
  const url = `https://t.me/${SUPPORT_USERNAME}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
});

// =====================================================================
//  КОМУ ПОКАЗАТЬ ТРЕНИРОВКУ — выбор друзей
// =====================================================================
let friendsListCache = null;
let friendsListAt = 0;
async function getFriendsCached(force = false) {
  if (!force && friendsListCache && Date.now() - friendsListAt < 60000) return friendsListCache;
  const { friends } = await api('/api/friends');
  friendsListCache = friends || [];
  friendsListAt = Date.now();
  return friendsListCache;
}
async function openFriendPicker(selected, onDone) {
  const sheet = $('friendPickSheet');
  const list = $('friendPickList');
  let chosen = new Set((selected || []).map(Number));
  list.innerHTML = '<div class="muted center">Загружаю друзей…</div>';
  sheet.classList.remove('hidden');
  let friends = [];
  try { friends = await getFriendsCached(true); } catch (e) { console.error(e); }
  const paintCount = () => {
    $('friendPickSave').textContent = chosen.size ? `Готово · ${chosen.size}` : 'Готово';
  };
  if (!friends.length) {
    list.innerHTML = '<div class="muted center friend-pick-empty">Пока нет друзей. Добавь их во вкладке «Друзья» — и сможешь открывать тренировки только им.</div>';
  } else {
    list.innerHTML = '';
    friends.forEach((fr) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'friend-pick-row' + (chosen.has(fr.id) ? ' on' : '');
      row.innerHTML = `${avatarHtml(fr)}<span class="friend-pick-name">${nameHtml(fr)}</span><span class="friend-pick-check">${ico('check')}</span>`;
      row.addEventListener('click', () => {
        haptic('select');
        if (chosen.has(fr.id)) chosen.delete(fr.id); else chosen.add(fr.id);
        row.classList.toggle('on', chosen.has(fr.id));
        paintCount();
      });
      list.appendChild(row);
    });
  }
  paintCount();
  const close = () => sheet.classList.add('hidden');
  $('friendPickSave').onclick = () => { close(); onDone([...chosen]); };
  $('friendPickCancel').onclick = () => { close(); onDone([...(selected || [])].map(Number)); };
  sheet.onclick = (e) => { if (e.target === sheet) $('friendPickCancel').onclick(); };
}

// =====================================================================
//  ЛИЧНЫЕ РЕКОРДЫ (профиль)
// =====================================================================
function renderRecords() {
  try { renderGoals(); } catch (e) { /* цели обновляем вместе с рекордами (после новой записи) */ }
  const box = $('recordsList');
  if (!box) return;
  const best = Object.values(bestResults());
  const order = (d) => { const i = COMP_DISCIPLINES.findIndex((x) => disciplineKey(x) === disciplineKey(d)); return i < 0 ? 999 : i; };
  best.sort((a, b) => order(a.w.competition.discipline) - order(b.w.competition.discipline));
  if (!best.length) {
    box.innerHTML = '<div class="muted records-empty">Нажми «＋ Добавить» и внеси свои лучшие результаты — или отметь «Старт» в записи, и рекорд появится здесь сам.</div>';
    return;
  }
  box.innerHTML = '';
  best.forEach(({ w }) => {
    const c = w.competition;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'record-row';
    const when = w.manual && w.date === '1900-01-01' ? '' : formatDayMonth(w.date);
    const sub = [when, c.name, w.manual ? 'вручную' : ''].filter(Boolean).join(' · ');
    row.innerHTML = `
      <span class="record-disc">${esc(c.discipline)}</span>
      <span class="record-main">
        <b class="record-res">${esc(c.result)}</b>
        <span class="record-sub">${esc(sub)}</span>
      </span>
      <span class="history-arrow">${w.manual ? '✕' : '›'}</span>`;
    row.addEventListener('click', async () => {
      if (!w.manual) return openEditScreen(w.id, 'profileScreen');
      if (!(await confirmAsk({ icon: 'trash', title: 'Удалить рекорд?', text: `${c.discipline} — ${c.result}`, ok: 'Удалить', danger: true }))) return;
      try {
        await api(`/api/auth/records/${w.manual_id}`, { method: 'DELETE' });
        myManualRecords = myManualRecords.filter((r) => r.id !== w.manual_id);
        renderRecords();
      } catch (err) { alertMsg('Не удалось удалить. Попробуй ещё раз.'); }
    });
    box.appendChild(row);
  });
}

// =====================================================================
//  ПОВТОРИТЬ ПРОШЛУЮ ТРЕНИРОВКУ
// =====================================================================
let repeatCallback = null;
function openRepeatSheet(cb) {
  repeatCallback = cb;
  const list = $('repeatList');
  const items = myWorkouts
    .filter((w) => w.type === 'training' && ((w.sets || []).length || (w.exercises || []).length || w.warmup))
    .slice(0, 8);
  list.innerHTML = items.length ? '' : '<div class="empty-hint">Пока нет прошлых тренировок — запиши первую 🙂</div>';
  items.forEach((w) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'repeat-row';
    // коротко: «Разминка: 3 км · 400м x5 65 · присед 5×5, 80 кг»
    const lines = buildDetailLines(w)
      .filter((l) => !/^(Самочувствие|RPE|Заметка|❤️|🏆|Беговая работа:|Силовая \/ ОФП:)/.test(l))
      .map((l) => l.replace(/^\d+\.\s*/, ''));
    row.innerHTML = `
      <span class="history-ico tr">${ico(entryKindIco(w))}</span>
      <span class="history-main">
        <span class="history-date">${esc(formatWithWeekday(w.date))}</span>
        <span class="history-sub repeat-sub">${esc(lines.slice(0, 3).join(' · ') || 'Тренировка')}</span>
      </span>`;
    row.addEventListener('click', () => {
      closeRepeatSheet();
      repeatCallback?.(w);
      haptic('success');
    });
    list.appendChild(row);
  });
  $('repeatSheet').classList.remove('hidden');
}
function closeRepeatSheet() { $('repeatSheet').classList.add('hidden'); }
$('repeatCancelBtn').addEventListener('click', closeRepeatSheet);
$('repeatSheet').addEventListener('click', (e) => { if (e.target === $('repeatSheet')) closeRepeatSheet(); });

// =====================================================================
//  ГРАФИКИ ПО НЕДЕЛЯМ («Разбор»)
// =====================================================================
const CHART_WEEKS = 8;
const CHART_COLORS = { km: '#b4f53c', count: '#9b6bff', feel: '#5ea818', rpe: '#9b6bff' };
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// Беговой объём записи в км: отрезки (метры × кол-во) + «N км»/«N м» в разминке и заминке + дистанция старта
// (на сервере для Fom — точно такая же формула, backend/src/ai.js)
// Метры из текста: «кросс 12 км», «3000 м», «3 000м», «ускорения 5×100 м», «6 по 400 м»
// (темп «3:40/км», «4:00 км» и минуты «мин» не считаются)
function textMeters(text) {
  const t = String(text || '').replace(/(\d)[\s ](\d{3})(?!\d)/g, '$1$2');
  // перед числом не должно быть цифры, «:» или запятой (иначе это темп «3:40 км»). Проверяем через первую группу —
  // «заглядывание назад» (?<!…) не работает на iPhone со старой iOS, и из-за него приложение не запускалось
  const re = /(^|[^\d:.,])(?:(\d{1,2})\s*(?:[x×х*]|по)\s*)?(\d+(?:[.,]\d+)?)\s*(км|km|м|m)(?![a-zа-яё])(?!\s*\/\s*[чсh])/gi;
  let m = 0;
  for (const x of t.matchAll(re)) {
    const val = Number(x[3].replace(',', '.'));
    const unit = x[4].toLowerCase();
    const mult = x[2] && Number(x[2]) > 0 && Number(x[2]) <= 50 ? Number(x[2]) : 1;
    if (unit === 'км' || unit === 'km') { if (val > 0 && val < 100) m += val * 1000 * mult; }
    else if (val >= 20 && val <= 30000) m += val * mult;
  }
  return m;
}
// Повторы: «10», «3×4» (серии × повторы)
function repsCount(r) {
  const s = String(r ?? '').trim();
  const x = /^(\d+)\s*[x×х*]\s*(\d+)$/i.exec(s);
  if (x) return Number(x[1]) * Number(x[2]);
  const n = parseInt(s, 10);
  return n > 0 ? n : 1;
}
function volumeKm(w) {
  if (!w || w.type !== 'training') return 0;
  let m = 0;
  (Array.isArray(w.sets) ? w.sets : []).forEach((s) => { m += (Number(s.distance_m) || 0) * repsCount(s.reps); });
  m += textMeters([w.warmup, w.cooldown].filter(Boolean).join('\n'));
  // старт: дистанция из дисциплины («5000 м», «10 км»)
  if (w.competition && w.competition.discipline) m += textMeters(w.competition.discipline);
  return m / 1000;
}

function weekStats() {
  const weeks = [];
  const thisMonday = mondayOf(localDateStr());
  for (let i = CHART_WEEKS - 1; i >= 0; i--) {
    const from = addDays(thisMonday, -7 * i);
    const to = addDays(from, 6);
    const list = myWorkouts.filter((w) => w.date >= from && w.date <= to);
    const tr = list.filter((w) => w.type === 'training');
    const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
    weeks.push({
      from, to,
      km: Math.round(tr.reduce((a, w) => a + volumeKm(w), 0) * 10) / 10,
      count: tr.length,
      feel: avg(list.map((w) => Number(w.feeling)).filter((v) => v > 0)),
      rpe: avg(tr.map((w) => Number(w.rpe)).filter((v) => v > 0)),
    });
  }
  return weeks;
}

function weekLabel(wk) {
  const a = parseDateStr(wk.from), b = parseDateStr(wk.to);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`;
}
function fmtNum(v) { return String(v).replace('.', ','); }

// «Красивый» верх шкалы: 1, 2, 5, 10, 20, 50…
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}

// Общая рамка графика: сетка, подписи осей, области нажатия по неделям
function chartFrame(el, weeks, max, ticks, drawMarks, tipText) {
  const W = Math.max(280, el.clientWidth || 320), H = 150;
  const L = 30, R = 6, T = 18, B = 22;
  const band = (W - L - R) / weeks.length;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const cx = (i) => L + band * i + band / 2;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img">`;
  ticks.forEach((t) => {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="c-grid"/>`;
    svg += `<text x="${L - 6}" y="${y(t) + 3.5}" class="c-axis" text-anchor="end">${fmtNum(t)}</text>`;
  });
  weeks.forEach((wk, i) => {
    const d = parseDateStr(wk.from);
    svg += `<text x="${cx(i)}" y="${H - 6}" class="c-axis${i === weeks.length - 1 ? ' c-now' : ''}" text-anchor="middle">${i === weeks.length - 1 ? 'эта' : `${d.getDate()}.${pad2(d.getMonth() + 1)}`}</text>`;
  });
  svg += drawMarks({ W, H, L, R, T, B, band, y, cx });
  weeks.forEach((wk, i) => {
    svg += `<rect x="${L + band * i}" y="0" width="${band}" height="${H}" fill="transparent" class="c-hit" data-i="${i}"/>`;
  });
  svg += '</svg>';
  el.innerHTML = svg;
  el.querySelectorAll('.c-hit').forEach((r) => {
    const show = () => showChartTip(el, cx(Number(r.dataset.i)), tipText(weeks[Number(r.dataset.i)]), Number(r.dataset.i));
    r.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
    r.addEventListener('click', show);
  });
  el.onpointerleave = (e) => { if (e.pointerType === 'mouse') hideChartTip(); };
}

// Столбики одной серии; подпись — только у самого большого и у текущей недели
function barChart(el, weeks, key, color, unit) {
  const vals = weeks.map((w) => w[key] || 0);
  const maxV = Math.max(...vals);
  const max = niceMax(maxV * 1.1);
  const ticks = [0, max / 2, max].map((t) => Math.round(t * 10) / 10);
  const iMax = vals.indexOf(maxV);
  chartFrame(el, weeks, max, ticks, ({ band, y, cx, H, B }) => {
    let g = '';
    const bw = Math.min(24, band * 0.56);
    vals.forEach((v, i) => {
      if (!v) return;
      const x = cx(i) - bw / 2, top = y(v), base = H - B, r = Math.min(4, (base - top) / 2);
      g += `<path d="M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z" fill="${color}" class="c-bar" data-i="${i}"/>`;
      if (i === iMax || i === vals.length - 1) g += `<text x="${cx(i)}" y="${top - 5}" class="c-val" text-anchor="middle">${fmtNum(v)}</text>`;
    });
    return g;
  }, (wk) => `${weekLabel(wk)}: <b>${fmtNum(wk[key] || 0)}</b> ${unit}`);
}

// Две линии на одной шкале 1–10: самочувствие и нагрузка
function lineChart(el, weeks) {
  chartFrame(el, weeks, 10, [0, 5, 10], ({ y, cx }) => {
    let g = '';
    [['feel', CHART_COLORS.feel], ['rpe', CHART_COLORS.rpe]].forEach(([k, color]) => {
      let d = '', pen = false;
      weeks.forEach((wk, i) => {
        if (wk[k] == null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${cx(i)},${y(wk[k])} `;
        pen = true;
      });
      if (d) g += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      weeks.forEach((wk, i) => {
        if (wk[k] != null) g += `<circle cx="${cx(i)}" cy="${y(wk[k])}" r="4" fill="${color}" stroke="#161a22" stroke-width="2"/>`;
      });
    });
    return g;
  }, (wk) => `${weekLabel(wk)}: самочувствие <b>${wk.feel == null ? '—' : fmtNum(wk.feel)}</b> · RPE <b>${wk.rpe == null ? '—' : fmtNum(wk.rpe)}</b>`);
}

function showChartTip(el, x, html, i) {
  const tip = $('chartTip');
  const card = $('chartsCard');
  tip.innerHTML = html;
  tip.classList.remove('hidden');
  const cr = card.getBoundingClientRect(), er = el.getBoundingClientRect();
  const left = Math.min(Math.max(8, er.left - cr.left + x - tip.offsetWidth / 2), cr.width - tip.offsetWidth - 8);
  tip.style.left = `${left}px`;
  tip.style.top = `${er.top - cr.top - tip.offsetHeight - 4}px`;
  card.querySelectorAll('.c-bar').forEach((b) => b.classList.toggle('dim', b.closest('.chart') === el && Number(b.dataset.i) !== i));
  haptic('select');
}
function hideChartTip() {
  $('chartTip').classList.add('hidden');
  $('chartsCard').querySelectorAll('.c-bar.dim').forEach((b) => b.classList.remove('dim'));
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.c-hit')) hideChartTip();
}, true);

function renderCharts() {
  if (!$('chartsCard')) return;
  const weeks = weekStats();
  const any = weeks.some((w) => w.count || w.feel != null);
  $('chartsCard').classList.toggle('empty', !any);
  if (!any) {
    ['chartKm', 'chartCount', 'chartFeel'].forEach((id) => { $(id).innerHTML = ''; });
    $('chartKm').innerHTML = '<div class="muted chart-empty">Графики появятся, когда в дневнике будут записи за последние недели.</div>';
    return;
  }
  hideChartTip();
  barChart($('chartKm'), weeks, 'km', CHART_COLORS.km, 'км');
  barChart($('chartCount'), weeks, 'count', CHART_COLORS.count, 'трен.');
  lineChart($('chartFeel'), weeks);
  // та же информация таблицей
  $('chartTable').innerHTML = `<table><thead><tr><th>Неделя</th><th>км</th><th>трен.</th><th>самоч.</th><th>RPE</th></tr></thead><tbody>${
    weeks.slice().reverse().map((w) => `<tr><td>${esc(weekLabel(w))}</td><td>${fmtNum(w.km)}</td><td>${w.count}</td><td>${w.feel == null ? '—' : fmtNum(w.feel)}</td><td>${w.rpe == null ? '—' : fmtNum(w.rpe)}</td></tr>`).join('')
  }</tbody></table>`;
}
$('chartsTableBtn').addEventListener('click', () => {
  const t = $('chartTable');
  t.classList.toggle('hidden');
  $('chartsTableBtn').textContent = t.classList.contains('hidden') ? 'Таблица' : 'Скрыть';
});

// =====================================================================
//  ФАЙЛ С ЧАСОВ (Garmin .zip / .FIT, а также .GPX и .TCX)
// =====================================================================
// Файл читается прямо в телефоне — на сервер уходит только короткая сводка по кругам,
// а Fom раскладывает её по полям формы (разминка, отрезки, отдых, заминка, пульс).

// ---------- ZIP (Garmin «Экспорт оригинала» отдаёт .zip, внутри — .fit) ----------
async function unzipFirst(buf, wanted = /\.(fit|gpx|tcx)$/i) {
  const dv = new DataView(buf);
  // конец центрального каталога — ищем с конца файла
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Не получилось открыть архив');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted.test(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = new Uint8Array(buf, start, compSize);
    if (method === 0) return { name, buf: data.slice().buffer };
    if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Телефон не умеет открывать .zip — распакуй архив и выбери .fit');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return { name, buf: await new Response(stream).arrayBuffer() };
    }
    throw new Error('Неизвестный формат архива');
  }
  throw new Error('В архиве нет файла тренировки (.fit)');
}

// ---------- FIT (формат Garmin) ----------
// Берём только нужное: сессию (итоги), круги и точки пульса.
const FIT_EPOCH = Date.UTC(1989, 11, 31) / 1000; // FIT считает время от 31.12.1989
function parseFit(buf) {
  const dv = new DataView(buf);
  const headerSize = dv.getUint8(0);
  if (String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11)) !== '.FIT') {
    throw new Error('Это не файл тренировки .FIT');
  }
  const end = Math.min(buf.byteLength, headerSize + dv.getUint32(4, true));
  const defs = {};
  const out = { session: null, laps: [], records: [] };
  let p = headerSize;
  let lastTs = 0;

  // значение поля; «пустые» значения FIT (0xFF, 0xFFFF…) → null
  function readField(off, size, baseType, little) {
    const t = baseType & 0x1f;
    try {
      switch (t) {
        case 0: case 2: case 10: case 13: { const v = dv.getUint8(off); return v === 0xff || (t === 10 && v === 0) ? null : v; }
        case 1: { const v = dv.getInt8(off); return v === 0x7f ? null : v; }
        case 3: { if (size < 2) return null; const v = dv.getInt16(off, little); return v === 0x7fff ? null : v; }
        case 4: case 11: { if (size < 2) return null; const v = dv.getUint16(off, little); return v === 0xffff || (t === 11 && v === 0) ? null : v; }
        case 5: { if (size < 4) return null; const v = dv.getInt32(off, little); return v === 0x7fffffff ? null : v; }
        case 6: case 12: { if (size < 4) return null; const v = dv.getUint32(off, little); return v === 0xffffffff || (t === 12 && v === 0) ? null : v; }
        case 8: { if (size < 4) return null; const v = dv.getFloat32(off, little); return Number.isFinite(v) ? v : null; }
        default: return null;
      }
    } catch (e) { return null; }
  }

  while (p < end) {
    const h = dv.getUint8(p); p += 1;
    if (h & 0x80) {
      // короткий заголовок со сжатым временем
      const def = defs[(h >> 5) & 0x3];
      if (!def) break;
      const offset = h & 0x1f;
      lastTs = (lastTs & ~0x1f) + offset + (offset < (lastTs & 0x1f) ? 0x20 : 0);
      p = readData(def, p, lastTs);
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) {
      // описание сообщения
      const little = dv.getUint8(p + 1) === 0;
      const num = dv.getUint16(p + 2, little);
      const n = dv.getUint8(p + 4);
      const fields = [];
      let q = p + 5;
      for (let i = 0; i < n; i++, q += 3) fields.push({ num: dv.getUint8(q), size: dv.getUint8(q + 1), type: dv.getUint8(q + 2) });
      let devSize = 0;
      if (h & 0x20) {
        const nd = dv.getUint8(q); q += 1;
        for (let i = 0; i < nd; i++, q += 3) devSize += dv.getUint8(q + 1);
      }
      defs[local] = { num, little, fields, devSize };
      p = q;
    } else {
      const def = defs[local];
      if (!def) break;
      p = readData(def, p, null);
    }
  }

  function readData(def, start, compressedTs) {
    let q = start;
    const v = {};
    for (const f of def.fields) {
      v[f.num] = readField(q, f.size, f.type, def.little);
      q += f.size;
    }
    q += def.devSize;
    if (v[253] != null) lastTs = v[253];
    const ts = compressedTs ?? v[253];
    if (def.num === 18 && !out.session) {
      out.session = {
        start: v[2], sport: v[5], elapsed: v[7] != null ? v[7] / 1000 : null, timer: v[8] != null ? v[8] / 1000 : null,
        distance: v[9] != null ? v[9] / 100 : null, hrAvg: v[16], hrMax: v[17],
      };
    } else if (def.num === 19) {
      out.laps.push({
        start: v[2], end: ts, timer: v[8] != null ? v[8] / 1000 : (v[7] != null ? v[7] / 1000 : null),
        distance: v[9] != null ? v[9] / 100 : null, hrAvg: v[15], hrMax: v[16], intensity: v[23],
      });
    } else if (def.num === 20 && ts != null && v[3] != null) {
      out.records.push({ t: ts, hr: v[3] });
    }
    return q;
  }

  if (!out.session && !out.laps.length) throw new Error('В файле нет тренировки');
  return out;
}

// ---------- GPX и TCX (другие часы и Strava) ----------
function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function parseXmlWorkout(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const byTag = (el, tag) => [...el.getElementsByTagName('*')].filter((x) => x.localName === tag);
  const num = (el, tag) => { const x = byTag(el, tag)[0]; return x ? Number(x.textContent) : null; };
  const out = { session: null, laps: [], records: [] };
  const tcxLaps = byTag(doc, 'Lap');
  if (tcxLaps.length) {
    // TCX: круги уже есть
    tcxLaps.forEach((l) => {
      const avg = byTag(l, 'AverageHeartRateBpm')[0], max = byTag(l, 'MaximumHeartRateBpm')[0];
      const inten = byTag(l, 'Intensity')[0]?.textContent;
      out.laps.push({
        start: Date.parse(l.getAttribute('StartTime')) / 1000 - FIT_EPOCH,
        timer: num(l, 'TotalTimeSeconds'), distance: num(l, 'DistanceMeters'),
        hrAvg: avg ? num(avg, 'Value') : null, hrMax: max ? num(max, 'Value') : null,
        intensity: inten === 'Resting' ? 1 : 0,
      });
    });
    byTag(doc, 'Trackpoint').forEach((tp) => {
      const hr = byTag(tp, 'HeartRateBpm')[0];
      const time = byTag(tp, 'Time')[0];
      if (hr && time) out.records.push({ t: Date.parse(time.textContent) / 1000 - FIT_EPOCH, hr: num(hr, 'Value') });
    });
  } else {
    // GPX: только точки — сами режем на отрезки по 1 км
    const pts = byTag(doc, 'trkpt').map((tp) => ({
      lat: Number(tp.getAttribute('lat')), lon: Number(tp.getAttribute('lon')),
      t: Date.parse(byTag(tp, 'time')[0]?.textContent) / 1000 - FIT_EPOCH,
      hr: (() => { const x = byTag(tp, 'hr')[0]; return x ? Number(x.textContent) : null; })(),
    })).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.t));
    if (pts.length < 2) throw new Error('В файле нет точек тренировки');
    let dist = 0, lapStart = pts[0], lapDist = 0, lapHr = [];
    for (let i = 1; i < pts.length; i++) {
      const d = haversine(pts[i - 1], pts[i]);
      dist += d; lapDist += d;
      if (pts[i].hr) { lapHr.push(pts[i].hr); out.records.push({ t: pts[i].t, hr: pts[i].hr }); }
      if (lapDist >= 1000 || i === pts.length - 1) {
        out.laps.push({
          start: lapStart.t, timer: pts[i].t - lapStart.t, distance: lapDist,
          hrAvg: lapHr.length ? Math.round(lapHr.reduce((a, b) => a + b, 0) / lapHr.length) : null,
          hrMax: lapHr.length ? Math.max(...lapHr) : null, intensity: 0,
        });
        lapStart = pts[i]; lapDist = 0; lapHr = [];
      }
    }
    out.session = { start: pts[0].t, timer: pts[pts.length - 1].t - pts[0].t, distance: dist };
  }
  if (!out.session && out.laps.length) {
    out.session = {
      start: out.laps[0].start,
      timer: out.laps.reduce((a, l) => a + (l.timer || 0), 0),
      distance: out.laps.reduce((a, l) => a + (l.distance || 0), 0),
    };
  }
  const hrs = out.records.map((r) => r.hr).filter(Boolean);
  if (out.session && hrs.length) {
    if (out.session.hrAvg == null) out.session.hrAvg = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);
    if (out.session.hrMax == null) out.session.hrMax = Math.max(...hrs);
  }
  return out;
}

// ---------- Сводка для Fom ----------
function fmtDur(sec) {
  if (sec == null) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(r)}` : `${m}:${pad2(r)}`;
}
function fmtDist(m) {
  if (!m) return '';
  return m >= 1000 ? `${String(Math.round(m / 10) / 100).replace('.', ',')} км` : `${Math.round(m)} м`;
}
function fmtPace(sec, m) {
  if (!sec || !m || m < 100) return '';
  const perKm = Math.round(sec / (m / 1000));
  return perKm >= 100 && perKm <= 1200 ? `${Math.floor(perKm / 60)}:${pad2(perKm % 60)}/км` : '';
}
const LAP_KIND = { 0: 'работа', 1: 'отдых', 2: 'разминка', 3: 'заминка', 4: 'восстановление', 5: 'интервал', 6: 'другое' };

// Минимальный пульс в кругах отдыха (насколько опускался пульс в паузах)
function restMinHr(w) {
  const rest = w.laps.filter((l) => l.intensity === 1 || l.intensity === 4);
  if (!rest.length || !w.records.length) return null;
  const mins = rest.map((l) => {
    const endT = l.end ?? (l.start + (l.timer || 0));
    const hr = w.records.filter((r) => r.t >= l.start && r.t <= endT).map((r) => r.hr);
    return hr.length ? Math.min(...hr) : null;
  }).filter(Boolean);
  return mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
}

function watchSummary(w, source) {
  const s = w.session || {};
  const date = s.start ? new Date((s.start + FIT_EPOCH) * 1000) : null;
  const lines = [];
  lines.push(`Тренировка из файла часов (${source})${date ? `, ${localDateStr(date)}` : ''}.`);
  const total = [fmtDist(s.distance), s.timer ? `за ${fmtDur(s.timer)}` : '', fmtPace(s.timer, s.distance)].filter(Boolean).join(' ');
  const hr = [s.hrAvg && `пульс ср ${s.hrAvg}`, s.hrMax && `макс ${s.hrMax}`].filter(Boolean).join(' ');
  lines.push(`Итого: ${[total, hr].filter(Boolean).join(', ')}.`);
  const hrMin = restMinHr(w);
  if (hrMin) lines.push(`Пульс в паузах: ${hrMin}.`);
  const hasKinds = w.laps.some((l) => l.intensity && l.intensity !== 0);
  if (w.laps.length > 1) {
    lines.push('Круги по порядку:');
    w.laps.slice(0, 60).forEach((l, i) => {
      const bits = [
        hasKinds ? LAP_KIND[l.intensity ?? 0] || 'работа' : '',
        fmtDist(l.distance), fmtDur(l.timer),
        l.distance >= 600 ? `(${fmtPace(l.timer, l.distance)})` : '',
        l.hrAvg ? `пульс ${l.hrAvg}${l.hrMax ? '/' + l.hrMax : ''}` : '',
      ].filter(Boolean);
      lines.push(`${i + 1}. ${bits.join(' ')}`);
    });
  }
  return { text: lines.join('\n'), date: date ? localDateStr(date) : null, hrAvg: s.hrAvg || null, hrMax: s.hrMax || null, hrMin };
}

// Прочитать выбранный файл → сводка
async function readWatchFile(file) {
  let buf = await file.arrayBuffer();
  let name = file.name || '';
  if (/\.zip$/i.test(name) || new DataView(buf).getUint32(0, true) === 0x04034b50) {
    ({ buf, name } = await unzipFirst(buf));
  }
  if (/\.(gpx|tcx)$/i.test(name)) {
    return watchSummary(parseXmlWorkout(new TextDecoder().decode(buf)), /\.tcx$/i.test(name) ? 'TCX' : 'GPX');
  }
  return watchSummary(parseFit(buf), 'Garmin');
}

function openWatchHelp() { $('watchSheet').classList.remove('hidden'); }
function closeWatchHelp() { $('watchSheet').classList.add('hidden'); }
$('watchHelpClose').addEventListener('click', closeWatchHelp);
$('watchSheet').addEventListener('click', (e) => { if (e.target === $('watchSheet')) closeWatchHelp(); });

// =====================================================================
//  ПЛАВНЫЙ ПЕРЕХОД ПО НИЖНЕЙ ПАНЕЛИ
// =====================================================================
// Светящаяся полоска переезжает под активную вкладку, а экран въезжает с той стороны, куда идёшь.
const NAV_ORDER = ['chatScreen', 'insightsScreen', 'mainScreen', 'friendsScreen', 'profileScreen'];
let navPrevIndex = NAV_ORDER.indexOf('mainScreen');
function moveNavIndicator(targetId) {
  const ind = $('navIndicator');
  const key = NAV_PARENT[targetId] || targetId;
  const btn = document.querySelector(`.bottom-nav [data-screen="${key}"]`);
  if (!ind || !btn || btn.classList.contains('nav-plus')) { if (ind) ind.classList.add('off'); return; }
  const nav = btn.parentElement.getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  ind.classList.remove('off');
  ind.style.transform = `translateX(${r.left - nav.left + r.width / 2 - 14}px)`;
}
function animateScreenIn(targetId) {
  const idx = NAV_ORDER.indexOf(NAV_PARENT[targetId] || targetId);
  const el = $(targetId);
  if (!el || REDUCED_MOTION) return;
  const dir = idx < 0 || idx === navPrevIndex ? 0 : idx > navPrevIndex ? 1 : -1;
  if (idx >= 0) navPrevIndex = idx;
  el.classList.remove('screen-in', 'from-left', 'from-right');
  void el.offsetWidth; // перезапуск анимации
  el.classList.add('screen-in', dir > 0 ? 'from-right' : dir < 0 ? 'from-left' : 'from-none');
}
window.addEventListener('resize', () => moveNavIndicator(document.querySelector('.screen:not(.hidden)')?.id));

// =====================================================================
//  КАРТОЧКА ДЛЯ СТОРИС (картинка 1080×1920 в стиле Forma)
// =====================================================================
const STORY_W = 1080, STORY_H = 1920;
const BOT_LINK = 't.me/forma2ko5_bot';
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function daysWordRu(n) {
  const a = n % 100, b = n % 10;
  return a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b >= 2 && b <= 4 ? 'дня' : 'дней';
}

// скруглённый прямоугольник
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// перенос текста по словам; возвращает строки (не больше maxLines, последняя с «…»)
function wrapLines(ctx, text, maxW, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    cut[maxLines - 1] = last + '…';
    return cut;
  }
  return lines;
}

// шрифт уменьшается, пока текст не влезет по ширине
function fitFont(ctx, text, weight, family, maxSize, maxW, minSize = 40) {
  let size = maxSize;
  do { ctx.font = `${weight} ${size}px ${family}`; size -= 4; } while (ctx.measureText(text).width > maxW && size > minSize);
}

// Что крупно показать на карточке
function storyHero(w) {
  if (w.type === 'rest') return { kind: 'rest' };
  if (w.competition?.result) return { kind: 'comp' };
  const sets = (w.sets || []).filter((s) => s.distance_m || s.duration_s || s.reps);
  if (sets.length) {
    return {
      kind: 'sets',
      lines: sets.slice(0, 4).map((s) => ({
        big: `${s.reps && s.reps > 1 ? `${s.reps} × ` : ''}${s.duration_s ? durLabel(s.duration_s) : s.distance_m ? distLabel(s.distance_m).replace(/м$/, ' м') : ''}`.trim(),
        small: [s.time_or_pace, s.rest_between && `отдых ${s.rest_between}`].filter(Boolean).join(' · '),
      })),
      more: sets.length - 4,
    };
  }
  const km = volumeKm(w);
  if (km >= 1) return { kind: 'km', km };
  if ((w.exercises || []).length) return { kind: 'ofp' };
  return { kind: 'text' };
}

async function drawStoryCard(w) {
  try { await Promise.all(['700 80px Unbounded', '800 40px Manrope', '600 40px Manrope'].map((f) => document.fonts.load(f))); } catch (e) {}
  const c = document.createElement('canvas');
  c.width = STORY_W; c.height = STORY_H;
  const ctx = c.getContext('2d');
  const HEAD = "'Unbounded', 'Manrope', sans-serif";
  const BODY = "'Manrope', -apple-system, sans-serif";
  const X = 90, CW = STORY_W - 2 * X;

  // фон со свечением, как в приложении
  ctx.fillStyle = '#0a0c11';
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  let g = ctx.createRadialGradient(STORY_W, 0, 0, STORY_W, 0, 1100);
  g.addColorStop(0, 'rgba(155,107,255,0.38)'); g.addColorStop(1, 'rgba(155,107,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, STORY_W, STORY_H);
  g = ctx.createRadialGradient(0, STORY_H, 0, 0, STORY_H, 1000);
  g.addColorStop(0, 'rgba(180,245,60,0.22)'); g.addColorStop(1, 'rgba(180,245,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, STORY_W, STORY_H);

  // логотип
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f3f5f8';
  ctx.font = `700 78px ${HEAD}`;
  ctx.fillText('Forma', X, 200);
  const lw = ctx.measureText('Forma').width;
  ctx.save();
  ctx.shadowColor = 'rgba(180,245,60,0.8)'; ctx.shadowBlur = 24;
  ctx.fillStyle = '#b4f53c';
  ctx.beginPath(); ctx.arc(X + lw + 20, 186, 12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // дата справа
  const d = parseDateStr(w.date);
  ctx.font = `600 38px ${BODY}`;
  ctx.fillStyle = '#8b93a7';
  ctx.textAlign = 'right';
  ctx.fillText(`${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`, STORY_W - X, 196);
  ctx.textAlign = 'left';

  // метка вида записи
  const pb = w.competition && isPersonalBest(w);
  const label = w.type === 'rest' ? 'ДЕНЬ ОТДЫХА' : w.competition ? 'СТАРТ' : w.session > 1 ? 'ВТОРАЯ ТРЕНИРОВКА' : 'ТРЕНИРОВКА';
  ctx.font = `800 34px ${BODY}`;
  const chipW = ctx.measureText(label).width + 64 + label.length * 3;
  rrect(ctx, X, 300, chipW, 72, 36);
  ctx.fillStyle = w.competition ? 'rgba(255,196,77,0.14)' : 'rgba(180,245,60,0.12)';
  ctx.fill();
  ctx.strokeStyle = w.competition ? 'rgba(255,196,77,0.7)' : 'rgba(180,245,60,0.6)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = w.competition ? '#ffd15a' : '#b4f53c';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillText(label, X + 32, 348);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  // главное — крупно
  const hero = storyHero(w);
  let y = 560;
  if (hero.kind === 'comp') {
    const c0 = w.competition;
    ctx.fillStyle = '#c3c9d6';
    ctx.font = `700 60px ${BODY}`;
    ctx.fillText(c0.discipline || '', X, y);
    y += 250;
    fitFont(ctx, c0.result, 700, HEAD, 260, CW, 120);
    ctx.save();
    ctx.shadowColor = 'rgba(255,196,77,0.45)'; ctx.shadowBlur = 40;
    ctx.fillStyle = '#ffd15a';
    ctx.fillText(c0.result, X, y);
    ctx.restore();
    y += 110;
    const sub = [c0.place ? `${c0.place} место` : '', c0.name].filter(Boolean).join(' · ');
    if (sub) {
      ctx.font = `600 46px ${BODY}`; ctx.fillStyle = '#d9dde6';
      wrapLines(ctx, sub, CW, 2).forEach((l) => { ctx.fillText(l, X, y); y += 62; });
    }
    if (pb) {
      y += 30;
      ctx.font = `800 40px ${BODY}`;
      const t = '🏆 ЛИЧНЫЙ РЕКОРД';
      const bw = ctx.measureText(t).width + 70;
      const gg = ctx.createLinearGradient(X, 0, X + bw, 0);
      gg.addColorStop(0, '#ffe98a'); gg.addColorStop(1, '#ffae1f');
      rrect(ctx, X, y - 58, bw, 86, 43); ctx.fillStyle = gg; ctx.fill();
      ctx.fillStyle = '#0b0d10'; ctx.fillText(t, X + 35, y);
    }
  } else if (hero.kind === 'sets') {
    const big = hero.lines.length === 1 ? 170 : hero.lines.length === 2 ? 120 : 92;
    y = 520 + big;
    hero.lines.forEach((l) => {
      fitFont(ctx, l.big, 700, HEAD, big, CW, 60);
      ctx.fillStyle = '#f3f5f8';
      ctx.fillText(l.big, X, y);
      y += Math.round(big * 0.55);
      if (l.small) {
        ctx.font = `600 ${hero.lines.length === 1 ? 50 : 40}px ${BODY}`;
        ctx.fillStyle = '#b4f53c';
        wrapLines(ctx, l.small, CW, 2).forEach((s) => { ctx.fillText(s, X, y); y += hero.lines.length === 1 ? 64 : 52; });
      }
      y += Math.round(big * 0.7);
    });
    if (hero.more > 0) { ctx.font = `600 40px ${BODY}`; ctx.fillStyle = '#8b93a7'; ctx.fillText(`и ещё ${hero.more}`, X, y - Math.round(big * 0.4)); }
  } else if (hero.kind === 'km') {
    y = 820;
    ctx.fillStyle = '#f3f5f8';
    ctx.font = `700 230px ${HEAD}`;
    const kmText = fmtNum(Math.round(hero.km * 10) / 10);
    ctx.fillText(kmText, X, y);
    const kw = ctx.measureText(kmText).width;
    ctx.font = `700 80px ${HEAD}`; ctx.fillStyle = '#b4f53c';
    ctx.fillText('км', X + kw + 24, y);
    y += 110;
    if (w.warmup) {
      ctx.font = `600 46px ${BODY}`; ctx.fillStyle = '#c3c9d6';
      wrapLines(ctx, w.warmup, CW, 3).forEach((l) => { ctx.fillText(l, X, y); y += 62; });
    }
  } else if (hero.kind === 'ofp') {
    ctx.font = `700 130px ${HEAD}`; ctx.fillStyle = '#f3f5f8';
    ctx.fillText('ОФП', X, y + 80);
    y += 190;
    ctx.font = `600 50px ${BODY}`; ctx.fillStyle = '#d9dde6';
    w.exercises.slice(0, 6).forEach((e) => { ctx.fillText(formatExercise(e).slice(0, 34), X, y); y += 72; });
  } else if (hero.kind === 'rest') {
    ctx.font = `700 120px ${HEAD}`; ctx.fillStyle = '#f3f5f8';
    ctx.fillText('Отдых', X, y + 80);
    ctx.font = `600 50px ${BODY}`; ctx.fillStyle = '#c3c9d6';
    y += 190;
    ['Восстановление —', 'тоже часть тренировки 💜'].forEach((l) => { ctx.fillText(l, X, y); y += 68; });
  } else {
    ctx.font = `600 56px ${BODY}`; ctx.fillStyle = '#d9dde6';
    wrapLines(ctx, w.warmup || w.notes || 'Тренировка записана', CW, 5).forEach((l) => { ctx.fillText(l, X, y); y += 76; });
  }

  // плитки с цифрами
  const tiles = [];
  const km = volumeKm(w);
  if (km >= 0.4 && hero.kind !== 'km') tiles.push(['объём', `${fmtNum(Math.round(km * 10) / 10)} км`]);
  if (w.hr_avg) tiles.push(['пульс ср.', String(w.hr_avg)]);
  if (w.rpe && w.type === 'training') tiles.push(['нагрузка', `${w.rpe}/10`]);
  if (w.feeling && tiles.length < 3) tiles.push(['самочувствие', `${w.feeling}/10`]);
  if (tiles.length) {
    const n = Math.min(3, tiles.length), gap = 24, tw = (CW - gap * (n - 1)) / n, ty = 1330, th = 190;
    tiles.slice(0, 3).forEach(([k, v], i) => {
      const tx = X + i * (tw + gap);
      rrect(ctx, tx, ty, tw, th, 36);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; ctx.stroke();
      fitFont(ctx, v, 700, HEAD, 64, tw - 50, 36);
      ctx.fillStyle = '#f3f5f8';
      ctx.fillText(v, tx + 30, ty + 98);
      ctx.font = `600 32px ${BODY}`; ctx.fillStyle = '#8b93a7';
      ctx.fillText(k, tx + 30, ty + 150);
    });
  }

  // серия и имя
  const streak = currentUser?.current_streak || 0;
  let by = 1640;
  if (streak >= 2) {
    ctx.font = `800 56px ${BODY}`; ctx.fillStyle = '#b4f53c';
    ctx.fillText(`🔥 ${streak} ${daysWordRu(streak)} подряд`, X, by);
    by += 80;
  }
  const name = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || (currentUser?.username ? '@' + currentUser.username : '');
  if (name) {
    ctx.font = `700 44px ${BODY}`; ctx.fillStyle = '#f3f5f8';
    ctx.fillText(name.slice(0, 32), X, by);
  }
  // подвал: где записано
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(X, 1770, CW, 2);
  ctx.font = `700 36px ${BODY}`; ctx.fillStyle = '#c3c9d6';
  ctx.textAlign = 'right';
  ctx.fillText(BOT_LINK, STORY_W - X, 1836);
  const linkW = ctx.measureText(BOT_LINK).width;
  ctx.textAlign = 'left';
  ctx.font = `600 34px ${BODY}`; ctx.fillStyle = '#8b93a7';
  // подпись слева — самая длинная, какая влезает рядом со ссылкой
  const tag = ['Дневник тренировок с Fom', 'Дневник тренировок', 'Записано в Forma']
    .find((t) => ctx.measureText(t).width + linkW + 40 <= CW) || '';
  ctx.fillText(tag, X, 1836);
  return c;
}

// ---------- Окно «Поделиться» ----------
let shareState = { w: null, blob: null, url: null, dataUrl: '' };

async function openShareSheet(w) {
  shareState = { w, blob: null, url: null, dataUrl: '' };
  $('sharePreview').removeAttribute('src');
  $('shareSheet').classList.remove('hidden');
  $('shareStatus').textContent = 'Рисую карточку...';
  const canStory = !!tg?.shareToStory && (tg.isVersionAtLeast?.('7.8') ?? false) && !/tdesktop|macos|web/.test(tg.platform || '');
  $('shareStoryBtn').classList.toggle('hidden', !canStory);
  try {
    const canvas = await drawStoryCard(w);
    shareState.dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    shareState.blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.9));
    $('sharePreview').src = shareState.dataUrl;
    $('shareStatus').textContent = '';
  } catch (err) {
    console.error(err);
    $('shareStatus').textContent = 'Не получилось нарисовать карточку — можно отправить текстом.';
  }
}
function closeShareSheet() { $('shareSheet').classList.add('hidden'); }

// Картинку кладём на сервер — Telegram берёт её по ссылке
async function uploadStoryImage() {
  if (shareState.url) return shareState.url;
  const res = await fetch(API_BASE + '/api/bot/story', {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'X-Telegram-Init-Data': tg?.initData || '' },
    body: shareState.blob,
  });
  if (!res.ok) throw new Error('upload failed');
  shareState.url = (await res.json()).url;
  return shareState.url;
}

$('shareStoryBtn').addEventListener('click', async () => {
  if (!shareState.blob) return;
  $('shareStatus').textContent = 'Готовлю сторис...';
  try {
    const url = await uploadStoryImage();
    tg.shareToStory(url, {
      text: 'Моя тренировка в Forma 🔥',
      widget_link: { url: 'https://' + BOT_LINK, name: 'Forma' },
    });
    $('shareStatus').textContent = '';
    closeShareSheet();
  } catch (err) {
    console.error(err);
    $('shareStatus').textContent = 'Не получилось открыть сторис. Попробуй «Сохранить картинку».';
  }
});

$('shareSaveBtn').addEventListener('click', async () => {
  if (!shareState.blob) return;
  const fileName = `forma-${shareState.w.date}.jpg`;
  try {
    // 1) системное «Поделиться» с картинкой — сразу в Instagram, Галерею и т.д.
    const file = new File([shareState.blob], fileName, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
    // 2) скачивание через Telegram (новые версии)
    if (tg?.downloadFile && tg.isVersionAtLeast?.('8.0')) {
      const url = await uploadStoryImage();
      tg.downloadFile({ url, file_name: fileName });
      return;
    }
    // 3) обычное скачивание (компьютер)
    const a = document.createElement('a');
    a.href = shareState.dataUrl; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
  } catch (err) {
    if (err?.name === 'AbortError') return; // сам закрыл окно
    console.error(err);
    $('shareStatus').textContent = 'Не получилось сохранить. Зажми картинку выше и выбери «Сохранить».';
  }
});

$('shareTextBtn').addEventListener('click', () => { closeShareSheet(); shareWorkoutText(shareState.w); });
$('shareCancelBtn').addEventListener('click', closeShareSheet);
$('shareSheet').addEventListener('click', (e) => { if (e.target === $('shareSheet')) closeShareSheet(); });

// =====================================================================
//  УТРЕННЯЯ ОТМЕТКА: сон, самочувствие, пульс покоя (10 секунд)
// =====================================================================
let morningChecks = [];
const mDraft = { sleep: null, mood: null };
const MOOD_EMOJI = { 1: '😫', 2: '😕', 3: '😐', 4: '🙂', 5: '🤩' };

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

async function loadMorning() {
  try { morningChecks = (await api('/api/auth/morning')).checks || []; } catch (e) { morningChecks = []; }
  renderMorning();
  renderAchievements();
}

// Пульс покоя сегодня заметно выше обычного? (среднее за прошлые дни)
function restHrJump() {
  const today = localDateStr();
  const t = morningChecks.find((c) => c.date === today);
  const prev = morningChecks.filter((c) => c.date !== today && c.rest_hr).map((c) => c.rest_hr);
  if (!t?.rest_hr || prev.length < 3) return 0;
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  return Math.round(t.rest_hr - avg);
}

function renderMorning() {
  const card = $('morningCard');
  const today = localDateStr();
  const hour = new Date().getHours();
  const t = morningChecks.find((c) => c.date === today);
  if (!currentUser || lsGet('forma_morning_hide') === today || hour < 4 || hour >= (t ? 12 : 15)) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  $('morningForm').classList.toggle('hidden', !!t);
  $('morningDone').classList.toggle('hidden', !t);
  if (t) {
    const bits = [t.sleep_h != null && `сон ${fmtNum(t.sleep_h)} ч`, t.mood && MOOD_EMOJI[t.mood], t.rest_hr && `пульс ${t.rest_hr}`].filter(Boolean);
    const jump = restHrJump();
    $('morningDone').innerHTML = `<div class="morning-sum">${ico('check')} ${esc(bits.join(' · '))}</div>` +
      (jump >= 5 ? `<div class="morning-warn">${ico('warn')} Пульс покоя на ${jump} выше обычного — прислушайся к себе и скажи тренеру, если что-то не так.</div>` : '');
  } else {
    $('mSleep').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.v) === mDraft.sleep));
    $('mMood').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.v) === mDraft.mood));
  }
}

$('mSleep').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { mDraft.sleep = Number(c.dataset.v); renderMorning(); }));
$('mMood').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { mDraft.mood = Number(c.dataset.v); renderMorning(); }));
$('morningClose').addEventListener('click', () => { lsSet('forma_morning_hide', localDateStr()); renderMorning(); });
$('morningSave').addEventListener('click', async () => {
  const hr = $('mHr').value;
  if (mDraft.sleep == null && mDraft.mood == null && !hr) return alertMsg('Отметь сон или самочувствие 🙂');
  const btn = $('morningSave');
  btn.disabled = true;
  try {
    const { check } = await api('/api/auth/morning', {
      method: 'POST',
      body: JSON.stringify({ date: localDateStr(), sleep_h: mDraft.sleep, mood: mDraft.mood, rest_hr: hr }),
    });
    morningChecks = [check, ...morningChecks.filter((c) => c.date !== check.date)];
    haptic('success');
    renderMorning();
    renderAchievements();
  } catch (err) {
    alertMsg(err.data?.error || 'Не удалось сохранить. Попробуй ещё раз.');
  } finally {
    btn.disabled = false;
  }
});

// =====================================================================
//  КАЛЕНДАРЬ СТАРТОВ + ОБРАТНЫЙ ОТСЧЁТ
// =====================================================================
let plannedStarts = [];

function daysUntil(dateStr) {
  return Math.round((parseDateStr(dateStr) - parseDateStr(localDateStr())) / 86400000);
}
function daysLabel(n) {
  const a = n % 100, b = n % 10;
  return a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b >= 2 && b <= 4 ? 'дня' : 'дней';
}


// =====================================================================
//  ЦЕЛИ НА МЕСЯЦ — Fom видит их и следит за прогрессом
// =====================================================================
let myGoals = [];
let myWeightKg = null;
let goalKind = 'volume';

async function loadGoals() {
  try {
    const r = await api('/api/auth/goals');
    myGoals = r.goals || [];
    myWeightKg = r.weight;
  } catch (e) { /* не страшно */ }
  renderGoals();
}
function monthKm(prefix) {
  return myWorkouts.filter((w) => w.date.startsWith(prefix)).reduce((a, w) => a + volumeKm(w), 0);
}
function goalProgress(g) {
  const month = localDateStr().slice(0, 7);
  const f = (n) => fmtNum(Math.round(n * 10) / 10);
  if (g.kind === 'volume') {
    const km = monthKm(month);
    return { title: `${f(g.target_num)} км за месяц`, now: `${f(km)} из ${f(g.target_num)} км`, frac: km / g.target_num, icon: 'target' };
  }
  if (g.kind === 'count') {
    const n = myWorkouts.filter((w) => w.date.startsWith(month) && w.type === 'training').length;
    return { title: `${g.target_num} тренировок`, now: `${n} из ${g.target_num}`, frac: n / g.target_num, icon: 'runner' };
  }
  if (g.kind === 'pb') {
    const best = bestResults()[disciplineKey(g.discipline)];
    const tv = parseResult(g.target, g.discipline);
    let frac = 0, done = false;
    if (best && tv != null) {
      done = higherIsBetter(g.discipline) ? best.value >= tv : best.value <= tv;
      frac = done ? 1 : Math.max(0, Math.min(0.95, higherIsBetter(g.discipline) ? best.value / tv : tv / best.value));
    }
    return { title: `${g.discipline} — ${g.target}`, now: best ? `лучший: ${best.w.competition.result}${done ? ' — цель взята! 🏆' : ''}` : 'рекорда пока нет', frac, icon: 'trophy' };
  }
  if (g.kind === 'weight') {
    const start = g.start_num, target = g.target_num, now = myWeightKg;
    const lose = start != null && target < start;
    const frac = start != null && now != null && start !== target ? (start - now) / (start - target) : 0;
    return {
      title: `${lose ? 'Похудеть' : 'Набрать'} до ${f(target)} кг`,
      now: now != null ? `сейчас ${f(now)} кг${start != null ? ` · было ${f(start)}` : ''}` : 'укажи вес',
      frac, icon: 'heart', weight: true,
    };
  }
  return { title: g.title, now: g.done ? 'выполнено ✓' : 'отметь, когда сделаешь', frac: g.done ? 1 : 0, icon: 'check', custom: true };
}
function renderGoals() {
  const box = $('goalsList');
  if (!box) return;
  $('goalsMonth').textContent = MONTHS[new Date().getMonth()].toLowerCase();
  if (!myGoals.length) {
    box.innerHTML = '<div class="muted records-empty">Поставь 1–3 цели на месяц: объём, число тренировок, рекорд, вес или свою. Fom будет видеть их и подсказывать, как идёшь.</div>';
    return;
  }
  box.innerHTML = '';
  myGoals.forEach((g) => {
    const p = goalProgress(g);
    const pct = Math.round(Math.max(0, Math.min(1, p.frac || 0)) * 100);
    const row = document.createElement('div');
    row.className = 'goal-row' + (pct >= 100 ? ' done' : '');
    row.innerHTML = `
      <span class="goal-ico">${ico(p.icon)}</span>
      <span class="goal-main">
        <b class="goal-title">${esc(p.title)}</b>
        <span class="goal-now">${esc(p.now)}</span>
        <span class="goal-bar"><i style="width:${pct}%"></i></span>
      </span>
      ${p.custom ? `<button type="button" class="goal-act goal-check">${g.done ? '✓' : '○'}</button>` : ''}
      ${p.weight ? '<button type="button" class="goal-act goal-weight">вес</button>' : ''}
      <button type="button" class="row-del" aria-label="Удалить">✕</button>`;
    row.querySelector('.row-del').addEventListener('click', async () => {
      if (!(await confirmAsk({ icon: 'trash', title: 'Убрать цель?', text: p.title, ok: 'Убрать', danger: true }))) return;
      try { await api(`/api/auth/goals/${g.id}`, { method: 'DELETE' }); myGoals = myGoals.filter((x) => x.id !== g.id); renderGoals(); }
      catch (e) { alertMsg('Не удалось удалить.'); }
    });
    row.querySelector('.goal-check')?.addEventListener('click', async () => {
      g.done = !g.done; renderGoals(); haptic(g.done ? 'success' : 'select');
      try { await api(`/api/auth/goals/${g.id}/done`, { method: 'POST', body: JSON.stringify({ done: g.done }) }); } catch (e) { /* не страшно */ }
    });
    row.querySelector('.goal-weight')?.addEventListener('click', openWeightSheet);
    box.appendChild(row);
  });
}

function paintGoalSheet() {
  $('goalKinds').querySelectorAll('.rn-day').forEach((b) => b.classList.toggle('active', b.dataset.kind === goalKind));
  document.querySelectorAll('#goalSheet .goal-f').forEach((el) => el.classList.toggle('hidden', !el.dataset.for.split(' ').includes(goalKind)));
  $('gNumLabel').textContent = goalKind === 'volume' ? 'Сколько км за месяц' : 'Сколько тренировок за месяц';
  $('gNum').placeholder = goalKind === 'volume' ? 'Например, 250' : 'Например, 20';
}
function openGoalSheet() {
  goalKind = 'volume';
  ['gNum', 'gDisc', 'gTarget', 'gWeightTarget', 'gTitle'].forEach((id) => { $(id).value = ''; });
  $('gWeightNow').value = myWeightKg ?? athleteProfile?.weight_kg ?? '';
  $('gDiscChips').innerHTML = COMP_DISCIPLINES.map((d) => `<button type="button" class="chip">${esc(d)}</button>`).join('');
  $('gDiscChips').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    $('gDisc').value = c.textContent;
    $('gDiscChips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
  }));
  paintGoalSheet();
  $('goalSheet').classList.remove('hidden');
}
$('goalKinds').querySelectorAll('.rn-day').forEach((b) => b.addEventListener('click', () => { goalKind = b.dataset.kind; paintGoalSheet(); }));
$('goalAddBtn').addEventListener('click', openGoalSheet);
$('gCancel').addEventListener('click', () => $('goalSheet').classList.add('hidden'));
$('goalSheet').addEventListener('click', (e) => { if (e.target === $('goalSheet')) $('goalSheet').classList.add('hidden'); });
$('gSave').addEventListener('click', async () => {
  const body = { kind: goalKind };
  if (goalKind === 'volume' || goalKind === 'count') body.target_num = $('gNum').value;
  if (goalKind === 'pb') { body.discipline = $('gDisc').value; body.target = $('gTarget').value; }
  if (goalKind === 'weight') { body.target_num = $('gWeightTarget').value; body.current_num = $('gWeightNow').value; }
  if (goalKind === 'custom') body.title = $('gTitle').value;
  const btn = $('gSave'); btn.disabled = true;
  try {
    const { goal } = await api('/api/auth/goals', { method: 'POST', body: JSON.stringify(body) });
    myGoals.push(goal);
    if (goalKind === 'weight' && $('gWeightNow').value) myWeightKg = parseFloat(String($('gWeightNow').value).replace(',', '.'));
    $('goalSheet').classList.add('hidden');
    haptic('success');
    renderGoals();
  } catch (err) {
    alertMsg(err.data?.error || 'Не удалось сохранить цель.');
  } finally { btn.disabled = false; }
});

function openWeightSheet() {
  $('wKg').value = myWeightKg ?? '';
  $('weightSheet').classList.remove('hidden');
}
$('wCancel').addEventListener('click', () => $('weightSheet').classList.add('hidden'));
$('weightSheet').addEventListener('click', (e) => { if (e.target === $('weightSheet')) $('weightSheet').classList.add('hidden'); });
$('wSave').addEventListener('click', async () => {
  try {
    const { kg } = await api('/api/auth/weight', { method: 'POST', body: JSON.stringify({ kg: $('wKg').value }) });
    myWeightKg = kg;
    $('weightSheet').classList.add('hidden');
    haptic('success');
    renderGoals();
  } catch (err) { alertMsg(err.data?.error || 'Не удалось сохранить вес.'); }
});

async function loadManualRecords() {
  try { myManualRecords = (await api('/api/auth/records')).records || []; } catch (e) { /* не страшно */ }
  renderRecords();
}

// Внести рекорд вручную
function openRecordSheet() {
  $('rcDisc').value = ''; $('rcResult').value = ''; $('rcNote').value = '';
  $('rcDate').max = localDateStr(); $('rcDate').value = '';
  $('rcChips').innerHTML = COMP_DISCIPLINES.map((d) => `<button type="button" class="chip">${esc(d)}</button>`).join('');
  $('rcChips').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    $('rcDisc').value = $('rcDisc').value === c.textContent ? '' : c.textContent;
    $('rcChips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x.textContent === $('rcDisc').value));
  }));
  $('recordSheet').classList.remove('hidden');
}
function closeRecordSheet() { $('recordSheet').classList.add('hidden'); }
$('recordAddBtn').addEventListener('click', openRecordSheet);
$('rcCancel').addEventListener('click', closeRecordSheet);
$('recordSheet').addEventListener('click', (e) => { if (e.target === $('recordSheet')) closeRecordSheet(); });
$('rcSave').addEventListener('click', async () => {
  const btn = $('rcSave');
  btn.disabled = true;
  try {
    const { record } = await api('/api/auth/records', {
      method: 'POST',
      body: JSON.stringify({ discipline: $('rcDisc').value, result: $('rcResult').value, date: $('rcDate').value, note: $('rcNote').value }),
    });
    myManualRecords = [...myManualRecords, record];
    renderRecords();
    renderAchievements();
    closeRecordSheet();
    haptic('success');
  } catch (err) {
    alertMsg(err.data?.error || 'Не удалось сохранить рекорд.');
  } finally {
    btn.disabled = false;
  }
});

async function loadStarts() {
  try { plannedStarts = (await api('/api/auth/starts')).starts || []; } catch (e) { plannedStarts = []; }
  renderStarts();
}

function renderStarts() {
  // отсчёт на главной — ближайший старт в пределах 90 дней
  const next = plannedStarts.find((s) => daysUntil(s.date) >= 0);
  const cd = $('countdownCard');
  if (next && daysUntil(next.date) <= 90) {
    const n = daysUntil(next.date);
    const when = n === 0 ? 'Сегодня старт! Удачи 🔥' : n === 1 ? 'Старт уже завтра' : `До старта ${n} ${daysLabel(n)}`;
    cd.innerHTML = `
      <span class="cd-num">${n === 0 ? '🔥' : n}</span>
      <span class="cd-main">
        <span class="cd-when">${esc(when)}</span>
        <span class="cd-name">${esc(next.name)}${next.discipline ? ' · ' + esc(next.discipline) : ''}${next.goal ? ' · цель ' + esc(next.goal) : ''}</span>
      </span>
      ${ico('trophy')}`;
    cd.classList.remove('hidden');
  } else {
    cd.classList.add('hidden');
  }
  // список в профиле
  const box = $('startsList');
  if (!plannedStarts.length) {
    box.innerHTML = '<div class="muted records-empty">Добавь соревнования, к которым готовишься, — на главной появится обратный отсчёт, а Fom будет учитывать их в разборах.</div>';
    return;
  }
  box.innerHTML = '';
  plannedStarts.forEach((st) => {
    const n = daysUntil(st.date);
    const row = document.createElement('div');
    row.className = 'start-row' + (n < 0 ? ' past' : '');
    row.innerHTML = `
      <span class="start-date"><b>${parseDateStr(st.date).getDate()}</b>${esc(MONTHS_SHORT[parseDateStr(st.date).getMonth()])}</span>
      <span class="record-main">
        <b class="start-name">${esc(st.name)}</b>
        <span class="record-sub">${esc([st.discipline, st.goal && `цель ${st.goal}`].filter(Boolean).join(' · ') || (n < 0 ? 'прошёл' : ''))}</span>
      </span>
      <span class="start-left">${n < 0 ? 'прошёл' : n === 0 ? 'сегодня' : `${n} ${daysLabel(n)}`}</span>
      <button type="button" class="row-del" aria-label="Удалить">✕</button>`;
    row.querySelector('.row-del').addEventListener('click', async () => {
      if (!(await confirmAsk({ icon: 'trash', title: 'Убрать старт из календаря?', text: st.name, ok: 'Убрать', danger: true }))) return;
      try {
        await api(`/api/auth/starts/${st.id}`, { method: 'DELETE' });
        plannedStarts = plannedStarts.filter((x) => x.id !== st.id);
        renderStarts();
      } catch (err) { alertMsg('Не удалось удалить. Попробуй ещё раз.'); }
    });
    box.appendChild(row);
  });
}

$('countdownCard').addEventListener('click', () => { openProfile(); setTimeout(() => $('startsCard').scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); });

function openStartSheet() {
  $('stName').value = ''; $('stDisc').value = ''; $('stGoal').value = '';
  $('stDate').min = localDateStr();
  $('stDate').value = addDays(localDateStr(), 14);
  $('stChips').innerHTML = COMP_DISCIPLINES.map((d) => `<button type="button" class="chip">${esc(d)}</button>`).join('');
  $('stChips').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    $('stDisc').value = $('stDisc').value === c.textContent ? '' : c.textContent;
    $('stChips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x.textContent === $('stDisc').value));
  }));
  $('startSheet').classList.remove('hidden');
}
function closeStartSheet() { $('startSheet').classList.add('hidden'); }
$('startAddBtn').addEventListener('click', openStartSheet);
$('stCancel').addEventListener('click', closeStartSheet);
$('startSheet').addEventListener('click', (e) => { if (e.target === $('startSheet')) closeStartSheet(); });
$('stSave').addEventListener('click', async () => {
  const btn = $('stSave');
  btn.disabled = true;
  try {
    const { start } = await api('/api/auth/starts', {
      method: 'POST',
      body: JSON.stringify({ name: $('stName').value, date: $('stDate').value, discipline: $('stDisc').value, goal: $('stGoal').value }),
    });
    plannedStarts = [...plannedStarts, start].sort((a, b) => a.date.localeCompare(b.date));
    renderStarts();
    closeStartSheet();
    haptic('success');
  } catch (err) {
    alertMsg(err.data?.error || 'Не удалось сохранить старт.');
  } finally {
    btn.disabled = false;
  }
});

// =====================================================================
//  ЧЕЛЛЕНДЖ НЕДЕЛИ (считается прямо в телефоне по дневнику)
// =====================================================================
function weekKmTarget() {
  // личная цель по объёму: средний объём прошлых 4 недель +10%, округлённо до 5 км
  const thisMonday = mondayOf(localDateStr());
  const kms = [];
  for (let i = 1; i <= 4; i++) {
    const from = addDays(thisMonday, -7 * i), to = addDays(from, 6);
    const km = myWorkouts.filter((w) => w.date >= from && w.date <= to).reduce((a, w) => a + volumeKm(w), 0);
    if (km > 0) kms.push(km);
  }
  if (!kms.length) return 20;
  const avg = kms.reduce((a, b) => a + b, 0) / kms.length;
  return Math.max(10, Math.round((avg * 1.1) / 5) * 5);
}

function renderChallenges() {
  const card = $('challengeCard');
  if (!currentUser) return;
  const monday = mondayOf(localDateStr());
  const week = myWorkouts.filter((w) => w.date >= monday);
  const trainings = week.filter((w) => w.type === 'training').length;
  const days = new Set(week.map((w) => w.date)).size;
  const km = Math.round(week.reduce((a, w) => a + volumeKm(w), 0) * 10) / 10;
  const kmGoal = weekKmTarget();
  const rows = [
    { id: 'days', icon: 'flame', label: '7 дней без пропусков', cur: days, goal: 7, unit: 'дн.' },
    { id: 'tr', icon: 'runner', label: '5 тренировок', cur: trainings, goal: 5, unit: '' },
    { id: 'km', icon: 'target', label: `${kmGoal} км за неделю`, cur: km, goal: kmGoal, unit: 'км' },
  ];
  const left = 7 - ((new Date().getDay() + 6) % 7) - 1;
  $('challengeLeft').textContent = left > 0 ? `ещё ${left} ${daysLabel(left)}` : 'последний день';
  $('challengeRows').innerHTML = rows.map((r) => {
    const done = r.cur >= r.goal;
    const p = Math.min(100, Math.round((r.cur / r.goal) * 100));
    return `<div class="ch-row${done ? ' done' : ''}">
      <div class="ch-top">${ico(done ? 'check' : r.icon)}<span class="ch-label">${esc(r.label)}</span>
        <span class="ch-val">${fmtNum(Math.min(r.cur, 999))}/${r.goal}${r.unit ? ' ' + r.unit : ''}</span></div>
      <div class="gift-bar"><i style="width:${p}%"></i></div>
    </div>`;
  }).join('');
  card.classList.remove('hidden');
  // все три выполнены — поздравляем один раз за неделю
  if (rows.every((r) => r.cur >= r.goal) && lsGet('forma_challenge_done') !== monday) {
    lsSet('forma_challenge_done', monday);
    setTimeout(() => showDialog({ icon: 'target', title: 'Челлендж недели выполнен! 🎉', text: 'Все три цели закрыты. Мощная неделя — так держать!', ok: 'Ура!' }), 600);
  }
}

// =====================================================================
//  ДОСТИЖЕНИЯ
// =====================================================================
function pbCount() {
  const best = {};
  let n = 0;
  myWorkouts.filter((w) => w.competition?.result).sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
    const c = w.competition, v = parseResult(c.result, c.discipline);
    if (v == null) return;
    const k = disciplineKey(c.discipline), cur = best[k];
    if (cur == null || (higherIsBetter(c.discipline) ? v > cur : v < cur)) { best[k] = v; n++; }
  });
  return n;
}
function maxMonthKm() {
  const m = {};
  myWorkouts.forEach((w) => { const k = w.date.slice(0, 7); m[k] = (m[k] || 0) + volumeKm(w); });
  return Math.max(0, ...Object.values(m));
}
function achievementList() {
  const trainings = myWorkouts.filter((w) => w.type === 'training');
  const best = Math.max(currentUser?.longest_streak || 0, currentUser?.current_streak || 0);
  const ap = athleteProfile || {};
  const profileFilled = !!(ap.sex || ap.birth_year || ap.height_cm || ap.weight_kg || ap.goal);
  const month = Math.round(maxMonthKm());
  const pioneer = currentUser?.pioneer_no
    ? [{ id: 'pioneer', icon: 'rocket', title: `Первопроходец №${currentUser.pioneer_no}`, desc: 'один из первых 10 в Forma', cur: 1, goal: 1, special: true }]
    : [];
  return [
    ...pioneer,
    { id: 'first', icon: 'check', title: 'Первый шаг', desc: 'первая запись', cur: myWorkouts.length, goal: 1 },
    { id: 's7', icon: 'flame', title: 'Неделя подряд', desc: 'серия 7 дней', cur: best, goal: 7 },
    { id: 's30', icon: 'flame', title: 'Месяц без пропусков', desc: 'серия 30 дней', cur: best, goal: 30 },
    { id: 's100', icon: 'diamond', title: 'Сотня', desc: 'серия 100 дней', cur: best, goal: 100 },
    { id: 't10', icon: 'runner', title: '10 тренировок', desc: 'всего', cur: trainings.length, goal: 10 },
    { id: 't50', icon: 'runner', title: '50 тренировок', desc: 'всего', cur: trainings.length, goal: 50 },
    { id: 't100', icon: 'trophy', title: '100 тренировок', desc: 'всего', cur: trainings.length, goal: 100 },
    { id: 'comp', icon: 'trophy', title: 'Первый старт', desc: 'запиши соревнование', cur: trainings.filter((w) => w.competition).length, goal: 1 },
    { id: 'pb5', icon: 'trophy', title: 'Рекордсмен', desc: '5 личных рекордов', cur: pbCount(), goal: 5 },
    { id: 'km100', icon: 'target', title: '100 км за месяц', desc: `лучший месяц: ${month} км`, cur: month, goal: 100 },
    { id: 'double', icon: 'runner', title: 'Двойная', desc: 'две тренировки в день', cur: trainings.some((w) => w.session > 1) ? 1 : 0, goal: 1 },
    { id: 'iron', icon: 'dumbbell', title: 'Железный', desc: '20 тренировок с ОФП', cur: trainings.filter((w) => (w.exercises || []).length).length, goal: 20 },
    { id: 'book', icon: 'lock', title: 'Открытая книга', desc: 'заполни анкету для Fom', cur: profileFilled ? 1 : 0, goal: 1 },
    { id: 'bird', icon: 'sparkle', title: 'Ранняя пташка', desc: '7 утренних отметок', cur: morningChecks.length, goal: 7 },
  ];
}

let achievementsReady = false;
let achOpen = false;
$('achToggle').addEventListener('click', () => { achOpen = !achOpen; renderAchievements(); });
function renderAchievements() {
  if (!currentUser || !$('achievementsGrid')) return;
  const list = achievementList();
  const done = list.filter((a) => a.cur >= a.goal);
  $('achievementsCount').textContent = `· ${done.length} из ${list.length}`;
  // полученные — первыми; в свёрнутом виде видна одна строка
  const sorted = [...list].sort((a, b) => (b.cur >= b.goal) - (a.cur >= a.goal));
  const shown = achOpen ? sorted : sorted.slice(0, 3);
  $('achToggle').textContent = achOpen ? 'Свернуть' : `Все ${list.length}`;
  $('achievementsGrid').innerHTML = shown.map((a) => {
    const ok = a.cur >= a.goal;
    return `<div class="ach${ok ? ' on' : ''}${a.special ? ' ach-special' : ''}">
      <span class="ach-ico">${ico(a.icon)}</span>
      <span class="ach-title">${esc(a.title)}</span>
      <span class="ach-desc">${ok ? esc(a.desc) : a.goal > 1 ? `${Math.min(a.cur, a.goal)}/${a.goal}` : esc(a.desc)}</span>
    </div>`;
  }).join('');
  // новое достижение — поздравляем (при первом запуске просто запоминаем, что уже есть)
  if (!achievementsReady) return;
  let seen = [];
  try { seen = JSON.parse(lsGet('forma_ach') || 'null'); } catch (e) {}
  const ids = done.map((a) => a.id);
  if (!Array.isArray(seen)) { lsSet('forma_ach', JSON.stringify(ids)); return; }
  const fresh = done.filter((a) => !seen.includes(a.id));
  lsSet('forma_ach', JSON.stringify([...new Set([...seen, ...ids])]));
  if (fresh.length) {
    const a = fresh[0];
    haptic('success');
    setTimeout(() => showDialog({ icon: a.icon, title: `Новое достижение: ${a.title}!`, text: a.desc[0].toUpperCase() + a.desc.slice(1) + ' — есть! 🎉', ok: 'Круто!' }), 700);
  }
}

// =====================================================================
//  ВЫГРУЗКА ДНЕВНИКА (таблица CSV — открывается в Excel и Google Таблицах)
// =====================================================================
function diaryCsv() {
  const q = (v) => {
    const t = String(v ?? '').replace(/\r?\n/g, ' ').trim();
    return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ['Дата', 'Тип', '№ за день', 'Разминка', 'Беговая работа', 'Силовая / ОФП', 'Заминка', 'Старт',
    'RPE', 'Самочувствие', 'Пульс ср', 'Пульс макс', 'Пульс в паузах', 'Объём, км', 'Заметки'];
  const rows = [...myWorkouts].sort((a, b) => a.date.localeCompare(b.date) || (a.session || 1) - (b.session || 1)).map((w) => [
    w.date, w.type === 'rest' ? 'Отдых' : w.competition ? 'Старт' : 'Тренировка', w.session || 1, w.warmup,
    (w.sets || []).map((s) => [s.duration_s ? durLabel(s.duration_s) : s.distance_m && distLabel(s.distance_m), s.reps && `x${s.reps}`, s.time_or_pace, s.rest_between && `отдых ${s.rest_between}`].filter(Boolean).join(' ')).join(' | '),
    (w.exercises || []).map(formatExercise).join(' | '), w.cooldown, competitionLine(w.competition),
    w.rpe, w.feeling, w.hr_avg, w.hr_max, w.hr_min, w.type === 'training' ? fmtNum(Math.round(volumeKm(w) * 10) / 10) : '', w.notes,
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(q).join(';')).join('\r\n');
}

$('exportBtn').addEventListener('click', async () => {
  if (!myWorkouts.length) return alertMsg('Пока нечего выгружать — записей нет.');
  const csv = diaryCsv();
  const name = `forma-${localDateStr()}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  try {
    const file = new File([blob], name, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    if (tg?.downloadFile && tg.isVersionAtLeast?.('8.0')) {
      const res = await fetch(API_BASE + '/api/bot/export', {
        method: 'POST', headers: { 'Content-Type': 'text/csv', 'X-Telegram-Init-Data': tg?.initData || '' }, body: blob,
      });
      if (!res.ok) throw new Error('upload failed');
      tg.downloadFile({ url: (await res.json()).url, file_name: name });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.error(err);
    alertMsg('Не получилось выгрузить. Попробуй ещё раз.');
  }
});

// =====================================================================
//  ГРУППЫ (команды и тренерские) + ПРИГЛАШЕНИЯ ДРУЗЕЙ
// =====================================================================
let myGroups = [];
let currentGroup = null;   // { group, members }
let currentMember = null;  // спортсмен, дневник которого смотрит тренер
let inviteInfo = null;

function shareLink(url, text) {
  const u = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank');
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; }
}

async function loadGroupsTab() {
  const list = $('groupsList');
  list.innerHTML = '<div class="empty-hint">Загружаю...</div>';
  try {
    const [g, inv] = await Promise.all([api('/api/friends/groups'), api('/api/friends/invite')]);
    myGroups = g.groups || [];
    inviteInfo = inv;
  } catch (err) {
    list.innerHTML = '<div class="empty-hint">Не удалось загрузить группы.</div>';
    return;
  }
  // приглашения
  const i = inviteInfo;
  $('inviteStats').innerHTML = i.invited
    ? `Пришли по твоей ссылке: <b>${i.invited}</b> · засчитано: <b>${i.qualified}</b> · бонус: <b>+${i.bonus} ${i.bonus === 1 ? 'билет' : 'билета'}</b>`
    : 'Пока никто не пришёл по твоей ссылке — отправь её друзьям 👇';
  // группы
  if (!myGroups.length) {
    list.innerHTML = '<div class="empty-hint">Ты пока не в группе. Создай свою — для команды или как тренер, или вступи по коду от тренера.</div>';
    return;
  }
  list.innerHTML = '';
  myGroups.forEach((g) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'history-item group-row';
    row.innerHTML = `
      <span class="history-ico ${g.coach_mode ? 'rs' : 'tr'}">${ico(g.coach_mode ? 'target' : 'people')}</span>
      <span class="history-main">
        <span class="history-date">${esc(g.name)}</span>
        <span class="history-sub">${g.coach_mode ? (g.is_owner ? 'ты тренер' : 'тренерская группа') : 'команда'} · ${g.members} ${membersWord(g.members)}</span>
      </span>
      <span class="history-arrow">›</span>`;
    row.addEventListener('click', () => openGroup(g.id));
    list.appendChild(row);
  });
}
function membersWord(n) {
  const a = n % 100, b = n % 10;
  return a > 10 && a < 20 ? 'участников' : b === 1 ? 'участник' : b >= 2 && b <= 4 ? 'участника' : 'участников';
}

$('inviteShareBtn').addEventListener('click', () => {
  if (inviteInfo?.link) shareLink(inviteInfo.link, 'Го вести дневник тренировок в Forma вместе 🔥 Помощник Fom, серии и розыгрыши подарков');
});
$('inviteCopyBtn').addEventListener('click', async () => {
  if (!inviteInfo?.link) return;
  const ok = await copyText(inviteInfo.link);
  $('inviteCopyBtn').textContent = ok ? 'Скопировано ✓' : inviteInfo.link;
  setTimeout(() => { $('inviteCopyBtn').textContent = 'Копировать ссылку'; }, 2000);
});

// ---------- Экран группы ----------
let groupTab = 'rating';
async function openGroup(id) {
  showScreen('groupScreen');
  $('groupName').textContent = 'Загружаю...';
  $('groupRating').innerHTML = '';
  $('groupFeed').innerHTML = '';
  try {
    currentGroup = await api(`/api/friends/groups/${id}`);
  } catch (err) {
    alertMsg(err.data?.error || 'Не удалось открыть группу');
    return showScreen('friendsScreen');
  }
  const g = currentGroup.group;
  $('groupName').textContent = g.name;
  $('groupKind').textContent = g.coach_mode ? (g.is_coach ? 'Тренерская группа · ты тренер' : 'Тренерская группа') : 'Команда';
  $('groupCoachNote').classList.toggle('hidden', !g.coach_mode);
  $('groupCoachNote').textContent = g.is_coach
    ? 'Ты видишь все записи участников, включая закрытые. Нажми на спортсмена — откроется его дневник.'
    : 'Тренер группы видит все твои записи и может их комментировать. Друзьям по-прежнему видны только открытые.';
  $('groupLeaveBtn').textContent = g.is_owner ? 'Удалить группу' : 'Выйти из группы';
  // кабинет — только тренеру; открываем его первым, когда тренер заходит в группу
  $('groupTabs').querySelector('[data-gtab="coach"]').classList.toggle('hidden', !g.is_coach);
  $('groupTabs').classList.toggle('seg-3', !!g.is_coach);
  if (g.is_coach && coachGroupId !== g.id) groupTab = 'coach';
  if (!g.is_coach && groupTab === 'coach') groupTab = 'rating';
  coachGroupId = g.is_coach ? g.id : null;
  setGroupTab(groupTab);
  loadGroupTask(g.id);
}

// Задание от тренера (последнее за 7 дней) — видят все участники группы
async function loadGroupTask(gid) {
  $('groupTask').classList.add('hidden');
  try {
    const { task } = await api(`/api/coach/groups/${gid}/task`);
    if (!task || currentGroup?.group?.id !== gid) return;
    $('groupTaskText').textContent = task.text;
    $('groupTaskAt').textContent = '· ' + relativeDateLabel(task.at.slice(0, 10)) + ', ' + task.at.slice(11, 16);
    $('groupTask').classList.remove('hidden');
  } catch (e) { /* нет задания — ничего не показываем */ }
}

function setGroupTab(tab) {
  groupTab = tab;
  $('groupTabs').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.gtab === tab));
  $('groupRating').classList.toggle('hidden', tab !== 'rating');
  $('groupFeed').classList.toggle('hidden', tab !== 'feed');
  $('groupCoach').classList.toggle('hidden', tab !== 'coach');
  if (tab === 'coach') loadCoachTab();
  else if (tab === 'rating') renderGroupRating(); else loadGroupFeed();
}
$('groupTabs').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => setGroupTab(b.dataset.gtab)));

function renderGroupRating() {
  if (!currentGroup) return;
  const { group: g, members } = currentGroup;
  const box = $('groupRating');
  box.innerHTML = '';
  members.forEach((m, i) => {
    const row = document.createElement(g.is_coach && m.id !== currentUser?.id ? 'button' : 'div');
    if (row.tagName === 'BUTTON') row.type = 'button';
    row.className = 'rank-row' + (m.id === currentUser?.id ? ' me' : '');
    const last = m.last_entry ? relativeDateLabel(m.last_entry) : 'нет записей';
    row.innerHTML = `
      <span class="rank-n${i < 3 && m.week_trainings ? ' top' : ''}">${i + 1}</span>
      ${avatarHtml(m, 'small')}
      <span class="rank-main">
        <span class="rank-name">${nameHtml(m)}${m.role === 'coach' ? ' <span class="coach-tag">тренер</span>' : ''}</span>
        <span class="rank-sub">${m.week_trainings} трен. · ${fmtNum(m.week_km || 0)} км${g.is_coach ? ` · последняя запись: ${esc(last)}` : ''}</span>
      </span>
      <span class="rank-streak">${ico('flame')} ${esc(m.current_streak ?? 0)}</span>`;
    if (row.tagName === 'BUTTON') row.addEventListener('click', () => openMember(m));
    box.appendChild(row);
  });
  const hint = document.createElement('div');
  hint.className = 'muted rank-hint';
  hint.textContent = 'Рейтинг — по тренировкам с понедельника, потом по километрам отрезков. Серия — дни подряд.';
  box.appendChild(hint);
}

async function loadGroupFeed() {
  const box = $('groupFeed');
  box.innerHTML = '<div class="empty-hint">Загружаю...</div>';
  try {
    const { workouts } = await api(`/api/friends/groups/${currentGroup.group.id}/feed`);
    box.innerHTML = workouts.length ? '' : '<div class="empty-hint">За последний месяц открытых тренировок пока нет.</div>';
    workouts.forEach((w) => box.appendChild(buildWorkoutCard({ ...w, date: normDate(w.date) })));
  } catch (err) {
    box.innerHTML = '<div class="empty-hint">Не удалось загрузить ленту.</div>';
  }
}

$('groupInviteBtn').addEventListener('click', () => {
  const g = currentGroup?.group;
  if (!g) return;
  shareLink(g.link, g.coach_mode
    ? `Вступай в мою тренерскую группу «${g.name}» в Forma — буду видеть твой дневник и комментировать тренировки 💪 Код: ${g.invite_code}`
    : `Вступай в нашу группу «${g.name}» в Forma 🔥 Общая лента и рейтинг недели. Код: ${g.invite_code}`);
});
$('groupBackBtn').addEventListener('click', () => { showScreen('friendsScreen'); setFriendsTab('groups'); });
$('groupLeaveBtn').addEventListener('click', async () => {
  const g = currentGroup?.group;
  if (!g) return;
  const ok = await confirmAsk(g.is_owner
    ? { icon: 'trash', title: 'Удалить группу?', text: `«${g.name}» исчезнет у всех участников.`, ok: 'Удалить', danger: true }
    : { icon: 'people', title: 'Выйти из группы?', text: g.name, ok: 'Выйти', danger: true });
  if (!ok) return;
  try {
    await api(`/api/friends/groups/${g.id}/leave`, { method: 'POST' });
    currentGroup = null;
    showScreen('friendsScreen');
    setFriendsTab('groups');
  } catch (err) { alertMsg('Не получилось. Попробуй ещё раз.'); }
});

// ---------- Дневник спортсмена для тренера ----------
async function openMember(m) {
  currentMember = m;
  showScreen('memberScreen');
  $('memberName').innerHTML = nameHtml(m);
  $('memberWorkouts').innerHTML = '<div class="empty-hint">Загружаю...</div>';
  $('memberWell').classList.add('hidden');
  $('memberCoach').classList.add('hidden');
  if (currentGroup?.group?.is_coach) loadMemberCoach(m);
  try {
    const { workouts, checks } = await api(`/api/friends/groups/${currentGroup.group.id}/members/${m.id}`);
    if (checks?.length) {
      const c = checks[0];
      const bits = [c.sleep_h != null && `сон ${fmtNum(c.sleep_h)} ч`, c.mood && MOOD_EMOJI[c.mood], c.rest_hr && `пульс покоя ${c.rest_hr}`].filter(Boolean);
      $('memberWell').innerHTML = `<div class="card-label">☀️ Утро · ${esc(relativeDateLabel(c.date))}</div><div class="morning-sum">${esc(bits.join(' · '))}</div>`;
      $('memberWell').classList.remove('hidden');
    }
    const box = $('memberWorkouts');
    box.innerHTML = workouts.length ? '' : '<div class="empty-hint">Записей пока нет.</div>';
    workouts.forEach((w) => {
      const card = buildWorkoutCard({ ...w, date: normDate(w.date) }, { showAuthor: false });
      if (w.visibility !== 'public') card.classList.add('private-wk');
      box.appendChild(card);
    });
  } catch (err) {
    $('memberWorkouts').innerHTML = `<div class="empty-hint">${esc(err.data?.error || 'Не удалось загрузить дневник.')}</div>`;
  }
}
$('memberBackBtn').addEventListener('click', () => { showScreen('groupScreen'); setGroupTab(groupTab); });
$('memberRemoveBtn').addEventListener('click', async () => {
  if (!currentMember || !currentGroup) return;
  if (!(await confirmAsk({ icon: 'people', title: 'Убрать из группы?', text: personName(currentMember), ok: 'Убрать', danger: true }))) return;
  try {
    await api(`/api/friends/groups/${currentGroup.group.id}/remove`, { method: 'POST', body: JSON.stringify({ userId: currentMember.id }) });
    openGroup(currentGroup.group.id);
  } catch (err) { alertMsg(err.data?.error || 'Не получилось.'); }
});

// =====================================================================
//  КАБИНЕТ ТРЕНЕРА
// =====================================================================
let coachGroupId = null;
let coachData = null;       // { totals, athletes }
let coachFilter = 'all';
const FLAG_CLASS = { miss: 'bad', over: 'warn', down: 'warn', sleep: 'warn', camp: 'camp', ok: 'ok' };

function coachTile(value, label, cls = '') {
  return `<div class="coach-tile ${cls}"><b>${value}</b><span>${esc(label)}</span></div>`;
}

async function loadCoachTab() {
  const g = currentGroup?.group;
  if (!g?.is_coach) return;
  $('coachList').innerHTML = '<div class="empty-hint">Считаю неделю…</div>';
  try {
    coachData = await api(`/api/coach/groups/${g.id}`);
  } catch (err) {
    $('coachList').innerHTML = `<div class="empty-hint">${esc(err.data?.error || 'Не удалось загрузить кабинет.')}</div>`;
    return;
  }
  const t = coachData.totals;
  $('coachTiles').innerHTML = coachTile(fmtNum(t.km), 'км команды') + coachTile(t.trainings, 'тренировок')
    + coachTile(t.attention, 'нужно внимание', t.attention ? 'warn' : '');
  $('coachFilter').querySelector('[data-cf="need"]').textContent = t.attention ? `Внимание · ${t.attention}` : 'Внимание';
  $('coachFilter').querySelector('[data-cf="camp"]').textContent = t.camp ? `На сборе · ${t.camp}` : 'На сборе';
  renderCoachList();
}

function renderCoachList() {
  const box = $('coachList');
  if (!coachData) return;
  $('coachFilter').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.cf === coachFilter));
  const list = coachData.athletes.filter((a) => coachFilter === 'all' || (coachFilter === 'need' && a.attention) || (coachFilter === 'camp' && a.camp));
  if (!coachData.athletes.length) {
    box.innerHTML = '<div class="empty-hint">В группе пока нет спортсменов. Нажми «Пригласить в группу» и отправь ссылку.</div>';
    return;
  }
  box.innerHTML = list.length ? '' : `<div class="empty-hint">${coachFilter === 'need' ? 'Сейчас всё ровно — никому не нужно особое внимание 👌' : 'Никто сейчас не на сборе.'}</div>`;
  list.forEach((a) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'coach-row';
    const last = a.last
      ? `${relativeDateLabel(a.last.date)}${a.last.start_time ? ' ' + a.last.start_time : ''} · ${a.last.text}${a.last.rpe ? ' · RPE ' + a.last.rpe : ''}`
      : 'записей пока нет';
    const flags = a.flags.map((fl) => `<span class="coach-flag ${FLAG_CLASS[fl.kind] || ''}">${esc(fl.label)}</span>`).join('');
    const meta = [a.rpe_avg != null && `RPE ср. ${fmtNum(a.rpe_avg)}`, a.sleep_avg != null && `сон ${fmtNum(a.sleep_avg)} ч`, a.camp && `${a.camp.day}-й день на сборе`].filter(Boolean).join(' · ');
    row.innerHTML = `
      <span class="coach-row-top">
        ${avatarHtml(a, 'small')}
        <span class="coach-row-main">
          <span class="coach-row-name">${nameHtml(a)}</span>
          <span class="coach-row-last">${esc(last)}</span>
        </span>
        <span class="coach-row-km"><b>${fmtNum(a.week_km || 0)}</b><span>км / нед</span></span>
      </span>
      <span class="coach-row-flags">${flags}${meta ? `<span class="coach-row-meta">${esc(meta)}</span>` : ''}</span>`;
    row.addEventListener('click', () => openMember(a));
    box.appendChild(row);
  });
}
$('coachFilter').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => { coachFilter = b.dataset.cf; renderCoachList(); }));

// --- Сводка недели ---
async function loadCoachDigest(fresh) {
  const g = currentGroup?.group;
  if (!g) return;
  $('coachDigestText').textContent = 'Fom собирает сводку по команде…';
  $('coachDigestRefresh').disabled = true;
  try {
    const { text } = await api(`/api/coach/groups/${g.id}/digest${fresh ? '?fresh=1' : ''}`, { timeout: 60000 });
    $('coachDigestText').textContent = text;
  } catch (err) {
    $('coachDigestText').textContent = err.data?.error || 'Не получилось — попробуй ещё раз.';
  } finally {
    $('coachDigestRefresh').disabled = false;
  }
}
$('coachDigestBtn').addEventListener('click', () => { $('coachDigestSheet').classList.remove('hidden'); loadCoachDigest(false); });
$('coachDigestRefresh').addEventListener('click', () => loadCoachDigest(true));
$('coachDigestClose').addEventListener('click', () => $('coachDigestSheet').classList.add('hidden'));
$('coachDigestSheet').addEventListener('click', (e) => { if (e.target === $('coachDigestSheet')) $('coachDigestSheet').classList.add('hidden'); });

// --- Задание команде ---
$('coachTaskBtn').addEventListener('click', () => { $('coachTaskText').value = ''; $('coachTaskSheet').classList.remove('hidden'); });
$('coachTaskCancel').addEventListener('click', () => $('coachTaskSheet').classList.add('hidden'));
$('coachTaskSheet').addEventListener('click', (e) => { if (e.target === $('coachTaskSheet')) $('coachTaskSheet').classList.add('hidden'); });
$('coachTaskSend').addEventListener('click', async () => {
  const text = $('coachTaskText').value.trim();
  const g = currentGroup?.group;
  if (!text || !g) return;
  $('coachTaskSend').disabled = true;
  try {
    const r = await api(`/api/coach/groups/${g.id}/task`, { method: 'POST', body: JSON.stringify({ text }), timeout: 60000 });
    $('coachTaskSheet').classList.add('hidden');
    haptic('success');
    loadGroupTask(g.id);
    alertMsg(`Задание отправлено: ${r.delivered} из ${r.total}.` + (r.delivered < r.total ? ' Кто-то не открывал бота — увидит задание в группе.' : ''));
  } catch (err) {
    alertMsg(err.data?.error || 'Не получилось отправить.');
  } finally {
    $('coachTaskSend').disabled = false;
  }
});

// --- Спортсмен глазами тренера ---
function rpeColor(r) {
  if (!r) return 'var(--input)';
  return r >= 8 ? '#ff9a3c' : r >= 6 ? 'var(--lime)' : '#7c9a44';
}
async function loadMemberCoach(m) {
  const g = currentGroup.group;
  let d;
  try { d = await api(`/api/coach/groups/${g.id}/members/${m.id}`); } catch (e) { return; }
  if (currentMember?.id !== m.id) return;
  const st = d.stats;
  const pct = st.prev_km >= 1 ? Math.round((st.week_km / st.prev_km - 1) * 100) : null;
  const over = st.flags.some((x) => x.kind === 'over');
  $('mcTiles').innerHTML =
    coachTile(`${fmtNum(st.week_km)} км`, pct == null ? 'за неделю' : `${pct >= 0 ? '+' : ''}${pct}% к пр. нед.`, over ? 'warn' : '')
    + coachTile(st.rpe_avg != null ? fmtNum(st.rpe_avg) : '—', 'RPE ср.')
    + coachTile(st.sleep_avg != null ? `${fmtNum(st.sleep_avg)} ч` : '—', 'сон ср.', st.flags.some((x) => x.kind === 'sleep') ? 'warn' : '')
    + coachTile(st.feel_avg != null ? `${fmtNum(st.feel_avg)}` : '—', 'самочувствие', st.flags.some((x) => x.kind === 'down') ? 'warn' : '');
  const maxKm = Math.max(5, ...d.days.map((x) => x.km));
  $('mcBars').innerHTML = d.days.map((x) => `
    <div class="mc-bar${x.future ? ' future' : ''}">
      <span class="mc-bar-km">${x.km ? fmtNum(x.km) : x.rest ? 'отд' : '—'}</span>
      <span class="mc-bar-fill" style="height:${x.km ? Math.max(8, Math.round(x.km / maxKm * 72)) : 4}px;background:${x.km ? rpeColor(x.rpe) : 'var(--input)'}"></span>
      <span class="mc-bar-wd">${x.wd}</span>
    </div>`).join('');
  $('mcFomText').textContent = d.fom || 'Fom посмотрит записи за 2 недели и коротко напишет, на что обратить внимание.';
  $('mcFomText').classList.toggle('muted', !d.fom);
  $('mcFomBtn').textContent = d.fom ? 'Обновить вывод' : 'Спросить Fom';
  paintMcMsgs(d.messages);
  $('mcMsgText').value = '';
  $('memberCoach').classList.remove('hidden');
}
function paintMcMsgs(list) {
  $('mcMsgs').innerHTML = (list || []).length
    ? 'Отправлено: ' + list.slice(0, 3).map((x) => `<div>· ${esc(relativeDateLabel(x.at.slice(0, 10)))} ${x.at.slice(11, 16)} — ${esc(x.text.length > 80 ? x.text.slice(0, 78) + '…' : x.text)}</div>`).join('')
    : '';
}
$('mcFomBtn').addEventListener('click', async () => {
  if (!currentMember || !currentGroup) return;
  $('mcFomBtn').disabled = true;
  $('mcFomText').classList.add('muted');
  $('mcFomText').textContent = 'Fom смотрит записи…';
  try {
    const { fom } = await api(`/api/coach/groups/${currentGroup.group.id}/members/${currentMember.id}/fom`, { method: 'POST', timeout: 60000 });
    $('mcFomText').textContent = fom;
    $('mcFomText').classList.remove('muted');
    $('mcFomBtn').textContent = 'Обновить вывод';
  } catch (err) {
    $('mcFomText').textContent = err.data?.error || 'Не получилось — попробуй ещё раз.';
  } finally {
    $('mcFomBtn').disabled = false;
  }
});
$('mcMsgSend').addEventListener('click', async () => {
  const text = $('mcMsgText').value.trim();
  if (!text || !currentMember || !currentGroup) return;
  $('mcMsgSend').disabled = true;
  try {
    const r = await api(`/api/coach/groups/${currentGroup.group.id}/members/${currentMember.id}/message`, { method: 'POST', body: JSON.stringify({ text }) });
    haptic('success');
    $('mcMsgText').value = '';
    alertMsg(r.delivered ? 'Отправлено ✓' : 'Сохранено, но бот не смог доставить: спортсмен ещё не открывал чат с ботом.');
    loadMemberCoach(currentMember);
  } catch (err) {
    alertMsg(err.data?.error || 'Не получилось отправить.');
  } finally {
    $('mcMsgSend').disabled = false;
  }
});

// ---------- Создать группу ----------
let gcKind = 'team';
function paintGcKind() {
  $('gcKind').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.kind === gcKind));
  $('gcHint').textContent = gcKind === 'coach'
    ? 'Ты — тренер: увидишь ВСЕ записи спортсменов (и закрытые), сможешь комментировать. Спортсмены узнают об этом при вступлении.'
    : 'Команда: общая лента открытых тренировок и рейтинг недели. Закрытые записи никто не видит.';
}
$('gcKind').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => { gcKind = b.dataset.kind; paintGcKind(); }));
$('groupCreateBtn').addEventListener('click', () => { $('gcName').value = ''; gcKind = 'team'; paintGcKind(); $('groupCreateSheet').classList.remove('hidden'); });
$('gcCancel').addEventListener('click', () => $('groupCreateSheet').classList.add('hidden'));
$('groupCreateSheet').addEventListener('click', (e) => { if (e.target === $('groupCreateSheet')) $('groupCreateSheet').classList.add('hidden'); });
$('gcSave').addEventListener('click', async () => {
  try {
    const { group } = await api('/api/friends/groups', { method: 'POST', body: JSON.stringify({ name: $('gcName').value, coach_mode: gcKind === 'coach' }) });
    $('groupCreateSheet').classList.add('hidden');
    haptic('success');
    openGroup(group.id);
  } catch (err) { alertMsg(err.data?.error || 'Не удалось создать группу.'); }
});

// ---------- Вступить ----------
$('groupJoinBtn').addEventListener('click', () => { $('gjCode').value = ''; $('groupJoinSheet').classList.remove('hidden'); });
$('gjCancel').addEventListener('click', () => $('groupJoinSheet').classList.add('hidden'));
$('groupJoinSheet').addEventListener('click', (e) => { if (e.target === $('groupJoinSheet')) $('groupJoinSheet').classList.add('hidden'); });
$('gjSave').addEventListener('click', () => {
  const code = $('gjCode').value.trim().toLowerCase().replace(/^g_/, '').replace(/.*start=g_/, '');
  if (!code) return;
  $('groupJoinSheet').classList.add('hidden');
  joinGroupFlow(code);
});

// Показать, что за группа, и спросить — вступать ли
async function joinGroupFlow(code) {
  let g;
  try { g = (await api(`/api/friends/groups/preview/${encodeURIComponent(code)}`)).group; } catch (err) {
    return alertMsg(err.data?.error || 'Группа не найдена — проверь код');
  }
  if (g.joined) { return openGroup(g.id); }
  const owner = [g.owner_first_name, g.owner_last_name].filter(Boolean).join(' ') || (g.owner_username ? '@' + g.owner_username : 'тренер');
  const ok = await confirmAsk({
    icon: g.coach_mode ? 'target' : 'people',
    title: `Вступить в «${g.name}»?`,
    text: g.coach_mode
      ? `Это тренерская группа: ${owner} будет видеть ВСЕ твои записи, включая закрытые, и сможет их комментировать. Выйти можно в любой момент.`
      : `Команда · ${g.members} ${membersWord(g.members)}. Общая лента открытых тренировок и рейтинг недели.`,
    ok: 'Вступить',
  });
  if (!ok) return;
  try {
    const { group } = await api('/api/friends/groups/join', { method: 'POST', body: JSON.stringify({ code }) });
    haptic('success');
    openGroup(group.id);
  } catch (err) { alertMsg(err.data?.error || 'Не удалось вступить.'); }
}


// =====================================================================
//  СОВМЕСТНЫЕ ПРОБЕЖКИ — поиск напарников в своём городе
// =====================================================================
const POPULAR_CITIES = ['Москва', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Новосибирск', 'Краснодар',
  'Нижний Новгород', 'Самара', 'Ростов-на-Дону', 'Сочи', 'Минск', 'Алматы'];
let runsCity = null;
let runsData = null;
let currentRun = null;
let runPoll = null;

const RUN_WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
function runWhen(date, time) {
  const today = localDateStr();
  const d = parseDateStr(date);
  const day = date === today ? 'Сегодня' : date === addDays(today, 1) ? 'Завтра'
    : `${RUN_WD[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return `${day}, ${time}`;
}

async function loadRunsTab(city) {
  $('runsStatus').textContent = '';
  if (!runsData) $('runsList').innerHTML = '<div class="muted center">Загружаю пробежки…</div>';
  try {
    runsData = await api(`/api/partners${city || runsCity ? `?city=${encodeURIComponent(city || runsCity)}` : ''}`);
    runsCity = runsData.city;
    renderRunsTab();
    if (!runsCity) setTimeout(openCitySheet, 300);
  } catch (err) {
    console.error(err);
    $('runsList').innerHTML = '';
    $('runsStatus').textContent = err.data?.error || 'Не удалось загрузить пробежки.';
  }
}

function renderRunsTab() {
  $('runsCity').textContent = runsCity || 'Выбери город';
  const list = $('runsList');
  const runs = runsData?.runs || [];
  if (!runsCity) { list.innerHTML = ''; return; }
  if (!runs.length) {
    const other = (runsData.cities || []).filter((c) => c.city.toLowerCase() !== runsCity.toLowerCase()).slice(0, 4);
    list.innerHTML = `<div class="empty-hint runs-empty">В городе ${esc(runsCity)} пока никто не зовёт на пробежку.<br>Будь первым — нажми «Позвать на пробежку» 🏃
      ${other.length ? `<div class="runs-other">Сейчас бегают: ${other.map((c) => `<button type="button" class="chip" data-city="${esc(c.city)}">${esc(c.city)} · ${c.n}</button>`).join(' ')}</div>` : ''}</div>`;
    list.querySelectorAll('[data-city]').forEach((b) => b.addEventListener('click', () => loadRunsTab(b.dataset.city)));
    return;
  }
  list.innerHTML = '';
  runs.forEach((r) => list.appendChild(buildRunCard(r)));
}

function buildRunCard(r) {
  const card = document.createElement('article');
  card.className = 'card run-card' + (r.joined ? ' joined' : '');
  const full = r.max_people && r.going >= r.max_people && !r.joined;
  const faces = (r.people || []).map((u) => avatarHtml(u, 'run-face')).join('');
  card.innerHTML = `
    <div class="run-top">
      <div class="run-when">${esc(runWhen(r.date, r.time))}</div>
      ${r.mine ? '<span class="run-mine">твоя</span>' : ''}
    </div>
    <div class="run-place">📍 ${esc(r.place)}</div>
    ${r.description ? `<div class="run-desc">${esc(r.description)}</div>` : ''}
    <div class="run-bottom">
      <div class="run-faces">${faces}<span class="run-going">${r.going}${r.max_people ? ` из ${r.max_people}` : ''} ${goingWord(r.going)}</span></div>
      ${r.messages ? `<span class="run-msgs">💬 ${r.messages}</span>` : ''}
      <button type="button" class="run-go ${r.joined ? 'on' : ''}" ${full ? 'disabled' : ''}>${r.joined ? '✓ Иду' : full ? 'Мест нет' : 'Иду'}</button>
    </div>`;
  card.addEventListener('click', (e) => { if (!e.target.closest('.run-go')) openRun(r.id); });
  card.querySelector('.run-go').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (r.joined) return openRun(r.id);
    try {
      await api(`/api/partners/${r.id}/join`, { method: 'POST' });
      haptic('success');
      openRun(r.id);
    } catch (err) { alertMsg(err.data?.error || 'Не получилось. Попробуй ещё раз.'); }
  });
  return card;
}
function goingWord(n) {
  const a = n % 100, b = n % 10;
  return a > 10 && a < 20 ? 'идут' : b === 1 ? 'идёт' : 'идут';
}

// ---------- Город ----------
function openCitySheet() {
  $('cityInput').value = runsCity || '';
  const known = (runsData?.cities || []).map((c) => c.city);
  const all = [...new Set([...known, ...POPULAR_CITIES])].slice(0, 14);
  $('cityChips').innerHTML = all.map((c) => `<button type="button" class="chip">${esc(c)}</button>`).join('');
  $('cityChips').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { $('cityInput').value = c.textContent; saveCity(); }));
  $('citySheet').classList.remove('hidden');
}
async function saveCity() {
  const city = $('cityInput').value.trim();
  if (!city) return;
  $('citySheet').classList.add('hidden');
  try { await api('/api/partners/city', { method: 'PUT', body: JSON.stringify({ city }) }); } catch (e) { /* не страшно */ }
  runsCity = city;
  runsData = null;
  loadRunsTab(city);
}
$('runsCityBtn').addEventListener('click', openCitySheet);
$('citySave').addEventListener('click', saveCity);
$('cityCancel').addEventListener('click', () => $('citySheet').classList.add('hidden'));
$('citySheet').addEventListener('click', (e) => { if (e.target === $('citySheet')) $('citySheet').classList.add('hidden'); });

// ---------- Позвать на пробежку ----------
let rnMax = '';
const RN_WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function rnDayShort(dateStr) {
  const d = parseDateStr(dateStr);
  return `${RN_WD[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0, 3)}`;
}
function openRunSheet() {
  if (!runsCity) return openCitySheet();
  $('rnCity').textContent = runsCity;
  const today = localDateStr();
  $('rnDate').min = today;
  $('rnDate').max = addDays(today, 30);
  $('rnDate').value = addDays(today, 1);
  $('rnTime').value = '07:00';
  $('rnPlace').value = ''; $('rnDesc').value = '';
  rnMax = '';
  $('rnDayChips').querySelectorAll('.rn-day[data-day]').forEach((c) => { c.querySelector('span').textContent = rnDayShort(addDays(today, +c.dataset.day)); });
  // третья плашка — день недели («Среда»), чтобы влезало
  const d2 = parseDateStr(addDays(today, 2));
  $('rnDay2').textContent = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][d2.getDay()];
  paintRunSheet();
  $('runSheet').classList.remove('hidden');
}
function paintRunSheet() {
  const today = localDateStr();
  const date = $('rnDate').value;
  let quick = false;
  $('rnDayChips').querySelectorAll('.rn-day[data-day]').forEach((c) => {
    const on = addDays(today, +c.dataset.day) === date;
    quick = quick || on;
    c.classList.toggle('active', on);
  });
  $('rnOtherDay').classList.toggle('active', !quick && !!date);
  $('rnOtherLabel').textContent = !quick && date ? rnDayShort(date) : 'день';
  const time = $('rnTime').value;
  let quickT = false;
  $('rnTimeChips').querySelectorAll('.rn-time[data-time]').forEach((c) => {
    const on = c.dataset.time === time;
    quickT = quickT || on;
    c.classList.toggle('active', on);
  });
  const own = $('rnTimeChips').querySelector('.rn-time-own');
  own.classList.toggle('active', !quickT && !!time);
  $('rnTimeLabel').textContent = !quickT && time ? time : 'Другое';
  $('rnMaxChips').querySelectorAll('.rn-time').forEach((c) => c.classList.toggle('active', c.dataset.max === rnMax));
}
$('rnDayChips').querySelectorAll('.rn-day[data-day]').forEach((c) => c.addEventListener('click', () => { $('rnDate').value = addDays(localDateStr(), +c.dataset.day); paintRunSheet(); }));
$('rnTimeChips').querySelectorAll('.rn-time[data-time]').forEach((c) => c.addEventListener('click', () => { $('rnTime').value = c.dataset.time; paintRunSheet(); }));
$('rnMaxChips').querySelectorAll('.rn-time').forEach((c) => c.addEventListener('click', () => { rnMax = c.dataset.max; paintRunSheet(); }));
// «Другой день» — системный календарь (он открывается везде)
{
  const input = $('rnDate');
  input.addEventListener('change', paintRunSheet);
  input.addEventListener('input', paintRunSheet);
  input.parentElement.addEventListener('click', (e) => {
    if (e.target !== input) { try { input.showPicker(); } catch (err) { input.focus(); } }
  });
}
// «Другое» время — свой выбор часов и минут (на Mac системный выбор времени не открывается)
let tpH = 7, tpM = 0;
const tp2 = (n) => String(n).padStart(2, '0');
function paintTimePicker() {
  $('tpValue').textContent = `${tp2(tpH)}:${tp2(tpM)}`;
  $('tpHours').querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.h === tpH));
  $('tpMins').querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.m === tpM));
}
$('tpHours').innerHTML = Array.from({ length: 24 }, (_, h) => `<button type="button" class="rn-time" data-h="${h}">${tp2(h)}</button>`).join('');
$('tpMins').innerHTML = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => `<button type="button" class="rn-time" data-m="${m}">${tp2(m)}</button>`).join('');
$('tpHours').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tpH = +b.dataset.h; paintTimePicker(); }));
$('tpMins').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tpM = +b.dataset.m; paintTimePicker(); }));
// Общий выбор времени (часы + минуты): для пробежек и для времени тренировки
let tpDone = null;
function openTimePicker({ title = 'Время', value = '07:00', onDone } = {}) {
  const [h, m] = String(value || '07:00').split(':').map(Number);
  tpH = Number.isFinite(h) ? h : 7;
  tpM = Number.isFinite(m) ? m - (m % 5) : 0;
  tpDone = onDone;
  $('tpTitle').textContent = title;
  paintTimePicker();
  $('timeSheet').classList.remove('hidden');
}
$('rnTimeOwn').addEventListener('click', () => openTimePicker({
  title: 'Время пробежки', value: $('rnTime').value || '07:00',
  onDone: (t) => { $('rnTime').value = t; paintRunSheet(); },
}));
$('tpCancel').addEventListener('click', () => $('timeSheet').classList.add('hidden'));
$('timeSheet').addEventListener('click', (e) => { if (e.target === $('timeSheet')) $('timeSheet').classList.add('hidden'); });
$('tpSave').addEventListener('click', () => {
  $('timeSheet').classList.add('hidden');
  haptic('select');
  if (tpDone) tpDone(`${tp2(tpH)}:${tp2(tpM)}`);
});
$('runCreateBtn').addEventListener('click', openRunSheet);
$('rnCancel').addEventListener('click', () => $('runSheet').classList.add('hidden'));
$('runSheet').addEventListener('click', (e) => { if (e.target === $('runSheet')) $('runSheet').classList.add('hidden'); });
$('rnSave').addEventListener('click', async () => {
  const btn = $('rnSave');
  btn.disabled = true;
  try {
    const { id } = await api('/api/partners', {
      method: 'POST',
      body: JSON.stringify({ city: runsCity, date: $('rnDate').value, time: $('rnTime').value, place: $('rnPlace').value, description: $('rnDesc').value, max_people: rnMax }),
    });
    $('runSheet').classList.add('hidden');
    haptic('success');
    runsData = null;
    openRun(id);
  } catch (err) {
    alertMsg(err.data?.error || 'Не удалось создать пробежку.');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Экран пробежки ----------
async function openRun(id) {
  showScreen('runScreen');
  $('runInfo').innerHTML = '<div class="muted center">Загружаю…</div>';
  $('runActions').innerHTML = '';
  $('runMessages').innerHTML = '';
  $('runWhen').textContent = '';
  currentRun = null;
  await refreshRun(id, true);
  clearInterval(runPoll);
  runPoll = setInterval(() => {
    if (document.querySelector('.screen:not(.hidden)')?.id !== 'runScreen' || !currentRun) return clearInterval(runPoll);
    refreshRun(currentRun.run.id, false);
  }, 8000);
}
async function refreshRun(id, first) {
  try {
    const data = await api(`/api/partners/${id}`);
    const newMsgs = !currentRun || data.messages.length !== currentRun.messages.length;
    currentRun = data;
    renderRun(first || newMsgs);
  } catch (err) {
    if (first) {
      $('runInfo').innerHTML = `<div class="empty-hint">${esc(err.data?.error || 'Не удалось открыть пробежку.')}</div>`;
    }
  }
}
function renderRun(scrollChat) {
  const { run, members, messages } = currentRun;
  $('runCityLabel').textContent = `Пробежка · ${run.city}`;
  $('runWhen').textContent = runWhen(run.date, run.time);
  $('runInfo').innerHTML = `
    <div class="run-place big">📍 ${esc(run.place)}</div>
    ${run.description ? `<div class="run-desc">${esc(run.description)}</div>` : ''}
    <div class="run-author">Зовёт: <button type="button" class="link-btn run-author-btn">${nameHtml(run.author || {})}</button></div>
    <div class="run-members-title">${members.length}${run.max_people ? ` из ${run.max_people}` : ''} ${goingWord(members.length)}</div>
    <div class="run-members">${members.map((u) => `<span class="run-member">${avatarHtml(u)}<span>${esc(personName(u))}</span></span>`).join('')}</div>`;
  const authorBtn = $('runInfo').querySelector('.run-author-btn');
  authorBtn.addEventListener('click', () => {
    const u = run.author;
    if (u?.username) { try { tg?.openTelegramLink ? tg.openTelegramLink(`https://t.me/${u.username}`) : window.open(`https://t.me/${u.username}`, '_blank'); } catch (e) {} }
  });

  const acts = $('runActions');
  acts.innerHTML = '';
  const addBtn = (label, cls, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.innerHTML = label;
    b.addEventListener('click', fn);
    acts.appendChild(b);
  };
  if (run.mine) {
    addBtn('Отменить пробежку', 'ghost-btn danger', async () => {
      if (!(await confirmAsk({ icon: 'trash', title: 'Отменить пробежку?', text: 'Участники получат сообщение от бота.', ok: 'Отменить', danger: true }))) return;
      try { await api(`/api/partners/${run.id}`, { method: 'DELETE' }); runsData = null; $('runBackBtn').click(); }
      catch (err) { alertMsg(err.data?.error || 'Не удалось отменить.'); }
    });
  } else if (run.joined) {
    addBtn('✓ Ты идёшь · не пойду', 'ghost-btn', async () => {
      try { await api(`/api/partners/${run.id}/leave`, { method: 'POST' }); refreshRun(run.id, false); } catch (err) { alertMsg(err.data?.error || 'Не получилось.'); }
    });
  } else {
    const full = run.max_people && members.length >= run.max_people;
    addBtn(full ? 'Мест нет' : '🏃 Иду', 'primary-btn', async () => {
      if (full) return;
      try { await api(`/api/partners/${run.id}/join`, { method: 'POST' }); haptic('success'); refreshRun(run.id, false); }
      catch (err) { alertMsg(err.data?.error || 'Не получилось.'); }
    });
  }
  if (!run.mine && run.author?.username) {
    addBtn('Написать автору', 'ghost-btn', () => authorBtn.click());
  }
  $('runReportBtn').classList.toggle('hidden', !!run.mine);

  const box = $('runMessages');
  const canChat = !!(run.mine || run.joined); // чат открыт только тем, кто идёт
  $('runInput').closest('.run-input-row').classList.toggle('hidden', !canChat);
  if (!messages.length) {
    box.innerHTML = canChat
      ? '<div class="muted center run-chat-empty">Здесь можно договориться: где встречаемся, какой темп, кто опаздывает.</div>'
      : '<div class="muted center run-chat-empty">Чат открыт тем, кто идёт на пробежку. Нажми «Иду», чтобы присоединиться.</div>';
  } else {
    box.innerHTML = messages.map((m) => `
      <div class="run-msg ${m.mine ? 'mine' : ''}">
        ${m.mine ? '' : `<div class="run-msg-name">${esc(personName(m.author || {}))}</div>`}
        <div class="run-msg-text">${esc(m.text)}</div>
        <div class="run-msg-time">${esc(timeAgo(m.created_at))}</div>
      </div>`).join('');
  }
  if (scrollChat) setTimeout(() => box.lastElementChild?.scrollIntoView({ block: 'nearest' }), 50);
}
async function sendRunMessage() {
  const input = $('runInput');
  const text = input.value.trim();
  if (!text || !currentRun) return;
  input.value = '';
  try {
    await api(`/api/partners/${currentRun.run.id}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
    haptic();
    refreshRun(currentRun.run.id, false).then(() => $('runMessages').lastElementChild?.scrollIntoView({ block: 'nearest' }));
  } catch (err) {
    input.value = text;
    alertMsg(err.data?.error || 'Не удалось отправить.');
  }
}
$('runSendBtn').addEventListener('mousedown', (e) => e.preventDefault()); // не теряем нажатие при открытой клавиатуре
$('runSendBtn').addEventListener('click', sendRunMessage);
$('runInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendRunMessage(); } });
$('runBackBtn').addEventListener('click', () => {
  clearInterval(runPoll);
  showScreen('friendsScreen');
  setFriendsTab('runs');
});
$('runReportBtn').addEventListener('click', async () => {
  if (!currentRun) return;
  if (!(await confirmAsk({ icon: 'warn', title: 'Пожаловаться на пробежку?', text: 'Если здесь спам, реклама или что-то неприличное — я проверю и удалю.', ok: 'Пожаловаться', danger: true }))) return;
  try { await api(`/api/partners/${currentRun.run.id}/report`, { method: 'POST', body: JSON.stringify({ reason: 'жалоба из приложения' }) }); alertMsg('Спасибо! Жалоба отправлена.'); }
  catch (err) { alertMsg('Не удалось отправить жалобу.'); }
});

// Открыли приложение по ссылке-приглашению в группу (?join=код или start_param g_код)
function pendingJoinCode() {
  const q = new URLSearchParams(location.search).get('join');
  const sp = tg?.initDataUnsafe?.start_param || '';
  const m = /^g_([a-z0-9]{4,12})$/i.exec(sp);
  return (q && /^[a-z0-9]{4,12}$/i.test(q) ? q : m?.[1] || '').toLowerCase();
}

hydrateIcons();

init();

// =====================================================================
//  ЗДОРОВЬЕ: питание по фото, анализы крови, БАДы (видит только сам спортсмен)
// =====================================================================
let healthTab = 'food';
let foodDate = null;
let foodData = null;

// Файл как есть → data URL (для PDF с анализами)
function fileToDataUrl(file, type) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]*;/, `data:${type};`));
    r.onerror = () => reject(new Error('Не получилось прочитать файл'));
    r.readAsDataURL(file);
  });
}
// Фото → сжатый JPEG (data URL): большая сторона не больше maxSide
function fileToJpeg(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не получилось открыть фото')); };
    img.src = url;
  });
}

function openHealth(tab) {
  if (tab) healthTab = tab;
  showScreen('healthScreen');
  setHealthTab(healthTab);
}
function setHealthTab(tab) {
  healthTab = tab;
  $('healthTabs').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.htab === tab));
  $('hFood').classList.toggle('hidden', tab !== 'food');
  $('hBlood').classList.toggle('hidden', tab !== 'blood');
  $('hSupps').classList.toggle('hidden', tab !== 'supps');
  if (tab === 'food') loadFood();
  else if (tab === 'blood') loadBlood();
  else loadSupps();
}
$('healthTabs').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => setHealthTab(b.dataset.htab)));
$('healthEntry').addEventListener('click', () => { haptic(); openHealth(); });
$('healthBackBtn').addEventListener('click', () => showScreen('profileScreen'));

// ---------- Питание ----------
const LOAD_LABEL = { rest: 'без тренировки', light: 'лёгкая тренировка', moderate: 'средняя нагрузка', high: 'тяжёлый день' };
function shiftDateStr(str, n) {
  const d = new Date(str + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
async function loadFood() {
  if (!foodDate) foodDate = localDateStr();
  $('foodDay').textContent = relativeDateLabel(foodDate);
  $('foodNext').disabled = foodDate >= localDateStr();
  $('foodList').innerHTML = '<div class="empty-hint">Загружаю…</div>';
  try {
    foodData = await api(`/api/health/food?date=${foodDate}`);
  } catch (err) {
    $('foodList').innerHTML = `<div class="empty-hint">${esc(err.data?.error || 'Не удалось загрузить.')}</div>`;
    return;
  }
  renderFood();
}
function renderFood() {
  const d = foodData, t = d.targets, s = d.totals;
  $('foodLoad').textContent = LOAD_LABEL[t.load] + (t.trainings ? ` · ${fmtNum(t.km)} км` : '');
  const range = (x, r) => (r ? `${x} / ${r[0]}–${r[1]} г` : `${x} г`);
  const low = (x, r) => r && d.meals.length && foodDate < localDateStr() && x < r[0];
  $('foodTiles').innerHTML = coachTile(s.kcal, 'ккал')
    + coachTile(s.protein, t.protein ? `белок · ориентир ${t.protein[0]}–${t.protein[1]}` : 'белок, г', low(s.protein, t.protein) ? 'warn' : '')
    + coachTile(s.carbs, t.carbs ? `углеводы · ${t.carbs[0]}–${t.carbs[1]}` : 'углеводы, г', low(s.carbs, t.carbs) ? 'warn' : '');
  const box = $('foodList');
  box.innerHTML = d.meals.length ? '' : '<div class="empty-hint">За этот день еды пока нет. Сфоткай тарелку — Fom прикинет калории и белок.</div>';
  d.meals.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'meal-row';
    row.innerHTML = `
      ${m.thumb ? `<img class="meal-thumb" src="${m.thumb}" alt="" />` : '<span class="meal-thumb meal-thumb-empty">🍽</span>'}
      <span class="meal-main">
        <span class="meal-name">${m.time ? `<span class="muted">${esc(m.time)}</span> ` : ''}${esc(m.title || 'Приём пищи')}</span>
        <span class="meal-sub">≈${m.kcal} ккал · Б ${Math.round(m.protein)} · Ж ${Math.round(m.fat)} · У ${Math.round(m.carbs)}</span>
      </span>
      <button type="button" class="wt-clear" aria-label="Удалить">✕</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      if (!(await confirmAsk({ icon: 'trash', title: 'Удалить?', text: m.title, ok: 'Удалить', danger: true }))) return;
      try { await api(`/api/health/food/${m.id}`, { method: 'DELETE' }); loadFood(); } catch (e) { alertMsg('Не получилось удалить.'); }
    });
    box.appendChild(row);
  });
  $('foodFomText').textContent = d.fom || (d.meals.length ? 'Нажми — Fom посмотрит, хватает ли энергии и белка под нагрузку и твои цели.' : 'Сфотографируй, что ешь за день, — Fom сравнит с нагрузкой и твоими целями: хватает ли энергии и белка.');
  $('foodFomText').classList.toggle('muted', !d.fom);
  $('foodFomBtn').disabled = !d.meals.length;
  $('foodFomBtn').textContent = d.fom ? 'Спросить ещё раз' : 'Как я поел?';
}
$('foodPrev').addEventListener('click', () => { foodDate = shiftDateStr(foodDate, -1); loadFood(); });
$('foodNext').addEventListener('click', () => { if (foodDate < localDateStr()) { foodDate = shiftDateStr(foodDate, 1); loadFood(); } });
$('foodFomBtn').addEventListener('click', async () => {
  $('foodFomBtn').disabled = true;
  $('foodFomText').textContent = 'Fom смотрит твой день…';
  try {
    const { fom } = await api('/api/health/food/fom', { method: 'POST', body: JSON.stringify({ date: foodDate }), timeout: 60000 });
    foodData.fom = fom;
    $('foodFomText').textContent = fom;
    $('foodFomText').classList.remove('muted');
    $('foodFomBtn').textContent = 'Спросить ещё раз';
  } catch (err) {
    $('foodFomText').textContent = err.data?.error || 'Не получилось — попробуй ещё раз.';
  } finally {
    $('foodFomBtn').disabled = false;
  }
});

// --- окно приёма пищи ---
let mealDraft = null; // { thumb, items }
function openMealSheet(mode) {
  mealDraft = { thumb: null, items: [] };
  $('mealPreview').classList.add('hidden');
  $('mealDescribe').classList.toggle('hidden', mode !== 'text');
  $('mealFields').classList.add('hidden');
  $('mealStatus').textContent = '';
  $('mealText').value = '';
  $('mealSave').disabled = true;
  $('mealSheet').classList.remove('hidden');
}
function fillMeal(p) {
  $('mealName').value = p.title || 'Приём пищи';
  $('mealKcal').value = p.kcal ?? 0;
  $('mealP').value = p.protein ?? 0;
  $('mealF').value = p.fat ?? 0;
  $('mealC').value = p.carbs ?? 0;
  mealDraft.items = p.items || [];
  $('mealItems').textContent = (p.items || []).map((x) => `${x.name}${x.grams ? ` ~${x.grams} г` : ''}`).join(' · ')
    + (p.note ? `\n${p.note}` : '') + (p.confidence === 'low' ? '\nОценка очень примерная — поправь цифры, если знаешь точнее.' : '');
  $('mealFields').classList.remove('hidden');
  $('mealSave').disabled = false;
}
async function estimateMeal(body) {
  $('mealStatus').textContent = 'Fom прикидывает калории и белок…';
  $('mealSave').disabled = true;
  try {
    const p = await api('/api/health/food/scan', { method: 'POST', body: JSON.stringify(body), timeout: 60000 });
    $('mealStatus').textContent = 'Проверь цифры и сохрани 👇';
    fillMeal(p);
  } catch (err) {
    $('mealStatus').textContent = err.data?.error || 'Не получилось оценить — впиши цифры сам.';
    fillMeal({ title: body.text || 'Приём пищи', kcal: '', protein: '', fat: '', carbs: '' });
  }
}
$('foodFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  openMealSheet('photo');
  $('mealStatus').textContent = 'Готовлю фото…';
  try {
    const [big, thumb] = await Promise.all([fileToJpeg(file, 1024, 0.8), fileToJpeg(file, 200, 0.7)]);
    mealDraft.thumb = thumb;
    $('mealPreview').src = thumb;
    $('mealPreview').classList.remove('hidden');
    await estimateMeal({ image: big });
  } catch (err) {
    $('mealStatus').textContent = err.message || 'Не получилось открыть фото.';
  }
});
$('foodTextBtn').addEventListener('click', () => { openMealSheet('text'); setTimeout(() => $('mealText').focus(), 50); });
$('mealEstimateBtn').addEventListener('click', () => {
  const text = $('mealText').value.trim();
  if (text) estimateMeal({ text });
});
$('mealCancel').addEventListener('click', () => $('mealSheet').classList.add('hidden'));
$('mealSheet').addEventListener('click', (e) => { if (e.target === $('mealSheet')) $('mealSheet').classList.add('hidden'); });
$('mealSave').addEventListener('click', async () => {
  $('mealSave').disabled = true;
  const now = new Date();
  const time = foodDate === localDateStr() ? `${pad2(now.getHours())}:${pad2(now.getMinutes())}` : null;
  try {
    await api('/api/health/food', {
      method: 'POST',
      body: JSON.stringify({
        date: foodDate, time, title: $('mealName').value, thumb: mealDraft.thumb, items: mealDraft.items,
        kcal: $('mealKcal').value, protein: $('mealP').value, fat: $('mealF').value, carbs: $('mealC').value,
      }),
    });
    haptic('success');
    $('mealSheet').classList.add('hidden');
    loadFood();
  } catch (err) {
    $('mealStatus').textContent = err.data?.error || 'Не получилось сохранить.';
    $('mealSave').disabled = false;
  }
});

// ---------- Анализы крови ----------
const BLOOD_PRESETS = [
  ['Гемоглобин', 'г/л'], ['Ферритин', 'нг/мл'], ['Железо', 'мкмоль/л'], ['Витамин D (25-OH)', 'нг/мл'], ['Витамин B12', 'пг/мл'],
  ['ТТГ', 'мМЕ/л'], ['КФК', 'Ед/л'], ['Глюкоза', 'ммоль/л'], ['Лейкоциты', '×10⁹/л'], ['Эритроциты', '×10¹²/л'],
  ['СОЭ', 'мм/ч'], ['Тестостерон', 'нмоль/л'], ['Кортизол', 'нмоль/л'], ['Магний', 'ммоль/л'],
];
let bloodTests = [];
let bloodEditId = null;
let bloodView = null;

async function loadBlood() {
  const box = $('bloodList');
  box.innerHTML = '<div class="empty-hint">Загружаю…</div>';
  try { bloodTests = (await api('/api/health/blood')).tests || []; } catch (err) {
    box.innerHTML = `<div class="empty-hint">${esc(err.data?.error || 'Не удалось загрузить.')}</div>`;
    return;
  }
  box.innerHTML = bloodTests.length ? '' : '<div class="empty-hint">Анализов пока нет. Сфоткай бланк или загрузи PDF из лаборатории — Fom сам перенесёт показатели.</div>';
  bloodTests.forEach((t) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'history-item blood-row';
    row.innerHTML = `
      <span class="history-ico rs">🩸</span>
      <span class="history-main">
        <span class="history-date">${esc(formatDayMonth(t.date))} ${t.date.slice(0, 4)}${t.lab ? ` · ${esc(t.lab)}` : ''}</span>
        <span class="history-sub">${t.markers.length} показ.${t.off ? ` · <b class="blood-off">${t.off} вне нормы</b>` : ' · всё в норме'}</span>
      </span>
      <span class="history-arrow">›</span>`;
    row.addEventListener('click', () => openBloodView(t));
    box.appendChild(row);
  });
}

function bloodRowHtml(m = {}) {
  return `<div class="blood-row-edit">
    <input type="text" class="br-name" maxlength="60" placeholder="Показатель" value="${esc(m.name || '')}" />
    <input type="text" class="br-val" inputmode="decimal" placeholder="—" value="${esc(m.value ?? '')}" />
    <input type="text" class="br-unit" maxlength="20" placeholder="ед." value="${esc(m.unit || '')}" />
    <span class="br-ref"><input type="text" class="br-lo" inputmode="decimal" placeholder="от" value="${esc(m.ref_low ?? '')}" /><input type="text" class="br-hi" inputmode="decimal" placeholder="до" value="${esc(m.ref_high ?? '')}" /></span>
    <button type="button" class="wt-clear br-del" aria-label="Убрать">✕</button>
  </div>`;
}
function addBloodRows(list) {
  const box = $('bloodRows');
  list.forEach((m) => {
    box.insertAdjacentHTML('beforeend', bloodRowHtml(m));
    box.lastElementChild.querySelector('.br-del').addEventListener('click', (e) => e.currentTarget.parentElement.remove());
  });
}
function openBloodSheet(t) {
  bloodEditId = t?.id || null;
  $('bloodDate').value = t?.date || localDateStr();
  $('bloodDate').max = localDateStr();
  $('bloodLab').value = t?.lab || '';
  $('bloodRows').innerHTML = '';
  $('bloodStatus').textContent = '';
  addBloodRows(t?.markers?.length ? t.markers : [{ name: 'Гемоглобин', unit: 'г/л' }, { name: 'Ферритин', unit: 'нг/мл' }]);
  $('bloodPresets').innerHTML = BLOOD_PRESETS.map(([n, u]) => `<button type="button" class="chip" data-u="${esc(u)}">＋ ${esc(n)}</button>`).join('');
  $('bloodPresets').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => addBloodRows([{ name: c.textContent.replace('＋ ', ''), unit: c.dataset.u }])));
  $('bloodSheet').classList.remove('hidden');
}
function readBloodRows() {
  const n = (v) => { const x = String(v).trim().replace(',', '.'); return x === '' ? null : Number(x); };
  return [...$('bloodRows').querySelectorAll('.blood-row-edit')].map((r) => ({
    name: r.querySelector('.br-name').value.trim(), value: n(r.querySelector('.br-val').value), unit: r.querySelector('.br-unit').value.trim(),
    ref_low: n(r.querySelector('.br-lo').value), ref_high: n(r.querySelector('.br-hi').value),
  })).filter((m) => m.name && m.value != null && Number.isFinite(m.value));
}
$('bloodAddBtn').addEventListener('click', () => openBloodSheet(null));
$('bloodCancel').addEventListener('click', () => $('bloodSheet').classList.add('hidden'));
$('bloodFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  $('bloodStatus').textContent = 'Fom читает бланк… это может занять до минуты';
  try {
    // PDF из лаборатории отправляем как есть, картинку — сжимаем
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (isPdf && file.size > 6 * 1024 * 1024) throw new Error('PDF больше 6 МБ — сфоткай бланк или сохрани страницу с анализом отдельно');
    const image = isPdf ? await fileToDataUrl(file, 'application/pdf') : await fileToJpeg(file, 1800, 0.85);
    const p = await api('/api/health/blood/scan', { method: 'POST', body: JSON.stringify({ image }), timeout: 90000 });
    if (!p.markers?.length) { $('bloodStatus').textContent = 'Не нашёл показателей на фото — попробуй ровнее или внеси вручную.'; return; }
    if (p.date) $('bloodDate').value = p.date;
    if (p.lab) $('bloodLab').value = p.lab;
    // пустые строки-заготовки убираем
    [...$('bloodRows').querySelectorAll('.blood-row-edit')].forEach((r) => { if (!r.querySelector('.br-val').value.trim()) r.remove(); });
    addBloodRows(p.markers);
    $('bloodStatus').textContent = `Нашёл ${p.markers.length} показ. Сверь с бланком — Fom мог ошибиться — и сохрани.`;
    haptic('success');
  } catch (err) {
    $('bloodStatus').textContent = err.data?.error || err.message || 'Не получилось прочитать бланк.';
  }
});
$('bloodSave').addEventListener('click', async () => {
  const markers = readBloodRows();
  if (!markers.length) { $('bloodStatus').textContent = 'Впиши хотя бы один показатель с числом.'; return; }
  $('bloodSave').disabled = true;
  $('bloodStatus').textContent = 'Сохраняю, Fom смотрит анализ…';
  try {
    const { test } = await api('/api/health/blood', { method: 'POST', body: JSON.stringify({ id: bloodEditId, date: $('bloodDate').value, lab: $('bloodLab').value, markers }), timeout: 90000 });
    $('bloodSheet').classList.add('hidden');
    haptic('success');
    await loadBlood();
    openBloodView(bloodTests.find((x) => x.id === test.id) || test);
  } catch (err) {
    $('bloodStatus').textContent = err.data?.error || 'Не получилось сохранить.';
  } finally {
    $('bloodSave').disabled = false;
  }
});

function openBloodView(t) {
  bloodView = t;
  $('bvTitle').textContent = `🩸 ${formatDayMonth(t.date)} ${t.date.slice(0, 4)}${t.lab ? ' · ' + t.lab : ''}`;
  // прошлый анализ — для стрелочек «было → стало»
  const prev = bloodTests.filter((x) => x.date < t.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const key = (s) => String(s || '').toLowerCase().replace(/[^a-zа-яё0-9]/g, '');
  $('bvMarkers').innerHTML = t.markers.map((m) => {
    const p = prev?.markers.find((x) => key(x.name) === key(m.name));
    const ref = m.ref_low != null && m.ref_high != null ? `${fmtNum(m.ref_low)}–${fmtNum(m.ref_high)}` : m.ref_high != null ? `до ${fmtNum(m.ref_high)}` : m.ref_low != null ? `от ${fmtNum(m.ref_low)}` : '';
    const trend = p ? `<span class="bv-prev">было ${fmtNum(p.value)}${Number(m.value) > Number(p.value) ? ' ↑' : Number(m.value) < Number(p.value) ? ' ↓' : ''}</span>` : '';
    return `<div class="bv-row ${m.status || ''}">
      <span class="bv-name">${esc(m.name)}${ref ? `<small>норма ${esc(ref)}</small>` : ''}</span>
      <span class="bv-val"><b>${fmtNum(m.value)}</b> ${esc(m.unit || '')}${m.status === 'low' ? ' <em>ниже</em>' : m.status === 'high' ? ' <em>выше</em>' : ''}${trend}</span>
    </div>`;
  }).join('');
  $('bvFom').textContent = t.fom || 'Fom ещё не посмотрел этот анализ.';
  $('bvFomBtn').textContent = t.fom ? 'Обновить' : 'Спросить Fom';
  $('bloodViewSheet').classList.remove('hidden');
}
$('bvClose').addEventListener('click', () => $('bloodViewSheet').classList.add('hidden'));
$('bloodViewSheet').addEventListener('click', (e) => { if (e.target === $('bloodViewSheet')) $('bloodViewSheet').classList.add('hidden'); });
$('bvEdit').addEventListener('click', () => { $('bloodViewSheet').classList.add('hidden'); openBloodSheet(bloodView); });
$('bvDelete').addEventListener('click', async () => {
  if (!bloodView || !(await confirmAsk({ icon: 'trash', title: 'Удалить анализ?', text: formatDayMonth(bloodView.date), ok: 'Удалить', danger: true }))) return;
  try { await api(`/api/health/blood/${bloodView.id}`, { method: 'DELETE' }); $('bloodViewSheet').classList.add('hidden'); loadBlood(); } catch (e) { alertMsg('Не получилось удалить.'); }
});
$('bvFomBtn').addEventListener('click', async () => {
  if (!bloodView) return;
  $('bvFomBtn').disabled = true;
  $('bvFom').textContent = 'Fom смотрит анализ и нагрузку перед ним…';
  try {
    const { test } = await api(`/api/health/blood/${bloodView.id}/fom`, { method: 'POST', timeout: 90000 });
    bloodView.fom = test.fom;
    $('bvFom').textContent = test.fom;
    const i = bloodTests.findIndex((x) => x.id === test.id);
    if (i >= 0) bloodTests[i].fom = test.fom;
  } catch (err) {
    $('bvFom').textContent = err.data?.error || 'Не получилось — попробуй ещё раз.';
  } finally {
    $('bvFomBtn').disabled = false;
  }
});

// ---------- БАДы ----------
async function loadSupps() {
  const box = $('suppList');
  box.innerHTML = '<div class="empty-hint">Загружаю…</div>';
  let supps = [];
  try { supps = (await api('/api/health/supps')).supps || []; } catch (e) { box.innerHTML = '<div class="empty-hint">Не удалось загрузить.</div>'; return; }
  box.innerHTML = supps.length ? '' : '<div class="empty-hint">Список пуст. Добавь, что принимаешь, — Fom будет это учитывать.</div>';
  supps.forEach((x) => {
    const row = document.createElement('div');
    row.className = 'supp-row';
    row.innerHTML = `<span class="supp-main"><b>${esc(x.name)}</b>${x.dose ? `<span class="muted">${esc(x.dose)}</span>` : ''}</span><button type="button" class="wt-clear" aria-label="Убрать">✕</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      try { await api(`/api/health/supps/${x.id}`, { method: 'DELETE' }); loadSupps(); } catch (e) { alertMsg('Не получилось.'); }
    });
    box.appendChild(row);
  });
}
$('suppAddBtn').addEventListener('click', async () => {
  const name = $('suppName').value.trim();
  if (!name) return $('suppName').focus();
  try {
    await api('/api/health/supps', { method: 'POST', body: JSON.stringify({ name, dose: $('suppDose').value }) });
    $('suppName').value = ''; $('suppDose').value = '';
    haptic('success');
    loadSupps();
  } catch (err) { alertMsg(err.data?.error || 'Не получилось добавить.'); }
});
$('rusadaBtn').addEventListener('click', () => {
  const url = 'https://list.rusada.ru/';
  if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank');
});
$('suppAskBtn').addEventListener('click', () => {
  document.querySelector('.bottom-nav [data-screen="chatScreen"]')?.click();
  setTimeout(() => {
    $('chatInput').value = 'Какие добавки или витамины мне стоит обсудить с врачом или тренером — с учётом моих тренировок, сна и анализов?';
    $('chatInput').dispatchEvent(new Event('input', { bubbles: true }));
    $('chatInput').focus();
  }, 150);
});

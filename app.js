// Адрес бэкенда на Railway
const API_BASE = 'https://forma-production-9c7a.up.railway.app';

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  // шапка и фон Telegram в цвет приложения (если версия Telegram это умеет)
  try { tg.setHeaderColor('#0a0c11'); tg.setBackgroundColor('#0a0c11'); } catch (e) {}
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
  return `hsl(${hue}, 85%, 60%)`;
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
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': tg?.initData || '',
      'X-Client-Date': localDateStr(), // сервер узнаёт, какое «сегодня» у пользователя
      ...(options.headers || {}),
    },
  });
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
const ALL_SCREENS = ['mainScreen', 'profileScreen', 'friendsScreen', 'friendProfileScreen', 'insightsScreen', 'chatScreen', 'editScreen'];
// какая кнопка нижней панели подсвечивается на «вложенных» экранах
const NAV_PARENT = { friendProfileScreen: 'friendsScreen' };
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
function bestResults(list = myWorkouts) {
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
  const others = myWorkouts.filter((x) => x.id !== w.id && x.date <= w.date);
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
    <div class="watch-row">
      <button type="button" class="watch-btn" data-f="watchBtn">⌚ Загрузить с часов</button>
      <button type="button" class="watch-help" data-f="watchHelp" aria-label="Как выгрузить файл с часов">?</button>
      <input type="file" data-f="watchFile" class="hidden" />
    </div>
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
        <div class="card-hint">метры · кол-во · время · отдых</div>
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

    <section class="card">
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
    <label class="toggle-row">
      <input type="checkbox" data-f="visibility" />
      <span class="toggle"></span>
      <span>Показывать друзьям</span>
    </label>
  </section>
`;

function createWorkoutForm(root, { getDate = () => null } = {}) {
  root.innerHTML = FORM_TEMPLATE;
  const f = (name) => root.querySelector(`[data-f="${name}"]`);

  let type = 'training';
  let mode = 'training'; // training | competition | rest
  let sets = [];      // беговые отрезки: { distance_m, reps, time_or_pace, rest_between }
  let exercises = []; // силовая/ОФП:     { name, sets, reps, weight }

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
    const keepVisibility = f('visibility').checked;
    setData({ ...w, notes: '', competition: null, visibility: keepVisibility ? 'public' : 'private' });
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
        <input type="text" inputmode="decimal" placeholder="м / км" value="${esc(distInput(s.distance_m))}" data-k="distance_m" />
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
    if (Array.isArray(p.sets) && p.sets.length) {
      sets = p.sets.map((s) => ({
        distance_m: s.distance_m ?? '', reps: s.reps ?? '', time_or_pace: s.time_or_pace ?? '', rest_between: s.rest_between ?? '',
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
  f('watchHelp').addEventListener('click', openWatchHelp);
  f('watchBtn').addEventListener('click', () => f('watchFile').click());
  f('watchFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const status = f('smartStatus');
    f('watchBtn').disabled = true;
    status.textContent = 'Читаю файл с часов...';
    try {
      const w = await readWatchFile(file);
      status.textContent = 'Fom раскладывает круги по полям...';
      const { parsed } = await api('/api/workouts/parse', { method: 'POST', body: JSON.stringify({ text: w.text, source: 'watch' }) });
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
      const { parsed } = await api('/api/workouts/parse', { method: 'POST', body: JSON.stringify({ text }) });
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
      f('visibility').checked = w.visibility === 'public';
      setSlider('feeling', w.feeling);
      setSlider('rpe', w.rpe);
      f('hrAvg').value = w.hr_avg ?? '';
      f('hrMax').value = w.hr_max ?? '';
      f('hrMin').value = w.hr_min ?? '';
      sets = (Array.isArray(w.sets) ? w.sets : []).map((s) => ({
        distance_m: s.distance_m ?? '', reps: s.reps ?? '', time_or_pace: s.time_or_pace ?? '', rest_between: s.rest_between ?? '',
      }));
      exercises = (Array.isArray(w.exercises) ? w.exercises : []).map((e) => ({
        name: e.name ?? '', sets: e.sets ?? '', reps: e.reps ?? '', weight: e.weight ?? '',
      }));
      renderSets();
      renderExercises();
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
        visibility: f('visibility').checked ? 'public' : 'private',
        sets: type === 'training' ? sets.map((x) => ({ ...x, distance_m: parseDistance(x.distance_m) })) : [],
        exercises: type === 'training' ? exercises : [],
        hr_avg: f('hrAvg').value,
        hr_max: f('hrMax').value,
        hr_min: f('hrMin').value,
      };
    },
    setData,
    reset() {
      this.setData({ type: 'training', visibility: f('visibility').checked ? 'public' : 'private' });
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
    const { user } = await api('/api/auth/login', { method: 'POST' });
    currentUser = user;
    $('shareCalendarToggle').checked = user.share_calendar !== false;
    $('reminderToggle').checked = user.remind_enabled !== false;
    renderMySport();
    updateAvatar();
    updateFriendsBadge();
    setInterval(updateFriendsBadge, 60000); // раз в минуту проверяем новые реакции и заявки
    updateStats();
    await loadMyWorkouts();
    renderEntryState();
    loadGiveaway();
    loadAthleteProfile();
    // новичку — короткое знакомство с приложением
    if (!myWorkouts.length && !tourStorage()) setTimeout(openTour, 1500);
  } catch (err) {
    console.error('Login failed', err);
    $('statusMsg').textContent = 'Не удалось связаться с сервером. Попробуй открыть приложение ещё раз.';
  }
  hideSplash();
}

async function loadMyWorkouts() {
  const { workouts, streak } = await api('/api/workouts');
  myWorkouts = workouts.map((w) => ({ ...w, date: normDate(w.date) }));
  workoutsByDate = {};
  myWorkouts.forEach((w) => { (workoutsByDate[w.date] ||= []).push(w); });
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
  $('profileRecord').innerHTML = `${ico('trophy')} рекорд ${best} дн.`;
  $('profileRecord').classList.toggle('hidden', best < 2);
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
    const result = await api('/api/workouts', { method: 'POST', body: JSON.stringify(payload) });
    applyStreak(result.streak);

    // обновляем список записей — из него рисуется карточка «сохранено», календарь и цифры
    try {
      await loadMyWorkouts();
    } catch (e) {
      const w = { ...result.workout, date: normDate(result.workout.date) };
      (workoutsByDate[w.date] ||= []).push(w);
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
  $('listTab').classList.toggle('hidden', tab !== 'list');
  if (tab === 'feed') loadFeedTab();
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

function renderFpCalendar() {
  if (!fpData) return;
  const byDate = {};
  fpData.days.forEach((d) => { byDate[normDate(d.date)] = d; });

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

    if (day?.public && day.id) {
      cell.addEventListener('click', () => {
        const target = $('wk-' + day.id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.classList.remove('flash');
          void target.offsetWidth;
          target.classList.add('flash');
        }
      });
    } else {
      cell.disabled = true;
    }
    grid.appendChild(cell);
  }
  $('fpCalSummary').textContent = trainings ? `Тренировок за месяц: ${trainings}` : 'В этом месяце тренировок не видно.';
}

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
$('previewProfileBtn').addEventListener('click', () => {
  if (currentUser) openFriendProfile(currentUser.id, 'profileScreen');
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
    const { insight, workoutsCount } = await api(`/api/insights?period=${selectedInsightPeriod}`);
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
      '<div class="chat-empty">Привет! Я Fom, твой ИИ-помощник 👋<br />Спроси про свои тренировки — например, «сколько я бегал на этой неделе?» или «не перегружаюсь ли я?»</div>';
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

  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'chat-bubble assistant typing';
  loadingBubble.textContent = 'Fom думает...';
  $('chatMessages').appendChild(loadingBubble);
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;

  try {
    const { reply } = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history: chatHistory.slice(0, -1) }),
    });
    chatHistory.push({ role: 'assistant', content: reply || 'Не смог ответить, попробуй переформулировать.' });
  } catch (err) {
    console.error('Chat failed', err);
    chatHistory.push({ role: 'assistant', content: 'Ошибка связи с сервером. Попробуй ещё раз.' });
  }
  renderChatMessages();
}

$('chatBtn').addEventListener('click', () => {
  showScreen('chatScreen');
  renderChatMessages();
});
$('chatSendBtn').addEventListener('click', sendChatMessage);
$('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
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
  if (w.type === 'training') {
    if (w.warmup) lines.push(`Разминка: ${w.warmup}`);
    const setLines = (Array.isArray(w.sets) ? w.sets : [])
      .map((s) => {
        const parts = [];
        if (s.distance_m) parts.push(distLabel(s.distance_m));
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
  lines.push('— записано в Forma');
  return lines.join('\n');
}

function shareWorkout(w) {
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
    if (workout.visibility !== 'public' && !reactions.length && !comments.length) return;
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

$('editBackBtn').addEventListener('click', leaveEditScreen);

$('editSaveBtn').addEventListener('click', async () => {
  if (!currentEditWorkout) return;
  const statusEl = $('editStatusMsg');
  const problem = editForm.problem();
  if (problem) { statusEl.textContent = problem; haptic('warning'); return; }
  statusEl.textContent = 'Сохраняю...';

  try {
    const result = await api(`/api/workouts/${currentEditWorkout.id}`, {
      method: 'PUT',
      body: JSON.stringify(editForm.getPayload()),
    });
    currentEditWorkout = { ...currentEditWorkout, ...result.workout, date: normDate(result.workout.date) };
    statusEl.textContent = 'Сохранено ✓';
    haptic('success');
    renderEditSocial(currentEditWorkout);
    try { await loadMyWorkouts(); } catch (e) { console.error(e); }
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
  if (!$('watchSheet').classList.contains('hidden')) return closeWatchHelp();
  if (!$('repeatSheet').classList.contains('hidden')) return closeRepeatSheet();
  if (!$('cropSheet').classList.contains('hidden')) return closeCropper();
  if (!$('photoSheet').classList.contains('hidden')) return $('photoSheet').classList.add('hidden');
  if (!$('sportSheet').classList.contains('hidden')) return closeSportSheet();
  if (!$('giftSheet').classList.contains('hidden')) return $('giftSheet').classList.add('hidden');
  if (!$('athleteSheet').classList.contains('hidden')) return closeAthleteSheet();
  if (screen === 'editScreen') return $('editBackBtn').click();
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

// ---------- Вид спорта в профиле ----------
const SPORTS = {
  athletics: ['🏃', 'Лёгкая атлетика'],
  running: ['👟', 'Бег'],
  football: ['⚽', 'Футбол'],
  basketball: ['🏀', 'Баскетбол'],
  volleyball: ['🏐', 'Волейбол'],
  hockey: ['🏒', 'Хоккей'],
  swimming: ['🏊', 'Плавание'],
  cycling: ['🚴', 'Велоспорт'],
  triathlon: ['🏅', 'Триатлон'],
  combat: ['🥊', 'Единоборства'],
  tennis: ['🎾', 'Теннис'],
  fitness: ['🏋️', 'Фитнес'],
  other: ['✨', 'Другое'],
};
// Подсказки дисциплин (можно выбрать или написать свою)
const DISCIPLINES = {
  athletics: ['Спринт', 'Барьерный бег', 'Средние дистанции', 'Длинные дистанции', 'Прыжки', 'Метания', 'Многоборье', 'Спортивная ходьба'],
  running: ['5–10 км', 'Полумарафон', 'Марафон', 'Трейл'],
  swimming: ['Спринт', 'Длинные дистанции', 'Открытая вода'],
  football: ['Вратарь', 'Защитник', 'Полузащитник', 'Нападающий'],
  combat: ['Бокс', 'Борьба', 'ММА', 'Дзюдо', 'Карате'],
};

// «🏃 Лёгкая атлетика · Спринт» или пусто, если вид спорта не выбран
function sportLabel(u, { short = false } = {}) {
  const s = SPORTS[u?.sport];
  if (!s) return '';
  if (short) return u.discipline ? `${s[0]} ${u.discipline}` : `${s[0]} ${s[1]}`;
  return `${s[0]} ${s[1]}${u.discipline ? ' · ' + u.discipline : ''}`;
}

function renderMySport() {
  const tag = $('profileSport');
  const label = sportLabel(currentUser);
  tag.textContent = label || '＋ Укажи вид спорта';
  tag.classList.toggle('empty', !label);
}

let sportDraft = { sport: null, discipline: '' };

function renderSportSheet() {
  const grid = $('sportGrid');
  grid.innerHTML = '';
  Object.entries(SPORTS).forEach(([key, [emoji, name]]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sport-chip' + (sportDraft.sport === key ? ' active' : '');
    b.innerHTML = `<span>${emoji}</span>${esc(name)}`;
    b.addEventListener('click', () => {
      if (sportDraft.sport !== key) sportDraft.discipline = '';
      sportDraft.sport = key;
      $('disciplineInput').value = sportDraft.discipline;
      haptic();
      renderSportSheet();
    });
    grid.appendChild(b);
  });

  $('disciplineBlock').classList.toggle('hidden', !sportDraft.sport);
  const chips = $('disciplineChips');
  chips.innerHTML = '';
  (DISCIPLINES[sportDraft.sport] || []).forEach((d) => {
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
  $('sportClearBtn').classList.toggle('hidden', !currentUser?.sport);
}

function openSportSheet() {
  sportDraft = { sport: currentUser?.sport || null, discipline: currentUser?.discipline || '' };
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
$('sportSaveBtn').addEventListener('click', () => {
  if (!sportDraft.sport) return alertMsg('Выбери вид спорта 🙂');
  saveSport(sportDraft.sport, sportDraft.discipline.trim());
});
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
  return [`https://fragment.com/file/gifts/${slug}/thumb.webp`, `https://nft.fragment.com/gift/${slug}-1.webp`];
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
  if (e.target.tagName !== 'TEXTAREA') return;
  autoGrow(e.target);
  keepCaretVisible(e.target);
});
document.addEventListener('focusin', (e) => { if (e.target.tagName === 'TEXTAREA') autoGrow(e.target); });

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
    text: 'Дневник тренировок с ИИ-помощником Fom. Покажу за 20 секунд, как тут всё устроено.' },
  { icon: 'sparkle', title: 'Запись за минуту',
    text: 'Нажми «+» внизу и заполни поля. Или просто опиши тренировку своими словами в «Умном вводе» — Fom сам разложит всё по полям.' },
  { art: '<span class="fom-badge tour-fom">F</span>', title: 'Fom — твой помощник',
    text: 'После тренировки Fom даёт короткий отзыв: объём, темп, пульс, восстановление. В «Разборе» — итоги недели и месяца, во вкладке Fom — чат.' },
  { icon: 'flame', title: 'Держи серию',
    text: 'Каждый записанный день — тренировка или отдых — продлевает серию. Записывать можно только за сегодня и вчера. За серию от 7 дней — розыгрыши подарков.' },
  { icon: 'people', title: 'Друзья',
    text: 'Добавляй друзей по @username, смотри их открытые тренировки, ставь реакции. Что показывать друзьям — решаешь ты.' },
  { icon: 'lock', title: 'Расскажи о себе',
    text: 'Укажи вид спорта и заполни анкету в профиле — так Fom поймёт, с кем имеет дело. Анкету видишь только ты и Fom.', extra: true },
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
const SUPPORT_USERNAME = 'MAKSIMSHELIKH';
$('supportBtn').addEventListener('click', () => {
  const url = `https://t.me/${SUPPORT_USERNAME}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
});

// =====================================================================
//  ЛИЧНЫЕ РЕКОРДЫ (профиль)
// =====================================================================
function renderRecords() {
  const box = $('recordsList');
  if (!box) return;
  const best = Object.values(bestResults());
  const order = (d) => { const i = COMP_DISCIPLINES.findIndex((x) => disciplineKey(x) === disciplineKey(d)); return i < 0 ? 999 : i; };
  best.sort((a, b) => order(a.w.competition.discipline) - order(b.w.competition.discipline));
  if (!best.length) {
    box.innerHTML = '<div class="muted records-empty">Отметь «Старт» в записи — лучший результат в каждой дисциплине появится здесь.</div>';
    return;
  }
  box.innerHTML = '';
  best.forEach(({ w }) => {
    const c = w.competition;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'record-row';
    row.innerHTML = `
      <span class="record-disc">${esc(c.discipline)}</span>
      <span class="record-main">
        <b class="record-res">${esc(c.result)}</b>
        <span class="record-sub">${esc(formatDayMonth(w.date))}${c.name ? ' · ' + esc(c.name) : ''}</span>
      </span>
      <span class="history-arrow">›</span>`;
    row.addEventListener('click', () => openEditScreen(w.id, 'profileScreen'));
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

// Беговой объём записи в км: отрезки (метры × кол-во) + «N км» в разминке и заминке
function volumeKm(w) {
  if (w.type !== 'training') return 0;
  let m = 0;
  (w.sets || []).forEach((s) => { m += (Number(s.distance_m) || 0) * (Number(s.reps) || 1); });
  const text = [w.warmup, w.cooldown].filter(Boolean).join(' ');
  for (const x of text.matchAll(/(\d+(?:[.,]\d+)?)\s*км/gi)) {
    const km = Number(x[1].replace(',', '.'));
    if (km > 0 && km < 100) m += km * 1000;
  }
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
    out.session.hrAvg ??= Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);
    out.session.hrMax ??= Math.max(...hrs);
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

hydrateIcons();

init();

/* =====================================================================
   Forma — тёмный стиль: глубокий фон, стеклянные карточки,
   неоново-салатовый акцент, широкий шрифт Unbounded для заголовков
   ===================================================================== */
:root {
  --bg: #0a0c11;
  --card-top: #1b202b;
  --card-bottom: #12151c;
  --card-solid: #161a22;
  --border: rgba(255, 255, 255, 0.07);
  --border-strong: rgba(255, 255, 255, 0.12);
  --input: rgba(255, 255, 255, 0.045);
  --text: #f3f5f8;
  --muted: #8b93a7;
  --lime: #b4f53c;
  --lime-2: #6fdc3a;
  --purple: #9b6bff;
  --danger: #ff5a4f;
  --grad-lime: linear-gradient(90deg, #c2f74a 0%, #6fdc3a 100%);
  --grad-plus: radial-gradient(circle at 30% 30%, #d6ff6a 0%, #8ee043 45%, #9b6bff 100%);
  --radius: 20px;
  --nav-space: 104px; /* место под нижнюю панель */
  --font-head: 'Unbounded', 'Manrope', -apple-system, sans-serif;
  --font: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

html { background: var(--bg); touch-action: manipulation; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

body {
  margin: 0;
  font-family: var(--font);
  color: var(--text);
  background:
    radial-gradient(600px 400px at 100% -10%, rgba(155, 107, 255, 0.14), transparent 60%),
    radial-gradient(500px 360px at -10% 30%, rgba(180, 245, 60, 0.07), transparent 60%),
    var(--bg);
  background-attachment: fixed;
  min-height: 100vh;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: calc(var(--nav-space) + env(safe-area-inset-bottom, 0px));
}

button, input, textarea { font-family: inherit; }
button { color: inherit; }

.hidden { display: none !important; }
.muted { color: var(--muted); font-size: 13px; }

/* ---------- Шапка ---------- */
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px 10px;
}
.logo {
  font-family: var(--font-head);
  font-weight: 700;
  font-size: 26px;
  letter-spacing: -0.5px;
  display: flex;
  align-items: flex-end;
  gap: 3px;
}
.logo-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--lime);
  box-shadow: 0 0 12px var(--lime);
  margin-bottom: 7px;
}
.topbar-right { display: flex; align-items: center; gap: 10px; }
.streak-pill {
  display: flex; align-items: center; gap: 4px;
  padding: 7px 12px;
  border-radius: 999px;
  background: var(--input);
  border: 1px solid var(--border);
  font-family: var(--font-head);
  font-size: 14px;
  font-weight: 600;
}
.avatar-btn {
  width: 40px; height: 40px;
  border-radius: 50%;
  border: 2px solid rgba(180, 245, 60, 0.6);
  background: var(--card-solid);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
}
.avatar-btn img { width: 100%; height: 100%; object-fit: cover; }

/* ---------- Экраны ---------- */
.screen { padding: 4px 16px 24px; }

.page-title, .title {
  font-family: var(--font-head);
  font-weight: 700;
  font-size: 22px;
  line-height: 1.15;
  margin: 6px 0 14px;
  letter-spacing: -0.3px;
}
.title { margin: 2px 0 12px; }
.title.small { font-size: 17px; margin: 2px 0 0; }

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--lime);
}
.eyebrow.light { color: rgba(255, 255, 255, 0.75); }

.section-title {
  font-family: var(--font-head);
  font-size: 16px;
  font-weight: 600;
  margin: 22px 0 10px;
}

/* ---------- Карточки ---------- */
.card {
  background: linear-gradient(180deg, var(--card-top), var(--card-bottom));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.card-hero { padding-bottom: 14px; }
.card-label {
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 10px;
  display: flex; align-items: center; gap: 8px;
}
.card-head { margin-bottom: 10px; }
.card-head .card-label { margin-bottom: 2px; }
.card-hint { color: var(--muted); font-size: 12px; }
.optional { color: var(--muted); font-weight: 500; font-size: 12px; }

/* ---------- Статистика (3 плитки) ---------- */
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.stat {
  background: linear-gradient(180deg, var(--card-top), var(--card-bottom));
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 12px 8px;
  text-align: center;
}
.stat-icon {
  width: 34px; height: 34px;
  margin: 0 auto 6px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.06);
  display: flex; align-items: center; justify-content: center;
  font-size: 17px;
}
.stat-num {
  font-family: var(--font-head);
  font-weight: 700;
  font-size: 26px;
  line-height: 1.1;
}
.stat-num.accent { color: var(--lime); text-shadow: 0 0 18px rgba(180, 245, 60, 0.35); }
.stat-label { color: var(--muted); font-size: 11px; margin-top: 3px; line-height: 1.2; }

/* ---------- Поля ввода ---------- */
textarea, input[type="text"], input[type="number"] {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--input);
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 15px;
  color: var(--text);
  outline: none;
  resize: none;
  transition: border-color 0.15s ease;
}
textarea:focus, input[type="text"]:focus, input[type="number"]:focus { border-color: rgba(180, 245, 60, 0.55); }
::placeholder { color: #5f6778; }
/* убираем стрелочки у числовых полей — на телефоне они только мешают */
input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

/* ---------- Переключатели (сегменты) ---------- */
.segmented {
  display: flex;
  background: var(--card-solid);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 4px;
  margin: 0 0 12px;
}
.seg-btn {
  flex: 1;
  border: none;
  background: transparent;
  padding: 10px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
}
.seg-btn.active { background: var(--grad-lime); color: #0b0d10; }

/* ---------- Выбор даты ---------- */
.date-picker-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.chip {
  border: 1px solid var(--border);
  background: var(--input);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.chip.active { background: var(--grad-lime); color: #0b0d10; border-color: transparent; }
.date-input-wrap {
  display: flex; align-items: center; gap: 6px;
  flex: 1 1 150px;
  font-size: 14px;
}
.date-input-wrap input[type="date"] {
  flex: 1; min-width: 0;
  border: 1px solid var(--border);
  background: var(--input);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  color-scheme: dark;
}

/* ---------- Строки: беговые отрезки ---------- */
.set-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 30px;
  gap: 6px;
  margin-bottom: 8px;
}
.set-row input { padding: 10px 8px; font-size: 14px; border-radius: 12px; }

/* ---------- Строки: силовая / ОФП ---------- */
.ex-row {
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.025);
  border-radius: 16px;
  padding: 8px;
  margin-bottom: 8px;
}
.ex-top { display: grid; grid-template-columns: 1fr 30px; gap: 6px; margin-bottom: 6px; }
.ex-bottom { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.ex-row input { padding: 10px; font-size: 14px; border-radius: 12px; }

.row-del {
  border: none; background: none;
  color: var(--danger);
  font-size: 15px;
  cursor: pointer;
  padding: 0;
}
.add-btn {
  width: 100%;
  padding: 11px;
  border-radius: 14px;
  border: 1px dashed rgba(180, 245, 60, 0.4);
  background: rgba(180, 245, 60, 0.05);
  color: var(--lime);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

/* ---------- Ползунки ---------- */
.slider-row { margin: 6px 0 14px; }
.slider-row:last-child { margin-bottom: 4px; }
.slider-top { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; color: var(--muted); }
.slider-top b { color: var(--text); font-family: var(--font-head); font-size: 14px; }
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, #ff5a4f, #ffc14d 50%, var(--lime));
  outline: none;
}
/* самочувствие: плохо (красный) → отлично (зелёный) */
input[type="range"].range-good { background: linear-gradient(90deg, #ff5a4f, #ffc14d 50%, var(--lime)); }
/* нагрузка: легко (зелёный) → на пределе (красный) */
input[type="range"].range-load { background: linear-gradient(90deg, var(--lime), #ffc14d 50%, #ff5a4f); }
.slider-scale { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 6px; }
.slider-hint { font-size: 12px; margin-top: 6px; }
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid var(--bg);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3);
  cursor: pointer;
}
input[type="range"]::-moz-range-thumb {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid var(--bg);
}

/* ---------- Умный ввод ---------- */
.smart-card {
  border: 1px solid transparent;
  background:
    linear-gradient(180deg, var(--card-top), var(--card-bottom)) padding-box,
    linear-gradient(120deg, rgba(180, 245, 60, 0.7), rgba(155, 107, 255, 0.7)) border-box;
}
.smart-hint { margin: -4px 0 10px; }
.smart-btn {
  width: 100%;
  margin-top: 10px;
  padding: 12px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(90deg, #9b6bff, #6f8bff);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(155, 107, 255, 0.3);
}
.smart-btn:disabled { opacity: 0.6; }

/* ---------- Пульс ---------- */
.hr-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.hr-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }
.hr-field input { padding: 10px 6px; text-align: center; font-size: 15px; }
.hr-hint { font-size: 12px; margin-top: 8px; line-height: 1.35; }

/* ---------- Переключатель «Показывать друзьям» ---------- */
.toggle-row {
  display: flex; align-items: center; gap: 10px;
  margin-top: 12px;
  font-size: 14px;
  cursor: pointer;
}
.toggle-row input { display: none; }
.toggle {
  width: 42px; height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  position: relative;
  transition: background 0.2s ease;
  flex: 0 0 auto;
}
.toggle::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}
.toggle-row input:checked + .toggle { background: var(--lime-2); }
.toggle-row input:checked + .toggle::after { transform: translateX(18px); }

/* ---------- Кнопки ---------- */
.primary-btn {
  width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 16px;
  border-radius: 999px;
  border: none;
  background: var(--grad-lime);
  color: #0b0d10;
  font-family: var(--font-head);
  font-size: 15px;
  font-weight: 600;
  margin-top: 6px;
  cursor: pointer;
  box-shadow: 0 8px 28px rgba(140, 230, 60, 0.25);
}
.primary-btn:disabled { opacity: 0.6; }
.primary-btn:active { transform: scale(0.99); }
.plus-ico { font-size: 20px; line-height: 1; }

.btn-row { display: flex; gap: 8px; margin-top: 10px; }
.ghost-btn {
  flex: 1;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--border-strong);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.ghost-btn.danger { color: var(--danger); border-color: rgba(255, 90, 79, 0.35); }

.small-btn {
  padding: 12px 16px;
  border-radius: 14px;
  border: none;
  background: var(--grad-lime);
  color: #0b0d10;
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
}

.round-btn {
  flex: 0 0 auto;
  width: 38px; height: 38px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--card-solid);
  color: var(--text);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s ease;
}
.round-btn:disabled { opacity: 0.3; cursor: default; }
.round-btn:active { opacity: 0.7; }

.status-msg { text-align: center; margin-top: 10px; font-size: 13px; color: var(--muted); }
.empty-hint { color: var(--muted); font-size: 13px; padding: 8px 2px; }

/* ---------- Карточка «запись сохранена» ---------- */
.done-card { border-color: rgba(180, 245, 60, 0.25); }
.done-title { font-family: var(--font-head); font-weight: 600; font-size: 16px; margin-bottom: 10px; }
.done-summary { white-space: pre-line; font-size: 14px; line-height: 1.6; color: #d9dde6; }
.done-hint { text-align: center; margin-top: 12px; font-size: 12px; }

/* ---------- Fom ---------- */
.fom-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  border-radius: 8px;
  background: var(--grad-plus);
  color: #0b0d10;
  font-family: var(--font-head);
  font-weight: 700;
  font-size: 13px;
}
.fom-badge.big { width: 42px; height: 42px; border-radius: 14px; font-size: 20px; }
.ai-box {
  margin-top: 14px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.5;
}
.ai-box-title { display: flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 8px; }
.ai-box-big { margin-top: 14px; font-size: 14px; line-height: 1.55; white-space: pre-wrap; }
.ai-box-big strong { color: var(--lime); }

/* ---------- Профиль: большое фото ---------- */
.profile-hero {
  position: relative;
  height: 300px;
  border-radius: 24px;
  overflow: hidden;
  isolation: isolate;
  margin-bottom: 12px;
  background-color: var(--card-solid);
  background-size: cover;
  background-position: center;
  /* тонкая аккуратная рамка тенью — без яркой полосы по краю фото */
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 18px 40px rgba(0, 0, 0, 0.45);
}
/* мягкая «мутность» снизу фото — под именем */
.profile-hero::before {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 48%;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 65%);
  mask-image: linear-gradient(180deg, transparent 0%, #000 65%);
}
.profile-hero.no-photo {
  background-image:
    radial-gradient(circle at 25% 25%, rgba(180, 245, 60, 0.5), transparent 55%),
    radial-gradient(circle at 80% 70%, rgba(155, 107, 255, 0.55), transparent 55%);
}
.profile-hero-shade {
  position: absolute; inset: -2px;
  background: linear-gradient(180deg, rgba(10, 12, 17, 0) 42%, rgba(10, 12, 17, 0.45) 70%, rgba(10, 12, 17, 0.88) 100%);
}
.profile-hero-bottom {
  position: absolute; left: 16px; right: 16px; bottom: 16px;
  display: flex; flex-direction: column; align-items: flex-start;
}
/* вид спорта — строка над именем */
.hero-sport {
  max-width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: #d9c8ff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  text-align: left;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
button.hero-sport { cursor: pointer; }
.hero-sport.empty { color: rgba(255, 255, 255, 0.75); text-decoration: underline dashed rgba(255, 255, 255, 0.4); text-underline-offset: 4px; }
.profile-name {
  font-family: var(--font-head);
  font-weight: 700;
  font-size: 28px;
  line-height: 1.1;
  margin: 4px 0 8px;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
  word-break: break-word;
}
.profile-tags { display: flex; gap: 6px; flex-wrap: nowrap; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.profile-tags::-webkit-scrollbar { display: none; }
.profile-tags .tag { flex: 0 0 auto; white-space: nowrap; }

/* фирменная синяя галочка */
.verified { width: 0.8em; height: 0.8em; margin-left: 6px; vertical-align: -0.06em; flex: 0 0 auto; }
.friend-name .verified { width: 16px; height: 16px; margin-left: 4px; vertical-align: -3px; }
.tag {
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(180, 245, 60, 0.6);
  color: var(--lime);
  font-size: 12px;
  font-weight: 700;
  backdrop-filter: blur(8px);
}
.photo-btn {
  position: absolute;
  top: 12px; right: 12px;
  z-index: 2;
  width: 40px; height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
  cursor: pointer;
}
.photo-btn:active { transform: scale(0.94); }

/* ---------- Меню «Фото» ---------- */
.sheet-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 50;
  display: flex; align-items: flex-end;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
}
.sheet {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  background: var(--card-solid);
  border: 1px solid var(--border-strong);
  border-radius: 24px;
  padding: 16px;
}
.sheet-title { text-align: center; font-weight: 700; margin-bottom: 12px; }
.sheet-btn {
  width: 100%;
  padding: 14px;
  margin-bottom: 8px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.05);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.sheet-btn.muted-btn { background: transparent; border-color: transparent; color: var(--muted); margin-bottom: 0; }

/* ---------- Календарь ---------- */
.cal-header { display: flex; justify-content: space-between; align-items: center; margin: 8px 0 10px; }
.cal-title { font-family: var(--font-head); font-weight: 600; font-size: 16px; }
.cal-weekdays, .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.cal-weekdays span { text-align: center; font-size: 11px; color: var(--muted); padding-bottom: 4px; }
.cal-cell {
  aspect-ratio: 1 / 1;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  padding: 0;
}
.cal-cell.empty { background: transparent; cursor: default; }
.cal-cell.has-training { background: var(--grad-lime); color: #0b0d10; font-weight: 800; }
.cal-cell.has-rest { background: transparent; box-shadow: inset 0 0 0 2px rgba(155, 107, 255, 0.7); }
.cal-cell.today { outline: 2px solid #fff; outline-offset: 1px; }
.cal-cell.future { opacity: 0.3; cursor: default; }
.cal-cell.too-old { opacity: 0.4; }
.cal-cell:not(.future):not(.empty):active { opacity: 0.7; }
.cal-legend { display: flex; gap: 16px; justify-content: center; font-size: 12px; color: var(--muted); margin-top: 12px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; vertical-align: -1px; }
.dot-training { background: var(--grad-lime); }
.dot-rest { box-shadow: inset 0 0 0 2px rgba(155, 107, 255, 0.8); }
.cal-summary { text-align: center; margin-top: 8px; }
.cal-help { text-align: center; margin-top: 6px; font-size: 12px; }

/* ---------- Последние записи ---------- */
.history-item {
  width: 100%;
  display: flex; align-items: center; gap: 12px;
  text-align: left;
  background: linear-gradient(180deg, var(--card-top), var(--card-bottom));
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}
.history-ico {
  width: 38px; height: 38px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
  flex: 0 0 auto;
}
.history-ico.tr { background: rgba(180, 245, 60, 0.12); }
.history-ico.rs { background: rgba(155, 107, 255, 0.15); }
.history-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.history-date { font-weight: 700; font-size: 14px; }
.history-sub { color: var(--muted); font-size: 12px; }
.history-arrow { color: var(--muted); font-size: 22px; }
.history-item:active { opacity: 0.7; }

/* ---------- Друзья ---------- */
.add-friend-row { display: flex; gap: 8px; margin-top: 10px; }
.add-friend-row input { flex: 1 1 auto; min-width: 0; }
.friend-item {
  display: flex; align-items: center; gap: 12px;
  background: linear-gradient(180deg, var(--card-top), var(--card-bottom));
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 10px 12px;
  margin-bottom: 8px;
  font-size: 14px;
}
.friend-ava {
  width: 38px; height: 38px;
  border-radius: 50%;
  background: var(--grad-plus);
  color: #0b0d10;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-head);
  font-weight: 700;
  flex: 0 0 auto;
}
.friend-name { flex: 1; font-weight: 700; min-width: 0; }
.friend-streak { font-family: var(--font-head); font-weight: 600; }
.friend-actions { display: flex; gap: 6px; }
.mini-btn { border: none; border-radius: 10px; padding: 7px 12px; font-size: 13px; font-weight: 700; cursor: pointer; }
.mini-btn.accept { background: var(--grad-lime); color: #0b0d10; }
.mini-btn.decline { background: rgba(255, 90, 79, 0.15); color: var(--danger); }

/* ---------- Чат с Fom ---------- */
.chat-section {
  display: flex;
  flex-direction: column;
  /* высота экрана минус шапка и нижняя панель — строка ввода всегда видна */
  height: calc(var(--app-h, 100vh) - 64px - var(--nav-space) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  padding-bottom: 8px;
}
.chat-head {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: 18px;
  background: linear-gradient(180deg, var(--card-top), var(--card-bottom));
  border: 1px solid var(--border);
}
.chat-head-name { font-family: var(--font-head); font-weight: 700; font-size: 16px; }
.chat-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0;
}
.chat-empty { color: var(--muted); font-size: 14px; line-height: 1.5; text-align: center; margin: auto 10px; }
.chat-bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
}
.chat-bubble.user { align-self: flex-end; background: var(--grad-lime); color: #0b0d10; border-bottom-right-radius: 6px; font-weight: 600; }
.chat-bubble.assistant { align-self: flex-start; background: var(--card-solid); border: 1px solid var(--border); border-bottom-left-radius: 6px; }
.chat-bubble.assistant strong { color: var(--lime); }
.chat-bubble.typing { color: var(--muted); }

/* строка ввода — как в мессенджере */
.chat-input-row { display: flex; align-items: center; gap: 8px; }
.chat-input-row input { flex: 1 1 auto; min-width: 0; border-radius: 999px; padding: 12px 18px; }
.send-btn {
  flex: 0 0 auto;
  width: 44px; height: 44px;
  border-radius: 50%;
  border: none;
  background: var(--grad-lime);
  color: #0b0d10;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  padding: 0;
}
.send-btn svg { margin-left: 2px; }
.send-btn:active { opacity: 0.7; }

/* ---------- Шапка экрана редактирования ---------- */
.screen-head { display: flex; align-items: center; gap: 12px; margin: 6px 0 14px; }

/* ---------- Нижняя панель (всегда внизу, не двигается) ---------- */
.bottom-nav {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  width: min(calc(100% - 24px), 440px);
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 6px;
  border-radius: 26px;
  background: rgba(20, 23, 31, 0.82);
  border: 1px solid var(--border-strong);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  z-index: 40;
}
.nav-btn {
  flex: 1;
  height: 100%;
  border: none;
  background: none;
  color: var(--muted);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.15s ease;
}
.nav-btn.active { color: var(--lime); }
.nav-btn.active svg { filter: drop-shadow(0 0 6px rgba(180, 245, 60, 0.6)); }
.nav-plus {
  flex: 0 0 auto;
  width: 60px; height: 60px;
  margin: 0 4px;
  transform: translateY(-14px);
  border-radius: 50%;
  border: 4px solid var(--bg);
  background: var(--grad-plus);
  color: #0b0d10;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 24px rgba(155, 107, 255, 0.45), 0 0 18px rgba(180, 245, 60, 0.35);
  transition: transform 0.15s ease;
}
.nav-plus:active { transform: translateY(-14px) scale(0.94); }
.nav-plus.active { box-shadow: 0 6px 28px rgba(155, 107, 255, 0.6), 0 0 26px rgba(180, 245, 60, 0.6); }

/* =====================================================================
   Друзья: лента, профиль друга, реакции, комментарии, активность
   ===================================================================== */
.ghost-btn.wide { display: block; width: 100%; margin-top: 12px; }

/* значки с числом новых событий */
.nav-btn { position: relative; }
.nav-badge {
  position: absolute;
  top: 8px; left: calc(50% + 6px);
  min-width: 17px; height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-style: normal;
  font-size: 10px; font-weight: 800;
  line-height: 17px;
  text-align: center;
  box-shadow: 0 0 0 2px #10131a;
}
.tab-badge {
  display: inline-block;
  min-width: 18px; height: 18px;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-size: 11px; font-weight: 800;
  line-height: 18px;
}

/* аватарки: фото поверх буквы (если фото не загрузилось — видна буква) */
.friend-ava { position: relative; overflow: hidden; }
.friend-ava img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.friend-ava.small { width: 30px; height: 30px; font-size: 13px; }

/* список друзей — строки нажимаются */
.friend-item.clickable { width: 100%; text-align: left; color: var(--text); cursor: pointer; font-family: inherit; }
.friend-item.clickable:active { opacity: 0.75; }
.friend-sub { display: block; font-weight: 500; font-size: 12px; color: var(--muted); margin-top: 2px; }

/* ---------- Карточка тренировки в ленте ---------- */
.wk-card { padding: 14px; transition: box-shadow 0.4s ease; }
.wk-head { display: flex; align-items: center; gap: 10px; }
.wk-head-main { min-width: 0; flex: 1; }
.wk-author {
  display: block;
  padding: 0; border: none; background: none;
  color: var(--text);
  font-weight: 800; font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.wk-author .verified { width: 15px; height: 15px; margin-left: 4px; vertical-align: -2px; }
.wk-date { color: var(--muted); font-size: 12px; margin-top: 2px; }
.wk-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.wk-chip {
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  font-size: 12px; font-weight: 800;
}
.wk-body { white-space: pre-line; font-size: 14px; line-height: 1.55; color: #d9dde6; margin-top: 10px; }
.wk-card.flash { box-shadow: 0 0 0 2px var(--lime), 0 0 28px rgba(180, 245, 60, 0.35); }

/* ---------- Реакции ---------- */
.social { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.react-bar { display: flex; gap: 6px; flex-wrap: wrap; }
.react-btn {
  display: inline-flex; align-items: center; gap: 5px;
  height: 34px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 13px; font-weight: 800;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.15s ease, border-color 0.15s ease;
}
.react-btn .react-emoji { font-size: 16px; line-height: 1; filter: grayscale(0.6); opacity: 0.75; transition: filter 0.15s, opacity 0.15s; }
.react-btn.has .react-emoji, .react-btn.mine .react-emoji { filter: none; opacity: 1; }
.react-btn.mine { background: rgba(180, 245, 60, 0.14); border-color: rgba(180, 245, 60, 0.7); color: var(--lime); }
.react-btn:active { transform: scale(0.92); }
.react-btn.comment-btn { margin-left: auto; }
.react-btn.pop .react-emoji { animation: react-pop 0.45s ease; }
@keyframes react-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.6) rotate(-10deg); }
  100% { transform: scale(1); }
}

/* ---------- Комментарии ---------- */
.thread { margin-top: 12px; }
.thread-loading, .thread-empty { font-size: 13px; padding: 4px 2px 8px; }
.who-reacted { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.who-reacted .verified { width: 12px; height: 12px; margin-left: 2px; vertical-align: -2px; }
.comment { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 10px; }
.comment-main {
  flex: 1; min-width: 0;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px 14px 14px 14px;
  padding: 8px 11px;
}
.comment-top { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin-bottom: 2px; }
.comment-top .verified { width: 13px; height: 13px; margin-left: 3px; vertical-align: -2px; }
.comment-text { font-size: 14px; line-height: 1.4; word-break: break-word; }
.comment-del { border: none; background: none; color: var(--muted); font-size: 13px; padding: 6px 2px; cursor: pointer; }
.comment-form { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.comment-form input { flex: 1; min-width: 0; padding: 10px 14px; border-radius: 999px; font-size: 14px; }
.send-btn.small { width: 38px; height: 38px; }

/* ---------- Активность ---------- */
.activity-card { border-color: rgba(155, 107, 255, 0.35); }
.activity-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%;
  padding: 8px 4px;
  border: none; border-radius: 12px;
  background: none;
  color: var(--text);
  text-align: left;
  font-size: 13px;
  line-height: 1.35;
  cursor: pointer;
}
.activity-item + .activity-item { border-top: 1px solid var(--border); border-radius: 0; }
.activity-item.unread .activity-text::before {
  content: '';
  display: inline-block;
  width: 7px; height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--lime);
  box-shadow: 0 0 8px var(--lime);
  vertical-align: 1px;
}
.activity-text { flex: 1; min-width: 0; }
.activity-text .verified { width: 13px; height: 13px; margin-left: 2px; vertical-align: -2px; }
.activity-time { flex: 0 0 auto; font-size: 11px; }

/* ---------- Пустая лента ---------- */
.empty-feed { text-align: center; padding: 26px 18px; }
.empty-feed-ico { font-size: 34px; margin-bottom: 8px; }
.empty-feed-title { font-family: var(--font-head); font-weight: 600; font-size: 16px; margin-bottom: 6px; }
.empty-feed .muted { line-height: 1.45; }

/* ---------- Календарь друга ---------- */
.cal-cell.readonly:disabled { cursor: default; }
/* закрытый день: видно, что он был, но без подробностей — с замочком */
.cal-cell.locked { position: relative; }
.cal-cell.has-training.locked { background: rgba(180, 245, 60, 0.28); color: var(--text); box-shadow: inset 0 0 0 1.5px rgba(180, 245, 60, 0.75); }
.cal-cell.locked::after {
  content: '🔒';
  position: absolute;
  top: 1px; right: 2px;
  font-size: 9px;
  line-height: 1;
}

/* ---------- Приватность ---------- */
.privacy-row { margin-top: 8px; }
.privacy-hint { font-size: 12px; line-height: 1.4; margin-top: 8px; }

/* метка «рекорд серии» — спокойнее основной */
.tag.tag-soft { border-color: rgba(255, 255, 255, 0.25); color: rgba(255, 255, 255, 0.85); }
.tag-btn { font-family: inherit; cursor: pointer; }
.tag-btn:active { opacity: 0.7; }

/* ---------- Обрезка фото ---------- */
.crop-backdrop { z-index: 60; align-items: center; }
.crop-sheet { max-width: 420px; margin: 0 auto; }
.crop-view {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 20px;
  background: #000;
  touch-action: none; /* палец двигает фото, а не страницу */
  cursor: grab;
}
.crop-view img {
  position: absolute; left: 0; top: 0;
  max-width: none;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
  transform-origin: 0 0;
}
/* подсказка: круг, который увидят в аватарке, остальное чуть затемнено */
.crop-guide {
  position: absolute; inset: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.35);
  outline: 2px solid rgba(255, 255, 255, 0.85);
  outline-offset: -2px;
  pointer-events: none;
}
.crop-zoom-row { display: flex; align-items: center; gap: 10px; margin: 14px 4px 6px; color: var(--muted); font-weight: 800; }
.crop-zoom { flex: 1; background: rgba(255, 255, 255, 0.15) !important; }
.crop-hint { text-align: center; font-size: 12px; margin-bottom: 4px; }
.crop-save { background: var(--grad-lime); color: #0b0d10; border-color: transparent; }
.crop-save:disabled { opacity: 0.6; }

/* ---------- Компактная шапка профиля ---------- */
.mini-head {
  position: fixed;
  top: calc(8px + env(safe-area-inset-top, 0px));
  left: 50%;
  width: min(calc(100% - 24px), 440px);
  margin-left: calc(min(calc(100% - 24px), 440px) / -2);
  z-index: 40;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 8px 8px 16px;
  border-radius: 22px;
  background: rgba(20, 23, 31, 0.82);
  border: 1px solid var(--border-strong);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  opacity: 0;
  pointer-events: none;
  cursor: pointer;
}
.mini-head.shown { pointer-events: auto; }
.mini-main { min-width: 0; }
.mini-name { font-family: var(--font-head); font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-name .verified { width: 15px; height: 15px; margin-left: 4px; vertical-align: -2px; }
.mini-stats { font-size: 13px; font-weight: 700; color: var(--muted); margin-top: 2px; white-space: nowrap; }
.mini-ava {
  position: relative;
  flex: 0 0 auto;
  width: 44px; height: 44px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--grad-plus);
  color: #0b0d10;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-head); font-weight: 700;
  box-shadow: 0 0 0 2px var(--lime);
  transition: transform 0.05s linear;
}
.mini-ava img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

/* ---------- Жест «назад» ---------- */
.swipe-back {
  position: fixed;
  left: 0; top: 50%;
  z-index: 70;
  width: 44px; height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid var(--border-strong);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: var(--text);
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transform: translate(-40px, -50%) scale(0.7);
  pointer-events: none;
  transition: background 0.15s ease, color 0.15s ease;
}
.swipe-back.ready { background: var(--grad-lime); color: #0b0d10; border-color: transparent; }

/* ---------- Вид спорта ---------- */
.sport-sheet { max-height: 86vh; overflow-y: auto; }
.sport-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px; }
.sport-chip {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 12px;
  border-radius: 14px;
  border: 1px solid var(--border-strong);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 14px; font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.sport-chip span { font-size: 18px; }
.sport-chip.active { background: rgba(180, 245, 60, 0.14); border-color: rgba(180, 245, 60, 0.75); color: var(--lime); }
.sport-sub { margin-bottom: 8px; }
.discipline-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
#disciplineInput { width: 100%; margin-bottom: 4px; }

/* ---------- Подпись у синей галочки ---------- */
.verified { cursor: pointer; }
.badge-tip {
  position: fixed;
  z-index: 80;
  display: none;
  padding: 8px 14px;
  border-radius: 12px;
  background: #2AABEE;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
  box-shadow: 0 8px 24px rgba(42, 171, 238, 0.45);
  pointer-events: none;
  opacity: 0;
  transform: translateY(6px) scale(0.85);
  transform-origin: var(--arrow-x, 50%) 100%;
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.3, 1.5, 0.5, 1);
}
.badge-tip.below { transform-origin: var(--arrow-x, 50%) 0; transform: translateY(-6px) scale(0.85); }
.badge-tip.show { opacity: 1; transform: none; }
/* хвостик-стрелочка к галочке */
.badge-tip::after {
  content: '';
  position: absolute;
  left: var(--arrow-x, 50%);
  bottom: -5px;
  width: 10px; height: 10px;
  margin-left: -5px;
  background: #2AABEE;
  transform: rotate(45deg);
  border-radius: 2px;
}
.badge-tip.below::after { bottom: auto; top: -5px; }

/* ---------- Розыгрыши ---------- */
.gift-card {
  border: 1px solid transparent;
  background:
    linear-gradient(180deg, var(--card-top), var(--card-bottom)) padding-box,
    linear-gradient(120deg, rgba(255, 196, 77, 0.75), rgba(155, 107, 255, 0.7)) border-box;
}
.gift-head { display: flex; justify-content: space-between; align-items: center; }
.gift-head .card-label { margin-bottom: 0; }
.gift-rules-btn {
  border: 1px solid var(--border-strong);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px; font-weight: 700;
  cursor: pointer;
}
.gift-sub { margin: 4px 0 10px; }
.gift-row {
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  margin-top: 8px;
}
.gift-row.month { background: linear-gradient(135deg, rgba(155, 107, 255, 0.16), rgba(255, 196, 77, 0.08)); border-color: rgba(155, 107, 255, 0.35); }
.gift-row.in { border-color: rgba(180, 245, 60, 0.55); }
.gift-row-top { display: flex; align-items: center; gap: 10px; }

.gift-row-main { flex: 1; min-width: 0; }
.gift-title { font-weight: 800; font-size: 14px; }
.gift-title .muted { font-weight: 600; font-size: 12px; }
.gift-when { font-size: 12px; color: #ffc44d; font-weight: 700; margin-top: 2px; }
.gift-badge {
  flex: 0 0 auto;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(180, 245, 60, 0.14);
  border: 1px solid rgba(180, 245, 60, 0.6);
  color: var(--lime);
  font-size: 12px; font-weight: 800;
}
.gift-bar { height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); margin-top: 10px; overflow: hidden; }
.gift-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #ffc44d, var(--lime)); }
.gift-row.month .gift-bar i { background: linear-gradient(90deg, var(--purple), #ffc44d); }
.gift-status { font-size: 12px; color: var(--muted); margin-top: 6px; }
.gift-status.ok { color: var(--lime); font-weight: 700; }
.gift-sheet { max-height: 86vh; overflow-y: auto; }
.gift-rules p { font-size: 14px; line-height: 1.45; color: #d9dde6; margin: 0 0 10px; }
.gift-winners { margin: 12px 0 6px; padding-top: 12px; border-top: 1px solid var(--border); }
.gift-winner { font-size: 14px; padding: 4px 0; }

/* ---------- Вторая тренировка за день ---------- */
.done-block + .done-block { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.done-block-title { font-weight: 800; font-size: 14px; margin-bottom: 6px; }
.done-block .ai-box { margin-top: 10px; }
.add-second-btn {
  display: block;
  width: 100%;
  margin-top: 14px;
  padding: 12px;
  border-radius: 14px;
  border: 1px dashed rgba(180, 245, 60, 0.6);
  background: rgba(180, 245, 60, 0.07);
  color: var(--lime);
  font-size: 14px; font-weight: 800;
  cursor: pointer;
}
.add-second-btn:active { transform: scale(0.99); }
/* во второй тренировке нельзя выбрать «Отдых» */
.second-mode [data-f="typeSwitch"] { display: none; }
/* в календаре — маленькая метка «×2» на днях с двумя тренировками */
.cal-cell.double { position: relative; }
.cal-cell.double::after {
  content: '×2';
  position: absolute;
  top: 1px; right: 3px;
  font-size: 8px; font-weight: 900;
  color: #0b0d10;
}
#editSessionSwitch { margin-bottom: 12px; }

/* ---------- Анкета для Fom ---------- */
.athlete-card { border-color: rgba(155, 107, 255, 0.3); }
.athlete-summary { white-space: pre-line; font-size: 14px; line-height: 1.5; margin: 8px 0 4px; color: #d9dde6; }
.athlete-note { font-size: 12px; }
.athlete-note.center { text-align: center; margin: -6px 0 12px; }
.athlete-sheet { max-height: 88vh; overflow-y: auto; }
.af-label { margin: 14px 0 8px; }
.af-sex { margin-bottom: 4px; }
.af-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.af-grid input { padding: 10px 6px; text-align: center; font-size: 15px; }
.athlete-sheet textarea { width: 100%; }
.athlete-sheet .btn-row { margin-top: 16px; }


/* =====================================================================
   Наши иконки
   ===================================================================== */
.ico { width: 1.15em; height: 1.15em; flex: 0 0 auto; vertical-align: -0.2em; overflow: visible; }
.stat-icon .ico { width: 21px; height: 21px; }
.streak-pill .ico { width: 17px; height: 17px; }
.card-label .ico { width: 20px; height: 20px; }
.date-input-wrap .ico { width: 20px; height: 20px; color: var(--muted); margin-bottom: 8px; }
.history-ico .ico { width: 21px; height: 21px; }
.seg-btn .ico { width: 18px; height: 18px; vertical-align: -0.25em; }
.seg-btn.active .ico { color: #0b0d10; }
.ghost-btn .ico { width: 17px; height: 17px; vertical-align: -0.22em; }
.tag .ico, .mini-stats .ico, .friend-streak .ico, .gift-badge .ico, .gift-status .ico { width: 1.05em; height: 1.05em; vertical-align: -0.18em; }
.sheet-title .ico { width: 20px; height: 20px; vertical-align: -0.22em; }
.gift-rules .ico, .gift-sub .ico, .athlete-summary .ico, .wk-date .ico, .gift-winner .ico { width: 1.1em; height: 1.1em; vertical-align: -0.2em; }
.done-title { display: flex; align-items: center; gap: 8px; }
.done-title .ico { width: 22px; height: 22px; }
.done-block-title { display: flex; align-items: center; gap: 6px; }
.done-block-title .ico { width: 18px; height: 18px; }
.gift-title .ico { width: 16px; height: 16px; vertical-align: -0.2em; }

/* =====================================================================
   Барабан подарков в розыгрыше
   ===================================================================== */
.gift-slot {
  position: relative;
  flex: 0 0 auto;
  width: 52px; height: 52px;
  border-radius: 16px;
  border: 1px solid rgba(255, 196, 77, 0.45);
  background: radial-gradient(circle at 50% 35%, rgba(255, 196, 77, 0.22), rgba(255, 255, 255, 0.03) 70%);
  box-shadow: inset 0 0 14px rgba(255, 196, 77, 0.15), 0 0 16px rgba(255, 196, 77, 0.12);
  overflow: hidden;
  padding: 0;
  cursor: pointer;
}
.gift-row.month .gift-slot {
  border-color: rgba(155, 107, 255, 0.6);
  background: radial-gradient(circle at 50% 35%, rgba(155, 107, 255, 0.3), rgba(255, 255, 255, 0.03) 70%);
  box-shadow: inset 0 0 14px rgba(155, 107, 255, 0.2), 0 0 18px rgba(155, 107, 255, 0.2);
}
/* блик сверху и снизу — как у настоящего барабана */
.gift-slot::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(10, 12, 17, 0.55), transparent 30%, transparent 70%, rgba(10, 12, 17, 0.55));
  pointer-events: none;
}
.gift-slot-item {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px;
  line-height: 1;
}
.gift-slot-item.in { animation: slot-in 0.38s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
.gift-slot-item.out { animation: slot-out 0.38s ease-in both; }
.gift-slot-item.fast.in { animation-duration: 0.12s; animation-timing-function: linear; }
.gift-slot-item.fast.out { animation-duration: 0.12s; animation-timing-function: linear; }
@keyframes slot-in { from { transform: translateY(100%); filter: blur(2px); } to { transform: none; filter: none; } }
@keyframes slot-out { from { transform: none; } to { transform: translateY(-100%); filter: blur(2px); } }
.gift-slot:active { transform: scale(0.95); }
.gift-maybe { font-size: 12px; color: var(--muted); margin-top: 2px; }
.gift-maybe b { color: var(--text); font-weight: 700; }

/* =====================================================================
   Наше окно-сообщение
   ===================================================================== */
.dlg-backdrop {
  position: fixed; inset: 0; z-index: 95;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: rgba(5, 6, 10, 0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: dlg-fade 0.18s ease both;
}
.dlg-backdrop.closing { animation: dlg-fade-out 0.16s ease both; }
.dlg {
  width: min(100%, 340px);
  padding: 22px 20px 16px;
  border-radius: 26px;
  text-align: center;
  background: linear-gradient(180deg, #1f2533, #141820);
  border: 1px solid var(--border-strong);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(155, 107, 255, 0.12);
  animation: dlg-pop 0.26s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
.dlg-backdrop.closing .dlg { animation: dlg-pop-out 0.16s ease both; }
.dlg-icon {
  width: 56px; height: 56px;
  margin: 0 auto 12px;
  border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border);
  color: #cfd5e2;
}
.dlg-icon .ico { width: 30px; height: 30px; }
.dlg-title { font-family: var(--font-head); font-weight: 700; font-size: 17px; line-height: 1.25; margin-bottom: 8px; }
.dlg-text { color: #c3c9d6; font-size: 14px; line-height: 1.5; }
.dlg-btns { display: flex; gap: 8px; margin-top: 18px; }
.dlg-btn {
  flex: 1;
  padding: 13px 10px;
  border-radius: 16px;
  border: 1px solid var(--border-strong);
  background: rgba(255, 255, 255, 0.05);
  font-weight: 700; font-size: 15px;
  cursor: pointer;
}
.dlg-btn.main { background: var(--grad-lime); color: #0b0d10; border-color: transparent; }
.dlg-btn.main.danger { background: var(--danger); color: #fff; }
.dlg-btn:active { transform: scale(0.97); }
@keyframes dlg-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dlg-fade-out { to { opacity: 0; } }
@keyframes dlg-pop { from { opacity: 0; transform: scale(0.9) translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes dlg-pop-out { to { opacity: 0; transform: scale(0.95); } }

/* =====================================================================
   Клавиатура открыта: прячем нижнюю панель, чат — на всю высоту
   ===================================================================== */
.bottom-nav { transition: opacity 0.15s ease, transform 0.15s ease; }
body.kb-open .bottom-nav { opacity: 0; pointer-events: none; transform: translate(-50%, 24px); visibility: hidden; }
body.kb-open { padding-bottom: 24px; }
body.kb-open .swipe-back { display: none; }
body.chat-open.kb-open .topbar { display: none; }
body.chat-open.kb-open .chat-section {
  height: calc(var(--app-h, 100vh) - env(safe-area-inset-top, 0px) - 12px);
  padding-top: 8px;
}
body.chat-open.kb-open { padding-bottom: 0; }

/* =====================================================================
   Знакомство с приложением
   ===================================================================== */
.tour {
  position: fixed; inset: 0; z-index: 90;
  display: flex; flex-direction: column;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 0 calc(20px + env(safe-area-inset-bottom, 0px));
  background:
    radial-gradient(500px 380px at 100% 0%, rgba(155, 107, 255, 0.22), transparent 60%),
    radial-gradient(460px 360px at 0% 100%, rgba(180, 245, 60, 0.12), transparent 60%),
    var(--bg);
  animation: dlg-fade 0.3s ease both;
}
.tour.closing { animation: dlg-fade-out 0.25s ease both; }
.tour-skip {
  align-self: flex-end;
  margin-right: 16px;
  border: none; background: none;
  color: var(--muted);
  font-size: 14px; font-weight: 700;
  padding: 8px 4px;
  cursor: pointer;
}
.tour-track {
  flex: 1;
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.tour-track::-webkit-scrollbar { display: none; }
.tour-slide {
  flex: 0 0 100%;
  scroll-snap-align: center;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center;
  padding: 0 30px;
}
.tour-art {
  width: 128px; height: 128px;
  margin-bottom: 28px;
  border-radius: 40px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, var(--card-top), var(--card-bottom));
  border: 1px solid var(--border-strong);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 60px rgba(155, 107, 255, 0.18);
  color: #cfd5e2;
}
.tour-art .ico { width: 64px; height: 64px; }
.tour-logo { font-family: var(--font-head); font-weight: 700; font-size: 26px; display: flex; align-items: flex-end; gap: 3px; }
.tour-fom { width: 64px; height: 64px; font-size: 30px; border-radius: 20px; }
.tour-title { font-family: var(--font-head); font-weight: 700; font-size: 23px; line-height: 1.2; margin-bottom: 12px; }
.tour-text { color: #c3c9d6; font-size: 15px; line-height: 1.55; max-width: 340px; }
.tour-fill { margin-top: 20px; }
.tour-dots { display: flex; justify-content: center; gap: 7px; margin: 14px 0 16px; }
.tour-dots i { width: 7px; height: 7px; border-radius: 999px; background: rgba(255, 255, 255, 0.18); transition: width 0.2s ease, background 0.2s ease; }
.tour-dots i.on { width: 22px; background: var(--lime); box-shadow: 0 0 10px rgba(180, 245, 60, 0.6); }
.tour-next { margin: 0 20px; width: auto; }

/* ---------- Поддержка (внизу профиля) ---------- */
.support-card { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
.support-ico {
  width: 42px; height: 42px; flex: 0 0 auto;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(155, 107, 255, 0.14);
  border: 1px solid rgba(155, 107, 255, 0.3);
  color: #cfd5e2;
}
.support-ico .ico { width: 22px; height: 22px; }
.support-main { flex: 1; min-width: 0; }
.support-title { font-weight: 800; font-size: 15px; margin-bottom: 2px; }

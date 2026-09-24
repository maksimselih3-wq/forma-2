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
let workoutsByDate = {}; // 'ГГГГ-ММ-ДД' -> запись

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
function showScreen(targetId) {
  ALL_SCREENS.forEach((id) => {
    const el = $(id);
    if (el) el.classList.toggle('hidden', id !== targetId);
  });
  document.querySelectorAll('.bottom-nav [data-screen]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === (NAV_PARENT[targetId] || targetId));
  });
  document.body.classList.toggle('chat-open', targetId === 'chatScreen');
  window.scrollTo(0, 0);
}

// =====================================================================
//  ФОРМА ЗАПИСИ — одна и та же для «новой записи» и «редактирования»
// =====================================================================
const FORM_TEMPLATE = `
  <section class="card smart-card">
    <div class="card-label">✨ Умный ввод</div>
    <div class="card-hint smart-hint">Опиши тренировку своими словами — Fom сам разложит всё по полям ниже.</div>
    <textarea data-f="smartText" rows="3" placeholder="Например: разминка 3 км + СБУ, 6×400 по 65 сек отдых 2 мин, присед 5×5 80 кг, пульс ср 150 макс 182, в паузах до 110. Было тяжело."></textarea>
    <button type="button" class="smart-btn" data-f="smartBtn">✨ Разложить по полям</button>
    <div class="status-msg" data-f="smartStatus"></div>
  </section>

  <div class="segmented" data-f="typeSwitch">
    <button type="button" class="seg-btn active" data-type="training">🏃 Тренировка</button>
    <button type="button" class="seg-btn" data-type="rest">😴 Отдых</button>
  </div>

  <div data-f="trainingFields">
    <section class="card">
      <div class="card-label">Разминка</div>
      <textarea data-f="warmup" rows="2" placeholder="Например: 3 км трусцой + суставная"></textarea>
    </section>

    <section class="card">
      <div class="card-head">
        <div class="card-label">🏃 Беговая работа</div>
        <div class="card-hint">метры · кол-во · время · отдых</div>
      </div>
      <div data-f="setsList"></div>
      <button type="button" class="add-btn" data-f="addSet">+ Добавить отрезок</button>
    </section>

    <section class="card">
      <div class="card-head">
        <div class="card-label">🏋️ Силовая / ОФП</div>
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
      <div class="card-label">❤️ Пульс, уд/мин <span class="optional">необязательно</span></div>
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

function createWorkoutForm(root) {
  root.innerHTML = FORM_TEMPLATE;
  const f = (name) => root.querySelector(`[data-f="${name}"]`);

  let type = 'training';
  let sets = [];      // беговые отрезки: { distance_m, reps, time_or_pace, rest_between }
  let exercises = []; // силовая/ОФП:     { name, sets, reps, weight }

  function setType(t) {
    type = t === 'rest' ? 'rest' : 'training';
    f('typeSwitch').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
    f('trainingFields').classList.toggle('hidden', type !== 'training');
  }
  f('typeSwitch').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => setType(b.dataset.type)));

  // --- беговые отрезки ---
  function renderSets() {
    const list = f('setsList');
    list.innerHTML = '';
    sets.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <input type="number" inputmode="numeric" placeholder="Метры" value="${esc(s.distance_m)}" data-k="distance_m" />
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
      status.textContent = '✅ Готово! Проверь поля ниже и сохрани запись.';
    } catch (err) {
      console.error(err);
      status.textContent = err.data?.error || 'Не получилось разобрать. Попробуй ещё раз.';
    } finally {
      f('smartBtn').disabled = false;
    }
  });

  return {
    get type() { return type; },
    getPayload() {
      return {
        type,
        warmup: f('warmup').value,
        cooldown: f('cooldown').value,
        feeling: Number(f('feeling').value),
        rpe: Number(f('rpe').value),
        notes: f('notes').value,
        visibility: f('visibility').checked ? 'public' : 'private',
        sets: type === 'training' ? sets : [],
        exercises: type === 'training' ? exercises : [],
        hr_avg: f('hrAvg').value,
        hr_max: f('hrMax').value,
        hr_min: f('hrMin').value,
      };
    },
    setData(w) {
      setType(w.type);
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
    },
    reset() {
      this.setData({ type: 'training', visibility: f('visibility').checked ? 'public' : 'private' });
      f('smartText').value = '';
      f('smartStatus').textContent = '';
    },
  };
}

const mainForm = createWorkoutForm($('mainFormFields'));
const editForm = createWorkoutForm($('editFormFields'));

// ---------- Инициализация ----------
async function init() {
  setEntryDate(localDateStr());
  showScreen('mainScreen');
  try {
    const { user } = await api('/api/auth/login', { method: 'POST' });
    currentUser = user;
    $('shareCalendarToggle').checked = user.share_calendar !== false;
    updateAvatar();
    updateFriendsBadge();
    setInterval(updateFriendsBadge, 60000); // раз в минуту проверяем новые реакции и заявки
    updateStats();
    await loadMyWorkouts();
    renderEntryState();
  } catch (err) {
    console.error('Login failed', err);
    $('statusMsg').textContent = 'Не удалось связаться с сервером. Попробуй открыть приложение ещё раз.';
  }
}

async function loadMyWorkouts() {
  const { workouts, streak } = await api('/api/workouts');
  myWorkouts = workouts.map((w) => ({ ...w, date: normDate(w.date) }));
  workoutsByDate = {};
  myWorkouts.forEach((w) => { workoutsByDate[w.date] = w; });
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
  $('profileRecord').textContent = `🏆 рекорд ${best} дн.`;
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
  if (!dateStr || dateStr > today) dateStr = today; // в будущее писать нельзя

  entryDate = dateStr;

  const input = $('entryDate');
  input.max = today;
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
  const existing = workoutsByDate[entryDate];
  const form = $('entryForm');
  const done = $('entryDone');

  if (!existing) {
    done.classList.add('hidden');
    form.classList.remove('hidden');
    return;
  }

  form.classList.add('hidden');
  done.classList.remove('hidden');

  const label = relativeDateLabel(entryDate);
  $('doneTitle').textContent =
    justSavedDate === entryDate ? `✅ Запись за ${label} сохранена` : `✅ За ${label} запись уже есть`;

  const lines = [existing.type === 'rest' ? '😴 День отдыха' : '🏃 Тренировка', ...buildDetailLines(existing)];
  $('doneSummary').textContent = lines.join('\n');

  const fbBox = $('doneFeedbackBox');
  if (existing.ai_feedback) {
    $('doneFeedbackText').textContent = existing.ai_feedback;
    fbBox.classList.remove('hidden');
  } else {
    fbBox.classList.add('hidden');
  }
}

document.querySelectorAll('.date-picker-row .chip').forEach((chip) => {
  chip.addEventListener('click', () => setEntryDate(addDays(localDateStr(), -Number(chip.dataset.shift))));
});
$('entryDate').addEventListener('change', (e) => setEntryDate(e.target.value));

$('doneEditBtn').addEventListener('click', () => {
  const existing = workoutsByDate[entryDate];
  if (existing) openEditScreen(existing.id, 'mainScreen');
});
$('doneShareBtn').addEventListener('click', () => {
  const existing = workoutsByDate[entryDate];
  if (existing) shareWorkout(existing);
});

// ---------- Сохранение новой записи ----------
$('saveBtn').addEventListener('click', async () => {
  const statusEl = $('statusMsg');
  const saveBtn = $('saveBtn');
  const payload = { date: entryDate, ...mainForm.getPayload() };

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
      workoutsByDate[w.date] = w;
    }

    statusEl.textContent = '';
    justSavedDate = entryDate;
    mainForm.reset();
    renderEntryState();
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
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

  try {
    await loadMyWorkouts();
    renderCalendar();
    renderHistory();
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
    const w = workoutsByDate[ds];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell';
    cell.textContent = d;

    if (w) {
      cell.classList.add(w.type === 'training' ? 'has-training' : 'has-rest');
      if (w.type === 'training') trainings++; else rests++;
    }
    if (ds === today) cell.classList.add('today');

    if (ds > today) {
      cell.classList.add('future');
      cell.disabled = true;
    } else {
      cell.addEventListener('click', () => {
        if (w) {
          openEditScreen(w.id, 'profileScreen');
        } else {
          setEntryDate(ds); // пустой день — форма новой записи на эту дату
          showScreen('mainScreen');
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

function renderHistory() {
  const list = $('historyList');
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
      <span class="history-ico ${isTraining ? 'tr' : 'rs'}">${isTraining ? '🏃' : '😴'}</span>
      <span class="history-main">
        <span class="history-date">${esc(formatWithWeekday(w.date))}</span>
        <span class="history-sub">${isTraining ? 'Тренировка' : 'Отдых'}${bits.length ? ' · ' + esc(bits.join(' · ')) : ''}</span>
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

// Сжимаем фото прямо на телефоне: квадрат 400×400, JPEG — чтобы быстро грузилось
function imageToSquareJpeg(file, size = 400) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      let quality = 0.85;
      let data = canvas.toDataURL('image/jpeg', quality);
      while (data.length > 90000 && quality > 0.3) {
        quality -= 0.1;
        data = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото')); };
    img.src = url;
  });
}

$('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const image = await imageToSquareJpeg(file);
    const { avatar_data } = await api('/api/auth/avatar', { method: 'POST', body: JSON.stringify({ image }) });
    currentUser.avatar_data = avatar_data;
    updateAvatar();
  } catch (err) {
    console.error(err);
    alertMsg(err.data?.error || 'Не удалось загрузить фото. Попробуй другое.');
  }
});

function alertMsg(text) {
  if (tg?.showAlert) tg.showAlert(text); else alert(text);
}

// =====================================================================
//  ДРУЗЬЯ: лента, профиль друга, реакции, комментарии, активность
// =====================================================================
const REACTIONS = ['🔥', '👏', '💪', '🚀'];

function haptic(kind = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(kind); } catch (e) {}
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

function personName(u) {
  return u?.first_name || (u?.username ? '@' + u.username : 'Спортсмен');
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
        <div class="wk-date">${esc(formatWithWeekday(normDate(w.date)))} · ${w.type === 'rest' ? '😴 Отдых' : '🏃 Тренировка'}</div>
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
          if (!confirm('Удалить комментарий?')) return;
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
    const { unread, requests } = await api('/api/friends/activity/count');
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
            <span class="friend-sub">${esc(lastTrainingLabel(fr.last_training))}</span>
          </span>
          <span class="friend-streak">🔥 ${esc(fr.current_streak ?? 0)}</span>
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
    $('fpEyebrow').textContent = isMe ? 'Так тебя видят друзья' : 'Друг';
    $('fpUsername').textContent = u.username ? '@' + u.username : 'спортсмен';
    $('fpStreak').textContent = u.current_streak ?? 0;
    $('fpMonth').textContent = fpData.stats?.last30 ?? 0;
    $('fpTotal').textContent = fpData.stats?.total ?? 0;
    $('fpRecord').textContent = `🏆 рекорд ${u.longest_streak ?? 0} дн.`;
    $('fpRecord').classList.toggle('hidden', (u.longest_streak ?? 0) < 2);
    $('fpRemoveBtn').classList.toggle('hidden', isMe);

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
  if (!confirm(`Удалить ${personName(fpData.user)} из друзей?`)) return;
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

$('insightsBtn').addEventListener('click', () => showScreen('insightsScreen'));

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
      '<div class="chat-empty">Привет! Я Fom, твой ИИ-тренер 👋<br />Спроси про свои тренировки — например, «сколько я бегал на этой неделе?» или «не перегружаюсь ли я?»</div>';
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
  if (w.type === 'training') {
    if (w.warmup) lines.push(`Разминка: ${w.warmup}`);
    const setLines = (Array.isArray(w.sets) ? w.sets : [])
      .map((s) => {
        const parts = [];
        if (s.distance_m) parts.push(`${s.distance_m}м`);
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
  lines.push(w.type === 'rest' ? '😴 День отдыха' : '🏃 Тренировка');
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
  statusEl.textContent = 'Сохраняю...';

  try {
    const result = await api(`/api/workouts/${currentEditWorkout.id}`, {
      method: 'PUT',
      body: JSON.stringify(editForm.getPayload()),
    });
    currentEditWorkout = { ...currentEditWorkout, ...result.workout, date: normDate(result.workout.date) };
    statusEl.textContent = 'Сохранено ✓';
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
  if (!confirm('Точно удалить эту запись? Это необратимо.')) return;

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

init();

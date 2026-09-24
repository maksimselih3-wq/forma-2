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
const ALL_SCREENS = ['mainScreen', 'profileScreen', 'friendsScreen', 'insightsScreen', 'chatScreen', 'editScreen'];
function showScreen(targetId) {
  ALL_SCREENS.forEach((id) => {
    const el = $(id);
    if (el) el.classList.toggle('hidden', id !== targetId);
  });
  document.querySelectorAll('.bottom-nav [data-screen]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === targetId);
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
    updateAvatar();
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

  $('streakCurrent').textContent = cur;
  $('statStreak').textContent = cur;
  $('streakBest').textContent = best;
  $('statWeek').textContent = weekTrainings;
  $('profileStreak').textContent = cur;
  $('profileBest').textContent = best;
  $('profileTotal').textContent = total;
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

// ---------- Друзья ----------
async function loadFriendsScreen() {
  const statusEl = $('friendRequestStatus');
  statusEl.textContent = '';

  try {
    const [{ requests }, { friends }] = await Promise.all([api('/api/friends/requests'), api('/api/friends')]);

    const reqList = $('incomingRequestsList');
    const reqBlock = $('incomingRequestsBlock');
    reqList.innerHTML = '';
    reqBlock.classList.toggle('hidden', requests.length === 0);
    requests.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'friend-item';
      div.innerHTML = `
        <span class="friend-ava">${esc((r.first_name || r.username || '?').slice(0, 1).toUpperCase())}</span>
        <span class="friend-name">${esc(r.first_name || '')}${isVerified(r.username) ? VERIFIED_BADGE : ''} <span class="muted">${r.username ? '@' + esc(r.username) : ''}</span></span>
        <span class="friend-actions">
          <button class="mini-btn accept" type="button">Принять</button>
          <button class="mini-btn decline" type="button">✕</button>
        </span>`;
      div.querySelector('.accept').addEventListener('click', async () => {
        await api('/api/friends/accept', { method: 'POST', body: JSON.stringify({ friendshipId: r.friendship_id }) });
        loadFriendsScreen();
      });
      div.querySelector('.decline').addEventListener('click', async () => {
        await api('/api/friends/decline', { method: 'POST', body: JSON.stringify({ friendshipId: r.friendship_id }) });
        loadFriendsScreen();
      });
      reqList.appendChild(div);
    });

    const friendsList = $('friendsList');
    friendsList.innerHTML = '';
    if (friends.length === 0) {
      friendsList.innerHTML = '<div class="empty-hint">Пока нет друзей — добавь кого-нибудь по username выше.</div>';
    } else {
      friends.forEach((fr) => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
          <span class="friend-ava">${esc((fr.first_name || fr.username || '?').slice(0, 1).toUpperCase())}</span>
          <span class="friend-name">${esc(fr.first_name || '')}${isVerified(fr.username) ? VERIFIED_BADGE : ''} <span class="muted">${fr.username ? '@' + esc(fr.username) : ''}</span></span>
          <span class="friend-streak">🔥 ${esc(fr.current_streak ?? 0)}</span>`;
        friendsList.appendChild(div);
      });
    }
  } catch (err) {
    console.error('Failed to load friends screen', err);
    statusEl.textContent = 'Не удалось загрузить друзей.';
  }
}

$('friendsBtn').addEventListener('click', () => {
  showScreen('friendsScreen');
  loadFriendsScreen();
});

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

async function openEditScreen(workoutId, returnTo = 'profileScreen') {
  editReturnScreen = returnTo;
  showScreen('editScreen');
  $('editStatusMsg').textContent = 'Загружаю...';

  try {
    const { workout } = await api(`/api/workouts/${workoutId}`);
    workout.date = normDate(workout.date);
    currentEditWorkout = workout;
    $('editDateLabel').textContent = formatWithWeekday(workout.date);
    editForm.setData(workout);
    $('editStatusMsg').textContent = '';
  } catch (err) {
    console.error('Failed to load workout', err);
    $('editStatusMsg').textContent = 'Не удалось загрузить запись.';
  }
}

function leaveEditScreen() {
  showScreen(editReturnScreen);
  if (editReturnScreen === 'profileScreen') loadProfileScreen();
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

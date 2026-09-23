// ⚠️ Замени на адрес своего задеплоенного бэкенда (шаг "Запустить сервер онлайн")
const API_BASE = 'https://forma-production-9c7a.up.railway.app';

const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

let currentUser = null;
let lastSavedWorkout = null;
let sets = []; // { distance_m, reps, time_or_pace, rest_between }
let selectedType = 'training';

// Все мои записи (для календаря и подсказки «на эту дату уже есть запись»)
let myWorkouts = [];
let workoutsByDate = {}; // 'ГГГГ-ММ-ДД' -> запись

// Дата, за которую сейчас заполняется форма на главном экране
let entryDate = null;

// ---------- Даты ----------
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function pad2(n) { return String(n).padStart(2, '0'); }

// Дата по часам телефона в формате 'ГГГГ-ММ-ДД'.
// (Раньше тут был toISOString — он отдаёт дату по Гринвичу, и ночью по Москве «сегодня» было вчерашним днём.)
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

// ---------- Утилиты API ----------
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

// ---------- Единая функция переключения экранов (защита от пропуска элементов) ----------
const ALL_SCREENS = ['mainScreen', 'profileScreen', 'friendsScreen', 'insightsScreen', 'chatScreen', 'editScreen'];
function showScreen(targetId) {
  ALL_SCREENS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) {
      console.error('Screen element not found:', id);
      return;
    }
    if (id === targetId) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
  window.scrollTo(0, 0);
}

// ---------- Инициализация ----------
async function init() {
  setEntryDate(localDateStr());
  try {
    const { user } = await api('/api/auth/login', { method: 'POST' });
    currentUser = user;
    updateAvatar();
    updateStreakBar();
    await loadMyWorkouts();
    updateExistingHint();
  } catch (err) {
    console.error('Login failed', err);
    document.getElementById('statusMsg').textContent =
      'Не удалось связаться с сервером. Проверь API_BASE в app.js.';
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
    updateStreakBar();
  }
}

function applyStreak(streak) {
  if (!currentUser || !streak) return;
  currentUser.current_streak = streak.current;
  currentUser.longest_streak = streak.longest;
  updateStreakBar();
}

function updateAvatar() {
  const tgUser = tg?.initDataUnsafe?.user;
  const img = document.getElementById('avatarImg');
  const fallback = document.getElementById('avatarFallback');
  if (tgUser?.photo_url) {
    img.src = tgUser.photo_url;
    img.style.display = 'block';
    fallback.style.display = 'none';
  }
}

function updateStreakBar() {
  document.getElementById('streakCurrent').textContent = currentUser?.current_streak ?? 0;
  document.getElementById('streakBest').textContent = currentUser?.longest_streak ?? 0;
}

// ---------- Выбор даты записи ----------
function setEntryDate(dateStr) {
  const today = localDateStr();
  if (!dateStr || dateStr > today) dateStr = today; // в будущее писать нельзя

  entryDate = dateStr;

  const input = document.getElementById('entryDate');
  input.max = today;
  input.value = dateStr;

  document.getElementById('entryTitle').textContent = `Запись за ${relativeDateLabel(dateStr)}`;

  document.querySelectorAll('.date-picker-row .chip').forEach((chip) => {
    const chipDate = addDays(today, -Number(chip.dataset.shift));
    chip.classList.toggle('active', chipDate === dateStr);
  });

  // сообщения от прошлого сохранения относятся к другой дате — прячем
  document.getElementById('aiFeedbackBox').style.display = 'none';
  document.getElementById('shareTodayBtn').style.display = 'none';
  document.getElementById('statusMsg').textContent = '';

  updateExistingHint();
}

function updateExistingHint() {
  const hint = document.getElementById('existingHint');
  const saveBtn = document.getElementById('saveBtn');
  const existing = workoutsByDate[entryDate];

  if (existing) {
    const kind = existing.type === 'training' ? 'тренировка' : 'отдых';
    document.getElementById('existingHintText').textContent =
      `На ${relativeDateLabel(entryDate)} уже есть запись (${kind}). Если сохранить форму, она заменит старую.`;
    hint.classList.remove('hidden');
    saveBtn.textContent = 'Перезаписать запись';
  } else {
    hint.classList.add('hidden');
    saveBtn.textContent = 'Сохранить запись';
  }
}

document.querySelectorAll('.date-picker-row .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    setEntryDate(addDays(localDateStr(), -Number(chip.dataset.shift)));
  });
});

document.getElementById('entryDate').addEventListener('change', (e) => {
  setEntryDate(e.target.value);
});

document.getElementById('openExistingBtn').addEventListener('click', () => {
  const existing = workoutsByDate[entryDate];
  if (existing) openEditScreen(existing.id, 'mainScreen');
});

// ---------- Переключатель тренировка/отдых ----------
document.querySelectorAll('#mainScreen .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mainScreen .seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedType = btn.dataset.type;
    document.getElementById('trainingFields').style.display =
      selectedType === 'training' ? 'block' : 'none';
  });
});

// ---------- Повторы (sets) ----------
function renderSets() {
  const list = document.getElementById('setsList');
  list.innerHTML = '';
  sets.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <input type="number" placeholder="Метры" value="${s.distance_m ?? ''}" data-field="distance_m" />
      <input type="number" placeholder="Кол-во" value="${s.reps ?? ''}" data-field="reps" />
      <input type="text" placeholder="Темп/время" value="${s.time_or_pace ?? ''}" data-field="time_or_pace" />
      <input type="text" placeholder="Отдых" value="${s.rest_between ?? ''}" data-field="rest_between" />
      <button type="button" data-idx="${i}">✕</button>
    `;
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', () => {
        sets[i][inp.dataset.field] = inp.value;
      });
    });
    row.querySelector('button').addEventListener('click', () => {
      sets.splice(i, 1);
      renderSets();
    });
    list.appendChild(row);
  });
}

document.getElementById('addSetBtn').addEventListener('click', () => {
  sets.push({ distance_m: '', reps: '', time_or_pace: '', rest_between: '' });
  renderSets();
});

// ---------- Слайдеры ----------
document.getElementById('feeling').addEventListener('input', (e) => {
  document.getElementById('feelingVal').textContent = e.target.value;
});
document.getElementById('rpe').addEventListener('input', (e) => {
  document.getElementById('rpeVal').textContent = e.target.value;
});

// ---------- Сохранение записи ----------
document.getElementById('saveBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('statusMsg');
  const aiBox = document.getElementById('aiFeedbackBox');
  aiBox.style.display = 'none';
  document.getElementById('shareTodayBtn').style.display = 'none';
  statusEl.textContent = 'Сохраняю...';

  const payload = {
    date: entryDate,
    type: selectedType,
    warmup: document.getElementById('warmup').value,
    cooldown: document.getElementById('cooldown').value,
    feeling: Number(document.getElementById('feeling').value),
    rpe: Number(document.getElementById('rpe').value),
    notes: document.getElementById('notes').value,
    visibility: document.getElementById('visibility').checked ? 'public' : 'private',
    sets: selectedType === 'training' ? sets : [],
  };

  try {
    const result = await api('/api/workouts', { method: 'POST', body: JSON.stringify(payload) });
    statusEl.textContent = `Сохранено за ${relativeDateLabel(entryDate)} ✓`;

    if (result.workout?.ai_feedback) {
      document.getElementById('aiFeedbackText').textContent = result.workout.ai_feedback;
      aiBox.style.display = 'block';
    }

    lastSavedWorkout = { ...result.workout, date: normDate(result.workout.date), sets: payload.sets };
    document.getElementById('shareTodayBtn').style.display = 'block';

    applyStreak(result.streak);
    // обновляем список записей (для календаря и подсказки)
    await loadMyWorkouts();
  } catch (err) {
    console.error(err);
    statusEl.textContent = err.data?.error || 'Ошибка сохранения. Попробуй ещё раз.';
  }
});

document.getElementById('shareTodayBtn').addEventListener('click', () => {
  if (lastSavedWorkout) shareWorkout(lastSavedWorkout);
});

// ---------- Экран профиля + календарь ----------
let calMonth = new Date(); // какой месяц показывает календарь (любой день этого месяца)

async function loadProfileScreen() {
  const tgUser = tg?.initDataUnsafe?.user;
  document.getElementById('profileAvatar').src = tgUser?.photo_url || '';
  document.getElementById('profileName').textContent =
    [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') || 'Спортсмен';
  document.getElementById('profileUsername').textContent = tgUser?.username ? '@' + tgUser.username : '';

  renderCalendar(); // сразу рисуем по тому, что уже загружено
  renderHistory();

  try {
    await loadMyWorkouts();
    renderCalendar();
    renderHistory();
  } catch (err) {
    console.error('Failed to load history', err);
  }

  document.getElementById('profileStreak').textContent = currentUser?.current_streak ?? 0;
  document.getElementById('profileBest').textContent = currentUser?.longest_streak ?? 0;
}

function renderCalendar() {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const today = localDateStr();
  const now = new Date();

  document.getElementById('calTitle').textContent = `${MONTHS[m]} ${y}`;
  // в будущие месяцы листать незачем
  document.getElementById('calNext').disabled =
    y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());

  const grid = document.getElementById('calGrid');
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
          // пустой день — открываем форму новой записи на эту дату
          setEntryDate(ds);
          showScreen('mainScreen');
        }
      });
    }
    grid.appendChild(cell);
  }

  document.getElementById('calSummary').textContent =
    trainings + rests === 0
      ? 'В этом месяце записей пока нет.'
      : `За месяц: тренировок — ${trainings}, дней отдыха — ${rests}.`;
}

function renderHistory() {
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '';
  if (myWorkouts.length === 0) {
    historyList.innerHTML = '<div class="empty-hint">Записей пока нет.</div>';
    return;
  }
  myWorkouts.slice(0, 10).forEach((w) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.textContent = `${formatWithWeekday(w.date)} — ${w.type === 'training' ? 'тренировка' : 'отдых'}${
      w.rpe && w.type === 'training' ? `, RPE ${w.rpe}` : ''
    }`;
    div.addEventListener('click', () => openEditScreen(w.id, 'profileScreen'));
    historyList.appendChild(div);
  });
}

document.getElementById('calPrev').addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  renderCalendar();
});

document.getElementById('profileBtn').addEventListener('click', () => {
  calMonth = new Date(); // при каждом открытии — текущий месяц
  showScreen('profileScreen');
  loadProfileScreen();
});

document.getElementById('backBtn').addEventListener('click', () => {
  showScreen('mainScreen');
});

// ---------- Экран друзей ----------
async function loadFriendsScreen() {
  const statusEl = document.getElementById('friendRequestStatus');
  statusEl.textContent = '';

  try {
    const [{ requests }, { friends }] = await Promise.all([
      api('/api/friends/requests'),
      api('/api/friends'),
    ]);

    const reqList = document.getElementById('incomingRequestsList');
    const reqBlock = document.getElementById('incomingRequestsBlock');
    reqList.innerHTML = '';
    if (requests.length === 0) {
      reqBlock.style.display = 'none';
    } else {
      reqBlock.style.display = 'block';
      requests.forEach((r) => {
        const div = document.createElement('div');
        div.className = 'friend-request-item';
        div.innerHTML = `
          <span>${r.first_name || ''} ${r.username ? '@' + r.username : ''}</span>
          <span class="actions">
            <button class="accept-btn" data-id="${r.friendship_id}">Принять</button>
            <button class="decline-btn" data-id="${r.friendship_id}">Отклонить</button>
          </span>
        `;
        div.querySelector('.accept-btn').addEventListener('click', async () => {
          await api('/api/friends/accept', { method: 'POST', body: JSON.stringify({ friendshipId: r.friendship_id }) });
          loadFriendsScreen();
        });
        div.querySelector('.decline-btn').addEventListener('click', async () => {
          await api('/api/friends/decline', { method: 'POST', body: JSON.stringify({ friendshipId: r.friendship_id }) });
          loadFriendsScreen();
        });
        reqList.appendChild(div);
      });
    }

    const friendsList = document.getElementById('friendsList');
    friendsList.innerHTML = '';
    if (friends.length === 0) {
      friendsList.innerHTML = '<div class="empty-hint">Пока нет друзей — добавь кого-нибудь по username выше.</div>';
    } else {
      friends.forEach((f) => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
          <span>${f.first_name || ''} ${f.username ? '@' + f.username : ''}</span>
          <span class="friend-streak">🔥 ${f.current_streak}</span>
        `;
        friendsList.appendChild(div);
      });
    }
  } catch (err) {
    console.error('Failed to load friends screen', err);
    statusEl.textContent = 'Не удалось загрузить друзей.';
  }
}

document.getElementById('friendsBtn').addEventListener('click', () => {
  showScreen('friendsScreen');
  loadFriendsScreen();
});

document.getElementById('friendsBackBtn').addEventListener('click', () => {
  showScreen('mainScreen');
});

document.getElementById('sendRequestBtn').addEventListener('click', async () => {
  const input = document.getElementById('friendUsernameInput');
  const statusEl = document.getElementById('friendRequestStatus');
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

// ---------- Экран разбора нагрузки ----------
let selectedInsightPeriod = 'week';

async function loadInsight() {
  const loadingEl = document.getElementById('insightLoading');
  const emptyEl = document.getElementById('insightEmpty');
  const boxEl = document.getElementById('insightBox');

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

    document.getElementById('insightText').innerHTML = renderMarkdownBold(insight);
    boxEl.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to load insight', err);
    loadingEl.classList.add('hidden');
    emptyEl.textContent = 'Не удалось получить разбор. Попробуй ещё раз.';
    emptyEl.classList.remove('hidden');
  }
}

document.getElementById('insightsBtn').addEventListener('click', () => {
  showScreen('insightsScreen');
});

document.getElementById('insightsBackBtn').addEventListener('click', () => {
  showScreen('mainScreen');
});

document.querySelectorAll('#insightsScreen .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#insightsScreen .seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedInsightPeriod = btn.dataset.period;
  });
});

document.getElementById('refreshInsightBtn').addEventListener('click', loadInsight);

// ---------- Чат с Fom ----------
let chatHistory = []; // { role: 'user'|'assistant', content: '...' } — хранится только пока открыто приложение

function renderMarkdownBold(text) {
  // Простой рендер **жирного** текста без сторонних библиотек
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderChatMessages() {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  if (chatHistory.length === 0) {
    container.innerHTML =
      '<div class="empty-hint">Привет! Я Fom, твой ИИ-тренер. Спроси меня про свои тренировки — например, «сколько я бегал на этой неделе?» или «не перегружаюсь ли я?»</div>';
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
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  chatHistory.push({ role: 'user', content: message });
  renderChatMessages();
  input.value = '';

  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'chat-bubble assistant';
  loadingBubble.textContent = 'Fom думает...';
  document.getElementById('chatMessages').appendChild(loadingBubble);
  document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;

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

document.getElementById('chatBtn').addEventListener('click', () => {
  showScreen('chatScreen');
  renderChatMessages();
});

document.getElementById('chatBackBtn').addEventListener('click', () => {
  showScreen('mainScreen');
});

document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

// ---------- Поделиться записью ----------
function buildShareText(w) {
  const lines = [];
  lines.push(w.type === 'rest' ? '😴 День отдыха' : '🏃 Тренировка');
  lines.push(`📅 ${formatWithWeekday(normDate(w.date))}`);

  if (w.type === 'training') {
    if (w.warmup) lines.push(`Разминка: ${w.warmup}`);
    if (Array.isArray(w.sets) && w.sets.length > 0) {
      lines.push('Основная работа:');
      w.sets.forEach((s, i) => {
        const parts = [];
        if (s.distance_m) parts.push(`${s.distance_m}м`);
        if (s.reps) parts.push(`x${s.reps}`);
        if (s.time_or_pace) parts.push(s.time_or_pace);
        if (s.rest_between) parts.push(`отдых ${s.rest_between}`);
        if (parts.length) lines.push(`${i + 1}. ${parts.join(' ')}`);
      });
    }
    if (w.cooldown) lines.push(`Заминка: ${w.cooldown}`);
    if (w.rpe) lines.push(`RPE: ${w.rpe}/10`);
  }
  if (w.feeling) lines.push(`Самочувствие: ${w.feeling}/10`);
  if (w.notes) lines.push(`Заметка: ${w.notes}`);

  return lines.join('\n');
}

function shareWorkout(w) {
  const text = buildShareText(w);
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('')}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank');
  }
}

document.getElementById('editShareBtn').addEventListener('click', () => {
  if (currentEditWorkout) shareWorkout(currentEditWorkout);
});

// ---------- Экран редактирования записи ----------
let currentEditWorkout = null;
let editSets = [];
let editReturnScreen = 'profileScreen'; // куда вернуться по кнопке «Назад»

function renderEditSets() {
  const list = document.getElementById('editSetsList');
  list.innerHTML = '';
  editSets.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <input type="number" placeholder="Метры" value="${s.distance_m ?? ''}" data-field="distance_m" />
      <input type="number" placeholder="Кол-во" value="${s.reps ?? ''}" data-field="reps" />
      <input type="text" placeholder="Темп/время" value="${s.time_or_pace ?? ''}" data-field="time_or_pace" />
      <input type="text" placeholder="Отдых" value="${s.rest_between ?? ''}" data-field="rest_between" />
      <button type="button">✕</button>
    `;
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', () => {
        editSets[i][inp.dataset.field] = inp.value;
      });
    });
    row.querySelector('button').addEventListener('click', () => {
      editSets.splice(i, 1);
      renderEditSets();
    });
    list.appendChild(row);
  });
}

document.getElementById('addEditSetBtn').addEventListener('click', () => {
  editSets.push({ distance_m: '', reps: '', time_or_pace: '', rest_between: '' });
  renderEditSets();
});

document.getElementById('editFeeling').addEventListener('input', (e) => {
  document.getElementById('editFeelingVal').textContent = e.target.value;
});
document.getElementById('editRpe').addEventListener('input', (e) => {
  document.getElementById('editRpeVal').textContent = e.target.value;
});

async function openEditScreen(workoutId, returnTo = 'profileScreen') {
  editReturnScreen = returnTo;
  showScreen('editScreen');
  document.getElementById('editStatusMsg').textContent = 'Загружаю...';

  try {
    const { workout } = await api(`/api/workouts/${workoutId}`);
    workout.date = normDate(workout.date);
    currentEditWorkout = workout;
    editSets = Array.isArray(workout.sets) ? workout.sets : [];

    document.getElementById('editDateLabel').textContent = formatWithWeekday(workout.date);
    document.getElementById('editWarmup').value = workout.warmup || '';
    document.getElementById('editCooldown').value = workout.cooldown || '';
    document.getElementById('editNotes').value = workout.notes || '';
    document.getElementById('editVisibility').checked = workout.visibility === 'public';
    document.getElementById('editFeeling').value = workout.feeling || 5;
    document.getElementById('editFeelingVal').textContent = workout.feeling || 5;
    document.getElementById('editRpe').value = workout.rpe || 5;
    document.getElementById('editRpeVal').textContent = workout.rpe || 5;
    document.getElementById('editTrainingFields').style.display = workout.type === 'training' ? 'block' : 'none';

    renderEditSets();
    document.getElementById('editStatusMsg').textContent = '';
  } catch (err) {
    console.error('Failed to load workout', err);
    document.getElementById('editStatusMsg').textContent = 'Не удалось загрузить запись.';
  }
}

function leaveEditScreen() {
  showScreen(editReturnScreen);
  if (editReturnScreen === 'profileScreen') {
    loadProfileScreen();
  } else {
    updateExistingHint();
  }
}

document.getElementById('editBackBtn').addEventListener('click', leaveEditScreen);

document.getElementById('editSaveBtn').addEventListener('click', async () => {
  if (!currentEditWorkout) return;
  const statusEl = document.getElementById('editStatusMsg');
  statusEl.textContent = 'Сохраняю...';

  const payload = {
    type: currentEditWorkout.type,
    warmup: document.getElementById('editWarmup').value,
    cooldown: document.getElementById('editCooldown').value,
    feeling: Number(document.getElementById('editFeeling').value),
    rpe: Number(document.getElementById('editRpe').value),
    notes: document.getElementById('editNotes').value,
    visibility: document.getElementById('editVisibility').checked ? 'public' : 'private',
    sets: currentEditWorkout.type === 'training' ? editSets : [],
  };

  try {
    const result = await api(`/api/workouts/${currentEditWorkout.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    currentEditWorkout = { ...result.workout, date: normDate(result.workout.date), sets: payload.sets };
    statusEl.textContent = 'Сохранено ✓';
    loadMyWorkouts().catch((e) => console.error(e));
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Ошибка сохранения. Попробуй ещё раз.';
  }
});

document.getElementById('editDeleteBtn').addEventListener('click', async () => {
  if (!currentEditWorkout) return;
  if (!confirm('Точно удалить эту запись? Это необратимо.')) return;

  const statusEl = document.getElementById('editStatusMsg');
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

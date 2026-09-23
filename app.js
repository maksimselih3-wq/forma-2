// ⚠️ Замени на адрес своего задеплоенного бэкенда (шаг "Запустить сервер онлайн")
const API_BASE = 'https://forma-production-9c7a.up.railway.app';

const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

let currentUser = null;
let sets = []; // { distance_m, reps, time_or_pace, rest_between }
let selectedType = 'training';

// ---------- Утилиты API ----------
async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': tg?.initData || '',
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

// ---------- Инициализация ----------
async function init() {
  try {
    const { user } = await api('/api/auth/login', { method: 'POST' });
    currentUser = user;
    updateAvatar();
    updateStreakBar();
  } catch (err) {
    console.error('Login failed', err);
    document.getElementById('statusMsg').textContent =
      'Не удалось связаться с сервером. Проверь API_BASE в app.js.';
  }
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

// ---------- Переключатель тренировка/отдых ----------
document.querySelectorAll('#mainScreen .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
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
  statusEl.textContent = 'Сохраняю...';

  const today = new Date().toISOString().slice(0, 10);

  const payload = {
    date: today,
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
    statusEl.textContent = 'Сохранено ✓';

    if (result.workout?.ai_feedback) {
      document.getElementById('aiFeedbackText').textContent = result.workout.ai_feedback;
      aiBox.style.display = 'block';
    }

    // обновляем streak локально из свежего списка
    const { streak } = await api('/api/workouts');
    currentUser.current_streak = streak.current;
    currentUser.longest_streak = streak.longest;
    updateStreakBar();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Ошибка сохранения. Попробуй ещё раз.';
  }
});

// ---------- Экран профиля ----------
document.getElementById('profileBtn').addEventListener('click', async () => {
  document.getElementById('mainScreen').classList.add('hidden');
  document.getElementById('friendsScreen').classList.add('hidden');
  document.getElementById('insightsScreen').classList.add('hidden');
  document.getElementById('chatScreen').classList.add('hidden');
  document.getElementById('profileScreen').classList.remove('hidden');

  const tgUser = tg?.initDataUnsafe?.user;
  document.getElementById('profileAvatar').src = tgUser?.photo_url || '';
  document.getElementById('profileName').textContent =
    [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') || 'Спортсмен';
  document.getElementById('profileUsername').textContent = tgUser?.username ? '@' + tgUser.username : '';
  document.getElementById('profileStreak').textContent = currentUser?.current_streak ?? 0;
  document.getElementById('profileBest').textContent = currentUser?.longest_streak ?? 0;

  try {
    const { workouts } = await api('/api/workouts');
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    workouts.slice(0, 10).forEach((w) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.textContent = `${w.date} — ${w.type === 'training' ? 'тренировка' : 'отдых'}${
        w.rpe ? `, RPE ${w.rpe}` : ''
      }`;
      historyList.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load history', err);
  }
});

document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('profileScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
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
  document.getElementById('mainScreen').classList.add('hidden');
  document.getElementById('profileScreen').classList.add('hidden');
  document.getElementById('insightsScreen').classList.add('hidden');
  document.getElementById('chatScreen').classList.add('hidden');
  document.getElementById('friendsScreen').classList.remove('hidden');
  loadFriendsScreen();
});

document.getElementById('friendsBackBtn').addEventListener('click', () => {
  document.getElementById('friendsScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
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
      emptyEl.classList.remove('hidden');
      return;
    }

    document.getElementById('insightText').textContent = insight;
    boxEl.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to load insight', err);
    loadingEl.classList.add('hidden');
    emptyEl.textContent = 'Не удалось получить разбор. Попробуй ещё раз.';
    emptyEl.classList.remove('hidden');
  }
}

document.getElementById('insightsBtn').addEventListener('click', () => {
  document.getElementById('mainScreen').classList.add('hidden');
  document.getElementById('profileScreen').classList.add('hidden');
  document.getElementById('friendsScreen').classList.add('hidden');
  document.getElementById('chatScreen').classList.add('hidden');
  document.getElementById('insightsScreen').classList.remove('hidden');
});

document.getElementById('insightsBackBtn').addEventListener('click', () => {
  document.getElementById('insightsScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
});

document.querySelectorAll('#insightsScreen .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#insightsScreen .seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedInsightPeriod = btn.dataset.period;
  });
});

document.getElementById('refreshInsightBtn').addEventListener('click', loadInsight);

// ---------- Чат с дневником ----------
let chatHistory = []; // { role: 'user'|'assistant', content: '...' } — хранится только пока открыто приложение

function renderChatMessages() {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  chatHistory.forEach((msg) => {
    const div = document.createElement('div');
    div.className = `chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`;
    div.textContent = msg.content;
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
  loadingBubble.textContent = '...';
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
  document.getElementById('mainScreen').classList.add('hidden');
  document.getElementById('profileScreen').classList.add('hidden');
  document.getElementById('friendsScreen').classList.add('hidden');
  document.getElementById('insightsScreen').classList.add('hidden');
  document.getElementById('chatScreen').classList.remove('hidden');
  renderChatMessages();
});

document.getElementById('chatBackBtn').addEventListener('click', () => {
  document.getElementById('chatScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
});

document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

init();

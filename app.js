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
  if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
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
document.querySelectorAll('.seg-btn').forEach((btn) => {
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

init();

// ---- settings you can change ----
const CONFIG = {
  goalMinutes: 240,      // daily goal
  sampleHistory: false,  // true = fill past days with fake data (for testing the heatmap)
};

const KEY = 'focuslog.v1';
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const short = ms => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`; };
const GOAL = CONFIG.goalMinutes * 60000;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ---- state (persisted, so a running timer survives a reload) ----
let S = { mode: 'stopwatch', minutes: 25, label: '', sessions: [], acc: 0, start: null, theme: null };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
if (S.mode !== 'countdown') S.mode = 'stopwatch';
if (!S.theme) S.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
let sel = null, lastSig = '';

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const elapsed = () => S.acc + (S.start ? Date.now() - S.start : 0);
const length = () => S.mode === 'countdown' ? Math.max(1, S.minutes || 1) * 60000 : Infinity;

function logSession(ms) {
  if (ms < 1000) return;
  const d = new Date();
  S.sessions.push({ date: dayKey(d), at: `${pad(d.getHours())}:${pad(d.getMinutes())}`, label: S.label.trim() || 'untitled', ms });
}
function reset() { S.acc = 0; S.start = null; }

// ---- day totals ----
function sample(k) {
  if (!CONFIG.sampleHistory) return 0;
  let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = ((h * 2654435761) >>> 0) / 4294967296, dow = new Date(k + 'T12:00').getDay();
  if (r < (dow === 0 || dow === 6 ? .55 : .2)) return 0;
  return Math.round(r * r * GOAL * 1.4 / 60000) * 60000;
}
function totals() {
  const days = {};
  for (const x of S.sessions) days[x.date] = (days[x.date] || 0) + x.ms;
  const tk = dayKey(new Date()), live = elapsed();
  return k => (days[k] || 0) + (k === tk ? live : (k < tk && !(k in days) ? sample(k) : 0));
}
const level = ms => ms < 60000 ? 0 : ms < GOAL * .25 ? 1 : ms < GOAL * .5 ? 2 : ms < GOAL ? 3 : 4;

// ---- rendering ----
function renderTimer() {
  const e = elapsed(), L = length();
  const shown = L === Infinity ? e : Math.max(0, L - e);
  const sec = S.mode === 'stopwatch' ? Math.floor(shown / 1000) : Math.ceil(shown / 1000);
  const h = Math.floor(sec / 3600);
  const clock = (h ? h + ':' : '') + `${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
  $('clock').textContent = clock;
  $('progress').style.width = (L === Infinity ? (sec % 60) / 60 : e / L) * 100 + '%';
  $('startBtn').textContent = S.start ? 'Pause' : e > 0 ? 'Resume' : 'Start';
  $('status').textContent = !S.start && e === 0 ? 'idle' : !S.start ? 'paused' : S.mode === 'countdown' ? 'counting down' : 'recording';
  $('dot').classList.toggle('live', !!S.start);
  document.title = S.start ? `${clock} · ${S.label || 'focus'}` : 'focus.log';
}

function renderControls() {
  document.documentElement.dataset.theme = S.theme;
  $('themeBtn').textContent = S.theme === 'dark' ? '☀ Light' : '☾ Dark';
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
  $('presets').hidden = S.mode !== 'countdown';
  document.querySelectorAll('#presets [data-min]').forEach(b => b.classList.toggle('on', +b.dataset.min === S.minutes));
  if (document.activeElement !== $('customMin')) $('customMin').value = S.minutes;
  if (document.activeElement !== $('task')) $('task').value = S.label;
}

function renderData() {
  const dayMs = totals(), now = new Date(), tk = dayKey(now), todayMs = dayMs(tk);
  const pct = Math.min(1, todayMs / GOAL);

  $('today').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('todayTotal').textContent = short(todayMs);
  $('goalLabel').textContent = short(GOAL);
  $('goalPct').textContent = Math.floor(pct * 100) + '%';
  $('goalCells').innerHTML = Array.from({ length: 8 }, (_, i) =>
    `<i style="background:${pct * 8 > i ? `var(--l${Math.min(4, 1 + Math.floor(i / 2))})` : 'var(--l0)'}"></i>`).join('');

  // heatmap: 53 weeks, Sunday-first columns, ending this week
  const end = new Date(now); end.setHours(12, 0, 0, 0); end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end); start.setDate(start.getDate() - 53 * 7 + 1);
  let cells = '', months = '', yearMs = 0, lastM = -1, run = 0, longest = 0;
  for (let w = 0; w < 53; w++) {
    let m = '';
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
      const k = dayKey(dt);
      if (d === 0 && dt.getMonth() !== lastM) {
        const ahead = new Date(dt); ahead.setDate(dt.getDate() + 14);
        if (w < 51 && !(w === 0 && ahead.getMonth() !== dt.getMonth())) m = MONTHS[dt.getMonth()];
        lastM = dt.getMonth();
      }
      if (k > tk) { cells += '<i class="future"></i>'; continue; }
      const ms = dayMs(k), lv = level(ms);
      yearMs += ms;
      if (lv) { run++; longest = Math.max(longest, run); } else if (k !== tk) run = 0;
      cells += `<i class="l${lv}${k === (sel || tk) ? ' sel' : ''}" data-k="${k}" data-ms="${ms}"></i>`;
    }
    months += `<span>${m}</span>`;
  }
  $('heat').innerHTML = cells;
  $('months').innerHTML = months;

  let streak = 0; const d = new Date(now);
  if (todayMs < 60000) d.setDate(d.getDate() - 1);
  while (dayMs(dayKey(d)) >= 60000 && streak < 400) { streak++; d.setDate(d.getDate() - 1); }
  $('streak').textContent = streak;
  $('longest').textContent = longest;
  $('year').textContent = $('yearTitle').textContent = Math.round(yearMs / 3600000) + 'h';

  // session list for the selected day
  const k = sel || tk;
  const rows = S.sessions.filter(x => x.date === k).slice().reverse();
  $('logTitle').textContent = k === tk ? 'Sessions today' : new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  $('logTotal').textContent = short(dayMs(k));
  $('log').innerHTML = rows.map(x => `<li><span class="at">${x.at}</span><span class="lbl"></span><span class="dur">${short(x.ms)}</span></li>`).join('');
  $('log').querySelectorAll('.lbl').forEach((el, i) => { el.textContent = rows[i].label; el.title = rows[i].label; });
  $('logEmpty').hidden = rows.length > 0;
  $('logEmpty').textContent = k === tk
    ? 'Nothing logged yet today. Start the timer and hit Log session when you finish.'
    : dayMs(k) > 0 ? 'Sample history. Your real sessions will show here once you log them.' : 'No focus this day.';

  lastSig = tk + Math.floor(todayMs / 60000);
}

function renderAll() { renderControls(); renderTimer(); renderData(); }

// ---- actions ----
function toggle() {
  if (S.start) { S.acc = elapsed(); S.start = null; } else S.start = Date.now();
  save(); renderAll();
}
function setMode(m) {
  if (m === S.mode) return;
  const e = elapsed();
  if (e >= 60000) logSession(e);
  reset(); S.mode = m; save(); renderAll();
}

$('startBtn').onclick = toggle;
$('logBtn').onclick = () => { logSession(elapsed()); reset(); sel = null; save(); renderAll(); };
$('discardBtn').onclick = () => { reset(); save(); renderAll(); };
$('themeBtn').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); renderControls(); };
$('modes').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); };
$('presets').onclick = e => { const b = e.target.closest('[data-min]'); if (b) { S.minutes = +b.dataset.min; save(); renderControls(); renderTimer(); } };
$('customMin').oninput = e => {
  const v = parseInt(e.target.value, 10);
  if (!isNaN(v)) { S.minutes = Math.min(600, Math.max(1, v)); save(); renderControls(); renderTimer(); }
};
$('customMin').onblur = () => { $('customMin').value = S.minutes; };
$('task').oninput = e => { S.label = e.target.value; save(); };

$('heat').addEventListener('mouseover', e => {
  const c = e.target.closest('[data-k]'); if (!c) return;
  const nice = new Date(c.dataset.k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  $('hover').textContent = `${+c.dataset.ms ? short(+c.dataset.ms) : 'No focus'} on ${nice}`;
});
$('heat').addEventListener('click', e => {
  const c = e.target.closest('[data-k]'); if (!c) return;
  sel = c.dataset.k === dayKey(new Date()) ? null : c.dataset.k;
  renderData();
});

// space = start/pause (when not typing)
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); toggle(); }
});

// ---- loop ----
setInterval(() => {
  if (S.start && elapsed() >= length()) { logSession(length()); reset(); save(); renderAll(); return; }
  renderTimer();
  const sig = dayKey(new Date()) + Math.floor(totals()(dayKey(new Date())) / 60000);
  if (sig !== lastSig) renderData();
}, 250);

renderAll();

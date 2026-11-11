// =====================================================
// focus.log - app.js
// =====================================================


// ---------- Settings you can change ----------

var GOAL_MINUTES = 250;       // your daily goal in minutes
var SAMPLE_HISTORY = false;   // true = fill past days with fake data (to test the heatmap)

var STORAGE_KEY = 'focuslog.v1';
var GOAL_MS = GOAL_MINUTES * 60 * 1000;
var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];


// ---------- App state ----------
// Everything the app remembers lives in this one object.
// It is saved to localStorage every time it changes.

var state = {
  mode: 'stopwatch',   // 'stopwatch' or 'countdown'
  minutes: 25,         // length of the countdown timer
  label: '',           // the task you typed
  theme: '',           // 'light' or 'dark'
  acc: 0,              // milliseconds counted before the last pause
  start: null,         // time (in ms) when the timer was last started, or null if not running
  sessions: []         // list of finished sessions: { date, at, label, ms }
};

// Which day is selected in the heatmap (null means today)
var selectedDay = null;


// ---------- Saving and loading ----------

function loadState() {
  var saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    try {
      var data = JSON.parse(saved);
      if (data.mode) state.mode = data.mode;
      if (data.minutes) state.minutes = data.minutes;
      if (data.label) state.label = data.label;
      if (data.theme) state.theme = data.theme;
      if (data.acc) state.acc = data.acc;
      if (data.start) state.start = data.start;
      if (data.sessions) state.sessions = data.sessions;
    } catch (error) {
      console.log('Could not read saved data', error);
    }
  }

  if (state.mode !== 'countdown') {
    state.mode = 'stopwatch';
  }

  // If no theme was chosen yet, use the computer's setting
  if (state.theme === '') {
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      state.theme = 'dark';
    } else {
      state.theme = 'light';
    }
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}


// ---------- Small helpers ----------

// Adds a leading zero: 5 -> "05"
function pad(number) {
  if (number < 10) {
    return '0' + number;
  }
  return '' + number;
}

// Turns a Date into "2026-11-11"
function dayKey(date) {
  var year = date.getFullYear();
  var month = pad(date.getMonth() + 1);
  var day = pad(date.getDate());
  return year + '-' + month + '-' + day;
}

// Turns milliseconds into "45m" or "2h 05m"
function formatDuration(ms) {
  var totalMinutes = Math.floor(ms / 60000);

  if (totalMinutes < 60) {
    return totalMinutes + 'm';
  }

  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  return hours + 'h ' + pad(minutes) + 'm';
}

// Turns "2026-11-11" into "Wed, Nov 11"
function niceDate(key) {
  var date = new Date(key + 'T12:00');
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}


// ---------- Timer logic ----------

// How many milliseconds have been counted so far
function getElapsed() {
  if (state.start === null) {
    return state.acc;
  }
  return state.acc + (Date.now() - state.start);
}

// Length of the countdown in ms (stopwatch has no length)
function getTimerLength() {
  var minutes = state.minutes;
  if (!minutes || minutes < 1) {
    minutes = 1;
  }
  return minutes * 60 * 1000;
}

function resetTimer() {
  state.acc = 0;
  state.start = null;
}

// Saves a finished session to the list
function logSession(ms) {
  if (ms < 1000) {
    return;   // ignore anything shorter than 1 second
  }

  var now = new Date();
  var label = state.label.trim();
  if (label === '') {
    label = 'untitled';
  }

  var session = {
    date: dayKey(now),
    at: pad(now.getHours()) + ':' + pad(now.getMinutes()),
    label: label,
    ms: ms
  };

  state.sessions.push(session);
}


// ---------- Daily totals ----------

// Fake data for testing the heatmap (only if SAMPLE_HISTORY is true)
function getSampleMs(key) {
  if (!SAMPLE_HISTORY) {
    return 0;
  }

  // Make a repeatable "random" number from the date text
  var hash = 0;
  for (var i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1000003;
  }
  var random = (hash % 1000) / 1000;

  if (random < 0.3) {
    return 0;   // some days have nothing
  }

  var minutes = Math.round(random * random * GOAL_MINUTES * 1.4);
  return minutes * 60000;
}

// Total milliseconds of focus on a given day
function getDayTotal(key) {
  var total = 0;
  var hasRealSessions = false;

  for (var i = 0; i < state.sessions.length; i++) {
    var session = state.sessions[i];
    if (session.date === key) {
      total = total + session.ms;
      hasRealSessions = true;
    }
  }

  var todayKey = dayKey(new Date());

  // Today also includes the time on the running clock
  if (key === todayKey) {
    total = total + getElapsed();
  }

  // Past days with no real sessions can show sample data
  if (key < todayKey && !hasRealSessions) {
    total = total + getSampleMs(key);
  }

  return total;
}

// Heatmap colour level from 0 (nothing) to 4 (goal met)
function getLevel(ms) {
  if (ms < 60000) {
    return 0;
  }
  if (ms < GOAL_MS * 0.25) {
    return 1;
  }
  if (ms < GOAL_MS * 0.5) {
    return 2;
  }
  if (ms < GOAL_MS) {
    return 3;
  }
  return 4;
}


// ---------- Drawing the timer ----------

function renderTimer() {
  var elapsed = getElapsed();
  var msToShow;

  if (state.mode === 'stopwatch') {
    msToShow = elapsed;
  } else {
    msToShow = getTimerLength() - elapsed;
    if (msToShow < 0) {
      msToShow = 0;
    }
  }

  var totalSeconds;
  if (state.mode === 'stopwatch') {
    totalSeconds = Math.floor(msToShow / 1000);
  } else {
    totalSeconds = Math.ceil(msToShow / 1000);
  }

  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor(totalSeconds / 60) % 60;
  var seconds = totalSeconds % 60;

  var clockText = pad(minutes) + ':' + pad(seconds);
  if (hours > 0) {
    clockText = hours + ':' + clockText;
  }

  document.getElementById('clock').textContent = clockText;

  // Progress bar: stopwatch fills every minute, timer fills over its whole length
  var progress;
  if (state.mode === 'stopwatch') {
    progress = seconds / 60;
  } else {
    progress = elapsed / getTimerLength();
  }
  document.getElementById('progress').style.width = (progress * 100) + '%';

  // Start button text
  var startButton = document.getElementById('startBtn');
  if (state.start !== null) {
    startButton.textContent = 'Pause';
  } else if (elapsed > 0) {
    startButton.textContent = 'Resume';
  } else {
    startButton.textContent = 'Start';
  }

  // Status text and dot
  var statusText;
  if (state.start === null && elapsed === 0) {
    statusText = 'idle';
  } else if (state.start === null) {
    statusText = 'paused';
  } else if (state.mode === 'countdown') {
    statusText = 'counting down';
  } else {
    statusText = 'recording';
  }
  document.getElementById('status').textContent = statusText;

  var dot = document.getElementById('dot');
  if (state.start !== null) {
    dot.classList.add('live');
  } else {
    dot.classList.remove('live');
  }

  // Browser tab title
  if (state.start !== null) {
    var taskName = state.label;
    if (taskName === '') {
      taskName = 'focus';
    }
    document.title = clockText + ' · ' + taskName;
  } else {
    document.title = 'focus.log';
  }
}


// ---------- Drawing the buttons and inputs ----------

function renderControls() {
  // Theme
  document.documentElement.setAttribute('data-theme', state.theme);
  var themeButton = document.getElementById('themeBtn');
  if (state.theme === 'dark') {
    themeButton.textContent = '☀ Light';
  } else {
    themeButton.textContent = '☾ Dark';
  }

  // Mode buttons
  var modeButtons = document.querySelectorAll('#modes button');
  for (var i = 0; i < modeButtons.length; i++) {
    var button = modeButtons[i];
    if (button.getAttribute('data-mode') === state.mode) {
      button.classList.add('on');
    } else {
      button.classList.remove('on');
    }
  }

  // Timer length buttons (only visible in Timer mode)
  var presets = document.getElementById('presets');
  if (state.mode === 'countdown') {
    presets.hidden = false;
  } else {
    presets.hidden = true;
  }

  var presetButtons = document.querySelectorAll('#presets button');
  for (var j = 0; j < presetButtons.length; j++) {
    var preset = presetButtons[j];
    var presetMinutes = Number(preset.getAttribute('data-min'));
    if (presetMinutes === state.minutes) {
      preset.classList.add('on');
    } else {
      preset.classList.remove('on');
    }
  }

  // Don't overwrite an input while the user is typing in it
  var customInput = document.getElementById('customMin');
  if (document.activeElement !== customInput) {
    customInput.value = state.minutes;
  }

  var taskInput = document.getElementById('task');
  if (document.activeElement !== taskInput) {
    taskInput.value = state.label;
  }
}


// ---------- Drawing today's total, the heatmap and the session list ----------

function renderToday() {
  var now = new Date();
  var todayKey = dayKey(now);
  var todayMs = getDayTotal(todayKey);

  var percent = todayMs / GOAL_MS;
  if (percent > 1) {
    percent = 1;
  }

  document.getElementById('today').textContent =
    now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('todayTotal').textContent = formatDuration(todayMs);
  document.getElementById('goalLabel').textContent = formatDuration(GOAL_MS);
  document.getElementById('goalPct').textContent = Math.floor(percent * 100) + '%';

  // 8 small blocks that fill up toward the goal
  var cellsBox = document.getElementById('goalCells');
  cellsBox.innerHTML = '';

  for (var i = 0; i < 8; i++) {
    var cell = document.createElement('i');
    var filled = percent * 8 > i;

    if (filled) {
      var level = 1 + Math.floor(i / 2);
      if (level > 4) {
        level = 4;
      }
      cell.style.background = 'var(--l' + level + ')';
    } else {
      cell.style.background = 'var(--l0)';
    }

    cellsBox.appendChild(cell);
  }
}

function renderHeatmap() {
  var now = new Date();
  var todayKey = dayKey(now);
  var shownDay = selectedDay;
  if (shownDay === null) {
    shownDay = todayKey;
  }

  // The grid ends on the Saturday of this week and goes back 53 weeks
  var lastDay = new Date(now);
  lastDay.setHours(12, 0, 0, 0);
  lastDay.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

  var firstDay = new Date(lastDay);
  firstDay.setDate(firstDay.getDate() - (53 * 7) + 1);

  var heat = document.getElementById('heat');
  var months = document.getElementById('months');
  heat.innerHTML = '';
  months.innerHTML = '';

  var yearMs = 0;
  var lastMonth = -1;
  var currentRun = 0;
  var longestRun = 0;

  for (var week = 0; week < 53; week++) {
    var monthText = '';

    for (var weekday = 0; weekday < 7; weekday++) {
      var date = new Date(firstDay);
      date.setDate(firstDay.getDate() + week * 7 + weekday);
      var key = dayKey(date);

      // Month label above the first week of each month
      if (weekday === 0 && date.getMonth() !== lastMonth) {
        var twoWeeksLater = new Date(date);
        twoWeeksLater.setDate(date.getDate() + 14);

        var tooCloseToStart = (week === 0 && twoWeeksLater.getMonth() !== date.getMonth());
        var tooCloseToEnd = (week >= 51);

        if (!tooCloseToStart && !tooCloseToEnd) {
          monthText = MONTH_NAMES[date.getMonth()];
        }
        lastMonth = date.getMonth();
      }

      var square = document.createElement('i');

      // Days after today are left empty
      if (key > todayKey) {
        square.className = 'future';
        heat.appendChild(square);
        continue;
      }

      var dayMs = getDayTotal(key);
      var level = getLevel(dayMs);
      yearMs = yearMs + dayMs;

      // Count the longest run of days in a row
      if (level > 0) {
        currentRun = currentRun + 1;
        if (currentRun > longestRun) {
          longestRun = currentRun;
        }
      } else if (key !== todayKey) {
        currentRun = 0;
      }

      square.className = 'l' + level;
      if (key === shownDay) {
        square.classList.add('sel');
      }
      square.setAttribute('data-k', key);
      square.setAttribute('data-ms', dayMs);

      heat.appendChild(square);
    }

    var monthLabel = document.createElement('span');
    monthLabel.textContent = monthText;
    months.appendChild(monthLabel);
  }

  // Current streak: count back from today (or yesterday if today is empty)
  var streak = 0;
  var checkDay = new Date(now);
  if (getDayTotal(todayKey) < 60000) {
    checkDay.setDate(checkDay.getDate() - 1);
  }
  while (getDayTotal(dayKey(checkDay)) >= 60000 && streak < 400) {
    streak = streak + 1;
    checkDay.setDate(checkDay.getDate() - 1);
  }

  var yearHours = Math.round(yearMs / 3600000) + 'h';

  document.getElementById('streak').textContent = streak;
  document.getElementById('longest').textContent = longestRun;
  document.getElementById('year').textContent = yearHours;
  document.getElementById('yearTitle').textContent = yearHours;
}

function renderLog() {
  var todayKey = dayKey(new Date());
  var shownDay = selectedDay;
  if (shownDay === null) {
    shownDay = todayKey;
  }

  // Title above the list
  var title = document.getElementById('logTitle');
  if (shownDay === todayKey) {
    title.textContent = 'Sessions today';
  } else {
    title.textContent = niceDate(shownDay);
  }
  document.getElementById('logTotal').textContent = formatDuration(getDayTotal(shownDay));

  // Find the sessions for that day, newest first
  var daySessions = [];
  for (var i = state.sessions.length - 1; i >= 0; i--) {
    if (state.sessions[i].date === shownDay) {
      daySessions.push(state.sessions[i]);
    }
  }

  // Build the list
  var list = document.getElementById('log');
  list.innerHTML = '';

  for (var j = 0; j < daySessions.length; j++) {
    var session = daySessions[j];

    var row = document.createElement('li');

    var at = document.createElement('span');
    at.className = 'at';
    at.textContent = session.at;

    var label = document.createElement('span');
    label.className = 'lbl';
    label.textContent = session.label;
    label.title = session.label;

    var duration = document.createElement('span');
    duration.className = 'dur';
    duration.textContent = formatDuration(session.ms);

    row.appendChild(at);
    row.appendChild(label);
    row.appendChild(duration);
    list.appendChild(row);
  }

  // Message when the list is empty
  var empty = document.getElementById('logEmpty');
  if (daySessions.length > 0) {
    empty.hidden = true;
  } else {
    empty.hidden = false;
    if (shownDay === todayKey) {
      empty.textContent = 'Nothing logged yet today. Start the timer and hit Log session when you finish.';
    } else if (getDayTotal(shownDay) > 0) {
      empty.textContent = 'Sample history. Your real sessions will show here once you log them.';
    } else {
      empty.textContent = 'No focus this day.';
    }
  }
}

function renderData() {
  renderToday();
  renderHeatmap();
  renderLog();
}

function renderAll() {
  renderControls();
  renderTimer();
  renderData();
}


// ---------- Button actions ----------

function startOrPause() {
  if (state.start !== null) {
    // pause
    state.acc = getElapsed();
    state.start = null;
  } else {
    // start or resume
    state.start = Date.now();
  }
  save();
  renderAll();
}

function logButtonClicked() {
  logSession(getElapsed());
  resetTimer();
  selectedDay = null;
  save();
  renderAll();
}

function discardButtonClicked() {
  resetTimer();
  save();
  renderAll();
}

function themeButtonClicked() {
  if (state.theme === 'dark') {
    state.theme = 'light';
  } else {
    state.theme = 'dark';
  }
  save();
  renderControls();
}

function changeMode(newMode) {
  if (newMode === state.mode) {
    return;
  }

  // If more than a minute was on the clock, save it before switching
  var elapsed = getElapsed();
  if (elapsed >= 60000) {
    logSession(elapsed);
  }

  resetTimer();
  state.mode = newMode;
  save();
  renderAll();
}

function setTimerMinutes(minutes) {
  if (minutes < 1) {
    minutes = 1;
  }
  if (minutes > 600) {
    minutes = 600;
  }
  state.minutes = minutes;
  save();
  renderControls();
  renderTimer();
}


// ---------- Connecting buttons to actions ----------

document.getElementById('startBtn').addEventListener('click', startOrPause);
document.getElementById('logBtn').addEventListener('click', logButtonClicked);
document.getElementById('discardBtn').addEventListener('click', discardButtonClicked);
document.getElementById('themeBtn').addEventListener('click', themeButtonClicked);

// Mode buttons
var modeButtons = document.querySelectorAll('#modes button');
for (var m = 0; m < modeButtons.length; m++) {
  modeButtons[m].addEventListener('click', function (event) {
    var mode = event.currentTarget.getAttribute('data-mode');
    changeMode(mode);
  });
}

// Timer length buttons
var presetButtons = document.querySelectorAll('#presets button');
for (var p = 0; p < presetButtons.length; p++) {
  presetButtons[p].addEventListener('click', function (event) {
    var minutes = Number(event.currentTarget.getAttribute('data-min'));
    setTimerMinutes(minutes);
  });
}

// Custom minutes input
var customInput = document.getElementById('customMin');
customInput.addEventListener('input', function () {
  var minutes = parseInt(customInput.value, 10);
  if (!isNaN(minutes)) {
    setTimerMinutes(minutes);
  }
});
customInput.addEventListener('blur', function () {
  customInput.value = state.minutes;
});

// Task input
var taskInput = document.getElementById('task');
taskInput.addEventListener('input', function () {
  state.label = taskInput.value;
  save();
});

// Heatmap: show a day's total when hovering
var heat = document.getElementById('heat');
heat.addEventListener('mouseover', function (event) {
  var key = event.target.getAttribute('data-k');
  if (!key) {
    return;
  }

  var ms = Number(event.target.getAttribute('data-ms'));
  var text;
  if (ms > 0) {
    text = formatDuration(ms) + ' on ' + niceDate(key);
  } else {
    text = 'No focus on ' + niceDate(key);
  }
  document.getElementById('hover').textContent = text;
});

// Heatmap: click a day to see its sessions
heat.addEventListener('click', function (event) {
  var key = event.target.getAttribute('data-k');
  if (!key) {
    return;
  }

  if (key === dayKey(new Date())) {
    selectedDay = null;
  } else {
    selectedDay = key;
  }
  renderData();
});

// Space bar starts / pauses (but not while typing)
document.addEventListener('keydown', function (event) {
  if (event.code !== 'Space') {
    return;
  }

  var tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
    return;
  }

  event.preventDefault();
  startOrPause();
});


// ---------- Main loop (runs 4 times per second) ----------

var lastDrawnMinute = '';

function tick() {
  // Timer finished: log it and stop
  if (state.mode === 'countdown' && state.start !== null) {
    if (getElapsed() >= getTimerLength()) {
      logSession(getTimerLength());
      resetTimer();
      save();
      renderAll();
      return;
    }
  }

  renderTimer();

  // Redraw the totals and heatmap once per minute (not every tick)
  var todayKey = dayKey(new Date());
  var minuteNow = todayKey + '-' + Math.floor(getDayTotal(todayKey) / 60000);
  if (minuteNow !== lastDrawnMinute) {
    lastDrawnMinute = minuteNow;
    renderData();
  }
}


// ---------- Start the app ----------

loadState();
renderAll();
setInterval(tick, 250);

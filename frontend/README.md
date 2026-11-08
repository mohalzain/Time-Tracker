# focus.log

A personal study and work timer. It uses plain HTML, CSS and JavaScript with no frameworks and no build step.

```
index.html   markup
style.css    all styling (light + dark themes)
app.js       state, timer logic, rendering
```

Open `index.html` in a browser, or serve the folder with any static server:

```
npx serve .        # or: python3 -m http.server
```

---

## 1. Using it

| Control | What it does |
|---|---|
| **Stopwatch** | Counts up until you stop it. |
| **Timer** | Counts down from the length you pick (15 / 25 / 45 / 60 / 90, or type 1–600 min). When it reaches zero the session is logged automatically. |
| **task:** | Label for the current session. Saved with the session when it's logged. |
| **Start / Pause / Resume** | Controls the clock. The **space bar** does the same when you're not typing. |
| **Log session** | Saves the elapsed time as a session and resets the clock. |
| **Discard** | Resets the clock without saving. |
| **☾ Dark / ☀ Light** | Switches the theme. It follows your OS theme until you choose one. |
| **Heatmap** | One square per day for the last 53 weeks. Hover to see the total, click to list that day's sessions. |

Other behaviour:
- Switching modes with more than 1 minute on the clock logs that time first.
- A running timer survives a page reload, because the start time is stored.
- The browser tab title shows the live time while a timer is running.

**Streak** is the number of consecutive days with at least 1 minute logged, counting back from today. If today has nothing logged yet, it counts from yesterday.
**Heatmap levels** are based on your daily goal: 0 = none, 1 = under 25%, 2 = under 50%, 3 = under 100%, 4 = goal met.

---

## 2. Configuration

At the top of `app.js`:

```js
const CONFIG = {
  goalMinutes: 240,      // daily goal
  sampleHistory: false,  // fake past data, for testing the heatmap
};
```

At the top of `style.css`:

```css
--h: 150;  /* accent hue: 150 green, 245 blue, 55 orange, 295 violet */
```

Every colour is a CSS variable in `:root` (light) and `[data-theme="dark"]` (dark).

---

## 3. Data model

All state lives in one object, `S`, in `app.js`. It is saved to `localStorage` under the key `focuslog.v1`:

```js
{
  mode: "stopwatch" | "countdown",
  minutes: 25,            // timer length
  label: "Chapter 4",     // current task text
  theme: "light" | "dark",
  acc: 0,                 // ms accumulated before the current run
  start: null | 1727080000000,  // epoch ms when the current run started, null if paused
  sessions: [ Session, ... ]
}
```

A **Session** is the only thing worth storing on a server:

```js
{
  date:  "2026-09-23",   // LOCAL calendar day, YYYY-MM-DD
  at:    "14:05",        // local time the session was logged, HH:MM
  label: "Chapter 4",
  ms:    1500000         // duration in milliseconds
}
```

Everything else, including daily totals, streaks and the heatmap, is calculated from `sessions` on every render.

> `date` is the user's **local** day, not UTC. If you store timestamps on the server, keep this field too (or store the user's timezone). Otherwise late-night sessions will land on the wrong day.

---

## 4. Where the code touches storage

`app.js` touches storage in three places. These are the only places you need to change to add a backend:

| Function | When it runs | What it does now |
|---|---|---|
| startup (`let S = …; Object.assign(S, JSON.parse(localStorage…))`) | page load | reads state |
| `save()` | after every change | writes the whole `S` to localStorage |
| `logSession(ms)` | a session finishes | pushes a Session into `S.sessions` |

After you change `S`, call `renderAll()` to redraw.

---

## 5. Connecting a backend

Keep localStorage as a local cache, so the app still works offline and opens instantly, and sync sessions to your server.

### 5.1 Suggested API

```
GET    /api/sessions?from=2025-09-23&to=2026-09-23   -> Session[] (each with an id)
POST   /api/sessions                                 body: Session  -> { id, ...Session }
DELETE /api/sessions/:id                             (optional)
GET    /api/settings                                 -> { theme, minutes, goalMinutes }
PUT    /api/settings                                 body: { theme, minutes, goalMinutes }
```

Add an `id` field to Session on the server. The front end ignores unknown fields.

### 5.2 Add `api.js`

Create `api.js` next to `app.js`:

```js
const API = 'https://your-server.com/api';   // or '/api' when served from the same origin

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',            // send cookies if you use session auth
    ...opts,
  });
  if (!res.ok) throw new Error(res.status + ' ' + path);
  return res.status === 204 ? null : res.json();
}

const api = {
  listSessions: (from, to) => req(`/sessions?from=${from}&to=${to}`),
  addSession:   s => req('/sessions', { method: 'POST', body: JSON.stringify(s) }),
  getSettings:  () => req('/settings'),
  putSettings:  s => req('/settings', { method: 'PUT', body: JSON.stringify(s) }),
};
```

Load it before `app.js` in `index.html`:

```html
<script src="api.js"></script>
<script src="app.js"></script>
```

### 5.3 Send sessions when they're logged

In `app.js`, replace `logSession` with this:

```js
function logSession(ms) {
  if (ms < 1000) return;
  const d = new Date();
  const s = { date: dayKey(d), at: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
              label: S.label.trim() || 'untitled', ms, synced: false };
  S.sessions.push(s);
  pushSession(s);
}

async function pushSession(s) {
  try {
    const saved = await api.addSession({ date: s.date, at: s.at, label: s.label, ms: s.ms });
    s.id = saved.id; s.synced = true; save();
  } catch (e) { /* offline: stays synced:false, retried by syncPending() */ }
}

async function syncPending() {
  for (const s of S.sessions.filter(x => !x.synced)) await pushSession(s);
}
window.addEventListener('online', syncPending);
```

### 5.4 Load history from the server on startup

Add this at the very bottom of `app.js`, after `renderAll();`:

```js
(async () => {
  try {
    const to = dayKey(new Date());
    const f = new Date(); f.setDate(f.getDate() - 371);
    const remote = await api.listSessions(dayKey(f), to);
    const pending = S.sessions.filter(x => !x.synced);   // keep unsent local ones
    S.sessions = [...remote.map(r => ({ ...r, synced: true })), ...pending];
    save(); renderAll();
    syncPending();
  } catch (e) { console.warn('offline, using local data', e); }
})();
```

### 5.5 Settings (optional)

To sync theme and timer length across devices, call `api.putSettings({ theme: S.theme, minutes: S.minutes })` inside the theme and preset handlers. Then call `api.getSettings()` in the startup block above and merge the result into `S`.

---

## 6. Example server (Node + Express)

This is a minimal in-memory server for testing the connection. Swap the array for a real database.

```js
// server.js   ->   npm i express   ->   node server.js
const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static(__dirname));          // serves index.html, app.js, ...

let sessions = [], nextId = 1;
let settings = { theme: 'light', minutes: 25, goalMinutes: 240 };

app.get('/api/sessions', (req, res) => {
  const { from = '0000', to = '9999' } = req.query;
  res.json(sessions.filter(s => s.date >= from && s.date <= to));
});
app.post('/api/sessions', (req, res) => {
  const { date, at, label, ms } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(ms > 0)) return res.status(400).end();
  const s = { id: nextId++, date, at, label: String(label).slice(0, 200), ms };
  sessions.push(s);
  res.status(201).json(s);
});
app.delete('/api/sessions/:id', (req, res) => {
  sessions = sessions.filter(s => s.id !== +req.params.id);
  res.status(204).end();
});
app.get('/api/settings', (req, res) => res.json(settings));
app.put('/api/settings', (req, res) => { settings = { ...settings, ...req.body }; res.json(settings); });

app.listen(3000, () => console.log('http://localhost:3000'));
```

A matching SQL table:

```sql
CREATE TABLE sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  date       DATE NOT NULL,          -- user's local day
  at         TIME,
  label      TEXT,
  ms         INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON sessions (user_id, date);
```

---

## 7. Notes

- **Same origin is easiest.** If the server also serves the three files (as in the example), set `API = '/api'` and you don't need CORS. If it runs on a different domain, enable CORS and allow credentials.
- **Auth.** It's a personal site, so a single password and a session cookie is enough. `credentials: 'include'` in `api.js` already sends the cookie.
- **Don't store `acc` / `start` on the server** unless you want a running timer to follow you between devices. Those two fields are enough to rebuild the running clock.
- **Resetting local data:** in the browser console, run `localStorage.removeItem('focuslog.v1')`.

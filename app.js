"use strict";

const APP_VERSION = "v11"; // keep in step with CACHE in sw.js
const STORAGE_KEY = "crokinole-state-v2";
const PROFILES_KEY = "crokinole-profiles-v1";
const VALUES = [20, 15, 10, 5];
const RATING_WINDOW = 30; // recent rounds used for the rating average
const MIN_ROUNDS = 4; // rounds needed before a rating is established
const blankTally = () => ({ 20: 0, 15: 0, 10: 0, 5: 0 });

let state = loadJSON(STORAGE_KEY);
let profiles = loadJSON(PROFILES_KEY) || {};

/* setup-screen selections (session only): profile ids or "guest" per slot */
let pick = [["guest"], ["guest"], ["guest"]];
let guestNames = [["", ""], ["", ""], ["", ""]];

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const saveProfiles = () =>
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));

const $ = (id) => document.getElementById(id);

/* ---------- badges ---------- */
const BADGES = [
  { id: "first-round", icon: "🌱", name: "Warming Up", desc: "Record your first round." },
  { id: "double-20", icon: "🎯", name: "Double Deuce", desc: "Two 20s in a single round." },
  { id: "hat-trick", icon: "🎩", name: "Hat Trick", desc: "Three 20s in a single round." },
  { id: "quad-20", icon: "👁️", name: "20/20 Vision", desc: "Four or more 20s in a single round." },
  { id: "century", icon: "💯", name: "Century Club", desc: "Score 100+ board points in one round." },
  { id: "shutout", icon: "🦨", name: "Skunked 'Em", desc: "Take a round while holding every opponent to zero." },
  { id: "first-win", icon: "🏆", name: "Winner Winner", desc: "Win your first game." },
  { id: "streak-3", icon: "🔥", name: "Heater", desc: "Win three games in a row." },
  { id: "comeback", icon: "🚀", name: "Comeback Kid", desc: "Win a points game after trailing by 30 or more." },
  { id: "sweep", icon: "🧹", name: "Clean Sweep", desc: "Win every round of a tournament match." },
  { id: "too-good", icon: "😎", name: "Too Good", desc: "Win a match while giving a handicap spot." },
  { id: "rounds-25", icon: "🪑", name: "Regular", desc: "Record 25 career rounds." },
  { id: "rounds-100", icon: "🛡️", name: "Veteran", desc: "Record 100 career rounds." },
  { id: "tw-10", icon: "🏹", name: "Marksman", desc: "Sink 10 career 20s." },
  { id: "tw-50", icon: "🎖️", name: "Sharpshooter", desc: "Sink 50 career 20s." },
  { id: "tw-100", icon: "🦅", name: "Sniper", desc: "Sink 100 career 20s." },
];
const BADGE_MAP = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/* ---------- experience & levels ---------- */
const XP = {
  round: 10, // each round played
  twenty: 5, // each 20 sunk (half-credit in doubles)
  roundWin: 15,
  roundTie: 5,
  gamePlayed: 20,
  gameWin: 50, // on top of gamePlayed
  badge: 25, // each new badge
};

const LEVELS = [
  { xp: 0, title: "Rookie Flicker" },
  { xp: 100, title: "Disc Apprentice" },
  { xp: 250, title: "Steady Hand" },
  { xp: 500, title: "Line Rider" },
  { xp: 1000, title: "Ditch Dodger" },
  { xp: 1750, title: "Peg Wizard" },
  { xp: 2750, title: "Twenty Hunter" },
  { xp: 4000, title: "Board Boss" },
  { xp: 5500, title: "Flick Master" },
  { xp: 7500, title: "Crokinole Sage" },
  { xp: 10000, title: "Grand Flicker" },
  { xp: 13000, title: "Crokinole Legend" },
];

function levelInfo(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  return {
    n: i + 1,
    title: LEVELS[i].title,
    cur: LEVELS[i].xp,
    next: i + 1 < LEVELS.length ? LEVELS[i + 1].xp : null,
  };
}

function addXp(pid, amount, entry) {
  amount = Math.round(amount);
  if (!amount) return;
  profiles[pid].xp = (profiles[pid].xp || 0) + amount;
  entry.xp[pid] = (entry.xp[pid] || 0) + amount;
}

function award(pid, id, entry, newly) {
  const p = profiles[pid];
  if (!p.badges) p.badges = {};
  if (p.badges[id]) return;
  p.badges[id] = Date.now();
  entry.newBadges.push({ pid, id });
  newly.push({ pid, id });
  addXp(pid, XP.badge, entry);
}

/* per-round feats and career milestones (in doubles, both partners share
   side feats and earn half-credit toward career 20s) */
function checkRoundBadges(pid, i, entry, pts, newly) {
  const p = profiles[pid];
  const t = entry.tally[i];
  if (p.samples.length === 1) award(pid, "first-round", entry, newly);
  if (t[20] >= 2) award(pid, "double-20", entry, newly);
  if (t[20] >= 3) award(pid, "hat-trick", entry, newly);
  if (t[20] >= 4) award(pid, "quad-20", entry, newly);
  if (pts[i] >= 100) award(pid, "century", entry, newly);
  const oppMax = Math.max(...pts.filter((_, j) => j !== i));
  if (pts[i] > 0 && oppMax === 0) award(pid, "shutout", entry, newly);
  const n = p.samples.length;
  if (n >= 25) award(pid, "rounds-25", entry, newly);
  if (n >= 100) award(pid, "rounds-100", entry, newly);
  const tw = p.samples.reduce((s, x) => s + x.tw, 0);
  if (tw >= 10) award(pid, "tw-10", entry, newly);
  if (tw >= 50) award(pid, "tw-50", entry, newly);
  if (tw >= 100) award(pid, "tw-100", entry, newly);
}

function wonFromBehind(winSide) {
  if (gameScoring() === "rounds") return false;
  const totals = state.scores.map(() => 0);
  for (const r of state.rounds) {
    r.awarded.forEach((a, j) => (totals[j] += a));
    const best = Math.max(...totals.filter((_, j) => j !== winSide));
    if (best - totals[winSide] >= 30) return true;
  }
  return false;
}

function awardGameEnd(entry, newly) {
  const winSide = state.winner;
  entry.gameStats = [];
  for (let i = 0; i < state.sides.length; i++) {
    for (const pid of state.sides[i].players) {
      if (pid === "guest" || !profiles[pid]) continue;
      const p = profiles[pid];
      entry.gameStats.push({
        pid,
        wins: p.wins || 0,
        games: p.games || 0,
        streak: p.streak || 0,
      });
      p.games = (p.games || 0) + 1;
      addXp(pid, XP.gamePlayed, entry);
      if (i === winSide) {
        addXp(pid, XP.gameWin, entry);
        p.wins = (p.wins || 0) + 1;
        p.streak = (p.streak || 0) + 1;
        if (p.wins === 1) award(pid, "first-win", entry, newly);
        if (p.streak >= 3) award(pid, "streak-3", entry, newly);
        if (wonFromBehind(winSide)) award(pid, "comeback", entry, newly);
        if (
          state.mode === "tournament" &&
          state.rounds.every((r) => r.awarded[winSide] === 2)
        ) {
          award(pid, "sweep", entry, newly);
        }
        if (state.handicap && state.handicap.to !== winSide)
          award(pid, "too-good", entry, newly);
      } else {
        p.streak = 0;
      }
    }
  }
}

function showToasts(items) {
  items.forEach((t, k) => {
    setTimeout(() => {
      const el = document.createElement("div");
      el.className = "toast";
      el.innerHTML = `<span class="toast-icon">${t.icon}</span><div>${t.html}</div>`;
      $("toasts").appendChild(el);
      setTimeout(() => el.classList.add("gone"), 3600);
      setTimeout(() => el.remove(), 4200);
    }, k * 800);
  });
}

/* ---------- ratings ---------- */
function rating(p) {
  const recent = p.samples.slice(-RATING_WINDOW);
  const discs = recent.reduce((s, x) => s + x.discs, 0);
  if (!discs) return null;
  const pts = recent.reduce((s, x) => s + x.pts, 0);
  return (pts / discs) * 8; // board points normalized to an official 8-disc round
}
const established = (p) => p.samples.length >= MIN_ROUNDS;

/* ---------- tabs ---------- */
const TABS = ["score", "players", "rules"];
TABS.forEach((t) => $("tab-" + t).addEventListener("click", () => showTab(t)));

function showTab(which) {
  TABS.forEach((t) => {
    $("view-" + t).classList.toggle("hidden", t !== which);
    $("tab-" + t).classList.toggle("active", t === which);
  });
  if (which === "players") renderPlayers();
}

/* ---------- setup ---------- */
/* player slots per side for each mode */
function setupSlots() {
  const m = $("mode").value;
  if (m === "doubles") return [2, 2];
  if (m === "twovone") return [2, 1];
  if (m === "cutthroat") return [1, 1, 1];
  return [1, 1];
}

/* discs each player on a side shoots per round: official 6 in doubles and
   for the 2v1 team (the solo player gets 12), else the setup choice
   (8 official / 12 home-style) */
function setupSideDiscs(s) {
  const m = $("mode").value;
  if (m === "doubles") return 6;
  if (m === "twovone") return s === 0 ? 6 : 12;
  return parseInt($("discs").value, 10) || 8;
}

function sideLegend(s) {
  const m = $("mode").value;
  if (m === "twovone") return s === 0 ? "Team (6 discs each)" : "Solo (12 discs)";
  if (m === "cutthroat") return `Player ${s + 1}`;
  return `Side ${s + 1}`;
}

/* how the match ends: accumulating round points or playing to a target */
function setupScoring() {
  const m = $("mode").value;
  if (m === "tournament") return "rounds";
  if (m === "cutthroat") return $("cut-scoring").value;
  return "target";
}

function refreshSetupFields() {
  const m = $("mode").value;
  const scoring = setupScoring();
  $("cut-scoring-field").classList.toggle("hidden", m !== "cutthroat");
  $("target-field").classList.toggle("hidden", scoring === "rounds");
  $("rounds-field").classList.toggle("hidden", scoring !== "rounds");
  $("discs-field").classList.toggle("hidden", m === "doubles" || m === "twovone");
}

$("mode").addEventListener("change", () => {
  refreshSetupFields();
  renderPickers();
});
$("cut-scoring").addEventListener("change", refreshSetupFields);
$("discs").addEventListener("change", renderHandicapRow);

$("side-pickers").addEventListener("change", (e) => {
  if (!e.target.classList.contains("picker")) return;
  pick[e.target.dataset.side][e.target.dataset.slot] = e.target.value;
  renderPickers();
});

$("side-pickers").addEventListener("input", (e) => {
  if (!e.target.classList.contains("guest-name")) return;
  guestNames[e.target.dataset.side][e.target.dataset.slot] = e.target.value;
});

function ratingTag(p) {
  const r = rating(p);
  if (r === null) return " — new";
  return ` — ${r.toFixed(1)}${established(p) ? "" : " (prov.)"}`;
}

function renderPickers() {
  const slots = setupSlots();
  const list = Object.values(profiles).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  let html = "";
  let playerNo = 0;
  for (let s = 0; s < slots.length; s++) {
    pick[s] = pick[s].slice(0, slots[s]);
    while (pick[s].length < slots[s]) pick[s].push("guest");
    html += `<fieldset class="side-pick"><legend>${sideLegend(s)}</legend>`;
    for (let k = 0; k < slots[s]; k++) {
      playerNo++;
      const sel = pick[s][k];
      html +=
        `<select class="picker" data-side="${s}" data-slot="${k}">` +
        `<option value="guest"${sel === "guest" ? " selected" : ""}>Guest (type a name)</option>` +
        list
          .map(
            (p) =>
              `<option value="${p.id}"${sel === p.id ? " selected" : ""}>${esc(p.name)}${ratingTag(p)}</option>`
          )
          .join("") +
        `</select>`;
      if (sel === "guest") {
        html += `<input class="guest-name" data-side="${s}" data-slot="${k}" type="text" maxlength="20" placeholder="Player ${playerNo} name" value="${esc(guestNames[s][k] || "")}">`;
      }
    }
    html += `</fieldset>`;
  }
  $("side-pickers").innerHTML = html;
  renderHandicapRow();
}

function handicapInfo() {
  if ($("mode").value === "cutthroat") {
    return { ok: false, reason: "Handicap isn't available in 3-player cutthroat." };
  }
  const slots = setupSlots();
  const sidePicks = slots.map((n, s) => pick[s].slice(0, n));
  const ids = sidePicks.flat().filter((id) => id !== "guest");
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: "The same player can't be on both sides." };
  }
  /* expected board points a side adds per round: each player's per-8-disc
     rating scaled by how many discs they actually shoot */
  const exps = sidePicks.map((row, s) => {
    const ps = row.map((id) => (id !== "guest" ? profiles[id] : null));
    if (ps.some((p) => !p || !established(p))) return null;
    return ps.reduce((sum, p) => sum + rating(p), 0) * (setupSideDiscs(s) / 8);
  });
  if (exps.some((e) => e === null)) {
    return {
      ok: false,
      reason: `Handicap needs saved players with at least ${MIN_ROUNDS} recorded rounds in every spot.`,
    };
  }
  const bonus = Math.round(Math.abs(exps[0] - exps[1]));
  const to = exps[0] <= exps[1] ? 0 : 1;
  const names = sidePicks[to].map((id) => profiles[id].name).join(" & ");
  return { ok: true, bonus, to, names };
}

function renderHandicapRow() {
  const info = handicapInfo();
  const box = $("use-handicap");
  box.disabled = !info.ok;
  if (!info.ok) box.checked = false;
  $("handicap-hint").textContent = info.ok
    ? info.bonus > 0
      ? `${info.names} would be spotted +${info.bonus} points each round.`
      : "Evenly matched — no points would be spotted."
    : info.reason;
}

function slotName(s, k, slots) {
  const id = pick[s][k];
  if (id !== "guest" && profiles[id]) return profiles[id].name;
  let playerNo = k + 1;
  for (let i = 0; i < s; i++) playerNo += slots[i];
  return (guestNames[s][k] || "").trim() || `Player ${playerNo}`;
}

$("start").addEventListener("click", () => {
  const mode = $("mode").value;
  const slots = setupSlots();
  const chosen = slots
    .flatMap((n, s) => pick[s].slice(0, n))
    .filter((id) => id !== "guest");
  if (new Set(chosen).size !== chosen.length) {
    alert("The same player can't be picked twice.");
    return;
  }
  const sides = slots.map((n, s) => {
    const players = pick[s].slice(0, n);
    return {
      name: players.map((_, k) => slotName(s, k, slots)).join(" & "),
      players,
      discsEach: setupSideDiscs(s),
    };
  });
  const hc = $("use-handicap").checked ? handicapInfo() : null;
  lastScores = null;
  state = {
    mode,
    scoring: setupScoring(),
    sides,
    target: parseInt($("target").value, 10),
    totalRounds: parseInt($("totalRounds").value, 10),
    handicap: hc && hc.ok && hc.bonus > 0 ? { to: hc.to, bonus: hc.bonus } : null,
    scores: sides.map(() => 0),
    twenties: sides.map(() => 0),
    rounds: [],
    tally: sides.map(() => blankTally()),
    winner: null,
  };
  save();
  render();
});

/* fallbacks keep games saved by older versions working */
function gameScoring() {
  return state.scoring || (state.mode === "tournament" ? "rounds" : "target");
}
function sideDiscs(i) {
  return state.sides[i].discsEach || state.discs || 8;
}

/* ---------- game actions ---------- */
$("score-round").addEventListener("click", () => {
  if (state.winner !== null) return;
  const pts = state.tally.map(boardPoints);
  const adj = pts.slice();
  if (state.handicap) adj[state.handicap.to] += state.handicap.bonus;

  const entry = {
    tally: state.tally.map((t) => ({ ...t })),
    pts,
    adj,
    awarded: [0, 0],
    credits: [],
    newBadges: [],
    xp: {},
  };
  const newly = [];
  const prevLevels = {};
  for (const side of state.sides) {
    for (const pid of side.players) {
      if (pid !== "guest" && profiles[pid]) {
        prevLevels[pid] = levelInfo(profiles[pid].xp || 0).n;
      }
    }
  }

  entry.awarded = computeAwards(adj);

  /* credit real (unadjusted) board points to profile histories */
  for (let i = 0; i < state.sides.length; i++) {
    const players = state.sides[i].players;
    const result = roundResult(i, entry.awarded, adj);
    for (const pid of players) {
      if (pid === "guest" || !profiles[pid]) continue;
      const twShare = state.tally[i][20] / players.length;
      profiles[pid].samples.push({
        pts: pts[i] / players.length,
        discs: sideDiscs(i),
        tw: twShare,
      });
      entry.credits.push(pid);
      checkRoundBadges(pid, i, entry, pts, newly);
      addXp(
        pid,
        XP.round +
          twShare * XP.twenty +
          (result === "win" ? XP.roundWin : result === "tie" ? XP.roundTie : 0),
        entry
      );
    }
  }

  for (let i = 0; i < state.sides.length; i++) {
    state.scores[i] += entry.awarded[i];
    state.twenties[i] += state.tally[i][20];
  }
  state.rounds.push(entry);
  state.tally = state.sides.map(() => blankTally());
  checkWinner();
  if (state.winner === 0 || state.winner === 1) awardGameEnd(entry, newly);
  saveProfiles();
  save();
  render();

  const toasts = newly.map(({ pid, id }) => {
    const b = BADGE_MAP[id];
    return {
      icon: b.icon,
      html: `<strong>${b.name}</strong><br>${esc(profiles[pid].name)} — ${b.desc}`,
    };
  });
  for (const pid of Object.keys(prevLevels)) {
    const lv = levelInfo(profiles[pid].xp || 0);
    if (lv.n > prevLevels[pid]) {
      toasts.push({
        icon: "⭐",
        html: `<strong>Level ${lv.n} — ${lv.title}</strong><br>${esc(profiles[pid].name)} leveled up!`,
      });
    }
  }
  showToasts(toasts);
  if (state.winner !== null) setTimeout(showWinOverlay, 700);
});

/* ---------- winner celebration ---------- */
function showWinOverlay() {
  if (!state || state.winner === null) return;
  if (state.winner === -1) {
    $("win-title").textContent = "Dead tie!";
  } else {
    $("win-title").textContent = `${state.sides[state.winner].name} wins!`;
  }
  $("win-score").textContent = state.sides
    .map((sd, i) => `${sd.name} ${state.scores[i]}`)
    .join(" · ");
  $("win-overlay").classList.remove("hidden");
  if (state.winner !== -1) spawnConfetti();
}

function spawnConfetti() {
  const box = $("confetti");
  box.innerHTML = "";
  const colors = ["#d4a04c", "#e8c189", "#b0543e", "#6fae5c", "#f3ead9"];
  for (let i = 0; i < 50; i++) {
    const p = document.createElement("span");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 2.2 + Math.random() * 2 + "s";
    p.style.animationDelay = Math.random() * 0.8 + "s";
    box.appendChild(p);
  }
  setTimeout(() => (box.innerHTML = ""), 5500);
}

$("win-close").addEventListener("click", () =>
  $("win-overlay").classList.add("hidden")
);

$("rematch").addEventListener("click", () => {
  state.scores = state.sides.map(() => 0);
  state.twenties = state.sides.map(() => 0);
  state.rounds = [];
  state.tally = state.sides.map(() => blankTally());
  state.winner = null;
  lastScores = null;
  $("win-overlay").classList.add("hidden");
  save();
  render();
});

$("undo").addEventListener("click", () => {
  const entry = state.rounds.pop();
  if (!entry) return;
  for (let i = 0; i < state.sides.length; i++) {
    state.scores[i] -= entry.awarded[i];
    state.twenties[i] -= entry.tally[i][20];
  }
  for (const pid of entry.credits || []) profiles[pid]?.samples.pop();
  for (const [pid, dx] of Object.entries(entry.xp || {})) {
    if (profiles[pid]) profiles[pid].xp = (profiles[pid].xp || 0) - dx;
  }
  for (const { pid, id } of entry.newBadges || []) {
    if (profiles[pid]?.badges) delete profiles[pid].badges[id];
  }
  for (const g of entry.gameStats || []) {
    const p = profiles[g.pid];
    if (p) {
      p.wins = g.wins;
      p.games = g.games;
      p.streak = g.streak;
    }
  }
  saveProfiles();
  state.tally = entry.tally;
  state.winner = null;
  save();
  render();
});

$("new-game").addEventListener("click", () => {
  if (
    state.rounds.length === 0 ||
    state.winner !== null ||
    confirm("Abandon the current game?")
  ) {
    state = null;
    lastScores = null;
    localStorage.removeItem(STORAGE_KEY);
    renderPickers();
    render();
  }
});

function boardPoints(t) {
  return VALUES.reduce((sum, v) => sum + v * t[v], 0);
}

/* round points awarded per side from the (handicap-adjusted) board totals */
function computeAwards(adj) {
  if (state.mode === "tournament") {
    if (adj[0] > adj[1]) return [2, 0];
    if (adj[1] > adj[0]) return [0, 2];
    return [1, 1];
  }
  if (state.mode === "cutthroat" && gameScoring() === "rounds") {
    /* match-play: a point per opponent you outscore (2/1/0; ties shake out) */
    return adj.map((v, i) => adj.filter((w, j) => j !== i && w < v).length);
  }
  if (state.mode === "cutthroat") {
    /* differential: a lone top scorer takes first minus second; ties score 0 */
    const sorted = [...adj].sort((a, b) => b - a);
    const lone = adj.filter((v) => v === sorted[0]).length === 1;
    return adj.map((v) => (lone && v === sorted[0] ? sorted[0] - sorted[1] : 0));
  }
  /* two-sided differential (singles, doubles, 2 vs 1) */
  const diff = adj[0] - adj[1];
  if (diff > 0) return [diff, 0];
  if (diff < 0) return [0, -diff];
  return [0, 0];
}

function roundResult(i, awarded, adj) {
  if (state.mode === "tournament") {
    return awarded[i] === 2 ? "win" : awarded[i] === 1 ? "tie" : "loss";
  }
  if (state.mode === "cutthroat" && gameScoring() === "rounds") {
    if (awarded[i] === adj.length - 1) return "win";
    return awarded[i] > 0 || adj[i] === Math.max(...adj) ? "tie" : "loss";
  }
  if (awarded[i] > 0) return "win";
  return adj[i] === Math.max(...adj) ? "tie" : "loss";
}

function checkWinner() {
  if (gameScoring() === "rounds") {
    if (state.rounds.length < state.totalRounds) return;
    const top = Math.max(...state.scores);
    let leaders = state.scores
      .map((s, i) => i)
      .filter((i) => state.scores[i] === top);
    if (leaders.length > 1) {
      const topTw = Math.max(...leaders.map((i) => state.twenties[i]));
      leaders = leaders.filter((i) => state.twenties[i] === topTw);
    }
    state.winner = leaders.length === 1 ? leaders[0] : -1; // -1: dead tie
  } else {
    const i = state.scores.findIndex((s) => s >= state.target);
    if (i >= 0) state.winner = i;
  }
}

/* ---------- players tab ---------- */
function renderPlayers() {
  const list = Object.values(profiles).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  $("profile-list").innerHTML =
    list.length === 0
      ? `<p class="hint">No players yet — add one above. Profiles build a rating as you score games, which powers handicap matches.</p>`
      : list
          .map((p) => {
            const r = rating(p);
            const n = p.samples.length;
            const tw = n
              ? (p.samples.reduce((s, x) => s + x.tw, 0) / n).toFixed(1)
              : "0.0";
            const stat =
              r === null
                ? "no rounds yet"
                : `${r.toFixed(1)} pts/round${established(p) ? "" : ` · provisional (${n}/${MIN_ROUNDS})`}`;
            const wins = p.wins || 0;
            const losses = (p.games || 0) - wins;
            const badges = Object.entries(p.badges || {})
              .sort((x, y) => x[1] - y[1])
              .map(([id]) => BADGE_MAP[id])
              .filter(Boolean)
              .map(
                (b) =>
                  `<span class="badge-icon" title="${b.name} — ${b.desc}">${b.icon}</span>`
              )
              .join("");
            const xp = p.xp || 0;
            const lv = levelInfo(xp);
            const prog = lv.next
              ? Math.round(((xp - lv.cur) / (lv.next - lv.cur)) * 100)
              : 100;
            return `<div class="profile-row" data-id="${p.id}">
              <div class="profile-main">
                <div class="profile-name">${esc(p.name)}</div>
                <div class="profile-level"><span class="lv-num">Lv ${lv.n}</span> ${lv.title} · ${xp.toLocaleString()} XP${lv.next ? ` · next at ${lv.next.toLocaleString()}` : " · max level"}</div>
                <div class="xp-bar"><div class="xp-fill" style="width:${prog}%"></div></div>
                <div class="profile-stats">${stat} · ${n} rounds · ${wins}W–${losses}L · ${tw} twenties/round</div>
                ${badges ? `<div class="profile-badges">${badges}</div>` : ""}
              </div>
              <button class="del-profile" aria-label="delete player">✕</button>
            </div>`;
          })
          .join("");

  /* null guards so a stale-cache html/js mismatch can't blank the whole tab */
  const badgeCatalog = $("badge-catalog");
  if (badgeCatalog) {
    badgeCatalog.innerHTML = BADGES.map((b) => {
      const earned = Object.values(profiles).some(
        (p) => p.badges && p.badges[b.id]
      );
      return `<div class="badge-row${earned ? "" : " locked"}">
        <span class="badge-icon big">${b.icon}</span>
        <div><strong>${b.name}</strong><div class="badge-desc">${b.desc}</div></div>
      </div>`;
    }).join("");
  }

  const levelCatalog = $("level-catalog");
  if (levelCatalog) {
    levelCatalog.innerHTML = LEVELS.map(
      (l, idx) => `<div class="badge-row">
        <span class="lv-num big">Lv ${idx + 1}</span>
        <div><strong>${l.title}</strong><div class="badge-desc">${l.xp.toLocaleString()} XP</div></div>
      </div>`
    ).join("");
  }
}

$("add-profile").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("new-player-name").value.trim();
  if (!name) return;
  if (
    Object.values(profiles).some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    alert("A player with that name already exists.");
    return;
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  profiles[id] = { id, name, samples: [] };
  saveProfiles();
  $("new-player-name").value = "";
  renderPlayers();
  renderPickers();
});

$("profile-list").addEventListener("click", (e) => {
  if (!e.target.classList.contains("del-profile")) return;
  const id = e.target.closest(".profile-row").dataset.id;
  if (!confirm(`Delete ${profiles[id].name} and their history?`)) return;
  delete profiles[id];
  saveProfiles();
  pick = pick.map((row) =>
    row.map((v) => (v !== "guest" && !profiles[v] ? "guest" : v))
  );
  renderPlayers();
  renderPickers();
});

/* ---------- rendering ---------- */
function render() {
  const inGame = state !== null;
  $("setup").classList.toggle("hidden", inGame);
  $("game").classList.toggle("hidden", !inGame);
  if (!inGame) return;

  renderScoreboard();
  renderBanner();
  const S = state.sides.length;
  if ($("tally-area").childElementCount !== S) {
    $("tally-area").innerHTML = state.sides
      .map((_, i) => `<div class="card side-card side-c${i}" id="side${i}"></div>`)
      .join("");
  }
  $("tally-area").classList.toggle("three", S === 3);
  for (let i = 0; i < S; i++) renderSide(i);
  renderHistory();
  $("score-round").classList.toggle("hidden", state.winner !== null);
}

let lastScores = null;

function animateNumber(el, from, to) {
  const t0 = performance.now();
  const dur = 600;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderScoreboard() {
  const rounds = gameScoring() === "rounds";
  let mid;
  if (rounds) {
    const played = Math.min(state.rounds.length, state.totalRounds);
    const pips =
      "●".repeat(played) +
      `<span class="open">${"●".repeat(state.totalRounds - played)}</span>`;
    mid = `<span class="pips">${pips}</span><br>round ${Math.min(state.rounds.length + 1, state.totalRounds)} of ${state.totalRounds}`;
  } else {
    const bars = state.sides
      .map((_, i) => {
        const w = Math.min(100, (state.scores[i] / state.target) * 100);
        return `<div class="race-row"><span class="race-fill c${i}" style="width:${w}%"></span></div>`;
      })
      .join("");
    mid = `to ${state.target}<div class="race">${bars}</div>`;
  }
  const top = Math.max(...state.scores);
  const leaders = state.scores.filter((s) => s === top).length;
  const sub = (i) => {
    const parts = [];
    if (state.handicap && state.handicap.to === i)
      parts.push(`+${state.handicap.bonus} hcp/rd`);
    parts.push(`${state.twenties[i]} twenties`);
    return parts.join(" · ");
  };
  const sidesHtml = state.sides
    .map(
      (sd, i) => `
    <div class="side${top > 0 && leaders === 1 && state.scores[i] === top ? " leading" : ""}">
      <div class="name">${esc(sd.name)}</div>
      <div class="pts">${state.scores[i]}</div>
      <div class="sub">${sub(i)}</div>
    </div>`
    )
    .join("");
  $("scoreboard").innerHTML = `<div class="sb-sides">${sidesHtml}</div><div class="sb-mid">${mid}</div>`;

  const ptsEls = $("scoreboard").querySelectorAll(".pts");
  if (lastScores && lastScores.length === state.scores.length) {
    state.scores.forEach((s, i) => {
      if (lastScores[i] !== s) animateNumber(ptsEls[i], lastScores[i], s);
    });
  }
  lastScores = [...state.scores];
}

function renderBanner() {
  const b = $("winner-banner");
  if (state.winner === null) {
    b.classList.add("hidden");
    return;
  }
  b.classList.remove("hidden");
  if (state.winner === -1) {
    b.textContent = "Match tied — even on points and twenties!";
  } else {
    const sharedTop =
      state.scores.filter((s) => s === Math.max(...state.scores)).length > 1;
    const note =
      gameScoring() === "rounds" && sharedTop ? " (on twenties)" : "";
    b.textContent = `${state.sides[state.winner].name} wins${note}! 🏆`;
  }
}

function renderSide(i) {
  const t = state.tally[i];
  const rows = VALUES.map(
    (v) => `
    <div class="counter" data-side="${i}" data-value="${v}">
      <span class="label">${v}</span>
      <button class="dec" aria-label="minus">−</button>
      <span class="val">${t[v]}</span>
      <button class="inc" aria-label="plus">+</button>
    </div>`
  ).join("");
  $("side" + i).innerHTML = `
    <h3>${esc(state.sides[i].name)}</h3>
    ${rows}
    <div class="round-total">this round<br><strong>${boardPoints(t)}</strong></div>`;
}

function renderHistory() {
  $("history").classList.toggle("hidden", state.rounds.length === 0);
  $("history-list").innerHTML = state.rounds
    .map((r) => {
      const disp = (i) =>
        r.adj[i] !== r.pts[i] ? `${r.pts[i]}+${r.adj[i] - r.pts[i]}` : `${r.pts[i]}`;
      const board = r.pts.map((_, i) => disp(i)).join("–");
      let tag;
      if (gameScoring() === "rounds") {
        tag = r.awarded.join("–");
      } else {
        const w = r.awarded.findIndex((a) => a > 0);
        tag = w >= 0 ? `+${r.awarded[w]} ${esc(state.sides[w].name)}` : "wash";
      }
      return `<li>board ${board} → <strong>${tag}</strong></li>`;
    })
    .join("");
}

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/* counter taps (delegated so re-rendering keeps working) */
$("tally-area").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || state === null || state.winner !== null) return;
  const row = btn.closest(".counter");
  const side = parseInt(row.dataset.side, 10);
  const value = row.dataset.value;
  const t = state.tally[side];
  const maxDiscs = sideDiscs(side) * state.sides[side].players.length;
  if (btn.classList.contains("inc") && t[value] < maxDiscs) t[value]++;
  if (btn.classList.contains("dec") && t[value] > 0) t[value]--;
  if (navigator.vibrate) navigator.vibrate(8);
  save();
  renderSide(side);
});

/* ---------- backup & restore ---------- */
$("backup-players").addEventListener("click", () => {
  const blob = new Blob(
    [JSON.stringify({ app: "crokinole-scorer", exported: new Date().toISOString(), profiles }, null, 2)],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `crokinole-players-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("restore-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = data.app === "crokinole-scorer" ? data.profiles : data;
    const valid =
      incoming &&
      typeof incoming === "object" &&
      Object.values(incoming).every(
        (p) => p && typeof p.name === "string" && Array.isArray(p.samples)
      );
    if (!valid) throw new Error("bad shape");
    const n = Object.keys(profiles).length;
    const m = Object.keys(incoming).length;
    if (!confirm(`Replace the ${n} player(s) on this device with the ${m} from the backup?`)) return;
    profiles = incoming;
    saveProfiles();
    pick = [["guest"], ["guest"], ["guest"]];
    renderPlayers();
    renderPickers();
  } catch {
    alert("That file doesn't look like a crokinole players backup.");
  }
});

/* ---------- app updates ---------- */
let swReg = null;
let reloading = false;

function showUpdateReady() {
  $("update-banner").classList.remove("hidden");
  $("update-status").textContent = "A new version is ready — tap the Update bar.";
}

function watchForUpdates(reg) {
  swReg = reg;
  if (reg.waiting) {
    showUpdateReady();
    return;
  }
  reg.addEventListener("updatefound", () => {
    const incoming = reg.installing;
    incoming.addEventListener("statechange", () => {
      if (incoming.state === "installed" && navigator.serviceWorker.controller) {
        showUpdateReady();
      }
    });
  });
}

$("update-banner").addEventListener("click", () => {
  swReg?.waiting?.postMessage("SKIP_WAITING");
});

$("check-updates").addEventListener("click", async () => {
  const status = $("update-status");
  if (!swReg) {
    status.textContent = "Updates only work in the installed/hosted app.";
    return;
  }
  status.textContent = "Checking…";
  try {
    await swReg.update();
    setTimeout(() => {
      if (swReg.waiting || swReg.installing) showUpdateReady();
      else status.textContent = `You're on the latest version (${APP_VERSION}).`;
    }, 1500);
  } catch {
    status.textContent = "Couldn't check — are you online?";
  }
});

/* ---------- boot ---------- */
/* one-time XP backfill for profiles created before the levels system */
{
  let migrated = false;
  for (const p of Object.values(profiles)) {
    if (p.xp === undefined) {
      const tw = p.samples.reduce((s, x) => s + x.tw, 0);
      p.xp = Math.round(
        p.samples.length * XP.round +
          tw * XP.twenty +
          (p.games || 0) * XP.gamePlayed +
          (p.wins || 0) * XP.gameWin +
          Object.keys(p.badges || {}).length * XP.badge
      );
      migrated = true;
    }
  }
  if (migrated) saveProfiles();
}

renderPickers();
render();
$("app-version").textContent = APP_VERSION;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(watchForUpdates);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) swReg?.update().catch(() => {});
  });
}

/* ask the browser to protect this origin's storage from auto-eviction */
if (navigator.storage && navigator.storage.persist) {
  navigator.storage
    .persisted()
    .then((ok) => ok || navigator.storage.persist())
    .then((ok) => {
      $("persist-line").textContent = ok
        ? "Storage protection: on — the browser won't auto-evict this app's data."
        : "Storage protection: not granted — keep backups of your players.";
    })
    .catch(() => {});
}

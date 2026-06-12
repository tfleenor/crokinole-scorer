"use strict";

const STORAGE_KEY = "crokinole-state-v1";
const VALUES = [20, 15, 10, 5];
const blankTally = () => ({ 20: 0, 15: 0, 10: 0, 5: 0 });

let state = load() || null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const $ = (id) => document.getElementById(id);

/* ---------- tabs ---------- */
$("tab-score").addEventListener("click", () => showTab("score"));
$("tab-rules").addEventListener("click", () => showTab("rules"));

function showTab(which) {
  $("view-score").classList.toggle("hidden", which !== "score");
  $("view-rules").classList.toggle("hidden", which !== "rules");
  $("tab-score").classList.toggle("active", which === "score");
  $("tab-rules").classList.toggle("active", which === "rules");
}

/* ---------- setup ---------- */
$("mode").addEventListener("change", () => {
  const tourney = $("mode").value === "tournament";
  $("target-field").classList.toggle("hidden", tourney);
  $("rounds-field").classList.toggle("hidden", !tourney);
});

$("start").addEventListener("click", () => {
  const mode = $("mode").value;
  const defaults = mode === "doubles" ? ["Team 1", "Team 2"] : ["Player 1", "Player 2"];
  state = {
    mode,
    names: [
      $("name0").value.trim() || defaults[0],
      $("name1").value.trim() || defaults[1],
    ],
    target: parseInt($("target").value, 10),
    totalRounds: parseInt($("totalRounds").value, 10),
    scores: [0, 0],
    twenties: [0, 0],
    rounds: [],
    tally: [blankTally(), blankTally()],
    winner: null,
  };
  save();
  render();
});

/* ---------- game actions ---------- */
$("score-round").addEventListener("click", () => {
  if (state.winner !== null) return;
  const pts = state.tally.map(boardPoints);
  const entry = { tally: state.tally.map((t) => ({ ...t })), pts, awarded: [0, 0] };

  if (state.mode === "tournament") {
    if (pts[0] > pts[1]) entry.awarded = [2, 0];
    else if (pts[1] > pts[0]) entry.awarded = [0, 2];
    else entry.awarded = [1, 1];
  } else {
    const diff = pts[0] - pts[1];
    if (diff > 0) entry.awarded = [diff, 0];
    else if (diff < 0) entry.awarded = [0, -diff];
  }

  state.scores[0] += entry.awarded[0];
  state.scores[1] += entry.awarded[1];
  state.twenties[0] += state.tally[0][20];
  state.twenties[1] += state.tally[1][20];
  state.rounds.push(entry);
  state.tally = [blankTally(), blankTally()];
  checkWinner();
  save();
  render();
});

$("undo").addEventListener("click", () => {
  const entry = state.rounds.pop();
  if (!entry) return;
  state.scores[0] -= entry.awarded[0];
  state.scores[1] -= entry.awarded[1];
  state.twenties[0] -= entry.tally[0][20];
  state.twenties[1] -= entry.tally[1][20];
  state.tally = entry.tally;
  state.winner = null;
  save();
  render();
});

$("new-game").addEventListener("click", () => {
  if (state.rounds.length === 0 || state.winner !== null ||
      confirm("Abandon the current game?")) {
    state = null;
    localStorage.removeItem(STORAGE_KEY);
    render();
  }
});

function boardPoints(t) {
  return VALUES.reduce((sum, v) => sum + v * t[v], 0);
}

function checkWinner() {
  if (state.mode === "tournament") {
    if (state.rounds.length >= state.totalRounds) {
      if (state.scores[0] !== state.scores[1]) {
        state.winner = state.scores[0] > state.scores[1] ? 0 : 1;
      } else if (state.twenties[0] !== state.twenties[1]) {
        state.winner = state.twenties[0] > state.twenties[1] ? 0 : 1;
      } else {
        state.winner = -1; // dead tie
      }
    }
  } else if (state.scores[0] >= state.target || state.scores[1] >= state.target) {
    state.winner = state.scores[0] >= state.target ? 0 : 1;
  }
}

/* ---------- rendering ---------- */
function render() {
  const inGame = state !== null;
  $("setup").classList.toggle("hidden", inGame);
  $("game").classList.toggle("hidden", !inGame);
  if (!inGame) return;

  renderScoreboard();
  renderBanner();
  renderSide(0);
  renderSide(1);
  renderHistory();
  $("score-round").classList.toggle("hidden", state.winner !== null);
}

function renderScoreboard() {
  const mid = state.mode === "tournament"
    ? `Round ${Math.min(state.rounds.length + 1, state.totalRounds)} of ${state.totalRounds}`
    : `to ${state.target}`;
  const sub = (i) => state.mode === "tournament"
    ? `${state.twenties[i]} twenties`
    : `${state.twenties[i]} twenties · ${state.rounds.length} rounds`;
  $("scoreboard").innerHTML = `
    <div class="side">
      <div class="name">${esc(state.names[0])}</div>
      <div class="pts">${state.scores[0]}</div>
      <div class="sub">${sub(0)}</div>
    </div>
    <div class="mid">${mid}</div>
    <div class="side">
      <div class="name">${esc(state.names[1])}</div>
      <div class="pts">${state.scores[1]}</div>
      <div class="sub">${sub(1)}</div>
    </div>`;
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
    const note = state.mode === "tournament" &&
      state.scores[0] === state.scores[1] ? " (on twenties)" : "";
    b.textContent = `${state.names[state.winner]} wins${note}! 🏆`;
  }
}

function renderSide(i) {
  const t = state.tally[i];
  const rows = VALUES.map((v) => `
    <div class="counter" data-side="${i}" data-value="${v}">
      <span class="label">${v}</span>
      <button class="dec" aria-label="minus">−</button>
      <span class="val">${t[v]}</span>
      <button class="inc" aria-label="plus">+</button>
    </div>`).join("");
  $("side" + i).innerHTML = `
    <h3>${esc(state.names[i])}</h3>
    ${rows}
    <div class="round-total">this round<br><strong>${boardPoints(t)}</strong></div>`;
}

function renderHistory() {
  $("history").classList.toggle("hidden", state.rounds.length === 0);
  $("history-list").innerHTML = state.rounds.map((r) => {
    const tag = state.mode === "tournament"
      ? `${r.awarded[0]}–${r.awarded[1]}`
      : r.awarded[0] > 0 ? `+${r.awarded[0]} ${esc(state.names[0])}`
      : r.awarded[1] > 0 ? `+${r.awarded[1]} ${esc(state.names[1])}`
      : "wash";
    return `<li>board ${r.pts[0]}–${r.pts[1]} → <strong>${tag}</strong></li>`;
  }).join("");
}

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* counter taps (delegated so re-rendering keeps working) */
$("tally-area").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || state === null || state.winner !== null) return;
  const row = btn.closest(".counter");
  const side = parseInt(row.dataset.side, 10);
  const value = row.dataset.value;
  const t = state.tally[side];
  if (btn.classList.contains("inc") && t[value] < 12) t[value]++;
  if (btn.classList.contains("dec") && t[value] > 0) t[value]--;
  save();
  renderSide(side);
});

/* ---------- boot ---------- */
render();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

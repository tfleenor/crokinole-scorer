"use strict";

const STORAGE_KEY = "crokinole-state-v2";
const PROFILES_KEY = "crokinole-profiles-v1";
const VALUES = [20, 15, 10, 5];
const RATING_WINDOW = 30; // recent rounds used for the rating average
const MIN_ROUNDS = 4; // rounds needed before a rating is established
const blankTally = () => ({ 20: 0, 15: 0, 10: 0, 5: 0 });

let state = loadJSON(STORAGE_KEY);
let profiles = loadJSON(PROFILES_KEY) || {};

/* setup-screen selections (session only): profile ids or "guest" per slot */
let pick = [["guest"], ["guest"]];
let guestNames = [["", ""], ["", ""]];

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

/* ---------- ratings ---------- */
function rating(p) {
  const recent = p.samples.slice(-RATING_WINDOW);
  const discs = recent.reduce((s, x) => s + x.discs, 0);
  if (!discs) return null;
  const pts = recent.reduce((s, x) => s + x.pts, 0);
  return (pts / discs) * 12; // board points per full round of 12 discs
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
$("mode").addEventListener("change", () => {
  const tourney = $("mode").value === "tournament";
  $("target-field").classList.toggle("hidden", tourney);
  $("rounds-field").classList.toggle("hidden", !tourney);
  renderPickers();
});

$("side-pickers").addEventListener("change", (e) => {
  if (!e.target.classList.contains("picker")) return;
  pick[e.target.dataset.side][e.target.dataset.slot] = e.target.value;
  renderPickers();
});

$("side-pickers").addEventListener("input", (e) => {
  if (!e.target.classList.contains("guest-name")) return;
  guestNames[e.target.dataset.side][e.target.dataset.slot] = e.target.value;
});

function slotCount() {
  return $("mode").value === "doubles" ? 2 : 1;
}

function ratingTag(p) {
  const r = rating(p);
  if (r === null) return " — new";
  return ` — ${r.toFixed(1)}${established(p) ? "" : " (prov.)"}`;
}

function renderPickers() {
  const slots = slotCount();
  const list = Object.values(profiles).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  let html = "";
  for (let s = 0; s < 2; s++) {
    pick[s] = pick[s].slice(0, slots);
    while (pick[s].length < slots) pick[s].push("guest");
    html += `<fieldset class="side-pick"><legend>Side ${s + 1}</legend>`;
    for (let k = 0; k < slots; k++) {
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
        html += `<input class="guest-name" data-side="${s}" data-slot="${k}" type="text" maxlength="20" placeholder="${slots > 1 ? `Player ${s * 2 + k + 1} name` : "Player / Team name"}" value="${esc(guestNames[s][k] || "")}">`;
      }
    }
    html += `</fieldset>`;
  }
  $("side-pickers").innerHTML = html;
  renderHandicapRow();
}

function handicapInfo() {
  const slots = slotCount();
  const sidePicks = [0, 1].map((s) => pick[s].slice(0, slots));
  const ids = sidePicks.flat().filter((id) => id !== "guest");
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: "The same player can't be on both sides." };
  }
  const exps = sidePicks.map((row) => {
    const ps = row.map((id) => (id !== "guest" ? profiles[id] : null));
    if (ps.some((p) => !p || !established(p))) return null;
    return ps.reduce((sum, p) => sum + rating(p), 0) / ps.length;
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
  return (
    (guestNames[s][k] || "").trim() ||
    (slots > 1 ? `Player ${s * 2 + k + 1}` : `Player ${s + 1}`)
  );
}

$("start").addEventListener("click", () => {
  const mode = $("mode").value;
  const slots = slotCount();
  const chosen = [0, 1]
    .flatMap((s) => pick[s].slice(0, slots))
    .filter((id) => id !== "guest");
  if (new Set(chosen).size !== chosen.length) {
    alert("The same player can't be picked twice.");
    return;
  }
  const sides = [0, 1].map((s) => {
    const players = pick[s].slice(0, slots);
    return {
      name: players.map((_, k) => slotName(s, k, slots)).join(" & "),
      players,
    };
  });
  const hc = $("use-handicap").checked ? handicapInfo() : null;
  state = {
    mode,
    sides,
    target: parseInt($("target").value, 10),
    totalRounds: parseInt($("totalRounds").value, 10),
    handicap: hc && hc.ok && hc.bonus > 0 ? { to: hc.to, bonus: hc.bonus } : null,
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
  const adj = pts.slice();
  if (state.handicap) adj[state.handicap.to] += state.handicap.bonus;

  const entry = {
    tally: state.tally.map((t) => ({ ...t })),
    pts,
    adj,
    awarded: [0, 0],
    credits: [],
  };

  if (state.mode === "tournament") {
    if (adj[0] > adj[1]) entry.awarded = [2, 0];
    else if (adj[1] > adj[0]) entry.awarded = [0, 2];
    else entry.awarded = [1, 1];
  } else {
    const diff = adj[0] - adj[1];
    if (diff > 0) entry.awarded = [diff, 0];
    else if (diff < 0) entry.awarded = [0, -diff];
  }

  /* credit real (unadjusted) board points to profile histories */
  for (let i = 0; i < 2; i++) {
    const players = state.sides[i].players;
    for (const pid of players) {
      if (pid === "guest" || !profiles[pid]) continue;
      profiles[pid].samples.push({
        pts: pts[i] / players.length,
        discs: 12 / players.length,
        tw: state.tally[i][20] / players.length,
      });
      entry.credits.push(pid);
    }
  }
  saveProfiles();

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
  for (const pid of entry.credits || []) profiles[pid]?.samples.pop();
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
    localStorage.removeItem(STORAGE_KEY);
    renderPickers();
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
            return `<div class="profile-row" data-id="${p.id}">
              <div>
                <div class="profile-name">${esc(p.name)}</div>
                <div class="profile-stats">${stat} · ${n} rounds · ${tw} twenties/round</div>
              </div>
              <button class="del-profile" aria-label="delete player">✕</button>
            </div>`;
          })
          .join("");
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
  renderSide(0);
  renderSide(1);
  renderHistory();
  $("score-round").classList.toggle("hidden", state.winner !== null);
}

function renderScoreboard() {
  const mid =
    state.mode === "tournament"
      ? `Round ${Math.min(state.rounds.length + 1, state.totalRounds)} of ${state.totalRounds}`
      : `to ${state.target}`;
  const sub = (i) => {
    const parts = [];
    if (state.handicap && state.handicap.to === i)
      parts.push(`+${state.handicap.bonus} hcp/rd`);
    parts.push(`${state.twenties[i]} twenties`);
    if (state.mode !== "tournament") parts.push(`${state.rounds.length} rounds`);
    return parts.join(" · ");
  };
  $("scoreboard").innerHTML = `
    <div class="side">
      <div class="name">${esc(state.sides[0].name)}</div>
      <div class="pts">${state.scores[0]}</div>
      <div class="sub">${sub(0)}</div>
    </div>
    <div class="mid">${mid}</div>
    <div class="side">
      <div class="name">${esc(state.sides[1].name)}</div>
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
    const note =
      state.mode === "tournament" && state.scores[0] === state.scores[1]
        ? " (on twenties)"
        : "";
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
      const tag =
        state.mode === "tournament"
          ? `${r.awarded[0]}–${r.awarded[1]}`
          : r.awarded[0] > 0
            ? `+${r.awarded[0]} ${esc(state.sides[0].name)}`
            : r.awarded[1] > 0
              ? `+${r.awarded[1]} ${esc(state.sides[1].name)}`
              : "wash";
      return `<li>board ${disp(0)}–${disp(1)} → <strong>${tag}</strong></li>`;
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
  if (btn.classList.contains("inc") && t[value] < 12) t[value]++;
  if (btn.classList.contains("dec") && t[value] > 0) t[value]--;
  save();
  renderSide(side);
});

/* ---------- boot ---------- */
renderPickers();
render();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

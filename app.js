"use strict";

const APP_VERSION = "v8"; // keep in step with CACHE in sw.js
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

/* ---------- badges ---------- */
const BADGES = [
  { id: "first-round", icon: "🌱", name: "Warming Up", desc: "Record your first round." },
  { id: "double-20", icon: "🎯", name: "Double Deuce", desc: "Two 20s in a single round." },
  { id: "hat-trick", icon: "🎩", name: "Hat Trick", desc: "Three 20s in a single round." },
  { id: "quad-20", icon: "👁️", name: "20/20 Vision", desc: "Four or more 20s in a single round." },
  { id: "century", icon: "💯", name: "Century Club", desc: "Score 100+ board points in one round." },
  { id: "shutout", icon: "🦨", name: "Skunked 'Em", desc: "Take a round while holding the other side to zero." },
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
  if (pts[i] > 0 && pts[1 - i] === 0) award(pid, "shutout", entry, newly);
  const n = p.samples.length;
  if (n >= 25) award(pid, "rounds-25", entry, newly);
  if (n >= 100) award(pid, "rounds-100", entry, newly);
  const tw = p.samples.reduce((s, x) => s + x.tw, 0);
  if (tw >= 10) award(pid, "tw-10", entry, newly);
  if (tw >= 50) award(pid, "tw-50", entry, newly);
  if (tw >= 100) award(pid, "tw-100", entry, newly);
}

function wonFromBehind(winSide) {
  if (state.mode === "tournament") return false;
  let mine = 0, theirs = 0;
  for (const r of state.rounds) {
    mine += r.awarded[winSide];
    theirs += r.awarded[1 - winSide];
    if (theirs - mine >= 30) return true;
  }
  return false;
}

function awardGameEnd(entry, newly) {
  const winSide = state.winner;
  entry.gameStats = [];
  for (let i = 0; i < 2; i++) {
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
    const result =
      state.mode === "tournament"
        ? entry.awarded[i] === 2 ? "win" : entry.awarded[i] === 1 ? "tie" : "loss"
        : entry.awarded[i] > 0 ? "win" : entry.awarded[1 - i] > 0 ? "loss" : "tie";
    for (const pid of players) {
      if (pid === "guest" || !profiles[pid]) continue;
      const twShare = state.tally[i][20] / players.length;
      profiles[pid].samples.push({
        pts: pts[i] / players.length,
        discs: 12 / players.length,
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

  state.scores[0] += entry.awarded[0];
  state.scores[1] += entry.awarded[1];
  state.twenties[0] += state.tally[0][20];
  state.twenties[1] += state.tally[1][20];
  state.rounds.push(entry);
  state.tally = [blankTally(), blankTally()];
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
});

$("undo").addEventListener("click", () => {
  const entry = state.rounds.pop();
  if (!entry) return;
  state.scores[0] -= entry.awarded[0];
  state.scores[1] -= entry.awarded[1];
  state.twenties[0] -= entry.tally[0][20];
  state.twenties[1] -= entry.tally[1][20];
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
    pick = [["guest"], ["guest"]];
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

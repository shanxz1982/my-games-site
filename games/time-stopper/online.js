/* TIME STOPPER — 联网对战 / 多人挑战 (Firestore) */
(function () {
"use strict";

const ROOMS = "timestopper_rooms";
const AI_FILL_MS = 22000;
const ROUND_TIMEOUT_MS = 9000;
const TIMING_DURATION = 1400;
const PLAYER_MAX_HP = 100;
const LS_PID = "tsOnlinePlayerId";
const LS_NAME = "tsOnlineDisplayName";
const BOT_NAMES = ["银时Bot", "时雨Bot", "量子Bot", "影秒Bot", "回响Bot", "脉冲Bot"];

/**
 * Firestore rules note (paste into Firebase Console → Firestore Rules if rooms fail):
 *
 * match /timestopper_rooms/{roomId} {
 *   allow read, write: if true; // casual party game — tighten later
 * }
 * match /timestopper_hall/{docId} {
 *   allow read: if true;
 *   allow create: if true;
 * }
 */

const Online = {
  active: false,
  mode: null, // 'pvp' | 'raid'
  roomId: null,
  unsub: null,
  room: null,
  amHost: false,
  localTiming: {
    running: false,
    start: 0,
    raf: 0,
    stopped: false
  },
  rewardTiming: {
    running: false,
    start: 0,
    raf: 0
  },
  fillTimer: null,
  resolveLock: false,
  lastStatus: null,
  aiScheduledRound: -1,
  hostTick: null
};

function $(s, root) { return (root || document).querySelector(s); }
function $$(s, root) { return Array.from((root || document).querySelectorAll(s)); }

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function uid() {
  try {
    let id = localStorage.getItem(LS_PID);
    if (id && id.length >= 8) return id;
    id = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(LS_PID, id);
    return id;
  } catch (e) {
    return "p_" + Math.random().toString(36).slice(2, 12);
  }
}

function getDisplayName() {
  try {
    const n = localStorage.getItem(LS_NAME);
    if (n && n.trim()) return n.trim().slice(0, 12);
  } catch (e) {}
  return "旅人" + uid().slice(-4);
}

function setDisplayName(name) {
  const n = String(name || "").trim().slice(0, 12) || getDisplayName();
  try { localStorage.setItem(LS_NAME, n); } catch (e) {}
  return n;
}

function myId() { return uid(); }

function db() {
  if (typeof firebase === "undefined") return null;
  if (!firebase.apps.length) {
    if (!window.FIREBASE_CONFIG) return null;
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }
  return firebase.firestore();
}

function roomRef(code) {
  const d = db();
  if (!d) return null;
  return d.collection(ROOMS).doc(code);
}

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function rollTargetMs() {
  const pool = [420, 450, 480, 500, 520, 550, 580, 600, 650, 700, 720, 750, 800];
  return pool[Math.floor(Math.random() * pool.length)];
}

function botNoise() {
  // similar to story easy/normal
  const easy = Math.random() < 0.45;
  const minN = easy ? 90 : 50;
  const maxN = easy ? 320 : 200;
  const mag = minN + Math.random() * (maxN - minN);
  const sign = Math.random() < 0.5 ? -1 : 1;
  return Math.round(sign * mag);
}

function makeBot(seat) {
  const name = BOT_NAMES[(seat + Math.floor(Math.random() * BOT_NAMES.length)) % BOT_NAMES.length];
  return {
    id: "bot_" + seat + "_" + Math.random().toString(36).slice(2, 7),
    name: name,
    isBot: true,
    seat: seat,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    atk: 10,
    def: 2,
    alive: true,
    targetMs: null,
    stopMs: null,
    dist: null,
    stopped: false,
    ready: true
  };
}

function makeHuman(seat, name) {
  return {
    id: myId(),
    name: name || getDisplayName(),
    isBot: false,
    seat: seat,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    atk: 10,
    def: 2,
    alive: true,
    targetMs: null,
    stopMs: null,
    dist: null,
    stopped: false,
    ready: true
  };
}

function bossMaxHp(n) {
  // 2→800, 3→1000, 4→1200
  return 800 + Math.max(0, n - 2) * 200;
}

function showOnlineRoot(show) {
  const root = $("#onlineRoot");
  if (!root) return;
  root.classList.toggle("hidden", !show);
  root.setAttribute("aria-hidden", show ? "false" : "true");
}

function showOnlineScreen(id) {
  $$(".online-screen").forEach((el) => el.classList.add("hidden"));
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

function openMultiChoice() {
  const modal = $("#multiChoiceModal");
  if (modal) modal.style.display = "flex";
}

function closeMultiChoice() {
  const modal = $("#multiChoiceModal");
  if (modal) modal.style.display = "none";
}

function enterLocalMulti() {
  closeMultiChoice();
  if (typeof setMode === "function") setMode("multi");
}

function enterOnlineLobby(mode) {
  closeMultiChoice();
  Online.mode = mode;
  Online.active = true;
  Online.room = null;
  Online.roomId = null;
  Online.amHost = false;
  Online.resolveLock = false;
  Online.aiScheduledRound = -1;
  stopLocalTiming();
  stopRewardTiming();
  clearFillTimer();
  clearHostTick();

  const menu = document.getElementById("menuScreen");
  const game = document.getElementById("gameScreen");
  const start = document.getElementById("startScreen");
  if (start) start.style.display = "none";
  if (menu) menu.style.display = "none";
  if (game) game.style.display = "none";
  const sr = document.getElementById("storyRoot");
  if (sr) { sr.classList.add("hidden"); sr.setAttribute("aria-hidden", "true"); }

  showOnlineRoot(true);
  showOnlineScreen("onlineLobby");
  $("#onlineLobbyTitle").textContent = mode === "raid" ? "多人挑战 · 组队大厅" : "联网对战 · 大厅";
  $("#onlineLobbyHint").textContent = mode === "raid"
    ? "2–4 人联机挑战终极魔王。等待约 22 秒后空位由 AI 补齐。"
    : "2–4 人联网对战。等待约 22 秒后空位由 AI 补齐。";
  const nameInput = $("#onlineNameInput");
  if (nameInput) nameInput.value = getDisplayName();
  $("#onlineRoomCodeInput").value = "";
  $("#onlineLobbyStatus").textContent = "创建房间或输入房间码加入";
  $("#onlineLobbyPlayers").innerHTML = "";
  $("#onlineLobbyCode").textContent = "—";
  $("#onlineWaitBar").style.width = "0%";
  $("#onlineHostActions").classList.add("hidden");
  if (typeof playSound === "function") playSound("tick");
}

async function createRoom() {
  const name = setDisplayName($("#onlineNameInput").value);
  const d = db();
  if (!d) {
    $("#onlineLobbyStatus").textContent = "Firebase 未就绪，请检查 firebase-config.js";
    return;
  }
  let code = genRoomCode();
  let tries = 0;
  while (tries < 8) {
    const snap = await roomRef(code).get();
    if (!snap.exists) break;
    code = genRoomCode();
    tries++;
  }
  const me = makeHuman(0, name);
  const now = Date.now();
  const doc = {
    mode: Online.mode,
    status: "lobby",
    hostId: me.id,
    maxPlayers: 4,
    createdAt: now,
    updatedAt: now,
    waitStartedAt: now,
    round: 0,
    phase: "idle",
    players: [me],
    boss: null,
    log: "房间已创建，等待玩家加入…",
    winnerId: null,
    rewardQueue: [],
    reward: null,
    roundTimeoutAt: null,
    version: 1
  };
  try {
    await roomRef(code).set(doc);
  } catch (e) {
    $("#onlineLobbyStatus").textContent = "创建失败：" + (e.message || e) + "（可能需开放 Firestore 规则，见 online.js 顶部注释）";
    return;
  }
  Online.roomId = code;
  Online.amHost = true;
  $("#onlineLobbyCode").textContent = code;
  $("#onlineLobbyStatus").textContent = "房间 " + code + " · 将链接分享给好友";
  $("#onlineHostActions").classList.remove("hidden");
  subscribeRoom(code);
  startFillWatch();
}

async function joinRoom() {
  const name = setDisplayName($("#onlineNameInput").value);
  const raw = ($("#onlineRoomCodeInput").value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(raw)) {
    $("#onlineLobbyStatus").textContent = "请输入 4 位房间码";
    return;
  }
  const d = db();
  if (!d) {
    $("#onlineLobbyStatus").textContent = "Firebase 未就绪";
    return;
  }
  const ref = roomRef(raw);
  try {
    await d.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("房间不存在");
      const data = snap.data();
      if (data.status !== "lobby") throw new Error("对局已开始，无法加入");
      if (data.mode !== Online.mode) throw new Error("模式不匹配（当前选的是" + (Online.mode === "raid" ? "挑战" : "对战") + "）");
      let players = Array.isArray(data.players) ? data.players.slice() : [];
      const existing = players.find((p) => p.id === myId());
      if (existing) {
        existing.name = name;
        existing.isBot = false;
      } else {
        if (players.filter((p) => !p.isBot).length + players.filter((p) => p.isBot).length >= (data.maxPlayers || 4)) {
          // count all
        }
        if (players.length >= (data.maxPlayers || 4)) throw new Error("房间已满");
        players.push(makeHuman(players.length, name));
      }
      tx.update(ref, {
        players: players,
        updatedAt: Date.now(),
        log: name + " 加入了房间"
      });
    });
  } catch (e) {
    $("#onlineLobbyStatus").textContent = "加入失败：" + (e.message || e);
    return;
  }
  Online.roomId = raw;
  Online.amHost = false;
  $("#onlineLobbyCode").textContent = raw;
  $("#onlineHostActions").classList.add("hidden");
  subscribeRoom(raw);
  startFillWatch();
}

function subscribeRoom(code) {
  if (Online.unsub) { Online.unsub(); Online.unsub = null; }
  const ref = roomRef(code);
  if (!ref) return;
  Online.unsub = ref.onSnapshot((snap) => {
    if (!snap.exists) {
      $("#onlineLobbyStatus").textContent = "房间已解散";
      return;
    }
    const data = snap.data();
    Online.room = data;
    Online.amHost = data.hostId === myId();
    renderFromRoom(data);
    if (Online.amHost) hostThink(data);
  }, (err) => {
    console.warn("room snapshot", err);
    $("#onlineLobbyStatus").textContent = "同步错误：" + (err.message || err);
  });
}

function clearFillTimer() {
  if (Online.fillTimer) { clearInterval(Online.fillTimer); Online.fillTimer = null; }
}

function clearHostTick() {
  if (Online.hostTick) { clearInterval(Online.hostTick); Online.hostTick = null; }
}

function startFillWatch() {
  clearFillTimer();
  Online.fillTimer = setInterval(() => {
    const room = Online.room;
    if (!room || room.status !== "lobby") return;
    const started = room.waitStartedAt || room.createdAt || Date.now();
    const elapsed = Date.now() - started;
    const pct = Math.min(100, (elapsed / AI_FILL_MS) * 100);
    const bar = $("#onlineWaitBar");
    if (bar) bar.style.width = pct + "%";
    const left = Math.max(0, Math.ceil((AI_FILL_MS - elapsed) / 1000));
    const waitEl = $("#onlineWaitText");
    if (waitEl) waitEl.textContent = left > 0 ? ("AI 补位倒计时 " + left + "s") : "正在补位…";
  }, 200);
}

function playersList(room) {
  return Array.isArray(room.players) ? room.players : [];
}

function humans(room) {
  return playersList(room).filter((p) => !p.isBot);
}

function alivePlayers(room) {
  return playersList(room).filter((p) => p.alive !== false);
}

async function patchRoom(fields) {
  if (!Online.roomId) return;
  const ref = roomRef(Online.roomId);
  if (!ref) return;
  fields.updatedAt = Date.now();
  await ref.update(fields);
}

async function hostThink(room) {
  if (!Online.amHost || !room) return;

  // AI fill
  if (room.status === "lobby") {
    const started = room.waitStartedAt || room.createdAt || Date.now();
    const elapsed = Date.now() - started;
    const plist = playersList(room);
    const hCount = humans(room).length;
    if (elapsed >= AI_FILL_MS && hCount >= 1) {
      await hostFillBotsAndMaybeStart(room);
      return;
    }
    return;
  }

  if (room.status === "playing" && room.phase === "timing") {
    await hostEnsureAiStops(room);
    await hostCheckRoundComplete(room);
  }

  if (room.status === "playing" && (room.phase === "reward_timing" || room.phase === "reward_pick")) {
    await hostEnsureRewardBot(room);
  }
}

async function hostFillBotsAndMaybeStart(room) {
  if (Online.resolveLock) return;
  Online.resolveLock = true;
  try {
    const ref = roomRef(Online.roomId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      if (data.status !== "lobby") return;
      let players = playersList(data).slice();
      const maxP = data.maxPlayers || 4;
      while (players.length < maxP) {
        players.push(makeBot(players.length));
      }
      if (players.length < 2) {
        players.push(makeBot(players.length));
      }
      if (players.length < 2) return;
      const fields = buildMatchStartFields(data.mode || "pvp", players);
      fields.log = "AI 已补齐空位，对局开始（" + players.length + " 人）";
      fields.updatedAt = Date.now();
      tx.update(ref, fields);
    });
  } catch (e) {
    console.warn("fill bots", e);
  } finally {
    Online.resolveLock = false;
  }
}

function buildMatchStartFields(mode, players) {
  const now = Date.now();
  const n = players.length;
  const resetPlayers = players.map((p, i) => Object.assign({}, p, {
    seat: i,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    atk: 10 + (p.isBot ? 0 : 0),
    def: 2,
    alive: true,
    targetMs: null,
    stopMs: null,
    dist: null,
    stopped: false
  }));
  let boss = null;
  if (mode === "raid") {
    const maxHp = bossMaxHp(n);
    boss = {
      name: "终焉时魔",
      emoji: "👾",
      hp: maxHp,
      maxHp: maxHp,
      atk: 18,
      targetMs: null,
      stopMs: null,
      dist: null,
      stopped: false
    };
  }
  const startRound = beginRoundPayload(resetPlayers, boss, 1, mode);
  return Object.assign({
    status: "playing",
    players: resetPlayers,
    boss: boss,
    winnerId: null,
    rewardQueue: [],
    reward: null,
    log: mode === "raid" ? "挑战开始！击败 " + boss.name + "！" : "对战开始！最后存活者获胜！"
  }, startRound);
}

function beginRoundPayload(players, boss, round, mode) {
  const alive = players.filter((p) => p.alive !== false);
  const nextPlayers = players.map((p) => {
    if (p.alive === false) {
      return Object.assign({}, p, { targetMs: null, stopMs: null, dist: null, stopped: true });
    }
    return Object.assign({}, p, {
      targetMs: rollTargetMs(),
      stopMs: null,
      dist: null,
      stopped: false
    });
  });
  let nextBoss = boss;
  if (mode === "raid" && boss && boss.hp > 0) {
    nextBoss = Object.assign({}, boss, {
      targetMs: rollTargetMs(),
      stopMs: null,
      dist: null,
      stopped: false
    });
  }
  return {
    round: round,
    phase: "timing",
    players: nextPlayers,
    boss: nextBoss,
    roundTimeoutAt: Date.now() + ROUND_TIMEOUT_MS,
    rewardQueue: [],
    reward: null
  };
}

async function hostStartMatch() {
  if (!Online.amHost || !Online.room || Online.room.status !== "lobby") return;
  const plist = playersList(Online.room);
  if (plist.length < 2) {
    // fill one bot so we can start
    await hostFillBotsAndMaybeStart(Online.room);
    return;
  }
  Online.resolveLock = true;
  try {
    const players = plist.slice();
    const fields = buildMatchStartFields(Online.room.mode || Online.mode, players);
    fields.log = "房主提前开局！";
    await patchRoom(fields);
  } catch (e) {
    console.warn(e);
  } finally {
    Online.resolveLock = false;
  }
}

async function hostEnsureAiStops(room) {
  if (Online.aiScheduledRound === room.round) return;
  Online.aiScheduledRound = room.round;
  const players = playersList(room);
  players.forEach((p) => {
    if (!p.isBot || p.alive === false || p.stopped) return;
    const target = p.targetMs || 500;
    const noise = botNoise();
    const stopAt = clamp(target + noise, 80, TIMING_DURATION - 40);
    const delay = 400 + Math.random() * 1200 + Math.abs(noise) * 0.5;
    setTimeout(() => {
      hostWriteBotStop(p.id, stopAt);
    }, delay);
  });
  if (room.mode === "raid" && room.boss && room.boss.hp > 0 && !room.boss.stopped) {
    const target = room.boss.targetMs || 500;
    const noise = botNoise();
    const stopAt = clamp(target + noise, 80, TIMING_DURATION - 40);
    const delay = 500 + Math.random() * 1400;
    setTimeout(() => {
      hostWriteBossStop(stopAt);
    }, delay);
  }
}

async function hostWriteBotStop(botId, stopMs) {
  if (!Online.amHost || !Online.roomId) return;
  const ref = roomRef(Online.roomId);
  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      if (data.phase !== "timing") return;
      const players = playersList(data).map((p) => {
        if (p.id !== botId || p.stopped) return p;
        const dist = Math.abs(stopMs - (p.targetMs || 0));
        return Object.assign({}, p, { stopMs: stopMs, dist: dist, stopped: true });
      });
      tx.update(ref, { players: players, updatedAt: Date.now() });
    });
  } catch (e) { console.warn("bot stop", e); }
}

async function hostWriteBossStop(stopMs) {
  if (!Online.amHost || !Online.roomId) return;
  const ref = roomRef(Online.roomId);
  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      if (data.phase !== "timing" || !data.boss || data.boss.stopped) return;
      const dist = Math.abs(stopMs - (data.boss.targetMs || 0));
      const boss = Object.assign({}, data.boss, { stopMs: stopMs, dist: dist, stopped: true });
      tx.update(ref, { boss: boss, updatedAt: Date.now() });
    });
  } catch (e) { console.warn("boss stop", e); }
}

async function hostCheckRoundComplete(room) {
  if (Online.resolveLock) return;
  const alive = alivePlayers(room);
  const allPlayersStopped = alive.every((p) => p.stopped);
  const bossDone = room.mode !== "raid" || !room.boss || room.boss.hp <= 0 || room.boss.stopped;
  const timedOut = room.roundTimeoutAt && Date.now() >= room.roundTimeoutAt;
  if (!((allPlayersStopped && bossDone) || timedOut)) return;

  Online.resolveLock = true;
  try {
    // force-stop anyone still running
    const ref = roomRef(Online.roomId);
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      if (data.phase !== "timing") return;
      let players = playersList(data).map((p) => {
        if (p.alive === false || p.stopped) return p;
        const stopMs = TIMING_DURATION - 20;
        const dist = Math.abs(stopMs - (p.targetMs || 0));
        return Object.assign({}, p, { stopMs: stopMs, dist: dist, stopped: true });
      });
      let boss = data.boss;
      if (data.mode === "raid" && boss && boss.hp > 0 && !boss.stopped) {
        const stopMs = TIMING_DURATION - 20;
        boss = Object.assign({}, boss, {
          stopMs: stopMs,
          dist: Math.abs(stopMs - (boss.targetMs || 0)),
          stopped: true
        });
      }
      const resolved = data.mode === "raid"
        ? resolveRaidRound(players, boss, data)
        : resolvePvpRound(players, data);
      delete resolved._nextRound;
      tx.update(ref, Object.assign({ updatedAt: Date.now() }, resolved));
    });
  } catch (e) {
    console.warn("resolve", e);
  } finally {
    Online.resolveLock = false;
    Online.aiScheduledRound = -1;
  }
}

function resolvePvpRound(players, data) {
  const alive = players.filter((p) => p.alive !== false);
  const ranked = alive.slice().sort((a, b) => (a.dist || 0) - (b.dist || 0));
  const logs = [];
  const byId = {};
  players.forEach((p) => { byId[p.id] = Object.assign({}, p); });

  const N = ranked.length;
  if (N >= 2) {
    applyPair(ranked[0], ranked[N - 1], byId, logs);
    if (N >= 3) {
      applyPair(ranked[1], ranked[N - 2], byId, logs);
    }
  } else {
    logs.push("存活不足，无法结算。");
  }

  let nextPlayers = players.map((p) => {
    const u = byId[p.id];
    if (u.hp <= 0 && u.alive !== false) {
      u.alive = false;
      u.hp = 0;
      logs.push(u.name + " 被淘汰！");
    }
    return u;
  });

  const still = nextPlayers.filter((p) => p.alive !== false);
  if (still.length <= 1) {
    const winner = still[0] || null;
    return {
      players: nextPlayers,
      phase: "ended",
      status: "ended",
      winnerId: winner ? winner.id : null,
      log: logs.join(" ") + (winner ? (" 🏆 胜者：" + winner.name) : " 无人存活"),
      roundTimeoutAt: null
    };
  }

  // next round after short delay handled by phase resolving → host advances
  return {
    players: nextPlayers,
    phase: "between",
    log: logs.join(" ") || "本回合无伤害",
    roundTimeoutAt: Date.now() + 1800,
    _nextRound: true
  };
}

function applyPair(best, worst, byId, logs) {
  if (!best || !worst || best.id === worst.id) return;
  if (Math.abs((best.dist || 0) - (worst.dist || 0)) < 1e-9) {
    logs.push(best.name + " 与 " + worst.name + " 误差相同，跳过。");
    return;
  }
  // tie within pair ranking: if equal dist skip
  let dmg = Math.max(1, Math.round(Math.abs((best.dist || 0) - (worst.dist || 0))));
  // mild ATK scaling
  dmg = Math.max(1, Math.round(dmg * (1 + ((byId[best.id].atk || 10) - 10) * 0.04)));
  dmg = Math.max(1, Math.round(dmg * (1 - ((byId[worst.id].def || 0) * 0.03))));
  byId[worst.id].hp = (byId[worst.id].hp || 0) - dmg;
  logs.push(best.name + " 命中 " + worst.name + " 造成 " + dmg + " 伤害（差 " + Math.round(Math.abs((best.dist || 0) - (worst.dist || 0))) + "）");
}

function resolveRaidRound(players, boss, data) {
  const logs = [];
  let nextBoss = Object.assign({}, boss);
  const byId = {};
  players.forEach((p) => { byId[p.id] = Object.assign({}, p); });

  const bossDist = nextBoss.dist != null ? nextBoss.dist : 9999;
  const attackers = [];
  players.filter((p) => p.alive !== false).forEach((p) => {
    const pd = p.dist != null ? p.dist : 9999;
    if (pd < bossDist) {
      let dmg = Math.max(1, Math.round(Math.abs(pd - bossDist)));
      dmg = Math.max(1, Math.round(dmg * (1 + ((p.atk || 10) - 10) * 0.05)));
      nextBoss.hp -= dmg;
      logs.push(p.name + " 攻击魔王造成 " + dmg + "！");
      attackers.push(p.id);
    }
  });

  // Boss patterns if any player lost to boss
  const victims = players.filter((p) => p.alive !== false && (p.dist != null ? p.dist : 9999) > bossDist);
  if (victims.length && nextBoss.hp > 0) {
    const patterns = ["aoe", "focus", "heal"];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    if (pattern === "aoe") {
      victims.forEach((v) => {
        let dmg = Math.max(1, Math.round(Math.abs((v.dist || 0) - bossDist)));
        dmg = Math.max(1, Math.round(dmg * 0.85));
        byId[v.id].hp -= dmg;
        logs.push(nextBoss.emoji + " 全体冲击 → " + v.name + " -" + dmg);
      });
    } else if (pattern === "focus") {
      const v = victims[Math.floor(Math.random() * victims.length)];
      let dmg = Math.max(1, Math.round(Math.abs((v.dist || 0) - bossDist) * 1.35));
      byId[v.id].hp -= dmg;
      logs.push(nextBoss.emoji + " 集火 " + v.name + " 造成 " + dmg + "！");
    } else {
      const heal = Math.max(5, Math.round(40 + Math.random() * 60));
      nextBoss.hp = Math.min(nextBoss.maxHp, nextBoss.hp + heal);
      logs.push(nextBoss.emoji + " 汲取时间之力，回复 " + heal + " HP");
    }
  } else if (!attackers.length && nextBoss.hp > 0) {
    logs.push("势均力敌，本回合无伤。");
  }

  let nextPlayers = players.map((p) => {
    const u = byId[p.id];
    if (u.hp <= 0 && u.alive !== false) {
      u.alive = false;
      u.hp = 0;
      logs.push(u.name + " 倒下了…");
    }
    return u;
  });

  if (nextBoss.hp <= 0) {
    nextBoss.hp = 0;
    return {
      players: nextPlayers,
      boss: nextBoss,
      phase: "ended",
      status: "ended",
      winnerId: "party",
      log: logs.join(" ") + " 🎉 魔王倒下！挑战成功！",
      roundTimeoutAt: null,
      rewardQueue: [],
      reward: null
    };
  }

  const still = nextPlayers.filter((p) => p.alive !== false);
  if (!still.length) {
    return {
      players: nextPlayers,
      boss: nextBoss,
      phase: "ended",
      status: "ended",
      winnerId: null,
      log: logs.join(" ") + " 全员覆灭…",
      roundTimeoutAt: null
    };
  }

  if (attackers.length) {
    return {
      players: nextPlayers,
      boss: nextBoss,
      phase: "reward_pick",
      rewardQueue: attackers.slice(),
      reward: {
        playerId: attackers[0],
        stat: null,
        targetMs: rollTargetMs(),
        stopMs: null,
        done: false
      },
      log: logs.join(" ") + " · 奖励轮到 " + (byId[attackers[0]] && byId[attackers[0]].name),
      roundTimeoutAt: Date.now() + 45000
    };
  }

  return {
    players: nextPlayers,
    boss: nextBoss,
    phase: "between",
    log: logs.join(" ") || "下一回合准备中",
    roundTimeoutAt: Date.now() + 1800,
    rewardQueue: [],
    reward: null,
    _nextRound: true
  };
}

async function hostAdvanceBetween() {
  if (!Online.amHost || !Online.room) return;
  const room = Online.room;
  if (room.phase !== "between") return;
  if (room.roundTimeoutAt && Date.now() < room.roundTimeoutAt) return;
  if (Online.resolveLock) return;
  Online.resolveLock = true;
  try {
    const players = playersList(room);
    const payload = beginRoundPayload(players, room.boss, (room.round || 0) + 1, room.mode);
    payload.log = "第 " + payload.round + " 回合 · 各自瞄准目标！";
    payload.status = "playing";
    await patchRoom(payload);
    Online.aiScheduledRound = -1;
  } catch (e) { console.warn(e); }
  finally { Online.resolveLock = false; }
}

// Host interval to advance between-rounds and timeout checks
function ensureHostLoop() {
  clearHostTick();
  Online.hostTick = setInterval(() => {
    if (!Online.amHost || !Online.room) return;
    const room = Online.room;
    if (room.status === "playing" && room.phase === "between") {
      hostAdvanceBetween();
    }
    if (room.status === "playing" && room.phase === "timing") {
      hostCheckRoundComplete(room);
    }
    if (room.status === "playing" && (room.phase === "reward_timing" || room.phase === "reward_pick")) {
      hostEnsureRewardBot(room);
      if (room.roundTimeoutAt && Date.now() >= room.roundTimeoutAt) {
        hostForceFinishReward();
      }
    }
    if (room.status === "lobby") {
      const started = room.waitStartedAt || room.createdAt || Date.now();
      if (Date.now() - started >= AI_FILL_MS && humans(room).length >= 1) {
        hostFillBotsAndMaybeStart(room);
      }
    }
  }, 400);
}

async function hostEnsureRewardBot(room) {
  const rew = room.reward;
  if (!rew || rew.done) return;
  const p = playersList(room).find((x) => x.id === rew.playerId);
  if (!p || !p.isBot) return;
  if (Online.resolveLock) return;
  if (room.phase !== "reward_pick" && room.phase !== "reward_timing") return;
  Online.resolveLock = true;
  try {
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 700));
    const stats = ["hp", "atk", "def"];
    const stat = rew.stat || stats[Math.floor(Math.random() * stats.length)];
    const target = rew.targetMs || 500;
    const stopMs = clamp(target + botNoise(), 80, TIMING_DURATION - 40);
    await applyRewardResult(rew.playerId, stat, stopMs);
  } catch (e) { console.warn(e); }
  finally { Online.resolveLock = false; }
}

async function hostForceFinishReward() {
  if (!Online.room || !Online.room.reward) return;
  const rew = Online.room.reward;
  if (rew.done) return;
  const stopMs = rew.targetMs || 500;
  await applyRewardResult(rew.playerId, rew.stat || "hp", stopMs);
}

function rewardGain(diff) {
  return Math.max(1, Math.floor((120 - Math.min(120, diff)) / 8));
}

async function applyRewardResult(playerId, stat, stopMs) {
  const ref = roomRef(Online.roomId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data();
    if (data.phase !== "reward_pick" && data.phase !== "reward_timing") return;
    const rew = data.reward;
    if (!rew || rew.playerId !== playerId) return;
    const target = rew.targetMs || 500;
    const diff = Math.abs(stopMs - target);
    const gain = rewardGain(diff);
    let players = playersList(data).map((p) => {
      if (p.id !== playerId) return p;
      const u = Object.assign({}, p);
      if (stat === "hp") {
        u.maxHp = (u.maxHp || PLAYER_MAX_HP) + gain * 2;
        u.hp = Math.min(u.maxHp, (u.hp || 0) + Math.max(gain * 3, 8));
      } else if (stat === "atk") {
        u.atk = (u.atk || 10) + Math.max(1, Math.floor(gain / 2));
      } else {
        u.def = (u.def || 2) + Math.max(1, Math.floor(gain / 3));
      }
      return u;
    });
    let queue = Array.isArray(data.rewardQueue) ? data.rewardQueue.slice() : [];
    // remove current
    queue = queue.filter((id) => id !== playerId);
    const pname = (players.find((p) => p.id === playerId) || {}).name || "玩家";
    const statLabel = stat === "hp" ? "HP" : stat === "atk" ? "ATK" : "DEF";
    let fields = {
      players: players,
      updatedAt: Date.now(),
      log: pname + " 奖励计时差 " + diff + " → " + statLabel + " +" + gain
    };
    if (queue.length) {
      fields.phase = "reward_pick";
      fields.rewardQueue = queue;
      fields.reward = {
        playerId: queue[0],
        stat: null,
        targetMs: rollTargetMs(),
        stopMs: null,
        done: false
      };
      fields.roundTimeoutAt = Date.now() + 45000;
      const nextName = (players.find((p) => p.id === queue[0]) || {}).name;
      fields.log += " · 下一位：" + (nextName || "");
    } else {
      fields.rewardQueue = [];
      fields.reward = null;
      fields.phase = "between";
      fields.roundTimeoutAt = Date.now() + 1600;
    }
    tx.update(ref, fields);
  });
}

async function pickRewardStat(stat) {
  const room = Online.room;
  if (!room || !room.reward || room.reward.playerId !== myId()) return;
  if (room.phase !== "reward_pick") return;
  await patchRoom({
    phase: "reward_timing",
    reward: Object.assign({}, room.reward, { stat: stat }),
    log: getDisplayName() + " 选择强化 " + (stat === "hp" ? "HP" : stat === "atk" ? "ATK" : "DEF")
  });
}

function stopLocalTiming() {
  Online.localTiming.running = false;
  if (Online.localTiming.raf) cancelAnimationFrame(Online.localTiming.raf);
  Online.localTiming.raf = 0;
}

function stopRewardTiming() {
  Online.rewardTiming.running = false;
  if (Online.rewardTiming.raf) cancelAnimationFrame(Online.rewardTiming.raf);
  Online.rewardTiming.raf = 0;
}

async function localStopSelf() {
  const room = Online.room;
  if (!room || room.phase !== "timing") return;
  const me = playersList(room).find((p) => p.id === myId());
  if (!me || me.alive === false || me.stopped) return;

  if (!Online.localTiming.running && !Online.localTiming.stopped) {
    // start
    Online.localTiming.running = true;
    Online.localTiming.stopped = false;
    Online.localTiming.start = performance.now();
    const needle = $("#onlineNeedle");
    const tick = (now) => {
      if (!Online.localTiming.running) return;
      const elapsed = (now - Online.localTiming.start) % TIMING_DURATION;
      if (needle) needle.style.left = (elapsed / TIMING_DURATION * 100) + "%";
      const timerEl = $("#onlineMyTimer");
      if (timerEl) timerEl.textContent = (elapsed / 1000).toFixed(2) + "s";
      if (elapsed >= TIMING_DURATION - 16) {
        // auto edge
      }
      Online.localTiming.raf = requestAnimationFrame(tick);
    };
    Online.localTiming.raf = requestAnimationFrame(tick);
    if (typeof playSound === "function") playSound("start");
    $("#onlineActionBtn").textContent = "停止 (空格)";
    return;
  }

  if (Online.localTiming.running) {
    const elapsed = Math.round((performance.now() - Online.localTiming.start) % TIMING_DURATION);
    stopLocalTiming();
    Online.localTiming.stopped = true;
    $("#onlineActionBtn").textContent = "已停表";
    $("#onlineActionBtn").disabled = true;
    if (typeof playSound === "function") playSound("stop");
    await writeMyStop(elapsed);
  }
}

async function writeMyStop(stopMs) {
  const ref = roomRef(Online.roomId);
  if (!ref) return;
  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      if (data.phase !== "timing") return;
      const players = playersList(data).map((p) => {
        if (p.id !== myId() || p.stopped) return p;
        const dist = Math.abs(stopMs - (p.targetMs || 0));
        return Object.assign({}, p, { stopMs: stopMs, dist: dist, stopped: true });
      });
      tx.update(ref, { players: players, updatedAt: Date.now() });
    });
  } catch (e) {
    console.warn("my stop", e);
  }
}

async function localRewardStop() {
  const room = Online.room;
  if (!room || !room.reward || room.reward.playerId !== myId()) return;
  if (room.phase !== "reward_timing") return;

  if (!Online.rewardTiming.running) {
    Online.rewardTiming.running = true;
    Online.rewardTiming.start = performance.now();
    const needle = $("#onlineRewardNeedle");
    const tick = (now) => {
      if (!Online.rewardTiming.running) return;
      const elapsed = (now - Online.rewardTiming.start) % TIMING_DURATION;
      if (needle) needle.style.left = (elapsed / TIMING_DURATION * 100) + "%";
      Online.rewardTiming.raf = requestAnimationFrame(tick);
    };
    Online.rewardTiming.raf = requestAnimationFrame(tick);
    $("#onlineRewardActionBtn").textContent = "停止 (空格)";
    if (typeof playSound === "function") playSound("start");
    return;
  }
  const elapsed = Math.round((performance.now() - Online.rewardTiming.start) % TIMING_DURATION);
  stopRewardTiming();
  $("#onlineRewardActionBtn").disabled = true;
  if (typeof playSound === "function") playSound("stop");
  const stat = room.reward.stat || "hp";
  await applyRewardResult(myId(), stat, elapsed);
}

function renderFromRoom(room) {
  ensureHostLoop();
  renderLobbyPlayers(room);

  if (room.status === "lobby") {
    showOnlineScreen("onlineLobby");
    $("#onlineLobbyCode").textContent = Online.roomId || "—";
    Online.amHost
      ? $("#onlineHostActions").classList.remove("hidden")
      : $("#onlineHostActions").classList.add("hidden");
    return;
  }

  if (room.status === "playing" || room.status === "ended") {
    showOnlineScreen("onlineBattle");
    renderBattle(room);
  }
}

function renderLobbyPlayers(room) {
  const box = $("#onlineLobbyPlayers");
  if (!box) return;
  const players = playersList(room);
  box.innerHTML = players.map((p) => {
    const tag = p.isBot ? "AI" : (p.id === room.hostId ? "房主" : "玩家");
    const me = p.id === myId() ? " · 我" : "";
    return '<div class="online-seat' + (p.id === myId() ? " me" : "") + '">' +
      '<span class="online-seat-name">' + escapeHtml(p.name) + me + '</span>' +
      '<span class="online-seat-tag">' + tag + "</span></div>";
  }).join("");
  $("#onlineLobbyStatus").textContent =
    (room.mode === "raid" ? "挑战" : "对战") + " · " + players.length + "/" + (room.maxPlayers || 4) +
    " · " + (room.log || "");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function renderBattle(room) {
  const title = $("#onlineBattleTitle");
  if (title) {
    title.textContent = room.mode === "raid"
      ? ("多人挑战 · 第 " + (room.round || 0) + " 回合")
      : ("联网对战 · 第 " + (room.round || 0) + " 回合");
  }
  const logEl = $("#onlineBattleLog");
  if (logEl) logEl.textContent = room.log || "";

  const grid = $("#onlineFighterGrid");
  if (grid) {
    grid.innerHTML = playersList(room).map((p) => {
      const pct = Math.max(0, Math.round(100 * (p.hp || 0) / Math.max(1, p.maxHp || PLAYER_MAX_HP)));
      const dead = p.alive === false;
      return '<div class="online-fighter' + (p.id === myId() ? " me" : "") + (dead ? " dead" : "") + '">' +
        '<div class="of-name">' + escapeHtml(p.name) + (p.isBot ? " 🤖" : "") +
        (p.id === myId() ? " (你)" : "") + "</div>" +
        '<div class="of-hp-track"><div class="of-hp-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="of-hp-text">HP ' + Math.max(0, Math.round(p.hp || 0)) + "/" + (p.maxHp || PLAYER_MAX_HP) +
        " · ATK " + (p.atk || 10) + " · DEF " + (p.def || 0) + "</div>" +
        '<div class="of-timing">' +
        (dead ? "已淘汰" :
          (p.stopped
            ? ("停 " + (p.stopMs | 0) + " / 目标 " + (p.targetMs | 0) + "（差 " + (p.dist | 0) + "）")
            : (room.phase === "timing" ? ("目标 " + (p.targetMs | 0) + " ms") : "等待…"))) +
        "</div></div>";
    }).join("");
  }

  const bossBox = $("#onlineBossCard");
  if (bossBox) {
    if (room.mode === "raid" && room.boss) {
      bossBox.classList.remove("hidden");
      const b = room.boss;
      const pct = Math.max(0, Math.round(100 * b.hp / Math.max(1, b.maxHp)));
      $("#onlineBossEmoji").textContent = b.emoji || "👾";
      $("#onlineBossName").textContent = b.name || "魔王";
      $("#onlineBossHpFill").style.width = pct + "%";
      $("#onlineBossHpText").textContent = "HP " + Math.max(0, Math.round(b.hp)) + "/" + b.maxHp;
      $("#onlineBossTiming").textContent = b.stopped
        ? ("停 " + (b.stopMs | 0) + " / 目标 " + (b.targetMs | 0) + "（差 " + (b.dist | 0) + "）")
        : (room.phase === "timing" ? ("目标 " + (b.targetMs | 0) + " ms") : "—");
    } else {
      bossBox.classList.add("hidden");
    }
  }

  // my controls
  const me = playersList(room).find((p) => p.id === myId());
  const actionWrap = $("#onlineActionWrap");
  const rewardWrap = $("#onlineRewardWrap");
  const endWrap = $("#onlineEndWrap");

  if (room.status === "ended") {
    if (actionWrap) actionWrap.classList.add("hidden");
    if (rewardWrap) rewardWrap.classList.add("hidden");
    if (endWrap) {
      endWrap.classList.remove("hidden");
      let msg = "对局结束";
      if (room.mode === "raid") {
        msg = room.winnerId === "party" ? "🎉 挑战成功！魔王已败！" : "💀 挑战失败…";
      } else if (room.winnerId) {
        const w = playersList(room).find((p) => p.id === room.winnerId);
        msg = "🏆 胜者：" + (w ? w.name : "—");
        if (room.winnerId === myId()) msg += "（你赢了！）";
      }
      $("#onlineEndMsg").textContent = msg;
    }
    return;
  }
  if (endWrap) endWrap.classList.add("hidden");

  // reward UI
  if (room.phase === "reward_pick" || room.phase === "reward_timing") {
    if (actionWrap) actionWrap.classList.add("hidden");
    if (rewardWrap) rewardWrap.classList.remove("hidden");
    const rew = room.reward;
    const isMe = rew && rew.playerId === myId();
    const who = playersList(room).find((p) => p.id === (rew && rew.playerId));
    $("#onlineRewardHint").textContent = isMe
      ? "你获得攻击奖励！先选强化属性，再空格停表。"
      : ("等待 " + ((who && who.name) || "队友") + " 领取奖励…");
    $$(".online-stat-pick").forEach((btn) => {
      btn.disabled = !isMe || room.phase !== "reward_pick";
    });
    const mark = $("#onlineRewardMark");
    if (mark && rew) mark.style.left = ((rew.targetMs || 500) / TIMING_DURATION * 100) + "%";
    $("#onlineRewardTarget").textContent = String((rew && rew.targetMs) || "—");
    const rbtn = $("#onlineRewardActionBtn");
    if (rbtn) {
      rbtn.classList.toggle("hidden", !(isMe && room.phase === "reward_timing"));
      rbtn.disabled = !(isMe && room.phase === "reward_timing");
      if (isMe && room.phase === "reward_timing" && !Online.rewardTiming.running) {
        rbtn.textContent = "开始奖励计时";
      }
    }
    return;
  }
  if (rewardWrap) rewardWrap.classList.add("hidden");

  // timing UI
  if (actionWrap) actionWrap.classList.remove("hidden");
  const myTarget = me && me.alive !== false ? me.targetMs : null;
  $("#onlineMyTarget").textContent = myTarget != null ? myTarget + " ms" : "—";
  const mark = $("#onlineMark");
  if (mark && myTarget != null) mark.style.left = (myTarget / TIMING_DURATION * 100) + "%";

  const btn = $("#onlineActionBtn");
  if (btn) {
    const canPlay = room.phase === "timing" && me && me.alive !== false && !me.stopped;
    btn.disabled = !canPlay;
    if (!canPlay) {
      btn.textContent = me && me.stopped ? "已停表" : (me && me.alive === false ? "已淘汰" : "等待回合");
      stopLocalTiming();
    } else {
      const key = room.round + "-" + room.phase;
      if (Online.lastStatus !== key) {
        Online.lastStatus = key;
        Online.localTiming.stopped = false;
        Online.localTiming.running = false;
        stopLocalTiming();
        const needle = $("#onlineNeedle");
        if (needle) needle.style.left = "0%";
        const t = $("#onlineMyTimer");
        if (t) t.textContent = "0.00s";
      }
      btn.textContent = "开始 (空格)";
      btn.disabled = false;
    }
  }
}

async function leaveOnline() {
  stopLocalTiming();
  stopRewardTiming();
  clearFillTimer();
  clearHostTick();
  if (Online.unsub) { Online.unsub(); Online.unsub = null; }

  // best-effort remove self / delete if host alone
  if (Online.roomId && Online.room) {
    try {
      const ref = roomRef(Online.roomId);
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        let players = playersList(data).filter((p) => p.id !== myId());
        if (!players.length || (Online.amHost && data.status === "lobby" && humans({ players: players }).length === 0)) {
          tx.delete(ref);
          return;
        }
        const fields = { players: players, updatedAt: Date.now(), log: getDisplayName() + " 离开了" };
        if (data.hostId === myId()) {
          const nextHost = players.find((p) => !p.isBot) || players[0];
          if (nextHost) fields.hostId = nextHost.id;
        }
        tx.update(ref, fields);
      });
    } catch (e) { console.warn("leave", e); }
  }

  Online.active = false;
  Online.room = null;
  Online.roomId = null;
  Online.amHost = false;
  Online.aiScheduledRound = -1;
  showOnlineRoot(false);

  const menu = document.getElementById("menuScreen");
  const game = document.getElementById("gameScreen");
  if (game) game.style.display = "none";
  if (menu) menu.style.display = "block";
}

function onKey(e) {
  if (!Online.active) return;
  if (e.code !== "Space") return;
  const tag = (e.target && e.target.tagName) || "";
  if (e.target && (e.target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA")) return;
  e.preventDefault();
  const room = Online.room;
  if (!room) return;
  if (room.phase === "timing") localStopSelf();
  else if (room.phase === "reward_timing") localRewardStop();
}

function bindUI() {
  const createBtn = $("#onlineCreateBtn");
  const joinBtn = $("#onlineJoinBtn");
  const startBtn = $("#onlineForceStartBtn");
  const leaveBtns = $$("[data-online-leave]");
  const actionBtn = $("#onlineActionBtn");
  const rewardBtn = $("#onlineRewardActionBtn");

  if (createBtn) createBtn.addEventListener("click", () => createRoom());
  if (joinBtn) joinBtn.addEventListener("click", () => joinRoom());
  if (startBtn) startBtn.addEventListener("click", () => hostStartMatch());
  leaveBtns.forEach((b) => b.addEventListener("click", () => leaveOnline()));
  if (actionBtn) actionBtn.addEventListener("click", () => localStopSelf());
  if (rewardBtn) rewardBtn.addEventListener("click", () => localRewardStop());

  $$(".online-stat-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      const stat = btn.getAttribute("data-stat");
      if (stat) pickRewardStat(stat);
    });
  });

  document.addEventListener("keydown", onKey);

  // multi choice modal
  const localBtn = $("#multiChoiceLocal");
  const pvpBtn = $("#multiChoicePvp");
  const raidBtn = $("#multiChoiceRaid");
  const closeBtn = $("#multiChoiceClose");
  if (localBtn) localBtn.addEventListener("click", enterLocalMulti);
  if (pvpBtn) pvpBtn.addEventListener("click", () => enterOnlineLobby("pvp"));
  if (raidBtn) raidBtn.addEventListener("click", () => enterOnlineLobby("raid"));
  if (closeBtn) closeBtn.addEventListener("click", closeMultiChoice);

  // mode cards
  const multiCard = $("#multiModeCard");
  if (multiCard) {
    multiCard.addEventListener("click", (e) => {
      e.preventDefault();
      openMultiChoice();
    });
  }
  const raidCard = $("#raidModeCard");
  if (raidCard) {
    raidCard.addEventListener("click", () => {
      closeMultiChoice();
      enterOnlineLobby("raid");
    });
  }
}

function onGlobalKey(e) {
  if (e.code === "Escape") {
    const modal = $("#multiChoiceModal");
    if (modal && modal.style.display === "flex") {
      e.preventDefault();
      closeMultiChoice();
      return;
    }
    if (Online.active) {
      e.preventDefault();
      leaveOnline();
    }
  }
}


function init() {
  bindUI();
  document.addEventListener("keydown", onGlobalKey);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Hook backToMenu / Escape
if (!window._tsOnlineBackHooked) {
  window._tsOnlineBackHooked = true;
  const _backToMenu = window.backToMenu;
  window.backToMenu = function () {
    if (Online.active) {
      leaveOnline();
      return;
    }
    if (typeof _backToMenu === "function") return _backToMenu.apply(this, arguments);
  };
}

window.TimeStopperOnline = {
  openMultiChoice,
  enterOnlineLobby,
  leaveOnline,
  isActive: () => Online.active
};

})();

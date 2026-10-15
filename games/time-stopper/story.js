/* TIME STOPPER — 故事模式 · 营救公主 */
(function () {
"use strict";

const STORY_KEY = "timeStopperStory_v2";
const STORY_KEY_OLD = "timeStopperStory_v1";
const $ = (s, root) => (root || document).querySelector(s);
const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

const DIFFICULTY = {
  easy:   { id: "easy",   label: "简单", noiseMin: 0.09, noiseMax: 0.32, hpMul: 0.85, atkMul: 0.9 },
  normal: { id: "normal", label: "普通", noiseMin: 0.05, noiseMax: 0.20, hpMul: 1,    atkMul: 1 },
  hard:   { id: "hard",   label: "困难", noiseMin: 0.02, noiseMax: 0.10, hpMul: 1.12, atkMul: 1.08 }
};

const ITEM_DEFS = {
  heal:   { id: "heal",   name: "回复药",   emoji: "🧪", desc: "恢复 40 HP" },
  shield: { id: "shield", name: "护盾符",   emoji: "🛡️", desc: "下次受伤减半" },
  double: { id: "double", name: "倍击符",   emoji: "💥", desc: "下次攻击双倍伤害" },
  reroll: { id: "reroll", name: "重停表",   emoji: "🔁", desc: "本回合可重停一次" }
};

const CHAPTERS = [
  {
    id: 1, title: "边陲的烽火",
    narrate: "王国边陲传来异变。年轻的勇者接过锈迹斑斑的剑，踏上营救被魔王掳走的公主之路。\n第一关：密林入口，一群哥布林挡路。\n——用 TIME STOPPER 的直觉，停在自己目标时间最近的那一帧。",
    enemy: { name: "哥布林斥候", emoji: "👺", hp: 42, atk: 9, def: 1, kind: "mob" },
    targetSec: 5.00
  },
  {
    id: 2, title: "迷雾河谷",
    narrate: "穿过密林，河谷升起灰雾。石像鬼在断桥上嘶鸣。\n勇者稳住呼吸——计时一决，快一步则生。",
    enemy: { name: "石像鬼", emoji: "🗿", hp: 58, atk: 12, def: 3, kind: "mob" },
    targetSec: 6.50
  },
  {
    id: 3, title: "中段首领 · 暗影骑士",
    narrate: "峡谷尽头立着黑甲骑士。他自称魔王先锋：\n「想救公主？先赢过我的心跳。」\n——中段首领战。",
    enemy: { name: "暗影骑士", emoji: "🖤", hp: 95, atk: 16, def: 5, kind: "boss" },
    targetSec: 4.80,
    midBoss: true
  },
  {
    id: 4, title: "熔岩回廊",
    narrate: "骑士倒下，道路通向灼热的熔岩回廊。火焰精灵成群扑来。\n背包里的符文隐隐发热——善用道具，方能活着走出地狱。",
    enemy: { name: "火焰精灵群", emoji: "🔥", hp: 72, atk: 14, def: 2, kind: "mob" },
    targetSec: 4.20
  },
  {
    id: 5, title: "镜之迷宫",
    narrate: "魔王城堡外墙是无数镜子。分身敌军扰乱视线。\n目标时间变幻不定——专注，才能看见真实。",
    enemy: { name: "镜影刺客", emoji: "🪞", hp: 78, atk: 15, def: 3, kind: "mob" },
    targetSec: 7.20
  },
  {
    id: 6, title: "王座之前",
    narrate: "王座厅大门半开。公主的呼喊隐约可闻。\n门卫巨魔拔出钉锤：「再近一步，骨头开花。」",
    enemy: { name: "门卫巨魔", emoji: "👹", hp: 105, atk: 17, def: 6, kind: "mob" },
    targetSec: 5.50
  },
  {
    id: 7, title: "最终决战 · 营救公主",
    narrate: "魔王从阴影中现身，公主被锁在水晶牢中。\n「时间与勇气，都站在强者一边。」\n勇者举起剑——这是最后一战。",
    enemy: { name: "魔王", emoji: "😈", hp: 150, atk: 22, def: 8, kind: "boss" },
    targetSec: 5.00,
    finalBoss: true
  }
];

const Story = {
  active: false,
  chapterIndex: 0,
  difficulty: "normal",
  hero: null,
  enemy: null,
  bag: [],
  buffs: { shield: false, double: false, rerollReady: false },
  phase: "hub",
  timing: {
    active: false,
    playerRunning: false,
    start: 0,
    raf: 0,
    playerSec: null,
    enemySec: null,
    playerTargetSec: 5,
    enemyTargetSec: 5,
    enemyStopSec: null,
    playerStopped: false,
    enemyStopped: false,
    awaitingRerollConfirm: false
  },
  rewardTiming: {
    running: false, start: 0, raf: 0, targetSec: 5
  },
  dmgFloatId: 0
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function diffDef() {
  return DIFFICULTY[Story.difficulty] || DIFFICULTY.normal;
}

function defaultHero() {
  return { name: "勇者", level: 1, hp: 100, maxHp: 100, atk: 14, def: 4 };
}

function saveStory() {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify({
      chapterIndex: Story.chapterIndex,
      hero: Story.hero,
      bag: Story.bag,
      difficulty: Story.difficulty,
      savedAt: Date.now()
    }));
    try { localStorage.removeItem(STORY_KEY_OLD); } catch (e2) {}
  } catch (e) {}
}

function normalizeDifficulty(v) {
  return DIFFICULTY[v] ? v : "normal";
}

function loadStory() {
  try {
    let raw = localStorage.getItem(STORY_KEY);
    let migrated = false;
    if (!raw) {
      raw = localStorage.getItem(STORY_KEY_OLD);
      migrated = !!raw;
    }
    if (!raw) return false;
    const d = JSON.parse(raw);
    Story.chapterIndex = d.chapterIndex | 0;
    Story.hero = d.hero || defaultHero();
    Story.bag = Array.isArray(d.bag) ? d.bag : [];
    Story.difficulty = normalizeDifficulty(d.difficulty);
    if (migrated) {
      try { localStorage.removeItem(STORY_KEY_OLD); } catch (e2) {}
      saveStory();
    }
    return true;
  } catch (e) { return false; }
}

function clearStorySave() {
  try { localStorage.removeItem(STORY_KEY); } catch (e) {}
  try { localStorage.removeItem(STORY_KEY_OLD); } catch (e) {}
}

function hasSave() {
  try {
    return !!(localStorage.getItem(STORY_KEY) || localStorage.getItem(STORY_KEY_OLD));
  } catch (e) { return false; }
}

function showStoryOnly(id) {
  $$(".story-screen").forEach((el) => { el.classList.add("hidden"); });
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
}

function openStoryRoot(show) {
  const root = $("#storyRoot");
  if (!root) return;
  root.classList.toggle("hidden", !show);
  root.setAttribute("aria-hidden", show ? "false" : "true");
}

function log(msg, cls) {
  const el = $("#storyLog");
  if (!el) return;
  const p = document.createElement("div");
  if (cls) p.className = cls;
  p.textContent = msg;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
}

function setHpBar(barEl, textEl, hp, max) {
  const pct = Math.max(0, Math.round((100 * hp) / Math.max(1, max)));
  if (barEl) barEl.style.width = pct + "%";
  if (textEl) textEl.textContent = "HP " + Math.max(0, Math.round(hp)) + "/" + max;
}


/** Coerce leftover ms-scale values (e.g. 500) into seconds. */
function asSec(v) {
  if (v == null || !Number.isFinite(v)) return 0;
  if (v > 30) return v / 1000;
  return v;
}

function fmtSec(sec) {
  if (sec == null || !Number.isFinite(sec)) return "0.00";
  return Math.max(0, asSec(sec)).toFixed(2);
}

function roundSec(sec) {
  return Math.round(Math.max(0, asSec(sec)) * 100) / 100;
}

function setText(id, value) {
  const el = $("#" + id);
  if (el) el.textContent = value;
}

function setBtnVisible(el, show) {
  if (!el) return;
  try {
    el.classList.toggle("hidden", !show);
    el.style.display = show ? "" : "none";
  } catch (e) {}
}

function syncBattleStatDisplays() {
  const h = Story.hero;
  const e = Story.enemy;
  if (h) {
    setText("storyHeroAtk", String(h.atk));
    setText("storyHeroDef", String(h.def));
  }
  if (e) {
    setText("storyEnemyAtk", String(e.atk));
    setText("storyEnemyDef", String(e.def != null ? e.def : 0));
    setText("storyEnemyCardName", e.name);
  }
}

function resetTimingDisplays() {
  setText("storyPlayerTimer", "0.00");
  setText("storyEnemyTimer", "0.00");
  setText("storyPlayerStatus", "等待开始");
  setText("storyEnemyStatus", "待机 · 自动");
  setText("storyPlayerStop", "停表 —");
  setText("storyEnemyStop", "停表 —");
}


function spawnDmgNumber(side, amount, kind) {
  const host = side === "hero" ? $("#storyHeroDmgHost") : $("#storyEnemyDmgHost");
  if (!host) return;
  const el = document.createElement("span");
  el.className = "story-dmg-num" + (kind === "heal" ? " heal" : kind === "crit" ? " crit" : "");
  el.textContent = (kind === "heal" ? "+" : "-") + amount;
  host.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function renderBag() {
  const box = $("#storyBagList");
  if (!box) return;
  if (!Story.bag.length) {
    box.innerHTML = '<div class="story-bag-empty">背包空空如也</div>';
    return;
  }
  box.innerHTML = "";
  Story.bag.forEach((itemId, idx) => {
    const def = ITEM_DEFS[itemId];
    if (!def) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "story-item-btn";
    btn.innerHTML = '<span class="item-emoji">' + def.emoji + "</span><span>" + def.name + "</span>";
    btn.title = def.desc;
    btn.disabled = Story.phase !== "battle" || Story.timing.active || Story.timing.awaitingRerollConfirm;
    btn.onclick = () => useItem(idx);
    box.appendChild(btn);
  });
}

function setDifficulty(id, persist) {
  Story.difficulty = normalizeDifficulty(id);
  $$("#storyDiffRow .story-diff-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-diff") === Story.difficulty);
  });
  const hint = $("#storyDiffHint");
  if (hint) hint.textContent = "当前难度：" + diffDef().label;
  if (persist && hasSave() && Story.hero) saveStory();
}

function renderHeroStats() {
  const h = Story.hero;
  if (!h) return;
  const el = $("#storyHubStats");
  if (el) {
    el.innerHTML =
      "<div class=\"story-stat-chip\">Lv." + h.level + "</div>" +
      "<div class=\"story-stat-chip\">HP " + h.hp + "/" + h.maxHp + "</div>" +
      "<div class=\"story-stat-chip\">ATK " + h.atk + "</div>" +
      "<div class=\"story-stat-chip\">DEF " + h.def + "</div>" +
      "<div class=\"story-stat-chip\">背包 " + Story.bag.length + "</div>" +
      "<div class=\"story-stat-chip\">章节 " + Math.min(Story.chapterIndex + 1, CHAPTERS.length) + "/" + CHAPTERS.length + "</div>" +
      "<div class=\"story-stat-chip\">难度 " + diffDef().label + "</div>";
  }
  const battleBag = $("#storyBattleBagHint");
  if (battleBag) battleBag.textContent = "背包 " + Story.bag.length + " 件";
  syncBattleStatDisplays();
}

function openHub() {
  Story.active = true;
  Story.phase = "hub";
  openStoryRoot(true);
  showStoryOnly("storyHub");
  if (!Story.hero) {
    if (!loadStory()) Story.hero = defaultHero();
  }
  setDifficulty(Story.difficulty, false);
  renderHeroStats();
  const cont = $("#storyContinue");
  if (cont) cont.disabled = !hasSave();
  const progress = $("#storyHubProgress");
  if (progress) {
    progress.textContent = hasSave()
      ? ("存档：第 " + Math.min(Story.chapterIndex + 1, CHAPTERS.length) + " 章 · Lv." + (Story.hero && Story.hero.level) + " · " + diffDef().label)
      : "尚无存档 — 选择难度后开始新冒险吧";
  }
}

function startNewAdventure() {
  Story.hero = defaultHero();
  Story.chapterIndex = 0;
  Story.bag = ["heal"];
  Story.buffs = { shield: false, double: false, rerollReady: false };
  clearStorySave();
  saveStory();
  showNarration();
}

function showNarration() {
  let ch = CHAPTERS[Story.chapterIndex];
  if (!ch) { showEnding(true); return; }
  Story.phase = "narrate";
  showStoryOnly("storyNarration");
  $("#storyChapterLabel").textContent =
    "第 " + ch.id + " 章" +
    (ch.midBoss ? " · 中段首领" : "") +
    (ch.finalBoss ? " · 最终战" : "") +
    (ch.hidden ? " · 隐藏" : "");
  $("#storyTitle").textContent = ch.title;
  $("#storyBody").textContent = ch.narrate;
}

function rollPlayerTarget(ch) {
  let t = asSec(ch.targetSec);
  if (Story.difficulty === "hard") {
    t += (Math.random() * 0.40) - 0.20;
  }
  return roundSec(clamp(t, 3.00, 9.00));
}

function rollEnemyTarget(ch) {
  if (ch.enemyTargetSec != null && Number.isFinite(ch.enemyTargetSec)) {
    return roundSec(clamp(asSec(ch.enemyTargetSec), 3.00, 9.00));
  }
  const base = asSec(ch.targetSec);
  let offset = Math.random() * 5.60 - 2.80;
  if (Math.abs(offset) < 0.05) offset = Math.random() < 0.5 ? -0.40 : 0.40;
  return roundSec(clamp(base + offset, 3.00, 9.00));
}

function rollEnemyNoise() {
  const d = diffDef();
  let minN = d.noiseMin;
  let maxN = d.noiseMax;
  if (Story.difficulty === "hard") {
    const reduce = Math.min(Story.chapterIndex * 0.05, 0.40);
    maxN = Math.max(minN + 0.01, maxN - reduce);
  }
  const mag = minN + Math.random() * (maxN - minN);
  const sign = Math.random() < 0.5 ? -1 : 1;
  // Preserve sign: roundSec() clamps to >=0 and would zero negative noise
  // (that made enemyStopSec === enemyTargetSec and eDist always/often 0).
  return Math.round(sign * mag * 100) / 100;
}

function updateTargetUI() {
  Story.timing.playerTargetSec = roundSec(asSec(Story.timing.playerTargetSec));
  Story.timing.enemyTargetSec = roundSec(asSec(Story.timing.enemyTargetSec));
  const p = Story.timing.playerTargetSec;
  const e = Story.timing.enemyTargetSec;
  const pEl = $("#storyPlayerTargetSec");
  const eEl = $("#storyEnemyTargetSec");
  if (pEl) pEl.textContent = fmtSec(p);
  if (eEl) eEl.textContent = fmtSec(e);
}

function beginBattle() {
  const ch = CHAPTERS[Story.chapterIndex];
  if (!ch) return;
  Story.phase = "battle";
  Story.buffs = { shield: false, double: false, rerollReady: false };
  const d = diffDef();
  const maxHp = Math.max(1, Math.round(ch.enemy.hp * d.hpMul));
  const atk = Math.max(1, Math.round(ch.enemy.atk * d.atkMul));
  Story.enemy = {
    name: ch.enemy.name,
    emoji: ch.enemy.emoji,
    hp: maxHp,
    maxHp: maxHp,
    atk: atk,
    def: ch.enemy.def != null ? ch.enemy.def : 0,
    kind: ch.enemy.kind
  };
  cancelTimingAnim();
  Story.timing.playerTargetSec = rollPlayerTarget(ch);
  Story.timing.enemyTargetSec = rollEnemyTarget(ch);
  Story.timing.playerSec = null;
  Story.timing.enemySec = null;
  Story.timing.enemyStopSec = null;
  Story.timing.playerStopped = false;
  Story.timing.enemyStopped = false;
  Story.timing.active = false;
  Story.timing.playerRunning = false;
  Story.timing.awaitingRerollConfirm = false;
  showStoryOnly("storyBattle");
  $("#storyStagePill").textContent =
    "关卡 " + ch.id +
    (ch.midBoss || ch.finalBoss ? " · BOSS" : "") +
    " · " + d.label;
  $("#storyHeroLv").textContent = Story.hero.name + " Lv." + Story.hero.level;
  $("#storyHeroName").textContent = Story.hero.name;
  $("#storyEnemyName").textContent = Story.enemy.name;
  $("#storyEnemyArt").textContent = Story.enemy.emoji;
  setHpBar($("#storyHeroHpBar"), $("#storyHeroHpText"), Story.hero.hp, Story.hero.maxHp);
  setHpBar($("#storyEnemyHpBar"), $("#storyEnemyHpText"), Story.enemy.hp, Story.enemy.maxHp);
  updateTargetUI();
  resetTimingDisplays();
  const cmp = $("#storyTargetCompare");
  if (cmp) cmp.textContent = "—";
  $("#storyLog").innerHTML = "";
  setBtnVisible($("#storyStartTimer"), true);
  setBtnVisible($("#storyStopTimer"), false);
  setBtnVisible($("#storyRerollBtn"), false);
  setBtnVisible($("#storyConfirmStop"), false);
  syncBattleStatDisplays();
  renderBag();
  renderHeroStats();
  updateBuffFlags();
  log(
    (ch.midBoss || ch.finalBoss ? "⚠ 首领战！ " : "") +
    "你的目标 " + fmtSec(Story.timing.playerTargetSec) + " 秒 · 敌方目标 " + fmtSec(Story.timing.enemyTargetSec) +
    " 秒 — 各自逼近自己的目标，误差差越大伤害越高。（" + d.label + "）"
  );
}

function updateBuffFlags() {
  const parts = [];
  if (Story.buffs.shield) parts.push("护盾");
  if (Story.buffs.double) parts.push("倍击");
  if (Story.buffs.rerollReady) parts.push("可重停");
  const el = $("#storyBuffFlags");
  if (el) {
    if (!parts.length) {
      el.innerHTML = '<span class="buff-empty">无增益</span>';
    } else {
      el.innerHTML = parts.map((p) => '<span class="buff-pill">' + p + "</span>").join("");
    }
  }
}

function useItem(idx) {
  if (Story.phase !== "battle" || Story.timing.active || Story.timing.awaitingRerollConfirm) return;
  const itemId = Story.bag[idx];
  const def = ITEM_DEFS[itemId];
  if (!def) return;
  if (itemId === "heal") {
    const before = Story.hero.hp;
    Story.hero.hp = Math.min(Story.hero.maxHp, Story.hero.hp + 40);
    const gained = Story.hero.hp - before;
    setHpBar($("#storyHeroHpBar"), $("#storyHeroHpText"), Story.hero.hp, Story.hero.maxHp);
    spawnDmgNumber("hero", gained, "heal");
    log("使用回复药，恢复 " + gained + " HP", "story-win");
  } else if (itemId === "shield") {
    Story.buffs.shield = true;
    log("护盾符生效：下次受伤减半", "story-win");
  } else if (itemId === "double") {
    Story.buffs.double = true;
    log("倍击符生效：下次攻击双倍", "story-win");
  } else if (itemId === "reroll") {
    Story.buffs.rerollReady = true;
    log("获得重停表机会（停表后可重来一次）", "story-win");
  }
  Story.bag.splice(idx, 1);
  saveStory();
  renderBag();
  updateBuffFlags();
  renderHeroStats();
}

function cancelTimingAnim() {
  if (Story.timing.raf) {
    try { cancelAnimationFrame(Story.timing.raf); } catch (e) {}
    try { clearInterval(Story.timing.raf); } catch (e2) {}
  }
  Story.timing.raf = 0;
}

function tryMaybeCommit() {
  if (Story.timing.awaitingRerollConfirm) return;
  if (!Story.timing.playerStopped || !Story.timing.enemyStopped) return;
  cancelTimingAnim();
  Story.timing.active = false;
  Story.timing.playerRunning = false;
  commitTurn();
}

function onEnemyAutoStop(elapsedSec) {
  if (Story.timing.enemyStopped) return;
  Story.timing.enemyStopped = true;
  const stopSec = elapsedSec != null ? elapsedSec : Story.timing.enemyStopSec;
  // Only record stop display / enemySec. Never write stop back into
  // enemyTargetSec or refresh the target UI from the stop time.
  Story.timing.enemySec = roundSec(stopSec);
  setText("storyEnemyTimer", fmtSec(Story.timing.enemySec));
  setText("storyEnemyStop", "停表 " + fmtSec(Story.timing.enemySec) + " 秒");
  setText("storyEnemyStatus", "已停 · 自动");
  if (!Story.timing.playerStopped) {
    log("敌方已停表 " + fmtSec(Story.timing.enemySec) + " 秒，等待你停表…");
  }
  tryMaybeCommit();
}

function startTimer(fromReroll) {
  if (Story.phase !== "battle") return;
  if (Story.timing.playerRunning) return;
  if (Story.timing.active && !fromReroll && !Story.timing.awaitingRerollConfirm) return;
  if (Story.timing.awaitingRerollConfirm && !fromReroll) return;

  if (!fromReroll) {
    cancelTimingAnim();
    Story.timing.playerSec = null;
    Story.timing.enemySec = null;
    Story.timing.playerStopped = false;
    Story.timing.enemyStopped = false;
    Story.timing.awaitingRerollConfirm = false;
    // Sanitize in place only — do NOT replace target with stop.
    Story.timing.playerTargetSec = roundSec(asSec(Story.timing.playerTargetSec));
    Story.timing.enemyTargetSec = roundSec(asSec(Story.timing.enemyTargetSec));
    const fixedEnemyTarget = Story.timing.enemyTargetSec;
    const noise = rollEnemyNoise();
    // stop = fixed target + difficulty noise; never write stop back into target
    Story.timing.enemyStopSec = roundSec(clamp(
      fixedEnemyTarget + noise,
      0.50,
      12.00
    ));
    resetTimingDisplays();
    updateTargetUI(); // re-assert fixed targets in the UI for this round
    const cmp = $("#storyTargetCompare");
    if (cmp) cmp.textContent = "—";
  } else {
    Story.timing.playerSec = null;
    Story.timing.playerStopped = false;
    Story.timing.awaitingRerollConfirm = false;
    setText("storyPlayerTimer", "0.00");
    setText("storyPlayerStop", "停表 —");
    setText("storyPlayerStatus", "等待开始");
  }

  Story.timing.active = true;
  Story.timing.playerRunning = true;
  Story.timing.start = performance.now();

  // Schedule ticking FIRST so a later DOM throw cannot block the live display.
  cancelTimingAnim();
  const tick = () => {
    if (!Story.timing.active && !Story.timing.playerRunning) return;
    const elapsed = (performance.now() - Story.timing.start) / 1000;

    if (Story.timing.playerRunning) {
      const el = $("#storyPlayerTimer");
      if (el) el.textContent = fmtSec(elapsed);
    }

    if (!Story.timing.enemyStopped) {
      if (elapsed >= Story.timing.enemyStopSec) {
        onEnemyAutoStop(Story.timing.enemyStopSec);
      } else {
        const el = $("#storyEnemyTimer");
        if (el) el.textContent = fmtSec(elapsed);
      }
    }

    if (!(Story.timing.playerRunning || !Story.timing.enemyStopped)) {
      cancelTimingAnim();
    }
  };
  Story.timing.raf = setInterval(tick, 16);
  tick();

  try {
    setBtnVisible($("#storyStartTimer"), false);
    setBtnVisible($("#storyStopTimer"), true);
    setBtnVisible($("#storyRerollBtn"), false);
    setBtnVisible($("#storyConfirmStop"), false);
    setText("storyPlayerStatus", "计时中…");
    if (!fromReroll) setText("storyEnemyStatus", "自动计时中…");
    renderBag();
  } catch (e) {
    /* button UI must never abort the running timer */
  }
}

function stopTimer(fromRerollConfirmPath) {
  if (!Story.timing.playerRunning) return;
  Story.timing.playerRunning = false;
  const elapsed = roundSec((performance.now() - Story.timing.start) / 1000);
  Story.timing.playerSec = elapsed;
  Story.timing.playerStopped = true;
  setText("storyPlayerTimer", fmtSec(Story.timing.playerSec));
  setText("storyPlayerStop", "停表 " + fmtSec(Story.timing.playerSec) + " 秒");
  setText("storyPlayerStatus", "已停表");
  setBtnVisible($("#storyStopTimer"), false);

  if (!fromRerollConfirmPath && Story.buffs.rerollReady) {
    Story.timing.awaitingRerollConfirm = true;
    setBtnVisible($("#storyRerollBtn"), true);
    setBtnVisible($("#storyStartTimer"), false);
    setText("storyPlayerStatus", "可重停或确认");
    log("已停表 " + fmtSec(Story.timing.playerSec) + " 秒。可用「重停」或确认结算。");
    setBtnVisible($("#storyConfirmStop"), true);
    if (Story.timing.enemyStopped) {
      cancelTimingAnim();
    }
    renderBag();
    return;
  }

  if (Story.timing.enemyStopped) {
    cancelTimingAnim();
  }
  tryMaybeCommit();
}

function consumeReroll() {
  if (!Story.buffs.rerollReady) return;
  Story.buffs.rerollReady = false;
  updateBuffFlags();
  setBtnVisible($("#storyRerollBtn"), false);
  setBtnVisible($("#storyConfirmStop"), false);
  Story.timing.awaitingRerollConfirm = false;
  log("重停表！重新计时（敌方停表保留）……");
  cancelTimingAnim();
  Story.timing.active = false;
  startTimer(true);
}

function confirmStopAfterRerollOption() {
  setBtnVisible($("#storyConfirmStop"), false);
  setBtnVisible($("#storyRerollBtn"), false);
  Story.buffs.rerollReady = false;
  Story.timing.awaitingRerollConfirm = false;
  updateBuffFlags();
  if (!Story.timing.playerStopped) return;
  tryMaybeCommit();
}

function commitTurn() {
  // Distances vs the round's fixed targets (set at battle/turn start) —
  // never vs stop time. enemyStopSec / enemySec must not overwrite these.
  const pTarget = Story.timing.playerTargetSec;
  const eTarget = Story.timing.enemyTargetSec;
  const playerSec = Story.timing.playerSec;
  const enemySec = Story.timing.enemySec;

  const pDist = roundSec(Math.abs(playerSec - pTarget));
  const eDist = roundSec(Math.abs(enemySec - eTarget));
  // Damage from |pDist-eDist| in seconds → centiseconds for integer HP (same scale as old ms)
  const delta = Math.max(1, Math.round(Math.abs(pDist - eDist) * 100));

  const cmp = $("#storyTargetCompare");
  if (cmp) cmp.textContent = "你差 " + fmtSec(pDist) + " · 敌差 " + fmtSec(eDist);

  log(
    "你停 " + fmtSec(playerSec) + "秒 / 目标 " + fmtSec(pTarget) + "秒（差 " + fmtSec(pDist) + "）· " +
    "敌停 " + fmtSec(enemySec) + "秒 / 目标 " + fmtSec(eTarget) + "秒（差 " + fmtSec(eDist) + "）"
  );

  // Tie: no damage / skip turn
  if (pDist === eDist) {
    log("势均力敌（误差相同），本回合无人受伤。");
    updateBuffFlags();
    scheduleNextTurn();
    return;
  }

  const playerAttacks = pDist < eDist;

  if (playerAttacks) {
    let dmg = delta;
    const crit = pDist <= 0.28;
    if (crit) dmg += 8;
    if (Story.buffs.double) {
      dmg *= 2;
      Story.buffs.double = false;
      log("倍击发动！", "story-win");
    }
    Story.enemy.hp -= dmg;
    setHpBar($("#storyEnemyHpBar"), $("#storyEnemyHpText"), Story.enemy.hp, Story.enemy.maxHp);
    spawnDmgNumber("enemy", dmg, crit ? "crit" : "hit");
    log(
      "你发动攻击！误差差 " + fmtSec(Math.abs(pDist - eDist)) + " → 造成 " + dmg + " 伤害" +
      (crit ? "（精准暴击！）" : ""),
      "story-win"
    );
  } else {
    let dmg = delta;
    if (Story.buffs.shield) {
      dmg = Math.max(1, Math.floor(dmg / 2));
      Story.buffs.shield = false;
      log("护盾抵挡一半伤害！", "story-win");
    }
    Story.hero.hp -= dmg;
    setHpBar($("#storyHeroHpBar"), $("#storyHeroHpText"), Story.hero.hp, Story.hero.maxHp);
    spawnDmgNumber("hero", dmg, "hit");
    log(
      Story.enemy.name + " 抢先出手！误差差 " + fmtSec(Math.abs(pDist - eDist)) + " → 你受到 " + dmg + " 伤害",
      "story-lose"
    );
  }
  updateBuffFlags();

  if (Story.enemy.hp <= 0) {
    log("击败了 " + Story.enemy.name + "！", "story-win");
    saveStory();
    setTimeout(onStageClear, 650);
    return;
  }
  if (Story.hero.hp <= 0) {
    log("你倒下了……", "story-lose");
    setTimeout(() => showEnding(false), 750);
    return;
  }
  scheduleNextTurn();
}

function scheduleNextTurn() {
  setTimeout(() => {
    const ch = CHAPTERS[Story.chapterIndex];
    Story.timing.playerTargetSec = rollPlayerTarget(ch);
    Story.timing.enemyTargetSec = rollEnemyTarget(ch);
    Story.timing.playerSec = null;
    Story.timing.enemySec = null;
    Story.timing.enemyStopSec = null;
    Story.timing.playerStopped = false;
    Story.timing.enemyStopped = false;
    Story.timing.active = false;
    Story.timing.playerRunning = false;
    Story.timing.awaitingRerollConfirm = false;
    updateTargetUI();
    resetTimingDisplays();
    const cmp2 = $("#storyTargetCompare");
    if (cmp2) cmp2.textContent = "—";
    setBtnVisible($("#storyStartTimer"), true);
    setBtnVisible($("#storyStopTimer"), false);
    setBtnVisible($("#storyRerollBtn"), false);
    setBtnVisible($("#storyConfirmStop"), false);
    renderBag();
    log("—— 下一回合 · 你 " + fmtSec(Story.timing.playerTargetSec) + "秒 / 敌 " + fmtSec(Story.timing.enemyTargetSec) + "秒 ——");
  }, 420);
}

function onStageClear() {
  const ch = CHAPTERS[Story.chapterIndex];
  Story.phase = "reward";
  openReward(!!(ch && ch.finalBoss));
}

function openReward(afterFinal) {
  showStoryOnly("storyReward");
  $("#storyRewardTitle").textContent = afterFinal ? "决战胜利 · 战利品" : "关卡清除 · 战利品";
  $("#storyRewardSummary").textContent =
    Story.hero.name + " Lv." + Story.hero.level +
    " · HP " + Story.hero.hp + "/" + Story.hero.maxHp +
    " · ATK " + Story.hero.atk + " · DEF " + Story.hero.def +
    " · " + diffDef().label;
  $("#storyRewardResult").textContent = "—";
  $("#storyRewardDetail").classList.add("hidden");
  setBtnVisible($("#storyLootStartBtn"), true);
  const lootStart = $("#storyLootStartBtn");
  if (lootStart) lootStart.disabled = false;
  setBtnVisible($("#storyLootStopBtn"), false);
  $$(".story-stat-pick").forEach((b) => { b.disabled = false; });
  $("#storyRewardContinue").classList.add("hidden");
  Story._afterFinalReward = !!afterFinal;
  Story._rewardLocked = false;
  Story.hero.hp = Math.min(Story.hero.maxHp, Story.hero.hp + 15);
  const targets = [4.20, 4.80, 5.00, 5.50, 6.00, 6.66, 7.20];
  Story.rewardTiming.targetSec = targets[Story.chapterIndex % targets.length];
  Story.rewardTiming.running = false;
  if (Story.rewardTiming.raf) cancelAnimationFrame(Story.rewardTiming.raf);
  $("#storyLootTargetSec").textContent = fmtSec(Story.rewardTiming.targetSec);
  setText("storyLootTimer", "0.00");
}

function lockRewardChoices() {
  Story._rewardLocked = true;
  const lootStartLock = $("#storyLootStartBtn");
  if (lootStartLock) lootStartLock.disabled = true;
  setBtnVisible($("#storyLootStartBtn"), false);
  setBtnVisible($("#storyLootStopBtn"), false);
  $$(".story-stat-pick").forEach((b) => { b.disabled = true; });
  $("#storyRewardContinue").classList.remove("hidden");
}

function itemFromAccuracy(diffSec) {
  if (diffSec <= 0.25) return "double";
  if (diffSec <= 0.50) return "reroll";
  if (diffSec <= 0.90) return "shield";
  return "heal";
}

function startLootTiming() {
  if (Story._rewardLocked || Story.rewardTiming.running || Story.phase !== "reward") return;
  Story.rewardTiming.running = true;
  Story.rewardTiming.start = performance.now();
  setBtnVisible($("#storyLootStartBtn"), false);
  setBtnVisible($("#storyLootStopBtn"), true);
  $$(".story-stat-pick").forEach((b) => { b.disabled = true; });
  setText("storyLootTimer", "0.00");
  const tick = (now) => {
    if (!Story.rewardTiming.running) return;
    const elapsed = (now - Story.rewardTiming.start) / 1000;
    setText("storyLootTimer", fmtSec(elapsed));
    Story.rewardTiming.raf = requestAnimationFrame(tick);
  };
  Story.rewardTiming.raf = requestAnimationFrame(tick);
}

function stopLootTiming() {
  if (!Story.rewardTiming.running) return;
  Story.rewardTiming.running = false;
  cancelAnimationFrame(Story.rewardTiming.raf);
  const elapsed = roundSec((performance.now() - Story.rewardTiming.start) / 1000);
  const target = Story.rewardTiming.targetSec;
  const diff = roundSec(Math.abs(elapsed - target));
  const itemId = itemFromAccuracy(diff);
  const def = ITEM_DEFS[itemId];
  Story.bag.push(itemId);
  setText("storyLootTimer", fmtSec(elapsed));
  $("#storyRewardResult").textContent =
    "停表 " + fmtSec(elapsed) + " 秒（差 " + fmtSec(diff) + "）→ " + def.emoji + " " + def.name;
  $("#storyRewardDetail").textContent = def.desc + " 已放入背包";
  $("#storyRewardDetail").classList.remove("hidden");
  saveStory();
  lockRewardChoices();
}

function pickStat(stat) {
  if (Story._rewardLocked) return;
  if (Story.rewardTiming.running) return;
  if (stat === "hp") {
    Story.hero.maxHp += 18;
    Story.hero.hp = Math.min(Story.hero.maxHp, Story.hero.hp + 18);
  } else if (stat === "atk") {
    Story.hero.atk += 3;
  } else if (stat === "def") {
    Story.hero.def += 2;
  }
  Story.hero.level += 1;
  $("#storyRewardResult").textContent =
    "永久强化：" +
    (stat === "hp" ? "+18 最大生命" : stat === "atk" ? "+3 攻击" : "+2 防御") +
    " · 升至 Lv." + Story.hero.level;
  $("#storyRewardDetail").textContent =
    "当前 HP " + Story.hero.hp + "/" + Story.hero.maxHp +
    " · ATK " + Story.hero.atk + " · DEF " + Story.hero.def;
  $("#storyRewardDetail").classList.remove("hidden");
  saveStory();
  lockRewardChoices();
}

function afterRewardContinue() {
  if (Story._afterFinalReward) {
    showEnding(true);
    return;
  }
  Story.chapterIndex += 1;
  saveStory();
  showNarration();
}

function showEnding(victory) {
  Story.phase = "ending";
  showStoryOnly("storyEnding");
  if (victory) {
    $("#storyEndTitle").textContent = "公主得救了！";
    $("#storyEndBody").textContent =
      "魔王倒下，水晶碎裂。公主握住勇者的手：\n「计时与勇气，缺一不可。王国将铭记这一天。」\n\n—— 故事模式通关（" +
      diffDef().label + "）——\n最终等级 Lv." +
      (Story.hero && Story.hero.level) +
      " · 攻击 " + (Story.hero && Story.hero.atk) +
      " · 防御 " + (Story.hero && Story.hero.def);
    clearStorySave();
    Story.hero = defaultHero();
    Story.bag = [];
    Story.chapterIndex = 0;
  } else {
    $("#storyEndTitle").textContent = "冒险中断…";
    $("#storyEndBody").textContent =
      "黑暗吞没了意识。但传说不会结束——从故事菜单再次启程吧。\n（进度已保存到战败前的关卡 · " +
      diffDef().label + "）";
    if (Story.hero) {
      Story.hero.hp = Math.max(1, Math.floor(Story.hero.maxHp * 0.55));
      saveStory();
    }
  }
}

function closeStoryToMenu() {
  Story.active = false;
  Story.phase = "hub";
  cancelTimingAnim();
  Story.timing.active = false;
  Story.timing.playerRunning = false;
  if (Story.rewardTiming.raf) cancelAnimationFrame(Story.rewardTiming.raf);
  Story.rewardTiming.running = false;
  openStoryRoot(false);
  const menu = document.getElementById("menuScreen");
  const start = document.getElementById("startScreen");
  const game = document.getElementById("gameScreen");
  if (game) game.style.display = "none";
  if (start) start.style.display = "none";
  if (menu) menu.style.display = "block";
}

function enterStoryMode() {
  const start = document.getElementById("startScreen");
  const menu = document.getElementById("menuScreen");
  const game = document.getElementById("gameScreen");
  if (start) start.style.display = "none";
  if (menu) menu.style.display = "none";
  if (game) game.style.display = "none";
  openHub();
}

window.enterStoryMode = enterStoryMode;
window.__storyStartTimer = startTimer;
window.__storyStopTimer = stopTimer;
window.StoryMode = { open: enterStoryMode, active: () => Story.active, key: STORY_KEY };

function bindStory() {
  const modeCard = $("#storyModeCard");
  if (modeCard) {
    modeCard.addEventListener("click", enterStoryMode);
    modeCard.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enterStoryMode(); }
    });
  }
  $$("#storyDiffRow .story-diff-btn").forEach((btn) => {
    btn.onclick = () => setDifficulty(btn.getAttribute("data-diff"), true);
  });
  $("#storyNew") && ($("#storyNew").onclick = () => startNewAdventure());
  $("#storyContinue") && ($("#storyContinue").onclick = () => {
    if (!loadStory()) { alert("没有故事进度，请开始新冒险。"); return; }
    setDifficulty(Story.difficulty, false);
    showNarration();
  });
  $("#storyBackMenu") && ($("#storyBackMenu").onclick = () => closeStoryToMenu());
  $("#storyNarrNext") && ($("#storyNarrNext").onclick = () => beginBattle());
  const startBtn = $("#storyStartTimer");
  if (startBtn) {
    startBtn.onclick = null;
    startBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      startTimer(false);
    });
  }
  const stopBtn = $("#storyStopTimer");
  if (stopBtn) {
    stopBtn.onclick = null;
    stopBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      stopTimer(false);
    });
  }
  const rerollBtn = $("#storyRerollBtn");
  if (rerollBtn) {
    rerollBtn.onclick = null;
    rerollBtn.addEventListener("click", () => consumeReroll());
  }
  const confirmStopBtn = $("#storyConfirmStop");
  if (confirmStopBtn) {
    confirmStopBtn.onclick = null;
    confirmStopBtn.addEventListener("click", () => confirmStopAfterRerollOption());
  }
  $("#storyFlee") && ($("#storyFlee").onclick = () => {
    if (!confirm("撤退将回到故事菜单（保留进度）")) return;
    cancelTimingAnim();
    Story.timing.active = false;
    Story.timing.playerRunning = false;
    saveStory();
    openHub();
  });
  $("#storyLootStartBtn") && ($("#storyLootStartBtn").onclick = () => startLootTiming());
  $("#storyLootStopBtn") && ($("#storyLootStopBtn").onclick = () => stopLootTiming());
  $$(".story-stat-pick").forEach((btn) => {
    btn.onclick = () => pickStat(btn.getAttribute("data-stat"));
  });
  $("#storyRewardContinue") && ($("#storyRewardContinue").onclick = () => afterRewardContinue());
  $("#storyEndMenu") && ($("#storyEndMenu").onclick = () => openHub());
  $("#storyEndMain") && ($("#storyEndMain").onclick = () => closeStoryToMenu());

  window.addEventListener("keydown", (e) => {
    if (!Story.active) return;
    if (e.code === "Escape") {
      if (Story.phase === "battle" && !Story.timing.active && !Story.timing.awaitingRerollConfirm) {
        e.preventDefault();
        e.stopPropagation();
        saveStory();
        openHub();
        return;
      }
      if (Story.phase === "hub" || Story.phase === "ending" || Story.phase === "narrate" || Story.phase === "reward") {
        e.preventDefault();
        e.stopPropagation();
        if (Story.phase === "hub" || Story.phase === "ending") closeStoryToMenu();
        else { saveStory(); openHub(); }
      }
      return;
    }
    if (e.code === "Space" || e.key === " ") {
      const visible = (el) => el && !el.classList.contains("hidden") && getComputedStyle(el).display !== "none";
      if (Story.phase === "battle") {
        if (Story.timing.playerRunning) {
          e.preventDefault();
          e.stopPropagation();
          stopTimer(false);
          return;
        }
        if (visible($("#storyStartTimer")) && !Story.timing.active && !Story.timing.awaitingRerollConfirm) {
          e.preventDefault();
          e.stopPropagation();
          startTimer(false);
          return;
        }
      }
      if (Story.phase === "reward") {
        if (Story.rewardTiming.running) {
          e.preventDefault();
          e.stopPropagation();
          stopLootTiming();
          return;
        }
        if (!Story._rewardLocked && visible($("#storyLootStartBtn"))) {
          e.preventDefault();
          e.stopPropagation();
          startLootTiming();
          return;
        }
      }
    }
  }, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindStory);
} else {
  bindStory();
}
})();

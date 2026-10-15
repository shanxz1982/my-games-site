/* TIME STOPPER — 故事模式 · 营救公主 */
(function () {
"use strict";

const STORY_KEY = "timeStopperStory_v1";
const $ = (s, root) => (root || document).querySelector(s);
const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

const ITEM_DEFS = {
  heal:   { id: "heal",   name: "回复药",   emoji: "🧪", desc: "恢复 40 HP" },
  shield: { id: "shield", name: "护盾符",   emoji: "🛡️", desc: "下次受伤减半" },
  double: { id: "double", name: "倍击符",   emoji: "💥", desc: "下次攻击双倍伤害" },
  reroll: { id: "reroll", name: "重停表",   emoji: "🔁", desc: "本回合可重停一次" }
};
const LOOT_POOL = ["heal", "shield", "double", "reroll"];

const CHAPTERS = [
  {
    id: 1, title: "边陲的烽火",
    narrate: "王国边陲传来异变。年轻的勇者接过锈迹斑斑的剑，踏上营救被魔王掳走的公主之路。\n第一关：密林入口，一群哥布林挡路。\n——用 TIME STOPPER 的直觉，停在目标时间最近的那一帧。",
    enemy: { name: "哥布林斥候", emoji: "👺", hp: 42, atk: 9, kind: "mob" },
    targetMs: 500
  },
  {
    id: 2, title: "迷雾河谷",
    narrate: "穿过密林，河谷升起灰雾。石像鬼在断桥上嘶鸣。\n勇者稳住呼吸——计时一决，快一步则生。",
    enemy: { name: "石像鬼", emoji: "🗿", hp: 58, atk: 12, kind: "mob" },
    targetMs: 650
  },
  {
    id: 3, title: "中段首领 · 暗影骑士",
    narrate: "峡谷尽头立着黑甲骑士。他自称魔王先锋：\n「想救公主？先赢过我的心跳。」\n——中段首领战。",
    enemy: { name: "暗影骑士", emoji: "🖤", hp: 95, atk: 16, kind: "boss" },
    targetMs: 480,
    midBoss: true
  },
  {
    id: 4, title: "熔岩回廊",
    narrate: "骑士倒下，道路通向灼热的熔岩回廊。火焰精灵成群扑来。\n背包里的符文隐隐发热——善用道具，方能活着走出地狱。",
    enemy: { name: "火焰精灵群", emoji: "🔥", hp: 72, atk: 14, kind: "mob" },
    targetMs: 420
  },
  {
    id: 5, title: "镜之迷宫",
    narrate: "魔王城堡外墙是无数镜子。分身敌军扰乱视线。\n目标时间变幻不定——专注，才能看见真实。",
    enemy: { name: "镜影刺客", emoji: "🪞", hp: 78, atk: 15, kind: "mob" },
    targetMs: 720
  },
  {
    id: 6, title: "王座之前",
    narrate: "王座厅大门半开。公主的呼喊隐约可闻。\n门卫巨魔拔出钉锤：「再近一步，骨头开花。」",
    enemy: { name: "门卫巨魔", emoji: "👹", hp: 105, atk: 17, kind: "mob" },
    targetMs: 550
  },
  {
    id: 7, title: "最终决战 · 营救公主",
    narrate: "魔王从阴影中现身，公主被锁在水晶牢中。\n「时间与勇气，都站在强者一边。」\n勇者举起剑——这是最后一战。",
    enemy: { name: "魔王", emoji: "😈", hp: 150, atk: 22, kind: "boss" },
    targetMs: 500,
    finalBoss: true
  }
];

const Story = {
  active: false,
  chapterIndex: 0,
  hero: null,
  enemy: null,
  bag: [],
  buffs: { shield: false, double: false, rerollReady: false },
  phase: "hub",
  timing: {
    running: false, start: 0, raf: 0, duration: 1200,
    playerMs: null, enemyMs: null, targetMs: 500
  },
  rewardTiming: {
    running: false, start: 0, raf: 0, duration: 1200, targetMs: 500
  },
  dmgFloatId: 0
};

function defaultHero() {
  return { name: "勇者", level: 1, hp: 100, maxHp: 100, atk: 14, def: 4 };
}

function saveStory() {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify({
      chapterIndex: Story.chapterIndex,
      hero: Story.hero,
      bag: Story.bag,
      savedAt: Date.now()
    }));
  } catch (e) {}
}

function loadStory() {
  try {
    const raw = localStorage.getItem(STORY_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    Story.chapterIndex = d.chapterIndex | 0;
    Story.hero = d.hero || defaultHero();
    Story.bag = Array.isArray(d.bag) ? d.bag : [];
    return true;
  } catch (e) { return false; }
}

function clearStorySave() {
  localStorage.removeItem(STORY_KEY);
}

function hasSave() {
  try { return !!localStorage.getItem(STORY_KEY); } catch (e) { return false; }
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
    btn.disabled = Story.phase !== "battle" || Story.timing.running;
    btn.onclick = () => useItem(idx);
    box.appendChild(btn);
  });
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
      "<div class=\"story-stat-chip\">章节 " + Math.min(Story.chapterIndex + 1, CHAPTERS.length) + "/" + CHAPTERS.length + "</div>";
  }
  const battleBag = $("#storyBattleBagHint");
  if (battleBag) battleBag.textContent = "背包 " + Story.bag.length + " 件";
}

function openHub() {
  Story.active = true;
  Story.phase = "hub";
  openStoryRoot(true);
  showStoryOnly("storyHub");
  if (!Story.hero) {
    if (!loadStory()) Story.hero = defaultHero();
  }
  renderHeroStats();
  const cont = $("#storyContinue");
  if (cont) cont.disabled = !hasSave();
  const progress = $("#storyHubProgress");
  if (progress) {
    progress.textContent = hasSave()
      ? ("存档：第 " + Math.min(Story.chapterIndex + 1, CHAPTERS.length) + " 章 · Lv." + (Story.hero && Story.hero.level))
      : "尚无存档 — 开始新冒险吧";
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
  // skip hidden chapter unless previous was cleared as final (chapterIndex points to it)
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

function beginBattle() {
  const ch = CHAPTERS[Story.chapterIndex];
  if (!ch) return;
  Story.phase = "battle";
  Story.buffs = { shield: false, double: false, rerollReady: false };
  Story.enemy = {
    name: ch.enemy.name,
    emoji: ch.enemy.emoji,
    hp: ch.enemy.hp,
    maxHp: ch.enemy.hp,
    atk: ch.enemy.atk,
    kind: ch.enemy.kind
  };
  Story.timing.targetMs = ch.targetMs;
  Story.timing.playerMs = null;
  Story.timing.enemyMs = null;
  Story.timing.running = false;
  showStoryOnly("storyBattle");
  $("#storyStagePill").textContent = "关卡 " + ch.id + (ch.midBoss || ch.finalBoss ? " · BOSS" : "");
  $("#storyHeroLv").textContent = Story.hero.name + " Lv." + Story.hero.level;
  $("#storyHeroName").textContent = Story.hero.name;
  $("#storyEnemyName").textContent = Story.enemy.name;
  $("#storyEnemyArt").textContent = Story.enemy.emoji;
  setHpBar($("#storyHeroHpBar"), $("#storyHeroHpText"), Story.hero.hp, Story.hero.maxHp);
  setHpBar($("#storyEnemyHpBar"), $("#storyEnemyHpText"), Story.enemy.hp, Story.enemy.maxHp);
  $("#storyTargetMs").textContent = String(ch.targetMs);
  $("#storyMark").style.left = (ch.targetMs / Story.timing.duration * 100) + "%";
  $("#storyPlayerStop").textContent = "—";
  $("#storyEnemyStop").textContent = "—";
  $("#storyBuffFlags").textContent = "无增益";
  $("#storyLog").innerHTML = "";
  $("#storyStartTimer").classList.remove("hidden");
  $("#storyStopTimer").classList.add("hidden");
  $("#storyRerollBtn").classList.add("hidden");
  renderBag();
  renderHeroStats();
  updateBuffFlags();
  log((ch.midBoss || ch.finalBoss ? "⚠ 首领战！ " : "") + "双方朝 " + ch.targetMs + " ms 停表，最接近者发动攻击。");
}

function updateBuffFlags() {
  const parts = [];
  if (Story.buffs.shield) parts.push("护盾");
  if (Story.buffs.double) parts.push("倍击");
  if (Story.buffs.rerollReady) parts.push("可重停");
  const text = parts.length ? parts.join(" · ") : "无增益";
  const el = $("#storyBuffFlags");
  if (el) el.textContent = text;
  const el2 = $("#storyBuffFlags2");
  if (el2) el2.textContent = text;
}

function useItem(idx) {
  if (Story.phase !== "battle" || Story.timing.running) return;
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

function startTimer() {
  if (Story.timing.running || Story.phase !== "battle") return;
  Story.timing.running = true;
  Story.timing.start = performance.now();
  Story.timing.playerMs = null;
  $("#storyStartTimer").classList.add("hidden");
  $("#storyStopTimer").classList.remove("hidden");
  $("#storyRerollBtn").classList.add("hidden");
  renderBag();
  const needle = $("#storyNeedle");
  const duration = Story.timing.duration;
  const tick = (now) => {
    if (!Story.timing.running) return;
    const elapsed = (now - Story.timing.start) % duration;
    if (needle) needle.style.left = (elapsed / duration * 100) + "%";
    Story.timing.raf = requestAnimationFrame(tick);
  };
  Story.timing.raf = requestAnimationFrame(tick);
}

function stopTimer(fromReroll) {
  if (!Story.timing.running) return;
  Story.timing.running = false;
  cancelAnimationFrame(Story.timing.raf);
  const elapsed = (performance.now() - Story.timing.start) % Story.timing.duration;
  Story.timing.playerMs = Math.round(elapsed);
  $("#storyPlayerStop").textContent = Story.timing.playerMs + " ms";
  $("#storyStopTimer").classList.add("hidden");

  if (!fromReroll && Story.buffs.rerollReady) {
    $("#storyRerollBtn").classList.remove("hidden");
    $("#storyStartTimer").classList.add("hidden");
    // still compute enemy preview? wait for confirm or reroll
    // show enemy only after commit
    log("已停表 " + Story.timing.playerMs + " ms。可用「重停」或确认结算。");
    const confirmBtn = $("#storyConfirmStop");
    if (confirmBtn) confirmBtn.classList.remove("hidden");
    return;
  }
  commitTurn();
}

function consumeReroll() {
  if (!Story.buffs.rerollReady) return;
  Story.buffs.rerollReady = false;
  updateBuffFlags();
  $("#storyRerollBtn").classList.add("hidden");
  const confirmBtn = $("#storyConfirmStop");
  if (confirmBtn) confirmBtn.classList.add("hidden");
  log("重停表！重新计时……");
  startTimer();
}

function confirmStopAfterRerollOption() {
  const confirmBtn = $("#storyConfirmStop");
  if (confirmBtn) confirmBtn.classList.add("hidden");
  $("#storyRerollBtn").classList.add("hidden");
  Story.buffs.rerollReady = false;
  updateBuffFlags();
  commitTurn();
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function commitTurn() {
  const target = Story.timing.targetMs;
  const skill = 35 + Story.chapterIndex * 9;
  const noise = (Math.random() - 0.5) * (190 - Math.min(130, skill));
  const enemyMs = Math.round(clamp(target + noise, 30, Story.timing.duration - 30));
  Story.timing.enemyMs = enemyMs;
  $("#storyEnemyStop").textContent = enemyMs + " ms";

  const pDist = Math.abs(Story.timing.playerMs - target);
  const eDist = Math.abs(enemyMs - target);
  log("你 " + Story.timing.playerMs + "ms（差 " + pDist + "）· 敌 " + enemyMs + "ms（差 " + eDist + "）");

  if (pDist <= eDist) {
    let dmg = Math.max(1, Story.hero.atk - Math.floor(Story.enemy.atk / 10) + Math.floor(Math.random() * 4));
    const crit = pDist <= 28;
    if (crit) dmg += 8;
    if (Story.buffs.double) {
      dmg *= 2;
      Story.buffs.double = false;
      log("倍击发动！", "story-win");
    }
    Story.enemy.hp -= dmg;
    setHpBar($("#storyEnemyHpBar"), $("#storyEnemyHpText"), Story.enemy.hp, Story.enemy.maxHp);
    spawnDmgNumber("enemy", dmg, crit ? "crit" : "hit");
    log("你发动攻击！造成 " + dmg + " 伤害" + (crit ? "（精准暴击！）" : ""), "story-win");
  } else {
    let dmg = Math.max(1, Story.enemy.atk - Story.hero.def + Math.floor(Math.random() * 5));
    if (Story.buffs.shield) {
      dmg = Math.max(1, Math.floor(dmg / 2));
      Story.buffs.shield = false;
      log("护盾抵挡一半伤害！", "story-win");
    }
    Story.hero.hp -= dmg;
    setHpBar($("#storyHeroHpBar"), $("#storyHeroHpText"), Story.hero.hp, Story.hero.maxHp);
    spawnDmgNumber("hero", dmg, "hit");
    log(Story.enemy.name + " 抢先出手！你受到 " + dmg + " 伤害", "story-lose");
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
  setTimeout(() => {
    $("#storyStartTimer").classList.remove("hidden");
    renderBag();
    log("—— 下一回合 ——");
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
    " · ATK " + Story.hero.atk + " · DEF " + Story.hero.def;
  $("#storyRewardResult").textContent = "—";
  $("#storyRewardDetail").classList.add("hidden");
  $("#storyLootStartBtn").classList.remove("hidden");
  $("#storyLootStartBtn").disabled = false;
  $("#storyLootStopBtn").classList.add("hidden");
  $$(".story-stat-pick").forEach((b) => { b.disabled = false; });
  $("#storyRewardContinue").classList.add("hidden");
  Story._afterFinalReward = !!afterFinal;
  Story._rewardLocked = false;
  // heal a bit between stages
  Story.hero.hp = Math.min(Story.hero.maxHp, Story.hero.hp + 15);
  // fresh target for loot timing challenge
  const targets = [420, 480, 500, 550, 600, 666, 720];
  Story.rewardTiming.targetMs = targets[Story.chapterIndex % targets.length];
  Story.rewardTiming.running = false;
  if (Story.rewardTiming.raf) cancelAnimationFrame(Story.rewardTiming.raf);
  $("#storyLootTargetMs").textContent = String(Story.rewardTiming.targetMs);
  $("#storyLootMark").style.left = (Story.rewardTiming.targetMs / Story.rewardTiming.duration * 100) + "%";
  $("#storyLootNeedle").style.left = "0%";
}

function lockRewardChoices() {
  Story._rewardLocked = true;
  $("#storyLootStartBtn").disabled = true;
  $("#storyLootStartBtn").classList.add("hidden");
  $("#storyLootStopBtn").classList.add("hidden");
  $$(".story-stat-pick").forEach((b) => { b.disabled = true; });
  $("#storyRewardContinue").classList.remove("hidden");
}

function itemFromAccuracy(diff) {
  // closer = better loot; always earn an item for completing the stop
  if (diff <= 25) return "double";
  if (diff <= 50) return "reroll";
  if (diff <= 90) return "shield";
  return "heal";
}

function startLootTiming() {
  if (Story._rewardLocked || Story.rewardTiming.running || Story.phase !== "reward") return;
  Story.rewardTiming.running = true;
  Story.rewardTiming.start = performance.now();
  $("#storyLootStartBtn").classList.add("hidden");
  $("#storyLootStopBtn").classList.remove("hidden");
  $$(".story-stat-pick").forEach((b) => { b.disabled = true; });
  const needle = $("#storyLootNeedle");
  const duration = Story.rewardTiming.duration;
  const tick = (now) => {
    if (!Story.rewardTiming.running) return;
    const elapsed = (now - Story.rewardTiming.start) % duration;
    if (needle) needle.style.left = (elapsed / duration * 100) + "%";
    Story.rewardTiming.raf = requestAnimationFrame(tick);
  };
  Story.rewardTiming.raf = requestAnimationFrame(tick);
}

function stopLootTiming() {
  if (!Story.rewardTiming.running) return;
  Story.rewardTiming.running = false;
  cancelAnimationFrame(Story.rewardTiming.raf);
  const elapsed = Math.round((performance.now() - Story.rewardTiming.start) % Story.rewardTiming.duration);
  const target = Story.rewardTiming.targetMs;
  const diff = Math.abs(elapsed - target);
  const itemId = itemFromAccuracy(diff);
  const def = ITEM_DEFS[itemId];
  Story.bag.push(itemId);
  $("#storyRewardResult").textContent =
    "停表 " + elapsed + " ms（差 " + diff + "）→ " + def.emoji + " " + def.name;
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
      "魔王倒下，水晶碎裂。公主握住勇者的手：\n「计时与勇气，缺一不可。王国将铭记这一天。」\n\n—— 故事模式通关 ——\n最终等级 Lv." +
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
      "黑暗吞没了意识。但传说不会结束——从故事菜单再次启程吧。\n（进度已保存到战败前的关卡）";
    if (Story.hero) {
      Story.hero.hp = Math.max(1, Math.floor(Story.hero.maxHp * 0.55));
      saveStory();
    }
  }
}

function closeStoryToMenu() {
  Story.active = false;
  Story.phase = "hub";
  if (Story.timing.raf) cancelAnimationFrame(Story.timing.raf);
  Story.timing.running = false;
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
  // leave other screens
  const start = document.getElementById("startScreen");
  const menu = document.getElementById("menuScreen");
  const game = document.getElementById("gameScreen");
  if (start) start.style.display = "none";
  if (menu) menu.style.display = "none";
  if (game) game.style.display = "none";
  openHub();
}

window.enterStoryMode = enterStoryMode;
window.StoryMode = { open: enterStoryMode, active: () => Story.active, key: STORY_KEY };

function bindStory() {
  const modeCard = $("#storyModeCard");
  if (modeCard) {
    modeCard.addEventListener("click", enterStoryMode);
    modeCard.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enterStoryMode(); }
    });
  }
  $("#storyNew") && ($("#storyNew").onclick = () => startNewAdventure());
  $("#storyContinue") && ($("#storyContinue").onclick = () => {
    if (!loadStory()) { alert("没有故事进度，请开始新冒险。"); return; }
    showNarration();
  });
  $("#storyBackMenu") && ($("#storyBackMenu").onclick = () => closeStoryToMenu());
  $("#storyNarrNext") && ($("#storyNarrNext").onclick = () => beginBattle());
  $("#storyStartTimer") && ($("#storyStartTimer").onclick = () => startTimer());
  $("#storyStopTimer") && ($("#storyStopTimer").onclick = () => stopTimer(false));
  $("#storyRerollBtn") && ($("#storyRerollBtn").onclick = () => consumeReroll());
  $("#storyConfirmStop") && ($("#storyConfirmStop").onclick = () => confirmStopAfterRerollOption());
  $("#storyFlee") && ($("#storyFlee").onclick = () => {
    if (!confirm("撤退将回到故事菜单（保留进度）")) return;
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
  $("#storySkipHidden") && ($("#storySkipHidden").onclick = () => {
    // used on ending if we add later
  });

  window.addEventListener("keydown", (e) => {
    if (!Story.active) return;
    if (e.code === "Escape") {
      if (Story.phase === "battle" && !Story.timing.running) {
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
        if (Story.timing.running) {
          e.preventDefault();
          e.stopPropagation();
          stopTimer(false);
          return;
        }
        if (visible($("#storyStartTimer"))) {
          e.preventDefault();
          e.stopPropagation();
          startTimer();
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

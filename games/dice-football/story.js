/* Story Mode — 勇者闯关营救公主 (timing duel + dice) */
(function () {
"use strict";
const $ = (s) => document.querySelector(s);
const STORY_KEY = "dice_football_story_v1";

const CHAPTERS = [
  {
    id: 1, title: "边陲的烽火",
    narrate: "王国边陲传来异变。年轻的勇者接过锈迹斑斑的剑，踏上营救被魔王掳走的公主之路。\n第一关：密林入口，一群哥布林挡路。",
    enemy: { name: "哥布林斥候", emoji: "👺", hp: 40, atk: 8, kind: "mob" },
    targetMs: 480
  },
  {
    id: 2, title: "迷雾河谷",
    narrate: "穿过密林，河谷升起灰雾。石像鬼在断桥上嘶鸣。\n勇者稳住呼吸——计时一决，快一步则生。",
    enemy: { name: "石像鬼", emoji: "🗿", hp: 55, atk: 11, kind: "mob" },
    targetMs: 520
  },
  {
    id: 3, title: "中段首领 · 暗影骑士",
    narrate: "峡谷尽头立着黑甲骑士。他自称魔王先锋：\n「想救公主？先赢过我的心跳。」\n——中段首领战。",
    enemy: { name: "暗影骑士", emoji: "🖤", hp: 90, atk: 15, kind: "boss" },
    targetMs: 500,
    midBoss: true
  },
  {
    id: 4, title: "熔岩回廊",
    narrate: "骑士倒下，道路通向灼热的熔岩回廊。火焰精灵成群扑来。\n勇者感到力量在血管里奔涌。",
    enemy: { name: "火焰精灵群", emoji: "🔥", hp: 70, atk: 13, kind: "mob" },
    targetMs: 450
  },
  {
    id: 5, title: "镜之迷宫",
    narrate: "魔王城堡外墙是无数镜子。分身敌军扰乱视线。\n目标时间变幻不定——专注，才能看见真实。",
    enemy: { name: "镜影刺客", emoji: "🪞", hp: 75, atk: 14, kind: "mob" },
    targetMs: 560
  },
  {
    id: 6, title: "王座之前",
    narrate: "王座厅大门半开。公主的呼喊隐约可闻。\n门卫巨魔拔出钉锤：「再近一步，骨头开花。」",
    enemy: { name: "门卫巨魔", emoji: "👹", hp: 100, atk: 16, kind: "mob" },
    targetMs: 490
  },
  {
    id: 7, title: "最终决战 · 营救公主",
    narrate: "魔王从阴影中现身，公主被锁在水晶牢中。\n「骰子与时间，都站在强者一边。」\n勇者举起剑——这是最后一战。",
    enemy: { name: "魔王", emoji: "😈", hp: 140, atk: 20, kind: "boss" },
    targetMs: 500,
    finalBoss: true
  }
];

const Story = {
  active: false,
  chapterIndex: 0,
  hero: null,
  enemy: null,
  phase: "hub", // hub | narrate | battle | levelup | ending
  timing: {
    running: false, start: 0, raf: 0, duration: 1200,
    playerMs: null, enemyMs: null, targetMs: 500, dice: 0
  }
};

function defaultHero() {
  return { name: "勇者", level: 1, hp: 100, maxHp: 100, atk: 12, def: 4, exp: 0 };
}

function saveStory() {
  localStorage.setItem(STORY_KEY, JSON.stringify({
    chapterIndex: Story.chapterIndex,
    hero: Story.hero,
    savedAt: Date.now()
  }));
}
function loadStory() {
  try {
    const raw = localStorage.getItem(STORY_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    Story.chapterIndex = d.chapterIndex | 0;
    Story.hero = d.hero || defaultHero();
    return true;
  } catch (e) { return false; }
}
function clearStorySave() { localStorage.removeItem(STORY_KEY); }

function showOnly(id) {
  ["splash","menu","newgame","journey","app","storyHub","storyNarration","storyBattle","storyLevelUp","storyEnding","slotsModal"]
    .forEach(x => { const el = document.getElementById(x); if (el) el.classList.add("hidden"); });
  const t = document.getElementById(id);
  if (t) t.classList.remove("hidden");
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
  const pct = Math.max(0, Math.round(100 * hp / Math.max(1, max)));
  barEl.style.width = pct + "%";
  textEl.textContent = "HP " + Math.max(0, hp) + "/" + max;
}

function openHub() {
  Story.active = true;
  Story.phase = "hub";
  showOnly("storyHub");
}

function startNewAdventure() {
  Story.hero = defaultHero();
  Story.chapterIndex = 0;
  clearStorySave();
  saveStory();
  showNarration();
}

function showNarration() {
  const ch = CHAPTERS[Story.chapterIndex];
  if (!ch) { showEnding(true); return; }
  Story.phase = "narrate";
  showOnly("storyNarration");
  $("#storyChapterLabel").textContent = "第 " + ch.id + " 章" + (ch.midBoss ? " · 中段首领" : "") + (ch.finalBoss ? " · 最终战" : "");
  $("#storyTitle").textContent = ch.title;
  $("#storyBody").textContent = ch.narrate;
}

function beginBattle() {
  const ch = CHAPTERS[Story.chapterIndex];
  if (!ch) return;
  Story.phase = "battle";
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
  Story.timing.dice = 0;
  Story.timing.running = false;
  showOnly("storyBattle");
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
  $("#storyDiceBonus").textContent = "—";
  $("#storyLog").innerHTML = "";
  $("#storyStartTimer").classList.remove("hidden");
  $("#storyStopTimer").classList.add("hidden");
  log((ch.midBoss || ch.finalBoss ? "⚠ 首领战！" : "") + "双方轮流停表，最接近 " + ch.targetMs + "ms 者发动攻击。");
}

function startTimer() {
  if (Story.timing.running) return;
  Story.timing.running = true;
  Story.timing.start = performance.now();
  Story.timing.playerMs = null;
  $("#storyStartTimer").classList.add("hidden");
  $("#storyStopTimer").classList.remove("hidden");
  const needle = $("#storyNeedle");
  const duration = Story.timing.duration;
  const tick = (now) => {
    if (!Story.timing.running) return;
    const elapsed = (now - Story.timing.start) % duration;
    needle.style.left = (elapsed / duration * 100) + "%";
    Story.timing.raf = requestAnimationFrame(tick);
  };
  Story.timing.raf = requestAnimationFrame(tick);
}

function stopTimer() {
  if (!Story.timing.running) return;
  Story.timing.running = false;
  cancelAnimationFrame(Story.timing.raf);
  const elapsed = (performance.now() - Story.timing.start) % Story.timing.duration;
  Story.timing.playerMs = Math.round(elapsed);
  $("#storyPlayerStop").textContent = Story.timing.playerMs + " ms";
  $("#storyStopTimer").classList.add("hidden");

  // Enemy AI: decent aim with noise + difficulty by chapter
  const target = Story.timing.targetMs;
  const skill = 40 + Story.chapterIndex * 8;
  const noise = (Math.random() - 0.5) * (180 - Math.min(120, skill));
  let enemyMs = Math.round(clamp(target + noise, 40, Story.timing.duration - 40));
  Story.timing.enemyMs = enemyMs;
  $("#storyEnemyStop").textContent = enemyMs + " ms";

  // Dice flavor: 1d6 slight bias toward closer roll (tie-break / polish)
  const dice = 1 + Math.floor(Math.random() * 6);
  Story.timing.dice = dice;
  $("#storyDiceBonus").textContent = "d6 → " + dice;

  resolveTurn();
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function resolveTurn() {
  const target = Story.timing.targetMs;
  let pDist = Math.abs(Story.timing.playerMs - target);
  let eDist = Math.abs(Story.timing.enemyMs - target);
  // dice: odd slightly helps player on near-ties, even helps enemy
  if (Math.abs(pDist - eDist) <= 25) {
    if (Story.timing.dice % 2 === 1) pDist -= 8;
    else eDist -= 8;
  }
  log("你 " + Story.timing.playerMs + "ms（差 " + Math.abs(Story.timing.playerMs - target) + "）· 敌 " + Story.timing.enemyMs + "ms（差 " + Math.abs(Story.timing.enemyMs - target) + "）");

  if (pDist <= eDist) {
    // player attacks
    const crit = pDist <= 30;
    const dmg = Math.max(1, Story.hero.atk - Math.floor(Story.enemy.atk / 8) + (crit ? 6 : 0) + Math.floor(Story.timing.dice / 2));
    Story.enemy.hp -= dmg;
    setHpBar($("#storyEnemyHpBar"), $("#storyEnemyHpText"), Story.enemy.hp, Story.enemy.maxHp);
    log("你发动攻击！造成 " + dmg + " 伤害" + (crit ? "（精准暴击！）" : ""), "story-win");
  } else {
    const dmg = Math.max(1, Story.enemy.atk - Story.hero.def + Math.floor(Math.random() * 4));
    Story.hero.hp -= dmg;
    setHpBar($("#storyHeroHpBar"), $("#storyHeroHpText"), Story.hero.hp, Story.hero.maxHp);
    log(Story.enemy.name + " 抢先出手！你受到 " + dmg + " 伤害", "story-lose");
  }

  if (Story.enemy.hp <= 0) {
    log("击败了 " + Story.enemy.name + "！", "story-win");
    saveStory();
    setTimeout(onStageClear, 700);
    return;
  }
  if (Story.hero.hp <= 0) {
    log("你倒下了……", "story-lose");
    setTimeout(() => showEnding(false), 800);
    return;
  }
  // next round
  setTimeout(() => {
    $("#storyStartTimer").classList.remove("hidden");
    log("—— 下一回合：再次开始计时 ——");
  }, 450);
}

function onStageClear() {
  const ch = CHAPTERS[Story.chapterIndex];
  if (ch.finalBoss) {
    showEnding(true);
    return;
  }
  // level up
  Story.phase = "levelup";
  const gainAtk = 2 + Math.floor(Math.random() * 3);
  const gainDef = 1 + Math.floor(Math.random() * 2);
  const gainHp = 12 + Math.floor(Math.random() * 10);
  Story.hero.level += 1;
  Story.hero.atk += gainAtk;
  Story.hero.def += gainDef;
  Story.hero.maxHp += gainHp;
  Story.hero.hp = Math.min(Story.hero.maxHp, Story.hero.hp + Math.floor(gainHp * 0.8) + 10);
  showOnly("storyLevelUp");
  $("#storyLvSummary").textContent = Story.hero.name + " 升至 Lv." + Story.hero.level + "！";
  $("#storyStatGain").innerHTML =
    "<div class=\"card\">攻击 +" + gainAtk + " → <b>" + Story.hero.atk + "</b></div>" +
    "<div class=\"card\">防御 +" + gainDef + " → <b>" + Story.hero.def + "</b></div>" +
    "<div class=\"card\">最大生命 +" + gainHp + " → <b>" + Story.hero.maxHp + "</b>（当前 HP " + Story.hero.hp + "）</div>";
  Story.chapterIndex += 1;
  saveStory();
}

function showEnding(victory) {
  Story.phase = "ending";
  showOnly("storyEnding");
  if (victory) {
    $("#storyEndTitle").textContent = "公主得救了！";
    $("#storyEndBody").textContent = "魔王倒下，水晶碎裂。公主握住勇者的手：\n「计时与勇气，缺一不可。王国将铭记这一天。」\n\n—— 故事模式通关 ——\n最终等级 Lv." + (Story.hero && Story.hero.level) + " · 攻击 " + (Story.hero && Story.hero.atk);
    clearStorySave();
  } else {
    $("#storyEndTitle").textContent = "冒险中断…";
    $("#storyEndBody").textContent = "黑暗吞没了意识。但传说不会结束——从故事菜单再次启程吧。\n（进度已保存到战败前的关卡）";
    // rewind hp for retry
    if (Story.hero) {
      Story.hero.hp = Math.max(1, Math.floor(Story.hero.maxHp * 0.6));
      saveStory();
    }
  }
}

function bindStory() {
  const btn = $("#btnStory");
  if (btn) btn.onclick = () => openHub();
  $("#storyNew").onclick = () => startNewAdventure();
  $("#storyContinue").onclick = () => {
    if (!loadStory()) { alert("没有故事进度，请开始新冒险。"); return; }
    showNarration();
  };
  $("#storyBackMenu").onclick = () => {
    Story.active = false;
    showOnly("menu");
  };
  $("#storyNarrNext").onclick = () => beginBattle();
  $("#storyStartTimer").onclick = () => startTimer();
  $("#storyStopTimer").onclick = () => stopTimer();
  $("#storyFlee").onclick = () => {
    if (!confirm("撤退将回到故事菜单（保留进度）")) return;
    saveStory();
    openHub();
  };
  $("#storyLvContinue").onclick = () => showNarration();
  $("#storyEndMenu").onclick = () => openHub();
  $("#storyEndMain").onclick = () => { Story.active = false; showOnly("menu"); };

  // Space to stop when timer running
  window.addEventListener("keydown", (e) => {
    if (!Story.active || Story.phase !== "battle") return;
    if (e.code === "Space" || e.key === " ") {
      if (Story.timing.running) { e.preventDefault(); stopTimer(); }
    }
  });
}

document.addEventListener("DOMContentLoaded", bindStory);
})();

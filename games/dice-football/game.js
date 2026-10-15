/* 投骰子吧！创造我的球会 — Dice Football Manager v2 */
(function () {
"use strict";
const $$ = (s, r=document) => r.querySelector(s);
const $$$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const rand = (n) => Math.floor(Math.random()*n);
const choice = (arr) => arr[rand(arr.length)];
const fmtMoney = (n) => "¥ " + (n/1000).toFixed(0) + "k";
function makeRNG(seedStr) {
  let h = 0; for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  let state = h || 0x12345678;
  return function () { state = (1664525 * state + 1013904223) >>> 0; return state / 0xffffffff; };
}
let RNG = Math.random;
const STORAGE_ROOT = "dice_football_v2";
const LEGACY_KEY = "dice_football_save";
const RECORDS_KEY = "dice_football_records_v2";

const CloudRecords = {
  _ready: false, _db: null,
  isConfigured() {
    const c = window.FIREBASE_CONFIG || {};
    return !!(c.projectId && c.apiKey);
  },
  async init() {
    if (!this.isConfigured()) return false;
    if (this._ready) return true;
    try {
      if (typeof firebase === "undefined") return false;
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      this._db = firebase.firestore();
      this._ready = true;
      return true;
    } catch (e) { console.warn("CloudRecords init failed", e); return false; }
  },
  async submit(entry) {
    const local = loadDeviceRecords();
    local.cloudQueue = local.cloudQueue || [];
    local.cloudQueue.push(Object.assign({}, entry, { queuedAt: Date.now() }));
    const w=entry.winPct||0;
    local.careerSummaries = (local.careerSummaries||[]).filter(x => !(x.managerName===entry.managerName && x.season===entry.season));
    local.careerSummaries.push(entry);
    saveDeviceRecords(local);
    if (!(await this.init())) return { ok: false, mode: "local", msg: "未配置 Firebase，已写入本地队列/纪录" };
    try {
      await this._db.collection("leaderboard").add({
        managerName: entry.managerName || "匿名教练",
        clubName: entry.clubName || "",
        trophies: entry.trophies|0,
        bestFinish: entry.bestFinish || "",
        season: entry.season|0,
        winPct: entry.winPct || 0,
        nickname: entry.nickname || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { ok: true, mode: "cloud", msg: "已提交全球排行榜" };
    } catch (e) {
      return { ok: false, mode: "local", msg: "云端提交失败，保留本地：" + (e.message||e) };
    }
  },
  async getLeaderboard(limit) {
    limit = limit || 20;
    if (!(await this.init())) {
      const local = loadDeviceRecords();
      const rows = (local.careerSummaries||[]).slice().sort((a,b)=>(b.trophies-a.trophies)||(b.winPct-a.winPct)).slice(0,limit);
      return { mode: "local", rows: rows };
    }
    try {
      const snap = await this._db.collection("leaderboard").orderBy("trophies","desc").limit(limit).get();
      return { mode: "cloud", rows: snap.docs.map(d => Object.assign({id:d.id}, d.data())) };
    } catch (e) {
      const local = loadDeviceRecords();
      return { mode: "local", rows: (local.careerSummaries||[]).slice(0,limit), error: String(e) };
    }
  }
};
window.CloudRecords = CloudRecords;

function defaultSlots() { return { version: 2, activeSlot: 0, slots: [null, null, null], profiles: {} }; }
function loadRoot() {
  try { const raw = localStorage.getItem(STORAGE_ROOT); if (raw) return JSON.parse(raw); } catch (e) {}
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const data = JSON.parse(legacy);
      const root = defaultSlots();
      root.slots[0] = { name: "迁移存档", nickname: "Player", savedAt: Date.now(), data: data };
      localStorage.setItem(STORAGE_ROOT, JSON.stringify(root));
      return root;
    }
  } catch (e) {}
  return defaultSlots();
}
function saveRoot(root) { localStorage.setItem(STORAGE_ROOT, JSON.stringify(root)); }
function loadDeviceRecords() {
  try {
    return Object.assign({ titles:[], bestLeagueFinish:null, longestUnbeaten:0, topScorers:[], careerSummaries:[], cloudQueue:[] },
      JSON.parse(localStorage.getItem(RECORDS_KEY)||"{}"));
  } catch (e) {
    return { titles:[], bestLeagueFinish:null, longestUnbeaten:0, topScorers:[], careerSummaries:[], cloudQueue:[] };
  }
}
function saveDeviceRecords(r) { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); }

const Cities = [
  {name:"北京",size:"大",diff:1.1},{name:"上海",size:"大",diff:1.12},{name:"广州",size:"大",diff:1.05},
  {name:"深圳",size:"大",diff:1.1},{name:"成都",size:"大",diff:1.05},{name:"武汉",size:"大",diff:1.02},
  {name:"杭州",size:"中",diff:1.0},{name:"天津",size:"中",diff:0.98},{name:"重庆",size:"大",diff:0.98},
  {name:"青岛",size:"中",diff:0.96},{name:"大连",size:"中",diff:0.95},{name:"济南",size:"中",diff:0.98},
  {name:"南昌",size:"中",diff:0.94},{name:"西安",size:"中",diff:0.96},{name:"长春",size:"中",diff:0.94}
];
const CSL_TEAMS = [
  {name:"上海海港",city:"上海"},{name:"山东泰山",city:"济南"},{name:"北京国安",city:"北京"},
  {name:"武汉三镇",city:"武汉"},{name:"上海申花",city:"上海"},{name:"成都蓉城",city:"成都"},
  {name:"浙江队",city:"杭州"},{name:"天津津门虎",city:"天津"},{name:"河南队",city:"郑州"},
  {name:"沧州雄狮",city:"沧州"},{name:"梅州客家",city:"梅州"},{name:"青岛海牛",city:"青岛"},
  {name:"青岛西海岸",city:"青岛"},{name:"南通支云",city:"南通"},{name:"长春亚泰",city:"长春"},
  {name:"深圳新鹏城",city:"深圳"}
];
const CL1_TEAMS = [
  {name:"广州队",city:"广州"},{name:"陕西联合",city:"西安"},{name:"苏州东吴",city:"苏州"},
  {name:"黑龙江冰城",city:"哈尔滨"},{name:"四川九牛",city:"成都"},{name:"南京城市",city:"南京"},
  {name:"广西平果哈嘟",city:"百色"},{name:"石家庄功夫",city:"石家庄"},{name:"大连英博",city:"大连"},
  {name:"青岛红狮",city:"青岛"},{name:"江西庐山",city:"南昌"},{name:"辽宁铁人",city:"沈阳"},
  {name:"延边龙鼎",city:"延吉"},{name:"云南玉昆",city:"昆明"},{name:"济南兴洲",city:"济南"},
  {name:"重庆铜梁龙",city:"重庆"}
];
const LEGENDS = [
  {name:"Pelé",pos:"FWD",age:28,atk:96,def:42},{name:"Diego Maradona",pos:"FWD",age:27,atk:97,def:45},
  {name:"Johan Cruyff",pos:"FWD",age:29,atk:94,def:50},{name:"Zinedine Zidane",pos:"MID",age:29,atk:92,def:56},
  {name:"Ronaldo Nazário",pos:"FWD",age:26,atk:95,def:38},{name:"Ronaldinho",pos:"MID",age:26,atk:93,def:42},
  {name:"Franz Beckenbauer",pos:"DEF",age:30,atk:78,def:94},{name:"Maldini",pos:"DEF",age:30,atk:70,def:95},
  {name:"Lev Yashin",pos:"GK",age:30,atk:55,def:96},{name:"Garrincha",pos:"FWD",age:27,atk:93,def:36}
];
const SURNAME_CN = ["王","李","张","刘","陈","杨","赵","黄","周","吴","徐","孙","马","朱","胡","郭","何","高","林","罗"];
const GIVEN_CN_1 = ["宇","浩","博","俊","睿","梓","子","明","天","思","诗","艺","晨","雨","钧","航","奕","嘉"];
const GIVEN_CN_2 = ["轩","涵","桐","宁","阳","然","杰","洋","婷","琪","萱","明","航","妍","悦","泽","乐","瑶"];
const POSITIONS = ["GK","DEF","MID","FWD"];
const FORMATIONS = {
  "4-3-3":[{p:"GK",x:10,y:50},{p:"DEF",x:28,y:20},{p:"DEF",x:28,y:40},{p:"DEF",x:28,y:60},{p:"DEF",x:28,y:80},{p:"MID",x:50,y:30},{p:"MID",x:50,y:50},{p:"MID",x:50,y:70},{p:"FWD",x:75,y:25},{p:"FWD",x:78,y:50},{p:"FWD",x:75,y:75}],
  "4-4-2":[{p:"GK",x:10,y:50},{p:"DEF",x:28,y:20},{p:"DEF",x:28,y:40},{p:"DEF",x:28,y:60},{p:"DEF",x:28,y:80},{p:"MID",x:50,y:18},{p:"MID",x:50,y:40},{p:"MID",x:50,y:60},{p:"MID",x:50,y:82},{p:"FWD",x:78,y:35},{p:"FWD",x:78,y:65}],
  "3-5-2":[{p:"GK",x:10,y:50},{p:"DEF",x:28,y:25},{p:"DEF",x:28,y:50},{p:"DEF",x:28,y:75},{p:"MID",x:48,y:15},{p:"MID",x:48,y:35},{p:"MID",x:52,y:50},{p:"MID",x:48,y:65},{p:"MID",x:48,y:85},{p:"FWD",x:78,y:35},{p:"FWD",x:78,y:65}],
  "4-2-3-1":[{p:"GK",x:10,y:50},{p:"DEF",x:26,y:20},{p:"DEF",x:26,y:40},{p:"DEF",x:26,y:60},{p:"DEF",x:26,y:80},{p:"MID",x:42,y:38},{p:"MID",x:42,y:62},{p:"MID",x:58,y:22},{p:"MID",x:58,y:50},{p:"MID",x:58,y:78},{p:"FWD",x:80,y:50}]
};
const Game = {
  version:"2.0.0", seed:null, date:"2026-03-01", round:1, season:2026,
  homeAdv:true, fastMatch:false, autoSave:true, slotIndex:0, nickname:"",
  clubs:[], league:{CSL:null,CL1:null}, cups:{CFA:null,WCC:null},
  user:{ clubId:null, money:2000000, morale:50, trainingFocus:"balanced",
    facilities:{training:1,youth:1,stadium:1}, scoutLevel:1, transferBudget:800000,
    wageBudget:120000, boardConfidence:55, captainId:null, setPieceId:null,
    shortlist:[], unbeatenStreak:0, bestUnbeaten:0 },
  manager:{ name:"新晋教练", reputation:40, preferredFormation:"4-3-3", seasonsManaged:0,
    trophies:0, wins:0, draws:0, losses:0, history:[] },
  tactics:{ formation:"4-3-3", mentality:"balanced", pressing:"med", width:"normal" },
  pools:{ legends:[], freeAgents:[], scouts:[], extraPlayers:[], scoutReports:{} },
  hall:[], fixtures:{CSL:[],CL1:[]}, lastResults:[], inbox:[], championsUnlocked:false, seasonGoals:{}
};
const AllPlayers = new Map();
function makeId(prefix){ return prefix+"_"+Math.random().toString(36).slice(2,10); }
function makeCNName(rng){ return SURNAME_CN[Math.floor(rng()*SURNAME_CN.length)]+GIVEN_CN_1[Math.floor(rng()*GIVEN_CN_1.length)]+GIVEN_CN_2[Math.floor(rng()*GIVEN_CN_2.length)]; }
function makeIntlName(rng){
  const first=["Alex","Liam","Noah","Leo","Lucas","Ethan","Hugo","Marco","Diego","Luis","Theo","Max","Ivan","Ken","Yuki"];
  const last=["Smith","Brown","Wilson","Walker","Silva","Santos","Rossi","Garcia","Kim","Tanaka","Khan","Ali"];
  return first[Math.floor(rng()*first.length)]+" "+last[Math.floor(rng()*last.length)];
}
function genPlayer(rng, opts){
  opts=opts||{};
  const pos=opts.pos||POSITIONS[Math.floor(rng()*POSITIONS.length)];
  const name=opts.name||(rng()<0.6?makeCNName(rng):makeIntlName(rng));
  const age=opts.age!=null?opts.age:(17+Math.floor(rng()*15));
  const atk=opts.atk!=null?opts.atk:(pos==="GK"?Math.floor(40+rng()*25):Math.floor(50+rng()*45));
  const def=opts.def!=null?opts.def:(pos==="FWD"?Math.floor(40+rng()*35):Math.floor(50+rng()*45));
  return { id:makeId("P"), name, pos, age, atk, def, morale:40+Math.floor(rng()*40),
    form:45+Math.floor(rng()*30), fitness:70+Math.floor(rng()*30), injuryWeeks:0,
    potential:opts.potential!=null?opts.potential:clamp(Math.max(atk,def)+Math.floor(rng()*20),50,99),
    legend:!!opts.legend, clubId:null, salary:Math.floor(2000+(atk+def)*30), goals:0, on:false };
}
function getAllPlayersOfClub(clubId){ return Array.from(AllPlayers.values()).filter(p=>p.clubId===clubId); }
function positionSuitability(p, formation){
  const slots=(FORMATIONS[formation]||FORMATIONS["4-3-3"]).map(s=>s.p);
  const need={}; slots.forEach(s=>need[s]=(need[s]||0)+1);
  if((need[p.pos]||0)>0) return "高";
  if(p.pos==="MID") return "中";
  return "低";
}
function tacticsModifiers(){
  const t=Game.tactics; let atkMod=0, defMod=0, thrHome=0;
  if(t.mentality==="attack"){ atkMod+=4; defMod-=3; thrHome-=0.4; }
  if(t.mentality==="defend"){ atkMod-=3; defMod+=4; thrHome+=0.3; }
  if(t.pressing==="high"){ atkMod+=2; defMod+=1; }
  if(t.pressing==="low"){ defMod+=2; atkMod-=1; }
  if(t.width==="wide"){ atkMod+=2; defMod-=1; }
  if(t.width==="narrow"){ defMod+=2; atkMod-=1; }
  if(t.formation==="4-3-3") atkMod+=2;
  if(t.formation==="3-5-2"){ atkMod+=1; defMod+=1; }
  if(t.formation==="4-2-3-1"){ atkMod+=1; defMod+=1; }
  return { atkMod, defMod, thrDelta:thrHome };
}
function computeTeamOverall(team, players){
  let on=players.filter(p=>p.on&&!p.injuryWeeks).slice(0,5);
  if(on.length<5){ const rest=players.filter(p=>!p.on&&!p.injuryWeeks).sort((a,b)=>(b.atk+b.def)-(a.atk+a.def)); on=on.concat(rest.slice(0,5-on.length)); }
  const baseAtk=Math.floor(on.reduce((s,p)=>s+p.atk*(0.85+p.form/500),0)/Math.max(1,on.length));
  const baseDef=Math.floor(on.reduce((s,p)=>s+p.def*(0.85+p.fitness/400),0)/Math.max(1,on.length));
  const train=team.isUser?Game.user.facilities.training:2;
  const teamMorale=Math.floor(players.reduce((s,p)=>s+p.morale,0)/Math.max(1,players.length));
  let atk=Math.round(baseAtk*(1+0.03*(train-1))), def=Math.round(baseDef*(1+0.03*(train-1)));
  if(team.isUser){ const m=tacticsModifiers(); atk+=m.atkMod; def+=m.defMod; }
  return { atk:clamp(atk,1,99), def:clamp(def,1,99), morale:teamMorale };
}

function createClub(name, city, leagueCode, color, isUser){
  color=color||"#2f7a4f"; isUser=!!isUser;
  const id=makeId("C");
  const cityInfo=Cities.find(c=>c.name===city)||Cities[0];
  const club={ id, name, city:cityInfo.name, color, league:leagueCode, funds:1000000*cityInfo.diff,
    prestige:leagueCode==="CSL"?70:50, players:[], youth:[], on:[], bench:[],
    stats:{atk:50,def:50,morale:50}, formation:"4-3-3", isUser };
  Game.clubs.push(club); return club;
}
function genTeamPlayers(rng, club, base){
  base=base||60; const arr=[];
  arr.push(genPlayer(rng,{pos:"GK",age:22+Math.floor(rng()*10),atk:40+Math.floor(rng()*30),def:base+5+Math.floor(rng()*30)}));
  while(arr.length<18){
    const pos=choice(["DEF","DEF","MID","MID","FWD","FWD","MID"]);
    arr.push(genPlayer(rng,{pos, atk:base-5+Math.floor(rng()*40)+(pos==="FWD"?5:0), def:base-5+Math.floor(rng()*40)+(pos==="DEF"?5:0)}));
  }
  arr.forEach(p=>{ p.clubId=club.id; p.on=false; club.players.push(p.id); AllPlayers.set(p.id,p); });
  const gk=arr.filter(p=>p.pos==="GK").sort((a,b)=>b.def-a.def)[0];
  const defs=arr.filter(p=>p.pos==="DEF").sort((a,b)=>b.def-a.def);
  const mids=arr.filter(p=>p.pos==="MID").sort((a,b)=>(b.atk+b.def)-(a.atk+a.def));
  const fwds=arr.filter(p=>p.pos==="FWD").sort((a,b)=>b.atk-a.atk);
  const starters=[gk,defs[0],mids[0],fwds[0],(mids[1]||defs[1]||fwds[1])].filter(Boolean);
  starters.forEach(p=>{p.on=true;});
  club.on=starters.map(p=>p.id); club.bench=arr.filter(p=>!p.on).slice(0,5).map(p=>p.id);
  const ov=computeTeamOverall(club,getAllPlayersOfClub(club.id));
  club.stats.atk=ov.atk; club.stats.def=ov.def; club.stats.morale=ov.morale;
  if(club.isUser){ Game.user.captainId=starters[0]&&starters[0].id; Game.user.setPieceId=(fwds[0]||mids[0])&&(fwds[0]||mids[0]).id; }
}
function roundRobin(teams){
  const arr=teams.slice(); if(arr.length%2===1) arr.push({bye:true});
  const n=arr.length, mid=n/2; let home=arr.slice(0,mid), away=arr.slice(mid).reverse(); const rounds=[];
  for(let r=0;r<n-1;r++){
    const matches=[];
    for(let i=0;i<mid;i++){ const t1=home[i],t2=away[i]; if(!t1.bye&&!t2.bye) matches.push({home:t1.id,away:t2.id,played:false,score:null}); }
    rounds.push(matches);
    const fixed=home[0]; const movedHome=[fixed,away[0]].concat(home.slice(1)); const movedAway=away.slice(1).concat([home[home.length-1]]);
    home=movedHome.slice(0,mid); away=movedAway.slice(0,mid);
  }
  return rounds.concat(rounds.map(ms=>ms.map(m=>({home:m.away,away:m.home,played:false,score:null}))));
}
function initStandings(teams){ const table={}; teams.forEach(t=>{ table[t.id]={teamId:t.id,pts:0,w:0,d:0,l:0,gf:0,ga:0,p:0}; }); return table; }
function applyResultToTable(table, match){
  const hg=match.score[0], ag=match.score[1]; const th=table[match.home], ta=table[match.away];
  th.p++; ta.p++; th.gf+=hg; th.ga+=ag; ta.gf+=ag; ta.ga+=hg;
  if(hg>ag){ th.w++; th.pts+=3; ta.l++; } else if(hg<ag){ ta.w++; ta.pts+=3; th.l++; } else { th.d++; ta.d++; th.pts++; ta.pts++; }
}
function tableToArray(table){ return Object.values(table).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf); }
function goalThreshold(baseAdv, atk, def, morale, thrDelta){
  thrDelta=thrDelta||0; let thr=6-baseAdv; thr-=Math.floor((atk-def)/12);
  if(morale>=70) thr-=1; else if(morale<=30) thr+=1; thr-=thrDelta; return clamp(Math.round(thr),3,7);
}
function rollDice(rng){ return 1+Math.floor(rng()*6); }
function prizeMoneyForLeague(code){ return code==="CSL"?120000:80000; }
function prizeForResult(res, code){ if(res==="win") return code==="CSL"?120000:80000; if(res==="draw") return code==="CSL"?60000:40000; return 0; }
function pushInbox(title, body, kind){ Game.inbox.unshift({id:makeId("M"),title,body,kind:kind||"news",date:Game.date,read:false}); if(Game.inbox.length>40) Game.inbox.length=40; }
function toast(msg){ const el=$$("#toast"); el.textContent=msg; el.classList.remove("hidden"); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.add("hidden"),2800); }
function serializeState(){ return { Game:JSON.parse(JSON.stringify(Game)), AllPlayers:Array.from(AllPlayers.values()) }; }
function applyState(data){ Object.keys(Game).forEach(k=>delete Game[k]); Object.assign(Game,data.Game); AllPlayers.clear(); (data.AllPlayers||[]).forEach(p=>AllPlayers.set(p.id,p)); RNG=makeRNG(Game.seed||"seed"); }
function saveToSlot(slotIndex, silent){
  const root=loadRoot(); const nick=Game.nickname||($$("#profileNick")&&$$("#profileNick").value)||"Player";
  Game.nickname=nick; root.activeSlot=slotIndex;
  root.slots[slotIndex]={ name:(getClubName(Game.user.clubId)||"生涯")+" · "+Game.manager.name, nickname:nick, savedAt:Date.now(), season:Game.season, data:serializeState() };
  root.profiles[nick]={ lastSlot:slotIndex, updatedAt:Date.now() }; saveRoot(root); if(!silent) toast("已保存到槽位 "+(slotIndex+1));
}
function loadFromSlot(slotIndex){
  const root=loadRoot(); const slot=root.slots[slotIndex]; if(!slot||!slot.data) return false;
  applyState(slot.data); Game.slotIndex=slotIndex; Game.nickname=slot.nickname||Game.nickname; root.activeSlot=slotIndex; saveRoot(root); return true;
}
function exportJSON(){ const blob=new Blob([JSON.stringify(serializeState(),null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="dice_football_save_"+Game.season+".json"; a.click(); URL.revokeObjectURL(a.href); }
function importJSON(file){
  const reader=new FileReader();
  reader.onload=()=>{ try{ const data=JSON.parse(reader.result); if(!data.Game||!data.AllPlayers) throw new Error("格式无效"); applyState(data); saveToSlot(Game.slotIndex|0,true); goToApp(); refreshUI(); toast("导入成功"); }catch(e){ alert("导入失败："+e.message);} };
  reader.readAsText(file);
}
function getClubName(id){ const c=Game.clubs.find(x=>x.id===id); return c?c.name:"-"; }

function updateDeviceRecordsFromSeason(hallEntry, userPosNum){
  const rec=loadDeviceRecords();
  if(hallEntry.CSLchamp===Game.user.clubId||hallEntry.CL1champ===Game.user.clubId){
    rec.titles.push({season:hallEntry.season,title:hallEntry.CSLchamp===Game.user.clubId?"中超冠军":"中甲冠军",club:getClubName(Game.user.clubId)});
  }
  if(userPosNum!=null){
    const finish={season:hallEntry.season,pos:userPosNum,league:Game.clubs.find(c=>c.id===Game.user.clubId).league};
    if(!rec.bestLeagueFinish||userPosNum<rec.bestLeagueFinish.pos) rec.bestLeagueFinish=finish;
  }
  rec.longestUnbeaten=Math.max(rec.longestUnbeaten|0, Game.user.bestUnbeaten|0);
  const scorers=Array.from(AllPlayers.values()).filter(p=>p.clubId===Game.user.clubId&&p.goals>0).sort((a,b)=>b.goals-a.goals).slice(0,5)
    .map(p=>({name:p.name,goals:p.goals,season:Game.season}));
  rec.topScorers=(rec.topScorers||[]).concat(scorers).sort((a,b)=>b.goals-a.goals).slice(0,20);
  const w=Game.manager.wins,d=Game.manager.draws,l=Game.manager.losses,t=w+d+l;
  const summary={ managerName:Game.manager.name, clubName:getClubName(Game.user.clubId), trophies:Game.manager.trophies,
    bestFinish:rec.bestLeagueFinish?(rec.bestLeagueFinish.league+" #"+rec.bestLeagueFinish.pos):"", season:Game.season,
    winPct:t?Math.round(1000*w/t)/10:0, nickname:Game.nickname };
  rec.careerSummaries=(rec.careerSummaries||[]).filter(x=>!(x.managerName===summary.managerName&&x.season===summary.season));
  rec.careerSummaries.push(summary); saveDeviceRecords(rec);
}
function newGame(seedStr){
  Game.seed=seedStr||("seed_"+Date.now()); RNG=makeRNG(Game.seed);
  Game.date="2026-03-01"; Game.season=2026; Game.round=1; Game.homeAdv=true; Game.fastMatch=false; Game.autoSave=true;
  Game.clubs=[]; Game.league={CSL:null,CL1:null}; Game.cups={CFA:null,WCC:null};
  Game.user={clubId:null,money:2000000,morale:50,trainingFocus:"balanced",facilities:{training:1,youth:1,stadium:1},scoutLevel:1,
    transferBudget:800000,wageBudget:120000,boardConfidence:55,captainId:null,setPieceId:null,shortlist:[],unbeatenStreak:0,bestUnbeaten:0};
  Game.pools={legends:[],freeAgents:[],scouts:[],extraPlayers:[],scoutReports:{}};
  Game.hall=[]; Game.fixtures={CSL:[],CL1:[]}; Game.lastResults=[]; Game.inbox=[]; Game.championsUnlocked=false; Game.seasonGoals={};
  AllPlayers.clear();
  Game.pools.legends=LEGENDS.map(x=>genPlayer(RNG,{name:x.name,pos:x.pos,age:x.age,atk:x.atk,def:x.def,legend:true}));
  Game.pools.legends.forEach(p=>AllPlayers.set(p.id,p));
  for(let i=0;i<400;i++){ const p=genPlayer(RNG,{pos:POSITIONS[Math.floor(RNG()*4)],age:17+Math.floor(RNG()*18)}); Game.pools.extraPlayers.push(p.id); AllPlayers.set(p.id,p); }
  const csl=CSL_TEAMS.map(t=>createClub(t.name,t.city,"CSL")); const cl1=CL1_TEAMS.map(t=>createClub(t.name,t.city,"CL1"));
  csl.forEach(c=>genTeamPlayers(RNG,c,68+rand(8))); cl1.forEach(c=>genTeamPlayers(RNG,c,60+rand(10)));
  Game.league.CSL={name:"中超联赛",code:"CSL",teams:csl.map(c=>c.id),table:initStandings(csl),rounds:[],roundIndex:0};
  Game.league.CL1={name:"中甲联赛",code:"CL1",teams:cl1.map(c=>c.id),table:initStandings(cl1),rounds:[],roundIndex:0};
  Game.league.CSL.rounds=roundRobin(csl); Game.league.CL1.rounds=roundRobin(cl1);
  Game.fixtures.CSL=Game.league.CSL.rounds; Game.fixtures.CL1=Game.league.CL1.rounds;
}
function addUserClubAsReal(leagueCode, teamName){
  const club=Game.clubs.find(c=>c.name===teamName&&c.league===leagueCode); if(!club) return false;
  club.isUser=true; Game.user.clubId=club.id;
  const cityInfo=Cities.find(c=>c.name===club.city)||{diff:1};
  Game.user.money=Math.floor((leagueCode==="CSL"?4000000:2000000)*cityInfo.diff);
  Game.user.transferBudget=Math.floor(Game.user.money*0.35); Game.user.wageBudget=Math.floor(Game.user.money*0.08);
  const starters=getAllPlayersOfClub(club.id).filter(p=>p.on);
  Game.user.captainId=starters[0]&&starters[0].id; Game.user.setPieceId=(starters.find(p=>p.pos==="FWD"||p.pos==="MID")||starters[0])&&(starters.find(p=>p.pos==="FWD"||p.pos==="MID")||starters[0]).id;
  pushInbox("任命通知", "董事会正式任命 "+Game.manager.name+" 为"+club.name+"主教练。", "news"); return true;
}
function addUserClubAsCustom(name, city, color){
  const club=createClub(name,city,"CL1",color,true); genTeamPlayers(RNG,club,58+rand(6));
  Game.league.CL1.teams.push(club.id); Game.league.CL1.table[club.id]={teamId:club.id,pts:0,w:0,d:0,l:0,gf:0,ga:0,p:0};
  Game.user.clubId=club.id; Game.user.money=Math.floor(1800000*(Cities.find(c=>c.name===city)||{diff:1}).diff);
  Game.user.transferBudget=Math.floor(Game.user.money*0.3); Game.user.wageBudget=Math.floor(Game.user.money*0.07);
  pushInbox("新建球会", name+" 正式成立，从中甲联赛启航。", "news");
}
const screens={ splash:$$("#splash"), menu:$$("#menu"), newgame:$$("#newgame"), journey:$$("#journey"), app:$$("#app") };
function showScreen(id){ Object.values(screens).forEach(el=>el&&el.classList.add("hidden")); screens[id].classList.remove("hidden"); }
function goToMenu(){ showScreen("menu"); }
function goToApp(){ showScreen("app"); selectNav("calendar"); }
function selectNav(name){
  $$$(".main > div").forEach(v=>v.classList.add("hidden"));
  const view=$$("#view-"+name); if(view) view.classList.remove("hidden");
  $$$(".nav-btn").forEach(b=>b.classList.remove("primary"));
  const btn=$$('.nav-btn[data-nav="'+name+'"]'); if(btn) btn.classList.add("primary");
  const map={calendar:renderCalendar,inbox:renderInbox,tactics:renderTactics,club:renderClub,finance:renderFinance,
    transfer:renderTransfer,league:renderLeague,career:renderCareer,hall:renderHall,settings:renderSettings};
  if(map[name]) map[name]();
}
function refreshTopbar(){
  $$("#dateText").innerText=Game.date; $$("#mgrPill").innerText="教练："+Game.manager.name;
  const userClub=Game.clubs.find(c=>c.id===Game.user.clubId);
  $$("#leagueBadge").innerText=userClub?(userClub.league==="CSL"?"中超":"中甲"):"-";
  const ov=userClub?computeTeamOverall(userClub,getAllPlayersOfClub(userClub.id)):{atk:0,def:0,morale:0};
  $$("#atkText").innerText=ov.atk; $$("#defText").innerText=ov.def; $$("#moraleText").innerText=ov.morale;
  $$("#moneyText").innerText=fmtMoney(Game.user.money); $$("#boardText").innerText=Game.user.boardConfidence; $$("#rankText").innerText=calcUserRank();
}
function calcUserRank(){
  const club=Game.clubs.find(c=>c.id===Game.user.clubId); if(!club) return "-";
  const arr=tableToArray(Game.league[club.league].table); const idx=arr.findIndex(x=>x.teamId===club.id);
  return idx>=0?(idx+1)+"/"+arr.length:"-";
}
function matchOdds(homeOv, awayOv){
  const h=homeOv.atk+homeOv.def*0.8+homeOv.morale*0.2+5, a=awayOv.atk+awayOv.def*0.8+awayOv.morale*0.2, draw=35;
  const sum=Math.max(10,h)+Math.max(10,a)+draw;
  return { home:Math.round(100*Math.max(10,h)/sum), draw:Math.round(100*draw/sum), away:Math.round(100*Math.max(10,a)/sum) };
}

function renderCalendar(){
  refreshTopbar();
  const userClub=Game.clubs.find(c=>c.id===Game.user.clubId); if(!userClub) return;
  const league=Game.league[userClub.league]; const matches=league.rounds[league.roundIndex]||[];
  const myMatch=matches.find(m=>m.home===userClub.id||m.away===userClub.id); const prev=$$("#matchPreview"); prev.innerHTML="";
  if(myMatch){
    const home=Game.clubs.find(c=>c.id===myMatch.home), away=Game.clubs.find(c=>c.id===myMatch.away);
    $$("#nextMatchText").innerText=home.name+" vs "+away.name;
    $$("#calNextInfo").innerText=home.name+"（主） vs "+away.name+"（客） · 第"+(league.roundIndex+1)+"轮";
    const oh=computeTeamOverall(home,getAllPlayersOfClub(home.id)), oa=computeTeamOverall(away,getAllPlayersOfClub(away.id)), odds=matchOdds(oh,oa);
    prev.innerHTML='<div class="odds-box"><b>'+odds.home+'%</b>主胜</div><div class="odds-box"><b>'+odds.draw+'%</b>平</div><div class="odds-box"><b>'+odds.away+'%</b>客胜</div><div class="mini">实力 主 '+oh.atk+'/'+oh.def+' · 客 '+oa.atk+'/'+oa.def+'</div>';
  } else { $$("#nextMatchText").innerText="赛季结束"; $$("#calNextInfo").innerText="本赛季暂无比赛"; }
  const rr=$$("#recentResults"); rr.innerHTML="";
  Game.lastResults.slice(-12).reverse().forEach(r=>{ const div=document.createElement("div"); div.className="row-between";
    div.innerHTML='<span class="hint">'+r.roundLabel+'</span><span>'+getClubName(r.home)+' '+r.score[0]+' - '+r.score[1]+' '+getClubName(r.away)+'</span>'; rr.appendChild(div); });
}
function renderInbox(){
  refreshTopbar(); const list=$$("#inboxList"); list.innerHTML="";
  if(!Game.inbox.length){ list.innerHTML='<div class="hint">暂无消息。比赛后会收到报纸风格简报。</div>'; return; }
  Game.inbox.forEach(m=>{ const div=document.createElement("div"); div.className="inbox-item "+(m.kind||"news");
    div.innerHTML='<div class="row-between"><b>'+m.title+'</b><span class="mini">'+m.date+'</span></div><div class="mini" style="margin-top:4px">'+m.body+'</div>'; list.appendChild(div); });
}
function renderTactics(){
  refreshTopbar(); const wrap=$$("#formationBtns"); wrap.innerHTML="";
  Object.keys(FORMATIONS).forEach(f=>{ const b=document.createElement("button"); b.className="slot-card"+(Game.tactics.formation===f?" active":""); b.textContent=f;
    b.onclick=()=>{ Game.tactics.formation=f; renderTactics(); }; wrap.appendChild(b); });
  const pitch=$$("#formPitch"); pitch.innerHTML="";
  (FORMATIONS[Game.tactics.formation]||[]).forEach(s=>{ const el=document.createElement("div"); el.className="slot"; el.style.left=s.x+"%"; el.style.top=s.y+"%"; el.textContent=s.p; pitch.appendChild(el); });
  $$("#tacMentality").value=Game.tactics.mentality; $$("#tacPressing").value=Game.tactics.pressing; $$("#tacWidth").value=Game.tactics.width;
  const m=tacticsModifiers(); $$("#tacHint").textContent="预计修正：进攻 "+(m.atkMod>=0?"+":"")+m.atkMod+" · 防守 "+(m.defMod>=0?"+":"")+m.defMod+" · 阈值 "+m.thrDelta.toFixed(1);
}
function wageBill(){ const club=Game.clubs.find(c=>c.id===Game.user.clubId); if(!club) return 0; return getAllPlayersOfClub(club.id).reduce((s,p)=>s+(p.salary||0),0); }
function renderFinance(){
  refreshTopbar(); $$("#finCash").textContent=fmtMoney(Game.user.money); $$("#finTransfer").textContent=fmtMoney(Game.user.transferBudget);
  const bill=wageBill(), pressure=Math.round(100*bill/Math.max(1,Game.user.wageBudget));
  $$("#finWage").innerHTML=fmtMoney(bill)+" / 预算 "+fmtMoney(Game.user.wageBudget)+"（压力 "+pressure+"%）";
  $$("#wageBar").style.width=clamp(pressure,0,100)+"%";
  const club=Game.clubs.find(c=>c.id===Game.user.clubId);
  const ticket=Math.floor(prizeMoneyForLeague(club&&club.league||"CL1")*(1+0.08*(Game.user.facilities.stadium-1)));
  $$("#finIncome").innerHTML='<div class="row-between"><span>预计门票/转播</span><span class="money">'+fmtMoney(ticket)+'</span></div><div class="row-between"><span>周薪支出</span><span class="neg">-'+fmtMoney(bill)+'</span></div>';
  $$("#boardVal").textContent=Game.user.boardConfidence; $$("#boardBar").style.width=Game.user.boardConfidence+"%";
  $$("#boardHint").textContent=pressure>110?"工资过高，董事会不满":Game.user.boardConfidence<35?"成绩承压":"董事会态度稳定";
}
function scoutBlurb(p){
  const bits=[]; if(p.legend) bits.push("传奇级球星。"); if(p.potential>=85) bits.push("潜力极高。"); else if(p.potential>=75) bits.push("即战力与成长兼备。"); else bits.push("稳妥轮换。");
  if(p.age<=21) bits.push("年龄优势。"); if(p.age>=30) bits.push("经验丰富。"); if(p.atk>p.def+15) bits.push("进攻突出。"); if(p.def>p.atk+15) bits.push("防守可靠。");
  return bits.join(" ");
}

function renderClub(){
  refreshTopbar(); const club=Game.clubs.find(c=>c.id===Game.user.clubId); if(!club) return;
  $$("#captainName").textContent=(AllPlayers.get(Game.user.captainId)||{}).name||"未指定";
  $$("#setpieceName").textContent=(AllPlayers.get(Game.user.setPieceId)||{}).name||"未指定";
  $$("#trainingFocus").value=Game.user.trainingFocus;
  const tbody=$$("#squadTable tbody"); tbody.innerHTML="";
  const players=getAllPlayersOfClub(club.id).sort((a,b)=>(b.on-a.on)||((b.atk+b.def)-(a.atk+a.def)));
  players.forEach(p=>{
    const suit=positionSuitability(p,Game.tactics.formation), suitCls=suit==="高"?"suit-good":suit==="中"?"suit-ok":"suit-bad";
    const tr=document.createElement("tr"); if(p.injuryWeeks) tr.classList.add("injured");
    tr.innerHTML="<td>"+(p.on?"首发":"替")+"</td><td>"+p.name+(p.legend?' <span class="badge">传奇</span>':'')+(p.injuryWeeks?' <span class="badge">伤'+p.injuryWeeks+'周</span>':'')+"</td><td>"+p.pos+"</td><td class=\""+suitCls+"\">"+suit+"</td><td>"+p.age+"</td><td>"+p.atk+"</td><td>"+p.def+"</td><td>"+p.form+"</td><td>"+p.fitness+"</td><td><button class=\"btn\" data-a=\"toggle\">"+(p.on?"换下":"上场")+"</button> <button class=\"btn\" data-a=\"cap\">队长</button> <button class=\"btn\" data-a=\"sp\">定位球</button> <button class=\"btn warn\" data-a=\"youth\">下放</button></td>";
    tbody.appendChild(tr);
    tr.querySelectorAll("button").forEach(btn=>{ btn.onclick=()=>{
      const a=btn.getAttribute("data-a");
      if(a==="toggle"){ if(p.injuryWeeks){alert("伤病无法上场");return;} if(p.on) p.on=false; else { const starters=players.filter(x=>x.on); if(starters.length>=5){alert("首发已满");return;} if(p.pos==="GK"&&starters.some(s=>s.pos==="GK")){alert("已有门将");return;} p.on=true; } }
      else if(a==="cap") Game.user.captainId=p.id; else if(a==="sp") Game.user.setPieceId=p.id;
      else if(a==="youth"){ if(club.youth.length>=10){alert("青年队已满");return;} p.clubId=null;p.on=false; club.players=club.players.filter(id=>id!==p.id); club.youth.push(p.id); }
      club.on=getAllPlayersOfClub(club.id).filter(x=>x.on).slice(0,5).map(x=>x.id);
      const ov=computeTeamOverall(club,getAllPlayersOfClub(club.id)); club.stats={atk:ov.atk,def:ov.def,morale:ov.morale}; renderClub();
    };});
  });
  const ytb=$$("#youthTable tbody"); ytb.innerHTML="";
  club.youth.forEach(pid=>{ const p=AllPlayers.get(pid); if(!p) return; const tr=document.createElement("tr");
    tr.innerHTML="<td>"+p.name+"</td><td>"+p.pos+"</td><td>"+p.age+"</td><td>"+p.atk+"</td><td>"+p.def+"</td><td>"+(p.potential||"-")+"</td><td><button class=\"btn\">提升</button></td>";
    ytb.appendChild(tr); tr.querySelector("button").onclick=()=>{ if(club.players.length>=20){alert("一线队已满");return;} p.clubId=club.id;p.on=false; club.players.push(p.id); club.youth=club.youth.filter(id=>id!==p.id); renderClub(); }; });
  const fac=$$("#facilityList"); fac.innerHTML="";
  [{key:"training",name:"训练中心",price:400000},{key:"youth",name:"青训学院",price:350000},{key:"stadium",name:"球场商业",price:500000}].forEach(f=>{
    const lv=Game.user.facilities[f.key]; const div=document.createElement("div"); div.className="row-between";
    div.innerHTML="<span>"+f.name+" Lv."+lv+"</span><button class=\"btn\" "+(lv>=5?"disabled":"")+">升级 "+fmtMoney(f.price)+"</button>";
    div.querySelector("button").onclick=()=>{ if(lv>=5)return; if(Game.user.money<f.price){alert("资金不足");return;} Game.user.money-=f.price; Game.user.facilities[f.key]=lv+1; renderClub(); refreshTopbar(); };
    fac.appendChild(div);
  });
  $$("#scoutLevelText").innerText=Game.user.scoutLevel;
  $$("#youthBrief").textContent="青训学院 Lv."+Game.user.facilities.youth+" · 下赛季预计 "+(2+Game.user.facilities.youth)+" 名新人";
}
function attemptSign(p, price){
  const club=Game.clubs.find(c=>c.id===Game.user.clubId);
  if(club.players.length>=20){alert("一线队已满");return;}
  if(Game.user.money<price||Game.user.transferBudget<price*0.5){alert("现金或转会预算不足");return;}
  Game.user.money-=price; Game.user.transferBudget=Math.max(0,Game.user.transferBudget-Math.floor(price*0.5));
  p.clubId=club.id; p.on=false; if(!club.players.includes(p.id)) club.players.push(p.id);
  Game.pools.scouts=Game.pools.scouts.filter(id=>id!==p.id); Game.pools.freeAgents=Game.pools.freeAgents.filter(id=>id!==p.id);
  Game.user.shortlist=Game.user.shortlist.filter(id=>id!==p.id);
  pushInbox("转会确认", p.name+" 加盟，转会费 "+fmtMoney(price)+"。","news"); renderTransfer(); renderClub(); refreshTopbar();
}
function renderTransfer(){
  refreshTopbar(); const st=$$("#scoutTable tbody"); st.innerHTML="";
  Game.pools.scouts.forEach(pid=>{ const p=AllPlayers.get(pid); if(!p) return; const price=Math.floor((p.atk+p.def)*8000*(p.legend?3:1));
    const tr=document.createElement("tr");
    tr.innerHTML="<td>"+p.name+(p.legend?' <span class="badge">传奇</span>':'')+"</td><td>"+p.pos+"</td><td>"+p.age+"</td><td>"+p.atk+"</td><td>"+p.def+"</td><td>"+fmtMoney(price)+"</td><td><button class=\"btn\" data-a=\"sign\">签约</button> <button class=\"btn\" data-a=\"rep\">报告</button> <button class=\"btn\" data-a=\"sl\">关注</button></td>";
    st.appendChild(tr);
    tr.querySelectorAll("button").forEach(btn=>{ btn.onclick=()=>{ const a=btn.getAttribute("data-a");
      if(a==="sign") attemptSign(p,price); else if(a==="rep") $$("#scoutReport").innerHTML="<b>"+p.name+"</b> · "+p.pos+" · 潜力 "+p.potential+"<br><span class=\"mini\">"+scoutBlurb(p)+"</span>";
      else if(a==="sl"){ if(!Game.user.shortlist.includes(p.id)) Game.user.shortlist.push(p.id); toast("已加入关注名单"); renderTransfer(); }
    };});
  });
  const mt=$$("#marketTable tbody"); mt.innerHTML="";
  Game.pools.freeAgents.forEach(pid=>{ const p=AllPlayers.get(pid); if(!p) return; const price=Math.floor((p.atk+p.def)*4000*(p.legend?2:1));
    const tr=document.createElement("tr");
    tr.innerHTML="<td>"+p.name+"</td><td>"+p.pos+"</td><td>"+p.age+"</td><td>"+p.atk+"</td><td>"+p.def+"</td><td>"+fmtMoney(Math.max(3000,p.salary))+"/季</td><td><button class=\"btn\">签约</button> <button class=\"btn\">关注</button></td>";
    mt.appendChild(tr); const btns=tr.querySelectorAll("button"); btns[0].onclick=()=>attemptSign(p,price);
    btns[1].onclick=()=>{ if(!Game.user.shortlist.includes(p.id)) Game.user.shortlist.push(p.id); renderTransfer(); };
  });
  const sl=$$("#shortlistEl"); sl.innerHTML="";
  if(!Game.user.shortlist.length) sl.innerHTML='<div class="hint">关注名单为空</div>';
  Game.user.shortlist.forEach(pid=>{ const p=AllPlayers.get(pid); if(!p) return; const div=document.createElement("div"); div.className="row-between card";
    div.innerHTML="<span>"+p.name+" · "+p.pos+" · "+p.atk+"/"+p.def+"</span><span><button class=\"btn\">报告</button> <button class=\"btn warn\">移除</button></span>";
    div.querySelectorAll("button")[0].onclick=()=>{ $$("#scoutReport").innerHTML="<b>"+p.name+"</b><br><span class=\"mini\">"+scoutBlurb(p)+"</span>"; };
    div.querySelectorAll("button")[1].onclick=()=>{ Game.user.shortlist=Game.user.shortlist.filter(id=>id!==pid); renderTransfer(); }; sl.appendChild(div);
  });
  const sell=$$("#sellTable tbody"); sell.innerHTML=""; const club=Game.clubs.find(c=>c.id===Game.user.clubId);
  getAllPlayersOfClub(club.id).sort((a,b)=>(b.atk+b.def)-(a.atk+a.def)).forEach(p=>{
    const val=Math.floor((p.atk+p.def)*5000*(p.legend?2.5:1)); const tr=document.createElement("tr");
    tr.innerHTML="<td>"+p.name+"</td><td>"+p.pos+"</td><td>"+p.age+"</td><td>"+p.atk+"</td><td>"+p.def+"</td><td>"+fmtMoney(val)+"</td><td><button class=\"btn warn\">出售</button></td>";
    sell.appendChild(tr); tr.querySelector("button").onclick=()=>{ if(club.players.length<=15){alert("不能低于15人");return;} Game.user.money+=val; Game.user.transferBudget+=Math.floor(val*0.5); p.clubId=null;p.on=false; club.players=club.players.filter(id=>id!==p.id); if(Game.pools.freeAgents.length<5) Game.pools.freeAgents.push(p.id); renderTransfer(); refreshTopbar(); };
  });
}

function renderLeague(){
  refreshTopbar(); const club=Game.clubs.find(c=>c.id===Game.user.clubId); if(!club) return;
  const league=Game.league[club.league]; const tbody=$$("#standingTable tbody"); tbody.innerHTML="";
  tableToArray(league.table).forEach((row,i)=>{ const t=Game.clubs.find(c=>c.id===row.teamId); const tr=document.createElement("tr");
    tr.innerHTML="<td>"+(i+1)+"</td><td>"+t.name+(t.id===club.id?' <span class="badge">我方</span>':'')+"</td><td>"+row.p+"</td><td>"+row.w+"</td><td>"+row.d+"</td><td>"+row.l+"</td><td>"+row.gf+"</td><td>"+row.ga+"</td><td>"+row.pts+"</td>"; tbody.appendChild(tr); });
  const rm=$$("#roundMatches"); rm.innerHTML="";
  (league.rounds[league.roundIndex]||[]).forEach(m=>{ const div=document.createElement("div"); div.className="row-between";
    div.innerHTML="<span>"+getClubName(m.home)+" vs "+getClubName(m.away)+"</span><span>"+(m.played?(m.score[0]+" - "+m.score[1]):"-")+"</span>"; rm.appendChild(div); });
}
function renderCareer(){
  refreshTopbar(); const w=Game.manager.wins,d=Game.manager.draws,l=Game.manager.losses,t=w+d+l;
  $$("#careerProfile").innerHTML="<div>姓名：<b>"+Game.manager.name+"</b></div><div>声望："+Game.manager.reputation+"</div><div>偏好阵型："+Game.manager.preferredFormation+"</div><div>执教赛季："+Game.manager.seasonsManaged+"</div><div>荣誉："+Game.manager.trophies+" 座</div><div>战绩："+w+"胜 "+d+"平 "+l+"负（胜率 "+(t?Math.round(100*w/t):0)+"%）</div>";
  const hist=$$("#careerHistory"); hist.innerHTML="";
  if(!Game.manager.history.length) hist.innerHTML='<div class="hint">完成赛季后将写入履历</div>';
  Game.manager.history.slice().reverse().forEach(h=>{ const div=document.createElement("div"); div.className="card";
    div.textContent=h.season+" · "+h.club+" · "+h.league+" 第"+h.pos+"名"+(h.trophy?" · "+h.trophy:""); hist.appendChild(div); });
  $$("#cloudStatus").textContent=CloudRecords.isConfigured()?"Firebase 已配置：可提交/拉取全球排行榜":"未配置 firebase-config.js → 仅本地；填写 projectId/apiKey 后上云";
  refreshCloudLB();
}
async function refreshCloudLB(){
  const box=$$("#cloudLB"); box.innerHTML='<div class="mini">加载中…</div>';
  const res=await CloudRecords.getLeaderboard(15);
  box.innerHTML='<div class="mini">来源：'+(res.mode==="cloud"?"云端 Firestore":"本地")+'</div>';
  if(!res.rows.length){ box.innerHTML+='<div class="hint">暂无排行数据</div>'; return; }
  res.rows.forEach((r,i)=>{ const div=document.createElement("div"); div.className="row-between";
    div.innerHTML="<span>#"+(i+1)+" "+(r.managerName||"?")+" · "+(r.clubName||"")+"</span><span class=\"tag\">荣誉 "+(r.trophies||0)+" · 胜率 "+(r.winPct||0)+"%</span>"; box.appendChild(div); });
}
function renderHall(){
  const list=$$("#hallList"); list.innerHTML="";
  if(!Game.hall.length) list.innerHTML='<div class="hint">完成一个赛季即可记录冠军与名次</div>';
  Game.hall.slice().reverse().forEach(item=>{ const div=document.createElement("div"); div.className="card";
    div.innerHTML="<b>"+item.season+" 赛季</b>：中超冠军 "+getClubName(item.CSLchamp)+"，中甲冠军 "+getClubName(item.CL1champ)+(item.userPos?"，你的名次："+item.userPos:""); list.appendChild(div); });
  const rec=loadDeviceRecords(); const board=$$("#recordsBoard"); board.innerHTML="";
  board.innerHTML+="<div>最长不败：<b>"+(rec.longestUnbeaten||0)+"</b> 场</div>";
  board.innerHTML+="<div>最佳联赛名次：<b>"+(rec.bestLeagueFinish?(rec.bestLeagueFinish.league+" #"+rec.bestLeagueFinish.pos+" ("+rec.bestLeagueFinish.season+")"):"-")+"</b></div>";
  board.innerHTML+='<div class="subtitle" style="margin-top:8px">冠军头衔</div>';
  (rec.titles||[]).slice(-8).reverse().forEach(t=>{ const d=document.createElement("div"); d.className="mini"; d.textContent=t.season+" "+t.club+" · "+t.title; board.appendChild(d); });
  board.innerHTML+='<div class="subtitle" style="margin-top:8px">历史射手</div>';
  (rec.topScorers||[]).slice(0,8).forEach(s=>{ const d=document.createElement("div"); d.className="mini"; d.textContent=s.name+" "+s.goals+" 球（"+s.season+"）"; board.appendChild(d); });
}
function renderSettings(){ $$("#homeAdvToggle").checked=Game.homeAdv; $$("#fastMatchToggle").checked=Game.fastMatch; $$("#autoSaveToggle").checked=Game.autoSave; }
const Match={ live:false, context:null, auto:false };
function startMatch(){
  const club=Game.clubs.find(c=>c.id===Game.user.clubId); const league=Game.league[club.league]; const roundIdx=league.roundIndex;
  const match=(league.rounds[roundIdx]||[]).find(m=>m.home===club.id||m.away===club.id); if(!match){ alert("本轮无比赛"); return; }
  const home=Game.clubs.find(c=>c.id===match.home), away=Game.clubs.find(c=>c.id===match.away);
  const ovHome=computeTeamOverall(home,getAllPlayersOfClub(home.id)), ovAway=computeTeamOverall(away,getAllPlayersOfClub(away.id));
  const tac=tacticsModifiers();
  const thrHome=goalThreshold(Game.homeAdv?1:0,ovHome.atk,ovAway.def,ovHome.morale,home.isUser?tac.thrDelta:0);
  const thrAway=goalThreshold(0,ovAway.atk,ovHome.def,ovAway.morale,away.isUser?tac.thrDelta:0);
  Match.context={league,roundIdx,match,home,away,time:0,half:1,goals:{home:0,away:0},stepInHalf:0,thrHome,thrAway,ovHome,ovAway};
  $$$(".main > div").forEach(v=>v.classList.add("hidden")); $$("#view-match").classList.remove("hidden");
  $$("#homeName").innerText=home.name; $$("#awayName").innerText=away.name; $$("#scoreText").innerText="0 - 0";
  $$("#timeText").innerText="0'"; $$("#halfText").innerText="上半场"; $$("#matchLog").innerHTML=""; $$("#homeDiceWrap").innerHTML=""; $$("#awayDiceWrap").innerHTML="";
  const mp=$$("#modPanel"); mp.innerHTML="";
  [["主队进攻",ovHome.atk],["主队防守",ovHome.def],["主队士气",ovHome.morale],["客队进攻",ovAway.atk],["客队防守",ovAway.def],["客队士气",ovAway.morale]].forEach(function(pair){
    const div=document.createElement("div"); div.className="stat"; div.innerHTML="<span>"+pair[0]+"</span><div class=\"bar\"><span style=\"width:"+clamp(pair[1],0,100)+"%\"></span></div><b>"+pair[1]+"</b>"; mp.appendChild(div);
  });
  const adv=document.createElement("div"); adv.className="hint"; adv.textContent="进球阈值：主≥"+thrHome+" 客≥"+thrAway+" · 阵型 "+Game.tactics.formation; mp.appendChild(adv);
  $$("#btnEndMatch").disabled=true; Match.live=true;
}
function addLog(text){ const el=$$("#matchLog"); const p=document.createElement("div"); p.textContent=text; el.appendChild(p); el.scrollTop=el.scrollHeight; }
function animateDice(containerId,val){ const wrap=$$("#"+containerId); const d=document.createElement("div"); d.className="dice roll-anim"; d.textContent=val; wrap.appendChild(d); if(wrap.children.length>10) wrap.removeChild(wrap.firstChild); }
function creditGoal(clubId){ const on=getAllPlayersOfClub(clubId).filter(p=>p.on&&(p.pos==="FWD"||p.pos==="MID")); const p=on.length?choice(on):getAllPlayersOfClub(clubId).find(x=>x.on); if(p) p.goals=(p.goals||0)+1; }
function doOneStep(auto){
  const ctx=Match.context; if(!ctx) return;
  if(ctx.stepInHalf>=5){ if(ctx.half===1){ ctx.half=2; ctx.stepInHalf=0; addLog("—— 下半场开始 ——"); $$("#halfText").innerText="下半场"; return; } endMatch(); return; }
  const homeRoll=rollDice(RNG), awayRoll=rollDice(RNG); animateDice("homeDiceWrap",homeRoll); animateDice("awayDiceWrap",awayRoll);
  const minute=ctx.time+9; ctx.time=minute; ctx.stepInHalf++; $$("#timeText").innerText=(ctx.half===1?minute:45+minute)+"'";
  let homeGoal=homeRoll>=ctx.thrHome, awayGoal=awayRoll>=ctx.thrAway;
  if(homeGoal&&awayGoal){ if(RNG()<0.5) homeGoal=false; else awayGoal=false; }
  if(homeGoal){ ctx.goals.home++; addLog((ctx.half===1?"上":"下")+"半场 "+minute+"'："+ctx.home.name+" 进球！("+homeRoll+")"); creditGoal(ctx.home.id); }
  if(awayGoal){ ctx.goals.away++; addLog((ctx.half===1?"上":"下")+"半场 "+minute+"'："+ctx.away.name+" 进球！("+awayRoll+")"); creditGoal(ctx.away.id); }
  $$("#scoreText").innerText=ctx.goals.home+" - "+ctx.goals.away;
  if(auto&&Game.fastMatch) setTimeout(function(){ doOneStep(true); },200);
}
function simScore(home, away){
  const oh=computeTeamOverall(home,getAllPlayersOfClub(home.id)), oa=computeTeamOverall(away,getAllPlayersOfClub(away.id));
  const thrH=goalThreshold(Game.homeAdv?1:0,oh.atk,oa.def,oh.morale,home.isUser?tacticsModifiers().thrDelta:0);
  const thrA=goalThreshold(0,oa.atk,oh.def,oa.morale,away.isUser?tacticsModifiers().thrDelta:0);
  let hg=0,ag=0; for(let h=0;h<2;h++) for(let i=0;i<5;i++){ if(rollDice(RNG)>=thrH) hg++; if(rollDice(RNG)>=thrA) ag++; } return [hg,ag];
}

function endMatch(){
  Match.live=false; $$("#btnEndMatch").disabled=false; const ctx=Match.context;
  ctx.match.played=true; ctx.match.score=[ctx.goals.home,ctx.goals.away]; applyResultToTable(ctx.league.table,ctx.match);
  ctx.league.rounds[ctx.roundIdx].filter(m=>m!==ctx.match).forEach(m=>{ if(m.played) return; const home=Game.clubs.find(c=>c.id===m.home), away=Game.clubs.find(c=>c.id===m.away); m.score=simScore(home,away); m.played=true; applyResultToTable(ctx.league.table,m); });
  const myGoals=ctx.home.id===Game.user.clubId?ctx.goals.home:ctx.goals.away; const theirGoals=ctx.home.id===Game.user.clubId?ctx.goals.away:ctx.goals.home;
  let result="draw"; if(myGoals>theirGoals) result="win"; else if(myGoals<theirGoals) result="loss";
  if(result==="win"){ Game.manager.wins++; Game.user.unbeatenStreak++; } else if(result==="draw"){ Game.manager.draws++; Game.user.unbeatenStreak++; } else { Game.manager.losses++; Game.user.unbeatenStreak=0; }
  Game.user.bestUnbeaten=Math.max(Game.user.bestUnbeaten,Game.user.unbeatenStreak);
  const baseIncome=Math.floor(prizeMoneyForLeague(ctx.league.code)*(1+0.05*(Game.user.facilities.stadium-1)));
  const bonus=prizeForResult(result,ctx.league.code); const total=baseIncome+bonus;
  Game.user.money+=total; Game.user.transferBudget+=Math.floor(bonus*0.3);
  const moraleDelta=result==="win"?3:result==="draw"?1:-2;
  getAllPlayersOfClub(Game.user.clubId).forEach(p=>{ p.morale=clamp(p.morale+moraleDelta,0,100); p.form=clamp(p.form+(result==="win"?2:result==="loss"?-2:0)+rand(3)-1,20,99); p.fitness=clamp(p.fitness-(8+rand(6)),30,100); if(!p.injuryWeeks&&RNG()<0.04) p.injuryWeeks=1+rand(3); });
  Game.user.boardConfidence=clamp(Game.user.boardConfidence+(result==="win"?3:result==="draw"?0:-4)-(wageBill()>Game.user.wageBudget?2:0),0,100);
  const uc=Game.clubs.find(c=>c.id===Game.user.clubId); applyTrainingGrowth(uc,getAllPlayersOfClub(uc.id));
  Game.lastResults.push({roundLabel:"第"+(ctx.roundIdx+1)+"轮",home:ctx.match.home,away:ctx.match.away,score:ctx.match.score});
  const headlines={ win:[getClubName(Game.user.clubId)+" 力克对手，主帅"+Game.manager.name+"迎来欢呼","骰运当头！完胜"], draw:["双方握手言和","闷平一场"], loss:["惜败！媒体质疑战术",getClubName(Game.user.clubId)+" 告负，董事会眉头紧锁"] };
  const head=choice(headlines[result]);
  pushInbox("赛后头条", head+" 最终比分 "+ctx.home.name+" "+ctx.goals.home+"-"+ctx.goals.away+" "+ctx.away.name+"。", result==="loss"?"warn":"news");
  $$$(".main > div").forEach(v=>v.classList.add("hidden")); $$("#view-summary").classList.remove("hidden");
  $$("#sumNames").innerText=ctx.home.name+" vs "+ctx.away.name; $$("#sumScore").innerText=ctx.goals.home+" - "+ctx.goals.away;
  $$("#sumResult").innerText=result==="win"?"胜":result==="loss"?"负":"平"; $$("#sumMoney").innerText="+"+fmtMoney(total); $$("#sumMorale").innerText=(moraleDelta>=0?"+":"")+moraleDelta; $$("#sumOther").innerText=head;
  const or=$$("#otherResults"); or.innerHTML="";
  ctx.league.rounds[ctx.roundIdx].forEach(m=>{ if(m===ctx.match) return; const div=document.createElement("div"); div.className="row-between"; div.innerHTML="<span>"+getClubName(m.home)+" vs "+getClubName(m.away)+"</span><span>"+m.score[0]+" - "+m.score[1]+"</span>"; or.appendChild(div); });
}
function applyTrainingGrowth(club, players){
  const lv=Game.user.facilities.training, focus=Game.user.trainingFocus, base=0.35+0.18*(lv-1);
  players.forEach(p=>{ if(p.injuryWeeks){ p.injuryWeeks=Math.max(0,p.injuryWeeks-1); return; }
    let atk=0,def=0,morale=0,fit=0;
    if(focus==="balanced"){atk=base;def=base;morale=0.3;fit=1;} if(focus==="attack"){atk=base*1.6;def=base*0.5;morale=0.2;fit=0.5;}
    if(focus==="defense"){atk=base*0.5;def=base*1.6;morale=0.2;fit=0.5;} if(focus==="morale"){atk=base*0.4;def=base*0.4;morale=0.9;fit=0.5;}
    if(focus==="fitness"){atk=base*0.3;def=base*0.3;morale=0.2;fit=3;}
    p.atk=Math.round(clamp(p.atk+atk+RNG()*0.6,1,99)); p.def=Math.round(clamp(p.def+def+RNG()*0.6,1,99));
    p.morale=clamp(Math.round(p.morale+morale),0,100); p.fitness=clamp(Math.round(p.fitness+fit),30,100);
  });
}
function addDays(dateStr, days){ const d=new Date(dateStr); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
function advanceRoundAndSeasonIfNeeded(){
  const club=Game.clubs.find(c=>c.id===Game.user.clubId); const league=Game.league[club.league];
  ["CSL","CL1"].forEach(code=>{ const L=Game.league[code]; if(code===club.league) return; if(L.roundIndex<L.rounds.length){ (L.rounds[L.roundIndex]||[]).forEach(m=>{ if(m.played) return; const h=Game.clubs.find(c=>c.id===m.home),a=Game.clubs.find(c=>c.id===m.away); m.score=simScore(h,a); m.played=true; applyResultToTable(L.table,m); }); L.roundIndex++; } });
  league.roundIndex++; Game.round++; if(Game.round%3===0) refreshMarkets(); Game.date=addDays(Game.date,7);
  Game.user.money-=Math.floor(wageBill()/4); if(Game.autoSave) saveToSlot(Game.slotIndex|0,true);
  if(league.roundIndex>=league.rounds.length&&Game.league.CSL.roundIndex>=Game.league.CSL.rounds.length&&Game.league.CL1.roundIndex>=Game.league.CL1.rounds.length) handleSeasonEnd();
}
function youthIntake(club){
  const n=2+Game.user.facilities.youth; const added=[];
  for(let i=0;i<n&&club.youth.length<10;i++){ const p=genPlayer(RNG,{age:16+rand(3),potential:60+rand(25)+Game.user.facilities.youth*3}); p.atk=clamp(40+rand(25),30,70); p.def=clamp(40+rand(25),30,70); AllPlayers.set(p.id,p); club.youth.push(p.id); added.push(p.name); }
  if(added.length) pushInbox("青训报到","青训学院输送新人："+added.join("、")+"。","news");
}
function refreshMarkets(){
  Game.pools.scouts=[];
  for(let i=0;i<5;i++){ let candidate=null;
    if(Game.championsUnlocked&&RNG()<0.12*Game.user.scoutLevel){ const freeLegends=Game.pools.legends.filter(p=>!(AllPlayers.get(p.id)||{}).clubId); if(freeLegends.length) candidate=choice(freeLegends); }
    if(!candidate){ const pids=Game.pools.extraPlayers.filter(id=>!(AllPlayers.get(id)||{}).clubId); if(!pids.length) break; candidate=AllPlayers.get(choice(pids)); const boost=Math.floor(RNG()*4*Game.user.scoutLevel); candidate.atk=clamp(candidate.atk+boost,1,99); candidate.def=clamp(candidate.def+boost,1,99); }
    if(candidate&&!Game.pools.scouts.includes(candidate.id)) Game.pools.scouts.push(candidate.id);
  }
  const free=Array.from(AllPlayers.values()).filter(p=>!p.clubId&&!Game.pools.scouts.includes(p.id));
  Game.pools.freeAgents=free.sort(()=>RNG()-0.5).slice(0,5).map(p=>p.id);
}
function advanceAgingAndRetire(){
  Array.from(AllPlayers.keys()).forEach(id=>{ const p=AllPlayers.get(id); if(!p) return; p.age++;
    if(p.age>=35&&RNG()<0.35+0.02*(p.age-35)){ const wasClub=p.clubId; if(wasClub){ const c=Game.clubs.find(x=>x.id===wasClub); if(c){ c.players=c.players.filter(pid=>pid!==p.id); c.youth=c.youth.filter(pid=>pid!==p.id); } }
      const regen=genPlayer(RNG,{age:17+Math.floor(RNG()*3)}); AllPlayers.set(regen.id,regen); Game.pools.extraPlayers.push(regen.id); AllPlayers.delete(p.id);
      Game.pools.freeAgents=Game.pools.freeAgents.filter(pid=>pid!==p.id); Game.pools.scouts=Game.pools.scouts.filter(pid=>pid!==p.id);
    }
  });
}
function handleSeasonEnd(){
  const tCSL=tableToArray(Game.league.CSL.table), tCL1=tableToArray(Game.league.CL1.table);
  const cslChamp=tCSL[0].teamId, cl1Champ=tCL1[0].teamId;
  const promotions=tCL1.slice(0,2).map(x=>x.teamId), relegations=tCSL.slice(-2).map(x=>x.teamId);
  promotions.forEach(id=>{ Game.clubs.find(x=>x.id===id).league="CSL"; });
  relegations.forEach(id=>{ Game.clubs.find(x=>x.id===id).league="CL1"; });
  Game.league.CSL.teams=Game.clubs.filter(c=>c.league==="CSL").map(c=>c.id); Game.league.CL1.teams=Game.clubs.filter(c=>c.league==="CL1").map(c=>c.id);
  const clubsCSL=Game.league.CSL.teams.map(id=>Game.clubs.find(c=>c.id===id)), clubsCL1=Game.league.CL1.teams.map(id=>Game.clubs.find(c=>c.id===id));
  Game.league.CSL.table=initStandings(clubsCSL); Game.league.CL1.table=initStandings(clubsCL1);
  Game.league.CSL.rounds=roundRobin(clubsCSL); Game.league.CL1.rounds=roundRobin(clubsCL1); Game.league.CSL.roundIndex=0; Game.league.CL1.roundIndex=0;
  const userClub=Game.clubs.find(c=>c.id===Game.user.clubId);
  let userPosNum=null; const inCSL=tCSL.findIndex(x=>x.teamId===userClub.id), inCL1=tCL1.findIndex(x=>x.teamId===userClub.id);
  if(inCSL>=0) userPosNum=inCSL+1; if(inCL1>=0) userPosNum=inCL1+1;
  const hallEntry={season:Game.season,CSLchamp:cslChamp,CL1champ:cl1Champ,userPos:userPosNum?userPosNum+"/"+(inCSL>=0?tCSL.length:tCL1.length):null};
  let trophy=null;
  if(cslChamp===userClub.id){ Game.manager.trophies++; trophy="中超冠军"; Game.championsUnlocked=true; Game.manager.reputation=clamp(Game.manager.reputation+8,0,100); }
  if(cl1Champ===userClub.id){ Game.manager.trophies++; trophy="中甲冠军"; Game.manager.reputation=clamp(Game.manager.reputation+5,0,100); }
  Game.manager.history.push({season:Game.season,club:userClub.name,league:inCSL>=0?"CSL":"CL1",pos:userPosNum,trophy:trophy}); Game.manager.seasonsManaged++;
  Game.hall.push(hallEntry); updateDeviceRecordsFromSeason(hallEntry,userPosNum); youthIntake(userClub); advanceAgingAndRetire();
  Game.season++; Game.date=Game.season+"-03-01"; Game.round=1;
  Game.user.boardConfidence=clamp(Game.user.boardConfidence+(userPosNum&&userPosNum<=4?5:-2),10,100); Game.user.transferBudget=Math.floor(Game.user.money*0.3);
  pushInbox("赛季总结", hallEntry.season+" 赛季落幕。中超冠军："+getClubName(cslChamp)+"；中甲冠军："+getClubName(cl1Champ)+"。你的名次："+(hallEntry.userPos||"-")+"。","news");
  alert("赛季结束！中超冠军："+getClubName(cslChamp)+"；中甲冠军："+getClubName(cl1Champ)+"。"); if(Game.autoSave) saveToSlot(Game.slotIndex|0,true);
}
function simulateFullRound(){
  const club=Game.clubs.find(c=>c.id===Game.user.clubId); const league=Game.league[club.league]; const matches=league.rounds[league.roundIndex]||[];
  let userScore=null, result="draw";
  matches.forEach(m=>{ if(m.played) return; const home=Game.clubs.find(c=>c.id===m.home), away=Game.clubs.find(c=>c.id===m.away);
    m.score=simScore(home,away); m.played=true; applyResultToTable(league.table,m);
    if(m.home===club.id||m.away===club.id){ userScore=m.score; const hg=m.score[0],ag=m.score[1];
      result=m.home===club.id?(hg>ag?"win":hg===ag?"draw":"loss"):(ag>hg?"win":ag===hg?"draw":"loss");
      Game.lastResults.push({roundLabel:"第"+(league.roundIndex+1)+"轮",home:m.home,away:m.away,score:m.score});
      Game.user.money+=Math.floor(prizeMoneyForLeague(league.code)*(1+0.05*(Game.user.facilities.stadium-1)))+prizeForResult(result,league.code);
      if(result==="win"){Game.manager.wins++;Game.user.unbeatenStreak++;} else if(result==="draw"){Game.manager.draws++;Game.user.unbeatenStreak++;} else {Game.manager.losses++;Game.user.unbeatenStreak=0;}
      Game.user.bestUnbeaten=Math.max(Game.user.bestUnbeaten,Game.user.unbeatenStreak);
      const delta=result==="win"?3:result==="draw"?1:-2; getAllPlayersOfClub(club.id).forEach(p=>{p.morale=clamp(p.morale+delta,0,100);});
      applyTrainingGrowth(club,getAllPlayersOfClub(club.id));
      pushInbox("赛后快讯", getClubName(m.home)+" "+m.score[0]+"-"+m.score[1]+" "+getClubName(m.away)+"（模拟）", result==="loss"?"warn":"news");
    }
  });
  advanceRoundAndSeasonIfNeeded(); renderCalendar(); toast(userScore?"模拟完毕 "+userScore[0]+"-"+userScore[1]:"本轮已模拟");
}
function refreshUI(){ renderCalendar(); renderClub(); renderTransfer(); renderLeague(); renderHall(); renderSettings(); renderFinance(); renderInbox(); renderTactics(); renderCareer(); }

function renderSlotsModal(){
  const root=loadRoot(); const list=$$("#slotsList"); list.innerHTML="";
  root.slots.forEach((s,i)=>{ const div=document.createElement("div"); div.className="slot-card"+(root.activeSlot===i?" active":""); div.dataset.i=i;
    if(!s) div.innerHTML="<b>槽位 "+(i+1)+"</b><div class=\"mini\">空</div>";
    else div.innerHTML="<b>槽位 "+(i+1)+"</b> · "+(s.nickname||"")+"<div class=\"mini\">"+(s.name||"")+" · "+(s.season||"?")+"季 · "+new Date(s.savedAt).toLocaleString("zh-CN")+"</div>";
    div.onclick=()=>{ $$$("#slotsList .slot-card").forEach(x=>x.classList.remove("active")); div.classList.add("active"); root.activeSlot=i; saveRoot(root); };
    list.appendChild(div);
  });
  $$("#profileNick").value=Game.nickname||""; $$("#slotsModal").classList.remove("hidden");
}
function bindAll(){
  $$("#btnNew").onclick=()=>{
    newGame("seed_"+Date.now());
    const fill=()=>{ const code=$$("#realLeagueSel").value; const sel=$$("#realTeamSel"); sel.innerHTML=""; Game.clubs.filter(c=>c.league===code).forEach(t=>{ const o=document.createElement("option"); o.value=t.name; o.textContent=t.name; sel.appendChild(o); }); };
    fill(); $$("#realLeagueSel").onchange=fill;
    const citySel=$$("#custCity"); citySel.innerHTML=""; Cities.forEach(c=>{ const o=document.createElement("option"); o.value=c.name; o.textContent=c.name+"（"+c.size+"）"; citySel.appendChild(o); });
    showScreen("newgame");
  };
  $$("#btnContinue").onclick=()=>renderSlotsModal();
  $$("#slotsClose").onclick=()=>$$("#slotsModal").classList.add("hidden");
  $$("#slotsLoad").onclick=()=>{ const active=$$("#slotsList .slot-card.active"); const i=active?+active.dataset.i:loadRoot().activeSlot; if(!loadFromSlot(i)){ alert("该槽位无存档"); return; } $$("#slotsModal").classList.add("hidden"); goToApp(); refreshUI(); toast("已加载槽位 "+(i+1)); };
  $$("#slotsDelete").onclick=()=>{ const active=$$("#slotsList .slot-card.active"); const i=active?+active.dataset.i:0; if(!confirm("确认清空槽位 "+(i+1)+"？")) return; const root=loadRoot(); root.slots[i]=null; saveRoot(root); renderSlotsModal(); };
  $$("#btnHallOfFame").onclick=()=>{ showScreen("app"); selectNav("hall"); };
  $$("#btnCloudLB").onclick=async ()=>{ showScreen("app"); selectNav("career"); await refreshCloudLB(); };
  $$("#btnImportExport").onclick=()=>{ showScreen("app"); selectNav("settings"); };
  $$("#btnQuit").onclick=()=>alert("可关闭浏览器标签页退出。");
  $$("#backToMenu").onclick=goToMenu;
  $$("#chooseReal").onclick=()=>{
    Game.manager.name=($$("#mgrName").value.trim()||"新晋教练"); Game.manager.preferredFormation=$$("#mgrForm").value; Game.tactics.formation=Game.manager.preferredFormation;
    Game.slotIndex=+$$("#newSlotSel").value; Game.nickname=$$("#newNick").value.trim()||Game.manager.name;
    if(!addUserClubAsReal($$("#realLeagueSel").value,$$("#realTeamSel").value)){ alert("选择失败"); return; }
    refreshMarkets(); showScreen("journey");
  };
  $$("#createClub").onclick=()=>{
    const name=$$("#custName").value.trim(); if(!name){ alert("请输入球队名称"); return; }
    Game.manager.name=($$("#mgrName").value.trim()||"新晋教练"); Game.manager.preferredFormation=$$("#mgrForm").value; Game.tactics.formation=Game.manager.preferredFormation;
    Game.slotIndex=+$$("#newSlotSel").value; Game.nickname=$$("#newNick").value.trim()||Game.manager.name;
    addUserClubAsCustom(name,$$("#custCity").value,$$("#custColor").value); refreshMarkets(); showScreen("journey");
  };
  $$("#startGame").onclick=()=>{ saveToSlot(Game.slotIndex|0,true); goToApp(); refreshUI(); };
  $$$(".nav-btn").forEach(b=>{ b.onclick=()=>selectNav(b.getAttribute("data-nav")); });
  $$("#btnSave").onclick=()=>saveToSlot(Game.slotIndex|0);
  $$("#btnSave2").onclick=()=>saveToSlot(Game.slotIndex|0);
  $$("#btnPlay").onclick=()=>{ const club=Game.clubs.find(c=>c.id===Game.user.clubId); if(!Game.league[club.league].rounds[Game.league[club.league].roundIndex]){ alert("本赛季已结束"); return; } startMatch(); };
  $$("#btnSimRound").onclick=simulateFullRound;
  $$("#btnReturnMenu").onclick=()=>{ saveToSlot(Game.slotIndex|0,true); goToMenu(); };
  $$("#trainingFocus").onchange=e=>{ Game.user.trainingFocus=e.target.value; };
  $$("#upgradeScout").onclick=()=>{ if(Game.user.scoutLevel>=5){alert("已满级");return;} if(Game.user.money<300000){alert("资金不足");return;} Game.user.money-=300000; Game.user.scoutLevel++; renderClub(); refreshTopbar(); };
  $$("#btnApplyTac").onclick=()=>{ Game.tactics.mentality=$$("#tacMentality").value; Game.tactics.pressing=$$("#tacPressing").value; Game.tactics.width=$$("#tacWidth").value; const club=Game.clubs.find(c=>c.id===Game.user.clubId); if(club) club.formation=Game.tactics.formation; toast("战术已应用"); renderTactics(); refreshTopbar(); };
  $$("#btnRoll").onclick=()=>doOneStep(false);
  $$("#btnAuto").onclick=()=>{ Game.fastMatch=true; doOneStep(true); };
  $$("#btnSkip").onclick=()=>{ const ctx=Match.context; if(!ctx) return; while(true){ if(ctx.stepInHalf>=5){ if(ctx.half===1){ctx.half=2;ctx.stepInHalf=0;} else break; } const hr=rollDice(RNG),ar=rollDice(RNG); if(hr>=ctx.thrHome){ctx.goals.home++;creditGoal(ctx.home.id);} if(ar>=ctx.thrAway){ctx.goals.away++;creditGoal(ctx.away.id);} ctx.stepInHalf++; } $$("#scoreText").innerText=ctx.goals.home+" - "+ctx.goals.away; endMatch(); };
  $$("#btnEndMatch").onclick=()=>{ $$$(".main > div").forEach(v=>v.classList.add("hidden")); $$("#view-summary").classList.remove("hidden"); };
  $$("#btnSummaryOK").onclick=()=>{ advanceRoundAndSeasonIfNeeded(); selectNav("calendar"); refreshUI(); };
  $$("#homeAdvToggle").onchange=e=>{ Game.homeAdv=e.target.checked; };
  $$("#fastMatchToggle").onchange=e=>{ Game.fastMatch=e.target.checked; };
  $$("#autoSaveToggle").onchange=e=>{ Game.autoSave=e.target.checked; };
  $$("#btnExport").onclick=exportJSON;
  $$("#btnImport").onclick=()=>$$("#importFile").click();
  $$("#importFile").onchange=e=>{ if(e.target.files[0]) importJSON(e.target.files[0]); };
  $$("#btnSubmitCloud").onclick=async ()=>{
    const rec=loadDeviceRecords(); const w=Game.manager.wins,d=Game.manager.draws,l=Game.manager.losses,t=w+d+l;
    const entry={ managerName:Game.manager.name, clubName:getClubName(Game.user.clubId), trophies:Game.manager.trophies,
      bestFinish:rec.bestLeagueFinish?(rec.bestLeagueFinish.league+" #"+rec.bestLeagueFinish.pos):calcUserRank(), season:Game.season,
      winPct:t?Math.round(1000*w/t)/10:0, nickname:Game.nickname };
    const res=await CloudRecords.submit(entry); toast(res.msg); refreshCloudLB();
  };
}
function initSplash(){
  const proceed=()=>{ showScreen("menu"); window.removeEventListener("keydown",proceed); window.removeEventListener("click",proceed); };
  window.addEventListener("keydown",proceed); window.addEventListener("click",proceed);
}
document.addEventListener("DOMContentLoaded",()=>{ initSplash(); bindAll(); CloudRecords.init(); });
})();

/**
 * Product catalog / 商品目录 for Acrylic Brick.
 * Designs are the showcase entries already stored in IndexedDB
 * (`acrylic-brick-showcase` / `entries`). Series, layout, and backgrounds
 * live in a separate database so the showcase schema stays untouched.
 */

import { DEFAULT_YAW, drawBrick } from "./catalog-render.js";

const LOCALE_KEY = "acrylic-brick-locale";
const SHOWCASE_DB = "acrylic-brick-showcase";
const SHOWCASE_STORE = "entries";
const CATALOG_DB = "acrylic-brick-catalog";
const CATALOG_STORE = "doc";
const CATALOG_KEY = "main";

const STR = {
  "zh-CN": {
    title: "商品目录",
    titleEn: "CATALOG",
    back: "返回主页",
    series: "系列",
    newSeries: "新建系列",
    untitledSeries: "未命名系列",
    defaultSeries: "系列",
    deleteSeries: "删除系列",
    deleteSeriesConfirm: "删除系列「{name}」？设计仍保留在展示架。",
    moveUp: "上移系列",
    moveDown: "下移系列",
    rows: "行",
    cols: "列",
    bgColor: "背景色",
    bgImage: "背景图",
    clearBg: "清除背景图",
    addDesigns: "添加设计",
    emptySeries: "这个系列还是空的。从展示架已保存的设计里挑选。",
    noDesigns: "展示架里还没有设计。先在编辑器点「存入展示架」，再回到这里添加。",
    noSeries: "还没有系列。点「新建系列」，把已保存的亚克力砖编成一册。",
    pickerTitle: "放入系列",
    pickerHint: "勾选要放进当前系列的设计。顺序与展示架一致，可在格子里再调整。",
    pickerEmpty: "没有可添加的本地设计。",
    confirm: "确定",
    cancel: "取消",
    remove: "移出系列",
    rotateLeft: "向左旋转",
    rotateRight: "向右旋转",
    earlier: "前移",
    later: "后移",
    dragHint: "拖拽左右旋转",
    exportOne: "导出本系列 PNG",
    exportLong: "导出长图 PNG",
    include: "收入长图",
    exporting: "正在导出…",
    exportNone: "请至少勾选一个系列再导出长图。",
    exportEmpty: "这个系列还没有设计，无法导出。",
    savedName: "名称已写回展示架",
    langZh: "中文",
    langEn: "EN",
    missing: "设计已从展示架删除",
    pieces: "{n} 件",
    ad: "广告",
    switchToZh: "切换到中文",
    switchToEn: "Switch to English",
    untitledDesign: "未命名设计",
  },
  en: {
    title: "Catalog",
    titleEn: "LOOKBOOK",
    back: "Back home",
    series: "Series",
    newSeries: "New series",
    untitledSeries: "Untitled series",
    defaultSeries: "Series",
    deleteSeries: "Delete series",
    deleteSeriesConfirm: "Delete series “{name}”? Designs stay on the showcase shelf.",
    moveUp: "Move series up",
    moveDown: "Move series down",
    rows: "Rows",
    cols: "Columns",
    bgColor: "Background",
    bgImage: "Background image",
    clearBg: "Clear image",
    addDesigns: "Add designs",
    emptySeries: "This series is empty. Pick designs already saved on the showcase.",
    noDesigns: "The showcase has no designs yet. Save one from the editor, then add it here.",
    noSeries: "No series yet. Create one and arrange saved acrylic bricks into a lookbook.",
    pickerTitle: "Add to series",
    pickerHint: "Choose designs for this series. Reorder them from each cell.",
    pickerEmpty: "No saved designs to add.",
    confirm: "Done",
    cancel: "Cancel",
    remove: "Remove from series",
    rotateLeft: "Rotate left",
    rotateRight: "Rotate right",
    earlier: "Move earlier",
    later: "Move later",
    dragHint: "Drag to rotate",
    exportOne: "Export this series PNG",
    exportLong: "Export long PNG",
    include: "In long image",
    exporting: "Exporting…",
    exportNone: "Check at least one series to build the long image.",
    exportEmpty: "This series has no designs to export.",
    savedName: "Name saved back to the showcase",
    langZh: "中文",
    langEn: "EN",
    missing: "Removed from showcase",
    pieces: "{n}",
    ad: "Ad",
    switchToZh: "切换到中文",
    switchToEn: "Switch to English",
    untitledDesign: "Untitled design",
  },
};

const state = {
  locale: readLocale(),
  series: [],
  activeId: null,
  designs: [],
  status: "",
  exporting: false,
  pickerOpen: false,
  pickerIds: [],
};

const root = document.getElementById("catalog-root");
const topbar = document.getElementById("topbar");
let saveTimer = 0;
const paintToken = new WeakMap();

function readLocale() {
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    if (value === "en" || value === "zh-CN") return value;
  } catch { /* private mode */ }
  return "zh-CN";
}

function t(key, vars) {
  const table = STR[state.locale] || STR["zh-CN"];
  let text = table[key] ?? STR["zh-CN"][key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function openDb(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error(`Failed to open ${name}`));
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

async function loadDesigns() {
  const db = await openDb(SHOWCASE_DB, 1, (database) => {
    if (!database.objectStoreNames.contains(SHOWCASE_STORE)) {
      database.createObjectStore(SHOWCASE_STORE, { keyPath: "id" });
    }
  });
  try {
    const tx = db.transaction(SHOWCASE_STORE, "readonly");
    const rows = await requestToPromise(tx.objectStore(SHOWCASE_STORE).getAll());
    await txDone(tx);
    return (rows || [])
      .filter((row) => row && typeof row.id === "string" && row.project && Array.isArray(row.project.layers))
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  } finally {
    db.close();
  }
}

async function renameDesign(id, name) {
  const db = await openDb(SHOWCASE_DB, 1, (database) => {
    if (!database.objectStoreNames.contains(SHOWCASE_STORE)) {
      database.createObjectStore(SHOWCASE_STORE, { keyPath: "id" });
    }
  });
  try {
    const tx = db.transaction(SHOWCASE_STORE, "readwrite");
    const store = tx.objectStore(SHOWCASE_STORE);
    const entry = await requestToPromise(store.get(id));
    if (!entry) return;
    entry.name = name;
    if (entry.project && typeof entry.project === "object") entry.project.name = name;
    store.put(entry);
    await txDone(tx);
  } finally {
    db.close();
  }
}

function blankSeries(index) {
  return {
    id: uid("series"),
    name: `${t("defaultSeries")} ${index}`,
    designIds: [],
    rows: 2,
    cols: 3,
    backgroundColor: "#f3efe6",
    backgroundImage: null,
    rotations: {},
    includeInExport: true,
  };
}

function normalizeSeries(raw, index) {
  const designIds = Array.isArray(raw?.designIds) ? raw.designIds.filter((id) => typeof id === "string") : [];
  const rotations = raw?.rotations && typeof raw.rotations === "object" ? { ...raw.rotations } : {};
  return {
    id: typeof raw?.id === "string" ? raw.id : uid("series"),
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name : `${t("defaultSeries")} ${index}`,
    designIds,
    rows: clampInt(raw?.rows, 1, 8, 2),
    cols: clampInt(raw?.cols, 1, 8, 3),
    backgroundColor: typeof raw?.backgroundColor === "string" ? raw.backgroundColor : "#f3efe6",
    backgroundImage: typeof raw?.backgroundImage === "string" ? raw.backgroundImage : null,
    rotations,
    includeInExport: raw?.includeInExport !== false,
  };
}

async function loadCatalog() {
  const db = await openDb(CATALOG_DB, 1, (database) => {
    if (!database.objectStoreNames.contains(CATALOG_STORE)) {
      database.createObjectStore(CATALOG_STORE, { keyPath: "id" });
    }
  });
  try {
    const tx = db.transaction(CATALOG_STORE, "readonly");
    const doc = await requestToPromise(tx.objectStore(CATALOG_STORE).get(CATALOG_KEY));
    await txDone(tx);
    const series = Array.isArray(doc?.series) ? doc.series.map(normalizeSeries) : [];
    return { series, activeId: typeof doc?.activeId === "string" ? doc.activeId : null };
  } finally {
    db.close();
  }
}

async function saveCatalog() {
  const db = await openDb(CATALOG_DB, 1, (database) => {
    if (!database.objectStoreNames.contains(CATALOG_STORE)) {
      database.createObjectStore(CATALOG_STORE, { keyPath: "id" });
    }
  });
  try {
    const tx = db.transaction(CATALOG_STORE, "readwrite");
    tx.objectStore(CATALOG_STORE).put({
      id: CATALOG_KEY,
      series: state.series,
      activeId: state.activeId,
    });
    await txDone(tx);
  } finally {
    db.close();
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCatalog().catch((error) => console.warn("[catalog] save failed", error));
  }, 180);
}

function designMap() {
  return new Map(state.designs.map((entry) => [entry.id, entry]));
}

function activeSeries() {
  return state.series.find((series) => series.id === state.activeId) || null;
}

function designTitle(entry) {
  if (!entry) return t("untitledDesign");
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (name) return name;
  const projectName = typeof entry.project?.name === "string" ? entry.project.name.trim() : "";
  return projectName || t("untitledDesign");
}

function yawOf(series, id) {
  const value = Number(series.rotations?.[id]);
  return Number.isFinite(value) ? value : DEFAULT_YAW;
}

function inkFor(color) {
  const hex = String(color || "#f3efe6").replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.padEnd(6, "0");
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return "#1c1915";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.62 ? "#1c1915" : "#f7f4ee";
}

function renderTop() {
  document.documentElement.lang = state.locale === "zh-CN" ? "zh-CN" : "en";
  document.title = `${t("title")} · Acrylic Brick`;
  topbar.innerHTML = `
    <div class="brand">
      <span class="logo" aria-hidden="true">📘</span>
      <div>
        <strong>${esc(t("title"))}</strong>
        <span class="en">${esc(t("titleEn"))}</span>
      </div>
    </div>
    <div class="top-actions">
      <div class="lang-toggle" role="group" aria-label="Language">
        <button type="button" class="lang-btn ${state.locale === "zh-CN" ? "active" : ""}" data-act="locale" data-locale="zh-CN" title="${esc(t("switchToZh"))}">${esc(t("langZh"))}</button>
        <button type="button" class="lang-btn ${state.locale === "en" ? "active" : ""}" data-act="locale" data-locale="en" title="${esc(t("switchToEn"))}">${esc(t("langEn"))}</button>
      </div>
      <a class="btn" href="./index.html">${esc(t("back"))}</a>
    </div>
  `;
}

function renderSeriesRail() {
  if (state.series.length === 0) {
    return `<p class="hint">${esc(t("noSeries"))}</p>`;
  }
  return `<ul class="series-list">${state.series.map((series, index) => `
    <li class="series-item ${series.id === state.activeId ? "active" : ""}">
      <button type="button" class="series-select" data-act="select-series" data-id="${esc(series.id)}">
        <strong data-series-label="${esc(series.id)}">${esc(series.name || t("untitledSeries"))}</strong>
        <em>${esc(t("pieces", { n: series.designIds.length }))}</em>
      </button>
      <div class="series-tools">
        <button type="button" class="btn sm" data-act="series-up" data-id="${esc(series.id)}" ${index === 0 ? "disabled" : ""} title="${esc(t("moveUp"))}">↑</button>
        <button type="button" class="btn sm" data-act="series-down" data-id="${esc(series.id)}" ${index === state.series.length - 1 ? "disabled" : ""} title="${esc(t("moveDown"))}">↓</button>
        <label class="check"><input type="checkbox" data-act="include" data-id="${esc(series.id)}" ${series.includeInExport ? "checked" : ""}/> ${esc(t("include"))}</label>
      </div>
    </li>
  `).join("")}</ul>`;
}

function renderCell(series, id, designs) {
  const entry = designs.get(id);
  if (!entry) {
    return `
      <article class="cell">
        <div class="preview-wrap"><div class="missing">${esc(t("missing"))}</div></div>
        <button type="button" class="btn sm" data-act="remove-design" data-id="${esc(id)}">${esc(t("remove"))}</button>
      </article>
    `;
  }
  const index = series.designIds.indexOf(id);
  return `
    <article class="cell">
      <div class="preview-wrap">
        <canvas class="brick-view" data-id="${esc(id)}" aria-label="${esc(designTitle(entry))} · ${esc(t("dragHint"))}"></canvas>
        <div class="cell-tools">
          <span>
            <button type="button" class="btn sm" data-act="rot-l" data-id="${esc(id)}" title="${esc(t("rotateLeft"))}" aria-label="${esc(t("rotateLeft"))}">↺</button>
            <button type="button" class="btn sm" data-act="rot-r" data-id="${esc(id)}" title="${esc(t("rotateRight"))}" aria-label="${esc(t("rotateRight"))}">↻</button>
          </span>
          <span>
            <button type="button" class="btn sm" data-act="earlier" data-id="${esc(id)}" ${index <= 0 ? "disabled" : ""} title="${esc(t("earlier"))}">←</button>
            <button type="button" class="btn sm" data-act="later" data-id="${esc(id)}" ${index >= series.designIds.length - 1 ? "disabled" : ""} title="${esc(t("later"))}">→</button>
            <button type="button" class="btn sm" data-act="remove-design" data-id="${esc(id)}" title="${esc(t("remove"))}">×</button>
          </span>
        </div>
      </div>
      <input class="cell-name" data-act="rename" data-id="${esc(id)}" value="${esc(designTitle(entry))}" maxlength="80" aria-label="${esc(t("title"))}" />
    </article>
  `;
}

function renderStage(series) {
  if (!series) {
    return `<div class="empty-main"><p>${esc(t("noSeries"))}</p></div>`;
  }
  const designs = designMap();
  const ink = inkFor(series.backgroundColor);
  const image = series.backgroundImage ? `url("${series.backgroundImage.replace(/"/g, "%22")}")` : "none";
  const cells = series.designIds.map((id) => renderCell(series, id, designs)).join("");
  const empty = series.designIds.length === 0
    ? `<p class="empty-sheet">${esc(state.designs.length === 0 ? t("noDesigns") : t("emptySeries"))}</p>`
    : "";
  return `
    <div class="series-header">
      <input class="series-name" data-act="series-name" value="${esc(series.name)}" maxlength="60" aria-label="${esc(t("series"))}" />
      <button type="button" class="btn danger" data-act="delete-series">${esc(t("deleteSeries"))}</button>
    </div>
    <div class="controls">
      <div class="stepper">
        <span>${esc(t("rows"))}</span>
        <button type="button" class="btn sm" data-act="rows" data-delta="-1" aria-label="${esc(t("rows"))}">−</button>
        <strong data-rows>${series.rows}</strong>
        <button type="button" class="btn sm" data-act="rows" data-delta="1">+</button>
      </div>
      <div class="stepper">
        <span>${esc(t("cols"))}</span>
        <button type="button" class="btn sm" data-act="cols" data-delta="-1" aria-label="${esc(t("cols"))}">−</button>
        <strong data-cols>${series.cols}</strong>
        <button type="button" class="btn sm" data-act="cols" data-delta="1">+</button>
      </div>
      <label class="color-field">${esc(t("bgColor"))}
        <input type="color" data-act="bg-color" value="${esc(safeColor(series.backgroundColor))}" />
      </label>
      <label class="btn sm file-btn">${esc(t("bgImage"))}
        <input type="file" accept="image/*" data-act="bg-file" hidden />
      </label>
      <button type="button" class="btn sm" data-act="bg-clear" ${series.backgroundImage ? "" : "disabled"}>${esc(t("clearBg"))}</button>
      <button type="button" class="btn sm primary" data-act="open-picker">${esc(t("addDesigns"))}</button>
    </div>
    <div class="export-row">
      <button type="button" class="btn primary" data-act="export-one" ${state.exporting ? "disabled" : ""}>${esc(t("exportOne"))}</button>
      <button type="button" class="btn" data-act="export-long" ${state.exporting ? "disabled" : ""}>${esc(t("exportLong"))}</button>
      <span class="status" data-status>${esc(state.status)}</span>
    </div>
    <section class="lookbook" data-lookbook style="--cols:${series.cols};--rows:${series.rows};--sheet:${esc(series.backgroundColor)};--ink:${ink};background-image:${image}">
      <h3>${esc(series.name || t("untitledSeries"))}</h3>
      ${empty}
      <div class="grid">${cells}</div>
    </section>
  `;
}

function safeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#f3efe6";
}

function renderPicker() {
  if (!state.pickerOpen) return "";
  const selected = new Set(state.pickerIds);
  const cards = state.designs.length === 0
    ? `<p class="hint">${esc(t("pickerEmpty"))}</p>`
    : state.designs.map((entry) => {
      const on = selected.has(entry.id);
      const thumb = typeof entry.thumbDataUrl === "string" && entry.thumbDataUrl.startsWith("data:image")
        ? `<img alt="" src="${esc(entry.thumbDataUrl)}" />`
        : `<div class="picker-fallback" aria-hidden="true">💎</div>`;
      return `
        <button type="button" class="picker-item ${on ? "selected" : ""}" data-act="toggle-pick" data-id="${esc(entry.id)}" aria-pressed="${on}">
          ${thumb}
          <strong>${esc(designTitle(entry))}</strong>
        </button>
      `;
    }).join("");
  return `
    <div class="modal-backdrop" data-act="close-picker" role="presentation">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="picker-title" data-stop>
        <h3 id="picker-title">${esc(t("pickerTitle"))}</h3>
        <p class="hint">${esc(t("pickerHint"))}</p>
        <div class="picker-list">${cards}</div>
        <div class="modal-actions">
          <button type="button" class="btn" data-act="close-picker">${esc(t("cancel"))}</button>
          <button type="button" class="btn primary" data-act="apply-picker">${esc(t("confirm"))}</button>
        </div>
      </div>
    </div>
  `;
}

function render() {
  renderTop();
  root.innerHTML = `
    <div class="catalog-body">
      <aside class="series-rail">
        <div class="rail-head">
          <h2>${esc(t("series"))}</h2>
          <button type="button" class="btn sm primary" data-act="new-series">${esc(t("newSeries"))}</button>
        </div>
        ${renderSeriesRail()}
      </aside>
      <div class="stage-wrap">${renderStage(activeSeries())}</div>
    </div>
    ${renderPicker()}
  `;
  requestAnimationFrame(() => { paintAll(); });
}

async function paintCanvas(canvas, entry, yaw) {
  const token = (paintToken.get(canvas) || 0) + 1;
  paintToken.set(canvas, token);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW < 4 || cssH < 4) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(cssW * dpr);
  const height = Math.round(cssH * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  await drawBrick(ctx, entry.project, yaw, width, height, () => paintToken.get(canvas) !== token);
}

function paintAll() {
  const series = activeSeries();
  if (!series) return;
  const designs = designMap();
  root.querySelectorAll("canvas.brick-view").forEach((canvas) => {
    const entry = designs.get(canvas.dataset.id);
    if (!entry) return;
    paintCanvas(canvas, entry, yawOf(series, canvas.dataset.id)).catch((error) => {
      console.warn("[catalog] preview failed", error);
    });
  });
}

function setStatus(text) {
  state.status = text;
  const node = root.querySelector("[data-status]");
  if (node) node.textContent = text;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

async function compressBackground(file) {
  const img = await fileToImage(file);
  const maxEdge = 1800;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  if (file.type === "image/png") return canvas.toDataURL("image/png");
  return canvas.toDataURL("image/jpeg", 0.84);
}

function moveItem(list, index, delta) {
  const next = index + delta;
  if (next < 0 || next >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
}

function fontStack() {
  return '"WenQuanYi Micro Hei", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
}

async function drawBackground(ctx, series, width, height) {
  ctx.fillStyle = series.backgroundColor || "#f3efe6";
  ctx.fillRect(0, 0, width, height);
  if (!series.backgroundImage) return;
  const img = await loadDataImage(series.backgroundImage);
  if (!img) return;
  const scale = Math.max(width / img.width, height / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function loadDataImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function renderSeriesSheet(series, width) {
  const designs = designMap();
  const items = series.designIds.map((id) => designs.get(id)).filter(Boolean);
  const cols = series.cols;
  const rows = Math.max(series.rows, Math.ceil(items.length / cols) || 1);
  const pad = Math.round(width * 0.045);
  const titleH = Math.round(width * 0.07);
  const gap = Math.round(width * 0.02);
  const inner = width - pad * 2;
  const cellW = (inner - gap * (cols - 1)) / cols;
  const previewH = Math.round(cellW * 0.92);
  const nameH = Math.round(width * 0.034);
  const rowH = previewH + nameH;
  const height = pad + titleH + rows * rowH + Math.max(0, rows - 1) * gap + pad;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  await drawBackground(ctx, series, canvas.width, canvas.height);
  const ink = inkFor(series.backgroundImage ? "#888888" : series.backgroundColor);
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(width * 0.034)}px ${fontStack()}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.shadowColor = ink === "#1c1915" ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.fillText(series.name || t("untitledSeries"), pad, pad + titleH * 0.35);
  ctx.shadowBlur = 0;

  for (let index = 0; index < items.length; index += 1) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = pad + col * (cellW + gap);
    const y = pad + titleH + row * (rowH + gap);
    const entry = items[index];
    const still = document.createElement("canvas");
    const dpr = 2;
    still.width = Math.max(2, Math.round(cellW * dpr));
    still.height = Math.max(2, Math.round(previewH * dpr));
    await drawBrick(still.getContext("2d"), entry.project, yawOf(series, entry.id), still.width, still.height);
    ctx.drawImage(still, x, y, cellW, previewH);
    ctx.fillStyle = ink;
    ctx.font = `600 ${Math.round(nameH * 0.46)}px ${fontStack()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = designTitle(entry);
    ctx.fillText(label, x + cellW / 2, y + previewH + nameH * 0.45, cellW - 8);
  }
  return canvas;
}

function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("png"));
        return;
      }
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      resolve(blob);
    }, "image/png");
  });
}

function safeFilename(name) {
  const cleaned = String(name || "catalog").replace(/[\\/:*?"<>|]+/g, " ").trim() || "catalog";
  return cleaned.slice(0, 60);
}

async function exportOne() {
  const series = activeSeries();
  if (!series) return;
  const designs = designMap();
  const count = series.designIds.filter((id) => designs.has(id)).length;
  if (count === 0) {
    setStatus(t("exportEmpty"));
    return;
  }
  state.exporting = true;
  setStatus(t("exporting"));
  render();
  try {
    const sheet = await renderSeriesSheet(series, 1400);
    await downloadCanvas(sheet, `${safeFilename(series.name)}.png`);
    setStatus("");
  } catch (error) {
    console.warn("[catalog] export failed", error);
    setStatus(t("exportEmpty"));
  } finally {
    state.exporting = false;
    render();
  }
}

async function exportLong() {
  const designs = designMap();
  const chosen = state.series.filter((series) => series.includeInExport && series.designIds.some((id) => designs.has(id)));
  if (chosen.length === 0) {
    setStatus(state.series.some((series) => series.includeInExport) ? t("exportEmpty") : t("exportNone"));
    return;
  }
  state.exporting = true;
  setStatus(t("exporting"));
  render();
  try {
    const width = 1400;
    const sheets = [];
    for (const series of chosen) sheets.push(await renderSeriesSheet(series, width));
    const gap = 0;
    const height = sheets.reduce((sum, sheet) => sum + sheet.height, 0) + gap * Math.max(0, sheets.length - 1);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    let y = 0;
    sheets.forEach((sheet, index) => {
      ctx.drawImage(sheet, 0, y);
      y += sheet.height;
      if (index < sheets.length - 1) {
        ctx.fillStyle = "rgba(20, 16, 12, 0.18)";
        ctx.fillRect(0, y - 1, width, 2);
      }
    });
    await downloadCanvas(canvas, `catalog-lookbook.png`);
    setStatus("");
  } catch (error) {
    console.warn("[catalog] long export failed", error);
    setStatus(t("exportNone"));
  } finally {
    state.exporting = false;
    render();
  }
}

function applyPicker() {
  const series = activeSeries();
  if (!series) return;
  const picked = new Set(state.pickerIds);
  const kept = series.designIds.filter((id) => picked.has(id));
  for (const id of state.pickerIds) {
    if (!kept.includes(id)) kept.push(id);
  }
  series.designIds = kept;
  state.pickerOpen = false;
  saveCatalog().catch((error) => console.warn("[catalog] save failed", error));
  render();
}

async function onClick(event) {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const act = button.dataset.act;
  if (act === "close-picker" && event.target.closest("[data-stop]") && event.target.dataset.act !== "close-picker") return;
  if (act === "locale") {
    state.locale = button.dataset.locale === "en" ? "en" : "zh-CN";
    try { localStorage.setItem(LOCALE_KEY, state.locale); } catch { /* ignore */ }
    render();
    return;
  }
  if (act === "new-series") {
    const series = blankSeries(state.series.length + 1);
    state.series.push(series);
    state.activeId = series.id;
    await saveCatalog();
    render();
    return;
  }
  if (act === "select-series") {
    state.activeId = button.dataset.id;
    scheduleSave();
    render();
    return;
  }
  if (act === "series-up" || act === "series-down") {
    const index = state.series.findIndex((series) => series.id === button.dataset.id);
    moveItem(state.series, index, act === "series-up" ? -1 : 1);
    await saveCatalog();
    render();
    return;
  }
  if (act === "delete-series") {
    const series = activeSeries();
    if (!series) return;
    if (!confirm(t("deleteSeriesConfirm", { name: series.name || t("untitledSeries") }))) return;
    state.series = state.series.filter((item) => item.id !== series.id);
    state.activeId = state.series[0]?.id || null;
    await saveCatalog();
    render();
    return;
  }
  if (act === "rows" || act === "cols") {
    const series = activeSeries();
    if (!series) return;
    const delta = Number(button.dataset.delta) || 0;
    if (act === "rows") series.rows = clampInt(series.rows + delta, 1, 8, series.rows);
    else series.cols = clampInt(series.cols + delta, 1, 8, series.cols);
    const look = root.querySelector("[data-lookbook]");
    if (look) {
      look.style.setProperty("--cols", String(series.cols));
      look.style.setProperty("--rows", String(series.rows));
    }
    const label = root.querySelector(act === "rows" ? "[data-rows]" : "[data-cols]");
    if (label) label.textContent = String(act === "rows" ? series.rows : series.cols);
    scheduleSave();
    requestAnimationFrame(() => paintAll());
    return;
  }
  if (act === "bg-clear") {
    const series = activeSeries();
    if (!series) return;
    series.backgroundImage = null;
    await saveCatalog();
    render();
    return;
  }
  if (act === "open-picker") {
    const series = activeSeries();
    if (!series) return;
    state.pickerIds = series.designIds.filter((id) => designMap().has(id));
    state.pickerOpen = true;
    render();
    return;
  }
  if (act === "close-picker") {
    state.pickerOpen = false;
    render();
    return;
  }
  if (act === "toggle-pick") {
    const id = button.dataset.id;
    if (state.pickerIds.includes(id)) state.pickerIds = state.pickerIds.filter((item) => item !== id);
    else state.pickerIds.push(id);
    render();
    return;
  }
  if (act === "apply-picker") {
    applyPicker();
    return;
  }
  if (act === "remove-design") {
    const series = activeSeries();
    if (!series) return;
    series.designIds = series.designIds.filter((id) => id !== button.dataset.id);
    await saveCatalog();
    render();
    return;
  }
  if (act === "earlier" || act === "later") {
    const series = activeSeries();
    if (!series) return;
    const index = series.designIds.indexOf(button.dataset.id);
    moveItem(series.designIds, index, act === "earlier" ? -1 : 1);
    await saveCatalog();
    render();
    return;
  }
  if (act === "rot-l" || act === "rot-r") {
    const series = activeSeries();
    if (!series) return;
    const id = button.dataset.id;
    const delta = act === "rot-l" ? -Math.PI / 12 : Math.PI / 12;
    series.rotations[id] = yawOf(series, id) + delta;
    scheduleSave();
    const canvas = root.querySelector(`canvas.brick-view[data-id="${CSS.escape(id)}"]`);
    const entry = designMap().get(id);
    if (canvas && entry) {
      paintCanvas(canvas, entry, series.rotations[id]).catch((error) => console.warn(error));
    }
    return;
  }
  if (act === "export-one") {
    exportOne();
    return;
  }
  if (act === "export-long") {
    exportLong();
  }
}

function onInput(event) {
  const target = event.target;
  const act = target.dataset.act;
  const series = activeSeries();
  if (!series) return;
  if (act === "series-name") {
    series.name = target.value;
    const label = root.querySelector(`[data-series-label="${CSS.escape(series.id)}"]`);
    if (label) label.textContent = series.name || t("untitledSeries");
    const heading = root.querySelector("[data-lookbook] h3");
    if (heading) heading.textContent = series.name || t("untitledSeries");
    scheduleSave();
    return;
  }
  if (act === "bg-color") {
    series.backgroundColor = target.value;
    const look = root.querySelector("[data-lookbook]");
    if (look) {
      look.style.setProperty("--sheet", series.backgroundColor);
      look.style.setProperty("--ink", inkFor(series.backgroundColor));
    }
    scheduleSave();
  }
}

async function onChange(event) {
  const target = event.target;
  const act = target.dataset.act;
  const series = activeSeries();
  if (act === "include") {
    const item = state.series.find((row) => row.id === target.dataset.id);
    if (!item) return;
    item.includeInExport = target.checked;
    scheduleSave();
    return;
  }
  if (act === "rename") {
    const name = target.value.trim() || t("untitledDesign");
    target.value = name;
    const entry = designMap().get(target.dataset.id);
    if (!entry || designTitle(entry) === name) return;
    entry.name = name;
    if (entry.project) entry.project.name = name;
    try {
      await renameDesign(entry.id, name);
      setStatus(t("savedName"));
    } catch (error) {
      console.warn("[catalog] rename failed", error);
    }
    return;
  }
  if (act === "bg-file" && series && target.files?.[0]) {
    try {
      series.backgroundImage = await compressBackground(target.files[0]);
      await saveCatalog();
      render();
    } catch (error) {
      console.warn("[catalog] background failed", error);
    } finally {
      target.value = "";
    }
  }
}

let drag = null;
function onPointerDown(event) {
  const canvas = event.target.closest?.("canvas.brick-view");
  if (!canvas) return;
  drag = { id: canvas.dataset.id, x: event.clientX, pointerId: event.pointerId };
  canvas.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const series = activeSeries();
  if (!series) return;
  const dx = event.clientX - drag.x;
  if (dx === 0) return;
  drag.x = event.clientX;
  series.rotations[drag.id] = yawOf(series, drag.id) + dx * 0.012;
  const canvas = root.querySelector(`canvas.brick-view[data-id="${CSS.escape(drag.id)}"]`);
  const entry = designMap().get(drag.id);
  if (canvas && entry) {
    paintCanvas(canvas, entry, series.rotations[drag.id]).catch((error) => console.warn(error));
  }
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag = null;
  scheduleSave();
}

root.addEventListener("click", (event) => {
  onClick(event).catch((error) => console.warn("[catalog] action failed", error));
});
root.addEventListener("input", onInput);
root.addEventListener("change", (event) => {
  onChange(event).catch((error) => console.warn("[catalog] change failed", error));
});
topbar.addEventListener("click", (event) => {
  onClick(event).catch((error) => console.warn("[catalog] action failed", error));
});
root.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);
window.addEventListener("resize", () => paintAll());

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  loadDesigns().then((designs) => {
    state.designs = designs;
    render();
  }).catch((error) => console.warn("[catalog] refresh failed", error));
});

async function boot() {
  try {
    const [designs, catalog] = await Promise.all([loadDesigns(), loadCatalog()]);
    state.designs = designs;
    state.series = catalog.series;
    state.activeId = state.series.some((series) => series.id === catalog.activeId)
      ? catalog.activeId
      : (state.series[0]?.id || null);
  } catch (error) {
    console.warn("[catalog] boot failed", error);
  }
  render();
}

boot();

// Used by the page's own export buttons; also lets a local check render a sheet
// without going through the download dialog.
window.__acrylicCatalog = {
  exportSheet: async (seriesId) => {
    const series = state.series.find((item) => item.id === seriesId) || activeSeries();
    if (!series) return null;
    return renderSeriesSheet(series, 900);
  },
  state,
};

/* ============================================================
   UX Analytics — application controller (v2)
   Real inputs only: screens come from uploaded images, events
   from an uploaded spreadsheet. Each region binds one event.
   ============================================================ */
import {
  chartColor, isMacroName, parseSpreadsheet, detectColumns, deriveEvents,
  ranking, concentration, concentrationLevel, scrollModel,
  relevanceOf, countOf, fmtInt, fmtPct, exampleData,
} from "./data.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (t, cls, html) => { const n = document.createElement(t); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isFramed = (() => { try { return window.self !== window.top; } catch { return true; } })();
const fmtK = (n) => {
  n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",").replace(",0", "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(".", ",").replace(",0", "") + "k";
  return String(n);
};

/* ---- State ------------------------------------------------ */
const state = {
  screens: [],
  events: [],
  fileName: null,
  headers: [],
  rawRows: null,
  columns: { name: 0, count: 1, total: -1 },
  suggestedTotal: 0,
  screenIndex: -1,
  show: { regions: true, heatmap: false },
  zoom: 1,
  totalUsers: 0,
  selectedId: null, hoverId: null, armedEvent: null,
  heat: { radius: 1, opacity: 0.85 },
  figmaNode: null, figmaToken: null, figmaProxy: null,
  mode: "analysis",             // "analysis" | "funnel"
  funnel: { steps: [], viz: "bars", selectedId: null },
  // steps: [{ id, name, file, imageURL, volume, eventName, metric }]  metric: "users" | "count"
};
const ZOOM_MIN = 0.4, ZOOM_MAX = 6;

const curScreen = () => state.screens[state.screenIndex] || null;
const regions = () => curScreen()?.regions || [];
const counts = () => Object.fromEntries(state.events.map((e) => [e.name, e.count]));
const hasImage = () => !!curScreen()?.imageURL && curScreen()?.type !== "figma-embed";
const hasFigmaEmbed = () => curScreen()?.type === "figma-embed";
const isFigmaScreen = () => !!curScreen()?.figmaKey || hasFigmaEmbed();
const hasScreen = () => hasImage() || hasFigmaEmbed();
const hasEvents = () => state.events.length > 0;
const canAnalyze = () => !!curScreen() && activeRegions().length > 0 && state.totalUsers > 0;
const regionColor = (i) => chartColor(i + 1);
const regionIndex = (id) => regions().findIndex((r) => r.id === id);
/* Regions relevant to the current view. For a Figma embed, a rectangle belongs
   only to the frame/state it was drawn on (nodeId), so navigating the prototype
   shows just that frame's rectangles. */
const activeRegions = () => {
  const all = regions();
  return (hasFigmaEmbed() && state.figmaNode) ? all.filter((r) => r.nodeId === state.figmaNode) : all;
};
const eventMacro = (name) => state.events.find((e) => e.name === name)?.macro ?? isMacroName(name);
const usersOf = (name) => state.events.find((e) => e.name === name)?.users || 0;

/* ---- Refs ------------------------------------------------- */
const overlay = $("#overlay");
const heatlayer = $("#heatlayer");
const stage = $("#stage");
const imgframe = $("#imgframe");
const screenImg = $("#screenimg");

/* One live iframe per Figma screen, kept mounted so switching tabs never
   reloads the embed. */
const figmaFrames = {};
function ensureFigmaFrame(screen) {
  let f = figmaFrames[screen.id];
  if (!f) {
    f = document.createElement("iframe");
    f.className = "figma-frame";
    f.title = "Protótipo Figma";
    f.setAttribute("allowfullscreen", "");
    f.referrerPolicy = "no-referrer";
    f.style.display = "none";
    f.addEventListener("load", () => { if (curScreen()?.id === screen.id) hideFigmaLoader(); });
    f.src = screen.figmaEmbed;
    imgframe.insertBefore(f, heatlayer);
    figmaFrames[screen.id] = f;
  }
  return f;
}
function activeFigmaFrame() { return curScreen() ? figmaFrames[curScreen().id] : null; }

/* ============================================================
   Toast
   ============================================================ */
function toast(msg, tone = "info", ms = 2800) {
  const icons = {
    success: "<path d='m5 12 4.5 4.5L19 6.5'/>",
    info: "<circle cx='12' cy='12' r='9'/><path d='M12 11v5M12 7.5h.01'/>",
    error: "<path d='M6 6l12 12M18 6 6 18'/>",
  };
  const t = el("div", `toast toast--${tone}`,
    `<span class="toast__ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${icons[tone]}</svg></span><span>${msg}</span>`);
  $("#toaststack").appendChild(t);
  setTimeout(() => { t.classList.add("out"); t.addEventListener("animationend", () => t.remove(), { once: true }); }, ms);
}

/* ============================================================
   Left panel — images
   ============================================================ */
function renderImageList() {
  const box = $("#imglist");
  box.innerHTML = "";
  $("#imglist-empty").hidden = state.screens.length > 0;
  state.screens.forEach((s, i) => {
    const active = i === state.screenIndex;
    const item = el("button", "imgitem" + (active ? " is-active" : ""));
    item.dataset.id = s.id;
    item.draggable = true;
    const thumb = (s.type === "figma-embed")
      ? `<span class="imgitem__thumb-img" style="display:grid;place-items:center;color:var(--content-02)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M12 3v6m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg></span>`
      : `<img class="imgitem__thumb-img" src="${s.imageURL}" alt="" />`;
    item.innerHTML =
      `<span class="imgitem__handle" title="Arraste para reordenar"><svg viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="9" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="9" cy="13" r="1.3"/></svg></span>
       ${thumb}
       <span class="imgitem__meta">
         <span class="imgitem__name">${s.name}</span>
         <span class="imgitem__file">${s.file}</span>
       </span>
       ${active ? '<span class="imgitem__badge"></span>' : ""}
       <button class="imgitem__remove" title="Remover imagem" data-remove="${s.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    item.addEventListener("click", (e) => {
      if (e.target.closest("[data-remove]")) { removeImage(s.id); return; }
      switchScreen(i);
    });
    box.appendChild(item);
  });
  makeReorderable(box, ".imgitem", "vertical");
  $("#img-count").textContent = state.screens.length;
  $("#stat-images").textContent = state.screens.length;
  $("#stat-mapped").textContent = activeRegions().length;
}

function renderTabs() {
  const box = $("#tabs");
  box.innerHTML = "";
  state.screens.forEach((s, i) => {
    const active = i === state.screenIndex;
    const tab = el("button", "tab" + (active ? " is-active" : ""));
    tab.dataset.id = s.id;
    tab.draggable = true;
    tab.innerHTML =
      `${active ? '<span class="tab__dot"></span>' : ""}<b>${s.name}</b><span class="tab__file">${s.file}</span>
       <span class="tab__remove" data-remove="${s.id}" title="Remover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></span>`;
    tab.addEventListener("click", (e) => {
      if (e.target.closest("[data-remove]")) { removeImage(s.id); return; }
      switchScreen(i);
    });
    box.appendChild(tab);
  });
  makeReorderable(box, ".tab", "horizontal");
}

/* ---- Drag-to-reorder (native HTML5 DnD) ------------------- */
function makeReorderable(container, sel, orient) {
  let draggingId = null;
  const items = $$(sel, container);
  const clearMarks = () => items.forEach((n) => n.classList.remove("drop-before", "drop-after"));
  items.forEach((node) => {
    node.addEventListener("dragstart", (e) => {
      draggingId = node.dataset.id; node.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", draggingId); } catch {}
    });
    node.addEventListener("dragend", () => { node.classList.remove("is-dragging"); clearMarks(); draggingId = null; });
    node.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (node.dataset.id === draggingId) return;
      const r = node.getBoundingClientRect();
      const before = orient === "vertical" ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
      clearMarks();
      node.classList.add(before ? "drop-before" : "drop-after");
    });
    node.addEventListener("drop", (e) => {
      e.preventDefault();
      const r = node.getBoundingClientRect();
      const before = orient === "vertical" ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
      reorderScreens(draggingId, node.dataset.id, before);
      clearMarks();
    });
  });
}

function reorderScreens(fromId, toId, before) {
  if (!fromId || fromId === toId) return;
  const activeId = curScreen()?.id;
  const arr = state.screens;
  const from = arr.findIndex((s) => s.id === fromId);
  const [moved] = arr.splice(from, 1);
  let to = arr.findIndex((s) => s.id === toId);
  if (!before) to += 1;
  arr.splice(to, 0, moved);
  state.screenIndex = arr.findIndex((s) => s.id === activeId);
  renderImageList(); renderTabs();
}

function removeImage(id) {
  const idx = state.screens.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const name = state.screens[idx].name;
  const activeId = curScreen()?.id;
  if (figmaFrames[id]) { figmaFrames[id].remove(); delete figmaFrames[id]; } // drop the live iframe
  state.screens.splice(idx, 1);
  if (!state.screens.length) state.screenIndex = -1;
  else state.screenIndex = state.screens.findIndex((s) => s.id === activeId);
  if (state.screenIndex < 0) state.screenIndex = Math.min(idx, state.screens.length - 1);
  state.selectedId = state.hoverId = null;
  renderAll();
  toast(`"${name}" removida.`, "success");
}

/* ============================================================
   Left panel — data (spreadsheet) + columns + events
   ============================================================ */
function renderDataSection() {
  const slot = $("#data-slot");
  slot.innerHTML = "";
  if (hasEvents()) {
    const chip = el("div", "datafile");
    chip.innerHTML =
      `<div class="datafile__icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 13h8M8 17h5"/></svg></div>
       <div class="datafile__meta"><span class="datafile__name">${state.fileName}</span><span class="datafile__hint">${state.events.length} eventos · clique para substituir</span></div>
       <span class="datafile__check"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8.5 12 2.5 2.5 4.5-5"/></svg></span>`;
    chip.style.cursor = "pointer";
    chip.addEventListener("click", () => $("#excelinput").click());
    slot.appendChild(chip);
  } else {
    const dz = el("label", "dropzone dropzone--data");
    dz.innerHTML =
      `<div class="dropzone__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 13h8M8 17h5"/></svg></div>
       <span class="dropzone__title">Anexar planilha</span>
       <span class="dropzone__hint">Export GA/Looker · .xlsx ou .csv</span>`;
    dz.addEventListener("click", () => $("#excelinput").click());
    ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
    dz.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) loadSpreadsheet(f); });
    slot.appendChild(dz);
  }
}

function renderColumns() {
  const slot = $("#columns-slot");
  if (!state.headers.length) {
    slot.innerHTML = `<p class="section__empty">Anexe a planilha para mapear as colunas.</p>`;
    return;
  }
  const opts = (sel, allowNone) =>
    (allowNone ? `<option value="-1"${sel === -1 ? " selected" : ""}>—</option>` : "") +
    state.headers.map((h, i) => `<option value="${i}"${sel === i ? " selected" : ""}>${h || "coluna " + (i + 1)}</option>`).join("");
  slot.innerHTML =
    `<div class="field"><label class="field__label">Evento <span class="req">*</span></label>
       <select class="select" data-col="name">${opts(state.columns.name, false)}</select></div>
     <div class="field"><label class="field__label">Contagem (event_count) <span class="req">*</span></label>
       <select class="select" data-col="count">${opts(state.columns.count, false)}</select></div>
     <div class="field"><label class="field__label">Total de usuários</label>
       <select class="select" data-col="total">${opts(state.columns.total, true)}</select></div>`;
  slot.querySelectorAll("select[data-col]").forEach((s) =>
    s.addEventListener("change", () => {
      state.columns[s.dataset.col] = parseInt(s.value, 10);
      reDeriveEvents();
    }));
}

function renderEvents() {
  const box = $("#events");
  box.innerHTML = "";
  const empty = $("#events-empty"), hint = $("#events-hint");
  if (!hasEvents()) {
    empty.hidden = false; hint.hidden = true; box.hidden = true;
    $("#event-count").textContent = "—";
    return;
  }
  empty.hidden = true; hint.hidden = false; box.hidden = false;
  const mapped = new Set(activeRegions().map((r) => r.event));
  state.events.forEach((e) => {
    const isMapped = mapped.has(e.name);
    const armed = state.armedEvent === e.name;
    const row = el("button", "event" + (isMapped ? " is-mapped" : "") + (armed ? " is-armed" : ""),
      `<span class="event__status"></span><span class="event__name">${e.name}</span>
       <span class="event__tag">${isMapped ? "mapeado" : e.macro ? "macro" : armed ? "desenhe →" : "pendente"}</span>`);
    row.addEventListener("click", () => onEventClick(e, isMapped));
    box.appendChild(row);
  });
  $("#event-count").textContent = `${activeRegions().length}/${state.events.length}`;
}

function onEventClick(e, isMapped) {
  if (isMapped) { const r = activeRegions().find((x) => x.event === e.name); if (r) selectRegion(r.id, true); return; }
  if (e.macro) { toast("Evento macro — alimenta métricas de tela inteira, fora do ranking por componente.", "info", 3400); return; }
  if (!hasScreen()) { toast("Adicione uma imagem ou conecte um protótipo antes de mapear os eventos.", "error"); return; }
  state.armedEvent = state.armedEvent === e.name ? null : e.name;
  if (state.armedEvent && !state.show.regions) { state.show.regions = true; applyLayers(); }
  if (state.armedEvent) {
    stage.classList.add("is-armed"); overlay.classList.add("is-drawing");
    $("#armhint-txt").textContent = `Desenhe o retângulo de "${e.name}"`;
  } else { stage.classList.remove("is-armed"); overlay.classList.remove("is-drawing"); }
  renderEvents();
}

/* ============================================================
   Canvas — image + regions
   ============================================================ */
function renderCanvas() {
  const empty = $("#canvas-empty"), stageEl = $("#imgstage");
  // Keep every Figma iframe mounted but hidden; only the active one is shown.
  Object.values(figmaFrames).forEach((fr) => (fr.style.display = "none"));
  if (hasScreen()) {
    empty.hidden = true; stageEl.hidden = false;
    if (hasFigmaEmbed()) {
      screenImg.style.display = "none";
      const f = ensureFigmaFrame(curScreen());
      f.style.display = "block";
      $("#figma-bar").hidden = false;
      $("#figma-badge").hidden = true; // nav badge shown only on a navigation event
      overlay.classList.add("pass-through");
      sizeFigmaFrame();
      updateFigmaBar();
    } else {
      screenImg.style.display = "";
      $("#figma-bar").hidden = true;
      overlay.classList.remove("pass-through");
      if (screenImg.src !== curScreen().imageURL) screenImg.src = curScreen().imageURL;
    }
    renderRegions();
  } else {
    empty.hidden = false; stageEl.hidden = true;
    $("#figma-bar").hidden = true;
    overlay.querySelectorAll(".region").forEach((n) => n.remove());
  }
}

function sizeFigmaFrame() {
  const cr = $("#canvas").getBoundingClientRect();
  const w = Math.max(320, cr.width - 24);
  const h = Math.max(360, cr.height - 40);
  const f = activeFigmaFrame();
  if (f) { f.style.width = Math.round(w) + "px"; f.style.height = Math.round(h) + "px"; }
  if (state.show.heatmap) drawHeatmap(1);
}

function renderRegions() {
  overlay.querySelectorAll(".region").forEach((n) => n.remove());
  activeRegions().forEach((r) => {
    const idx = regionIndex(r.id);
    const color = regionColor(idx);
    const node = el("div", "region");
    node.dataset.id = r.id;
    node.style.setProperty("--rc", color);
    positionRegion(node, r);
    const cnt = countOf(r.event, counts()), usr = usersOf(r.event);
    const meta = cnt ? `<span class="region__meta">${fmtK(cnt)} cliques${usr ? " · " + fmtK(usr) + " users" : ""}</span>` : "";
    node.innerHTML =
      `<span class="region__tags">
         <span class="region__label"><span class="region__num">${idx + 1}</span><span>${r.event}</span>
           <button class="region__remove" title="Remover" data-remove="${r.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>
         ${meta}
       </span>
       <span class="region__handle nw"></span><span class="region__handle ne"></span>
       <span class="region__handle sw"></span><span class="region__handle se"></span>`;
    wireRegion(node, r);
    overlay.appendChild(node);
  });
  renderRegionDetail(state.selectedId);
  syncHighlight();
}
function positionRegion(node, r) {
  node.style.left = r.x * 100 + "%"; node.style.top = r.y * 100 + "%";
  node.style.width = r.w * 100 + "%"; node.style.height = r.h * 100 + "%";
}
function wireRegion(node, r) {
  node.addEventListener("pointerenter", () => setHover(r.id));
  node.addEventListener("pointerleave", () => setHover(null));
  node.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest("[data-remove]")) { ev.stopPropagation(); removeRegion(r.id); return; }
    const handle = ev.target.closest(".region__handle");
    if (handle) startResize(ev, node, r, handle.classList[1]); else startDrag(ev, node, r);
  });
}

function removeRegion(id) {
  const s = curScreen(); if (!s) return;
  const i = s.regions.findIndex((r) => r.id === id); if (i < 0) return;
  const name = s.regions[i].event;
  s.regions.splice(i, 1);
  if (state.selectedId === id) state.selectedId = null;
  if (state.hoverId === id) state.hoverId = null;
  renderRegions(); renderEvents(); renderInsights(); updateCounters();
  if (state.show.heatmap) drawHeatmap(1);
  toast(`"${name}" removido do mapeamento.`, "success");
}

function rectPct(ev) {
  const b = overlay.getBoundingClientRect();
  return { x: (ev.clientX - b.left) / b.width, y: (ev.clientY - b.top) / b.height };
}
function startDrag(ev, node, r) {
  ev.preventDefault(); selectRegion(r.id, false);
  node.classList.add("is-dragging"); overlay.setPointerCapture?.(ev.pointerId);
  const start = rectPct(ev), ox = r.x, oy = r.y;
  const move = (e) => { const p = rectPct(e); r.x = clamp(ox + (p.x - start.x), 0, 1 - r.w); r.y = clamp(oy + (p.y - start.y), 0, 1 - r.h); positionRegion(node, r); };
  const up = (e) => { node.classList.remove("is-dragging"); overlay.releasePointerCapture?.(e.pointerId); overlay.removeEventListener("pointermove", move); overlay.removeEventListener("pointerup", up); refreshScrollDependent(); };
  overlay.addEventListener("pointermove", move); overlay.addEventListener("pointerup", up);
}
function startResize(ev, node, r, corner) {
  ev.preventDefault(); ev.stopPropagation(); selectRegion(r.id, false);
  node.classList.add("is-dragging"); overlay.setPointerCapture?.(ev.pointerId);
  const start = rectPct(ev), o = { x: r.x, y: r.y, w: r.w, h: r.h };
  const west = corner === "nw" || corner === "sw", north = corner === "nw" || corner === "ne";
  const move = (e) => {
    const p = rectPct(e), dx = p.x - start.x, dy = p.y - start.y;
    if (west) { r.x = clamp(o.x + dx, 0, o.x + o.w - 0.04); r.w = o.w - (r.x - o.x); } else { r.w = clamp(o.w + dx, 0.04, 1 - o.x); }
    if (north) { r.y = clamp(o.y + dy, 0, o.y + o.h - 0.02); r.h = o.h - (r.y - o.y); } else { r.h = clamp(o.h + dy, 0.02, 1 - o.y); }
    positionRegion(node, r);
  };
  const up = (e) => { node.classList.remove("is-dragging"); overlay.releasePointerCapture?.(e.pointerId); overlay.removeEventListener("pointermove", move); overlay.removeEventListener("pointerup", up); refreshScrollDependent(); };
  overlay.addEventListener("pointermove", move); overlay.addEventListener("pointerup", up);
}

/* ---- Draw-to-map ----------------------------------------- */
let drawGhost = null;
overlay.addEventListener("pointerdown", (ev) => {
  if (ev.target !== overlay) return;
  if (!state.armedEvent) { selectRegion(null); return; }
  ev.preventDefault();
  const start = rectPct(ev);
  drawGhost = el("div", "drawghost"); overlay.appendChild(drawGhost);
  const move = (e) => {
    const p = rectPct(e);
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y), w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
    Object.assign(drawGhost.style, { left: x * 100 + "%", top: y * 100 + "%", width: w * 100 + "%", height: h * 100 + "%" });
  };
  const up = (e) => {
    overlay.removeEventListener("pointermove", move); overlay.removeEventListener("pointerup", up);
    const p = rectPct(e);
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y), w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
    drawGhost.remove(); drawGhost = null;
    if (w > 0.04 && h > 0.02) commitRegion(state.armedEvent, x, y, w, h);
    else toast("Retângulo muito pequeno — desenhe uma área maior.", "error");
  };
  overlay.addEventListener("pointermove", move); overlay.addEventListener("pointerup", up);
});

function commitRegion(event, x, y, w, h) {
  const r = { id: "r" + Date.now(), event, x, y, w, h };
  if (isFigmaScreen()) r.nodeId = curScreen().figmaNodeId || state.figmaNode || null;   // anchor to the current frame/state
  curScreen().regions.push(r);
  state.armedEvent = null; stage.classList.remove("is-armed"); overlay.classList.remove("is-drawing");
  renderRegions(); renderEvents(); renderInsights(); updateCounters();
  if (state.show.heatmap) drawHeatmap(1);
  selectRegion(r.id, true);
  const rel = state.totalUsers > 0 ? " · " + fmtPct(relevanceOf(r, state.totalUsers, counts())) + " relevância" : "";
  toast(`"${event}" mapeado${rel}.`, "success");
}

/* ============================================================
   Selection / hover — cross-panel linking
   ============================================================ */
function selectRegion(id, scroll) {
  state.selectedId = id;
  if (id && scroll) $(`.rankrow[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  renderRegionDetail(id);
  syncHighlight();
}

/* Selection popover: clicks (event_count) + total de usuários do evento */
function renderRegionDetail(id) {
  const box = $("#region-detail");
  const r = id ? regions().find((x) => x.id === id) : null;
  if (!r) { box.hidden = true; return; }
  const idx = regionIndex(id), color = regionColor(idx);
  const count = countOf(r.event, counts());
  const users = usersOf(r.event);
  const rel = state.totalUsers > 0 ? count / state.totalUsers : 0;
  const freq = users > 0 ? count / users : null;
  box.style.setProperty("--rc", color);
  box.innerHTML =
    `<button class="rd__close" title="Fechar" aria-label="Fechar">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
     </button>
     <div class="rd__title"><span class="rd__dot"></span><span class="rd__name">${r.event}</span></div>
     <div class="rd__grid">
       <div class="rd__cell"><span>Cliques</span><b>${fmtInt(count)}</b></div>
       <div class="rd__cell"><span>Total de usuários</span><b>${users ? fmtInt(users) : "—"}</b></div>
       <div class="rd__cell accent"><span>Relevância</span><b>${state.totalUsers ? fmtPct(rel) : "—"}</b></div>
       <div class="rd__cell"><span>Freq / usuário</span><b>${freq != null ? freq.toFixed(2).replace(".", ",") : "—"}</b></div>
     </div>`;
  box.querySelector(".rd__close").addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); });
  box.querySelector(".rd__close").addEventListener("click", (e) => { e.stopPropagation(); selectRegion(null); });
  // Anchor near the region; flip vertically when low, horizontally when right-side
  const below = r.y + r.h < 0.72;
  const rightSide = r.x + r.w / 2 > 0.5;
  if (rightSide) { box.style.left = "auto"; box.style.right = (1 - (r.x + r.w)) * 100 + "%"; box.style.transformOrigin = "top right"; }
  else { box.style.right = "auto"; box.style.left = r.x * 100 + "%"; box.style.transformOrigin = "top left"; }
  if (below) { box.style.top = (r.y + r.h) * 100 + "%"; box.style.bottom = "auto"; box.style.transform = "translateY(8px)"; }
  else { box.style.top = "auto"; box.style.bottom = (1 - r.y) * 100 + "%"; box.style.transform = "translateY(-8px)"; }
  box.hidden = false;
}
function setHover(id) { state.hoverId = id; syncHighlight(); }
function syncHighlight() {
  const focus = state.hoverId || state.selectedId;
  overlay.querySelectorAll(".region").forEach((n) => {
    const id = n.dataset.id;
    n.classList.toggle("is-active", id === state.selectedId);
    n.classList.toggle("is-hot", id === state.hoverId && id !== state.selectedId);
    n.classList.toggle("is-dimmed", !!focus && id !== focus);
  });
  document.querySelectorAll(".rankrow").forEach((n) => {
    const id = n.dataset.id;
    n.classList.toggle("is-active", id === focus);
    n.classList.toggle("is-dimmed", !!focus && id !== focus);
  });
  document.querySelectorAll(".scrolldot").forEach((n) => {
    const on = n.dataset.id === focus;
    n.setAttribute("r", on ? 6.5 : n.dataset.baseR);
    n.style.opacity = !focus || on ? 1 : 0.3;
  });
}

/* ============================================================
   Right panel — insights
   ============================================================ */
function renderInsights() { renderConcentration(); renderRank(); renderScroll(); }

function renderConcentration() {
  const body = $("#conc-body"), empty = $("#conc-empty");
  if (!canAnalyze()) { body.hidden = true; empty.hidden = false; return; }
  body.hidden = false; empty.hidden = true;
  const g = concentration(activeRegions(), state.totalUsers, counts());
  const lvl = concentrationLevel(g);
  $("#conc-level").textContent = lvl.label;
  $("#conc-level").style.color = `var(--${lvl.tone}-pure)`;
  requestAnimationFrame(() => { $("#conc-fill").style.width = (g * 100).toFixed(0) + "%"; });
  countUp($("#conc-val"), g, 2);

  // Which components most drive the score (largest share of total relevance)
  const rows = ranking(activeRegions(), state.totalUsers, counts());
  const top = rows.slice(0, 3);
  const infl = $("#conc-infl"), list = $("#conc-infl-list");
  if (top.length >= 2) {
    infl.hidden = false;
    list.innerHTML = top.map((r) => {
      const idx = regionIndex(r.region.id);
      return `<span class="infl-chip" style="--rc:${regionColor(idx)}"><span class="infl-chip__dot"></span>${r.event} <b>${Math.round(r.share * 100)}%</b></span>`;
    }).join("");
  } else infl.hidden = true;
}
function countUp(node, target, dp) {
  if (reduceMotion) { node.textContent = target.toFixed(dp); return; }
  const from = parseFloat(node.textContent) || 0, t0 = performance.now(), dur = 500;
  const tick = (t) => { const k = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 4); node.textContent = (from + (target - from) * e).toFixed(dp); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function renderRank() {
  const box = $("#rank"); box.innerHTML = "";
  if (!canAnalyze()) {
    box.appendChild(el("div", "card__empty",
      !hasImage() ? "Adicione uma imagem para começar."
      : !hasEvents() ? "Anexe a planilha para carregar os eventos."
      : !activeRegions().length ? "Mapeie ao menos um componente na tela."
      : "Informe o total de usuários no contexto da tela."));
    return;
  }
  const rows = ranking(activeRegions(), state.totalUsers, counts());
  rows.forEach((row, i) => {
    if (i === rows.cutIndex && rows.cutIndex > 0) box.appendChild(el("div", "pareto-cut", "80% acumulado"));
    const idx = regionIndex(row.region.id), color = regionColor(idx);
    const w = clamp(row.relevance / rows.max, 0.02, 1) * 100;
    const node = el("div", "rankrow");
    node.dataset.id = row.region.id; node.style.setProperty("--rc", color);
    node.innerHTML =
      `<span class="rankrow__idx">${idx + 1}</span>
       <span class="rankrow__body"><span class="rankrow__name">${row.event}</span>
         <span class="rankrow__track"><span class="rankrow__fill"></span></span></span>
       <span class="rankrow__val">${fmtPct(row.relevance)}</span>`;
    node.addEventListener("pointerenter", () => setHover(row.region.id));
    node.addEventListener("pointerleave", () => setHover(null));
    node.addEventListener("click", () => selectRegion(row.region.id, false));
    box.appendChild(node);
    requestAnimationFrame(() => requestAnimationFrame(() => { node.querySelector(".rankrow__fill").style.width = w + "%"; }));
  });
  syncHighlight();
}

function renderScroll() {
  const host = $("#scrollchart");
  if (!canAnalyze()) { host.innerHTML = ""; $("#scroll-labels").hidden = true; $("#scroll-legend").hidden = true; $("#anomaly-chip").hidden = true; return; }
  $("#scroll-labels").hidden = false;
  const pts = scrollModel(activeRegions(), state.totalUsers, counts());
  $("#anomaly-chip").hidden = !pts.hasAnomaly;
  $("#scroll-legend").hidden = !pts.hasAnomaly;
  const W = 300, H = 140, pl = 10, pr = 10, pt = 12, pb = 20, plotW = W - pl - pr, plotH = H - pt - pb;
  const X = (d) => pl + d * plotW, Y = (v) => pt + (1 - v) * plotH;
  let curve = "";
  for (let d = 0; d <= 1.0001; d += 0.05) curve += (d === 0 ? "M" : "L") + X(d).toFixed(1) + " " + Y(Math.exp(-1.8 * d)).toFixed(1) + " ";
  let dots = "", flagN = 0;
  pts.forEach((p) => {
    const idx = regionIndex(p.region.id), color = regionColor(idx);
    const baseR = p.anomaly ? 5 : 4, cx = X(p.depth).toFixed(1), cy = Y(p.rel).toFixed(1);
    if (p.anomaly) {
      const above = flagN % 2 === 0, fy = (Y(p.rel) + (above ? -12 : 16)).toFixed(1); flagN++;
      const good = p.positive; // above expected → opportunity; below → attention
      const fill = good ? "var(--success-pure)" : "var(--error-pure)";
      dots += `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="${fill}" stroke-opacity="0.5"/>`;
      dots += `<text x="${cx}" y="${fy}" text-anchor="middle" class="anomaly-flag" style="fill:${fill}">${good ? "▲ oportun." : "▼ atenção"}</text>`;
    }
    dots += `<circle class="scrolldot" data-id="${p.region.id}" data-base-r="${baseR}" cx="${cx}" cy="${cy}" r="${baseR}" fill="${color}"/>`;
    dots += `<circle class="scrolldot__hit" data-id="${p.region.id}" cx="${cx}" cy="${cy}" r="11"/>`;
  });
  host.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Relevância por profundidade de scroll">
       <line x1="${pl}" y1="${pt + plotH}" x2="${W - pr}" y2="${pt + plotH}" stroke="var(--content-line)" />
       <line x1="${pl}" y1="${pt}" x2="${pl}" y2="${pt + plotH}" stroke="var(--content-line)" />
       <path class="decay-curve" d="${curve}" />${dots}
       <text x="${pl}" y="${H - 4}" class="axis-label">topo</text>
       <text x="${W - pr}" y="${H - 4}" text-anchor="end" class="axis-label">rodapé</text>
     </svg>`;
  host.querySelectorAll(".scrolldot__hit, .scrolldot").forEach((d) => {
    d.addEventListener("pointerenter", () => setHover(d.dataset.id));
    d.addEventListener("pointerleave", () => setHover(null));
    d.addEventListener("click", () => selectRegion(d.dataset.id, true));
    d.style.cursor = "pointer";
  });
  syncHighlight();
}

/* ============================================================
   Heatmap — conventional thermal map (blue→cyan→green→yellow→red)
   Two passes: accumulate intensity, then colorize through a LUT.
   ============================================================ */
let _heatLUT = null;
function heatLUT() {
  if (_heatLUT) return _heatLUT;
  const c = document.createElement("canvas"); c.width = 256; c.height = 1;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 256, 0);
  // Soft outer halo (transparent → blue/purple) → cyan → green → yellow → orange → red core
  grd.addColorStop(0.00, "rgba(60,60,220,0)");
  grd.addColorStop(0.08, "rgba(70,80,230,0.55)");
  grd.addColorStop(0.20, "rgba(0,150,255,0.9)");
  grd.addColorStop(0.35, "rgba(0,225,180,1)");
  grd.addColorStop(0.50, "rgba(60,235,60,1)");
  grd.addColorStop(0.66, "rgba(230,255,0,1)");
  grd.addColorStop(0.82, "rgba(255,150,0,1)");
  grd.addColorStop(1.00, "rgba(255,30,30,1)");
  g.fillStyle = grd; g.fillRect(0, 0, 256, 1);
  _heatLUT = g.getImageData(0, 0, 256, 1).data;
  return _heatLUT;
}

/* Deterministic PRNG so the scattered blobs stay stable across redraws */
function seedRand(str) {
  let a = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { a = Math.imul(a ^ str.charCodeAt(i), 3432918353); a = (a << 13) | (a >>> 19); }
  return () => { a = Math.imul(a ^ (a >>> 16), 2246822507); a = Math.imul(a ^ (a >>> 13), 3266489909); a ^= a >>> 16; return (a >>> 0) / 4294967296; };
}

/* Paint an organic, Maze-style thermal heatmap onto ctx (does not clear).
   Each region is a cluster of soft gaussian points, weighted by relevance,
   so hot areas read as lumpy blobs with a red core and a soft blue halo. */
function renderHeatmap(ctx, w, h, { radiusMult = 1, opacity = 0.85, progress = 1 } = {}) {
  if (!canAnalyze()) return;
  const icv = document.createElement("canvas"); icv.width = w; icv.height = h;
  const ictx = icv.getContext("2d");

  const rows = ranking(activeRegions(), state.totalUsers, counts()), max = rows.max || 1;
  const n = Math.ceil(rows.length * progress);
  const gauss = (rng) => (rng() + rng() + rng() - 1.5); // ~N(0, .5)

  rows.slice(0, n).forEach((row) => {
    const r = row.region;
    const cx = (r.x + r.w / 2) * w, cy = (r.y + r.h / 2) * h;
    const rw = r.w * w, rh = r.h * h;
    const share = clamp(row.relevance / max, 0.14, 1);
    const rng = seedRand(row.region.id);
    const pts = Math.round(10 + share * 46);            // hotter → denser cluster
    const spreadX = rw * 0.42, spreadY = rh * 0.42;
    const dot = Math.max(10, Math.min(rw, rh) * 0.5) * radiusMult;
    const alpha = 0.10 + share * 0.16;
    for (let k = 0; k < pts; k++) {
      const px = cx + gauss(rng) * spreadX;
      const py = cy + gauss(rng) * spreadY;
      const rad = dot * (0.6 + rng() * 0.6);
      const g = ictx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, "rgba(0,0,0," + alpha.toFixed(3) + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ictx.fillStyle = g;
      ictx.beginPath(); ictx.arc(px, py, rad, 0, Math.PI * 2); ictx.fill();
    }
  });

  // Single blur pass over the whole intensity field → soft, merged blobs
  const bcv = document.createElement("canvas"); bcv.width = w; bcv.height = h;
  const bctx = bcv.getContext("2d");
  bctx.filter = "blur(" + Math.max(3, Math.round(Math.min(w, h) * 0.016)) + "px)";
  bctx.drawImage(icv, 0, 0);
  bctx.filter = "none";

  const img = bctx.getImageData(0, 0, w, h), d = img.data, lut = heatLUT();
  for (let i = 0; i < d.length; i += 4) {
    let a = d[i + 3];
    if (!a) continue;
    if (a > 255) a = 255;
    const o = a << 2;
    d[i] = lut[o]; d[i + 1] = lut[o + 1]; d[i + 2] = lut[o + 2];
    d[i + 3] = Math.round(lut[o + 3] * opacity);
  }
  bctx.putImageData(img, 0, 0);
  ctx.drawImage(bcv, 0, 0);
}

function drawHeatmap(progress = 1) {
  if (!hasScreen()) return;
  const rect = overlay.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
  heatlayer.width = w; heatlayer.height = h;
  const ctx = heatlayer.getContext("2d"); ctx.clearRect(0, 0, w, h);
  renderHeatmap(ctx, w, h, { radiusMult: state.heat.radius, opacity: state.heat.opacity, progress });
}

const MAX_EXPORT_PX = 8000; // keep within browser canvas limits

function triggerDownload(url, filename, revoke) {
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);      // required by Firefox/Safari
  a.click();
  setTimeout(() => { a.remove(); if (revoke) URL.revokeObjectURL(url); }, 4000);
}

/* Fallback base for Figma screens (can't rasterize the cross-origin iframe):
   draw a neutral board with the mapped rectangles + labels — an attention map. */
function drawRegionsBoard(ctx, w, h) {
  ctx.fillStyle = "#0e0f16"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
  const step = Math.max(24, w * 0.03);
  for (let x = step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = step; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const lh = Math.max(18, h * 0.02);
  ctx.font = `700 ${(lh * 0.62).toFixed(0)}px sans-serif`;
  ctx.textBaseline = "middle";
  activeRegions().forEach((r) => {
    const idx = regionIndex(r.id), color = regionColor(idx);
    const x = r.x * w, y = r.y * h, rw = r.w * w, rh = r.h * h;
    ctx.globalAlpha = 0.14; ctx.fillStyle = color; ctx.fillRect(x, y, rw, rh); ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, w * 0.0025); ctx.strokeRect(x, y, rw, rh);
    const label = (idx + 1) + " " + r.event;
    const tw = ctx.measureText(label).width + lh * 0.7;
    ctx.fillStyle = color; ctx.fillRect(x, Math.max(0, y - lh), tw, lh);
    ctx.fillStyle = "#121212"; ctx.fillText(label, x + lh * 0.35, Math.max(lh / 2, y - lh / 2));
  });
}

function exportHeatmap() {
  if (!canAnalyze()) { toast("Gere o heatmap (mapeie componentes e informe o total de usuários) antes de baixar.", "error"); return; }
  const figma = hasFigmaEmbed();
  const rect = overlay.getBoundingClientRect();
  let nw, nh;
  if (figma) {
    const scale = 2;
    nw = Math.round((rect.width || 900) * scale);
    nh = Math.round((rect.height || 600) * scale);
  } else {
    const ratio = rect.width ? rect.height / rect.width : 1.8;
    nw = screenImg.naturalWidth || screenImg.width || Math.round(rect.width) || 1000;
    nh = screenImg.naturalHeight || screenImg.height || Math.round(nw * ratio);
  }

  // Cap the export so tall merged pages don't overflow the canvas size limit
  let ew = nw, eh = nh;
  const longest = Math.max(nw, nh);
  if (longest > MAX_EXPORT_PX) { const s = MAX_EXPORT_PX / longest; ew = Math.round(nw * s); eh = Math.round(nh * s); }

  const cv = document.createElement("canvas");
  cv.width = ew; cv.height = eh;
  const ctx = cv.getContext("2d");
  try {
    if (figma) drawRegionsBoard(ctx, ew, eh);
    else ctx.drawImage(screenImg, 0, 0, ew, eh);
    renderHeatmap(ctx, ew, eh, { radiusMult: state.heat.radius, opacity: state.heat.opacity, progress: 1 });
  } catch (e) {
    toast("Não consegui compor a imagem: " + (e.message || e.name), "error", 4200);
    return;
  }

  const filename = `${(curScreen().name || "tela").replace(/\s+/g, "-").toLowerCase()}-heatmap.png`;
  // Prefer a blob URL — large data: URLs silently fail to download in Chrome.
  const useDataURL = () => {
    try { openExportModal(cv.toDataURL("image/png"), filename, false); }
    catch (e) { toast(e.name === "SecurityError" ? "O navegador bloqueou a exportação (imagem protegida)." : "Não foi possível gerar o arquivo.", "error", 4200); }
  };
  try {
    if (cv.toBlob) cv.toBlob((blob) => blob ? openExportModal(URL.createObjectURL(blob), filename, true) : useDataURL(), "image/png");
    else useDataURL();
  } catch (e) {
    if (e.name === "SecurityError") toast("O navegador bloqueou a exportação (imagem protegida).", "error", 4200);
    else useDataURL();
  }
}

/* ---- Expanded insight modal ------------------------------ */
const NOTE = {
  concentration: `<b>Concentração de atenção</b> — 0 = distribuída, 1 = tudo num só elemento. <u>Acionável:</u> concentração alta pode ser hierarquia funcionando de propósito <i>ou</i> ruído visual escondendo o resto — valide com um teste de 5 segundos. Baixa: atenção espalhada, revise a hierarquia.`,
  ranking: `<b>Ranking &amp; Pareto</b> — componentes por % de relevância (cliques ÷ total de usuários); a linha marca os 80% acumulados. <u>Acionável:</u> invista o redesenho no topo. Na cauda longa, decida entre <i>remover</i> (se é desnecessário) ou <i>testar reposicionamento</i> (se é boa função com má comunicação).`,
  scroll: `<b>Scroll × Relevância</b> — profundidade do componente × relevância; a curva tracejada é o decaimento esperado. <u>Acionável:</u> anomalia positiva no rodapé → conteúdo forte, teste subir. Anomalia negativa no topo → clareza/comunicação, não posição.`,
};

const SUBTITLE = {
  concentration: "Mede o quanto a atenção se concentra em poucos componentes (0 = espalhada, 1 = tudo num só). Quanto maior a % de um item, mais ele puxa a nota para cima. Selecione um componente para ver o papel dele.",
  ranking: "Ordena os componentes pelo uso relativo (cliques ÷ total de usuários). Os primeiros concentram a maior parte do uso; a linha marca onde somam 80%. Selecione um componente para ver o que fazer com ele.",
  scroll: "Cruza a profundidade do componente na tela com sua relevância. A curva tracejada é o que se espera pela posição. Selecione um componente para ver se está acima ou abaixo do esperado — e por quê.",
};

/* Per-item verdicts: is this component positive, neutral or attention for the insight? */
function verdictConcentration(r) {
  const s = Math.round(r.share * 100);
  if (r.share >= 0.30) return { tone: "alert", label: "Domina a atenção",
    text: `Responde por <b>${s}%</b> da atenção da tela — é o que mais puxa a concentração para cima. <u>Positivo</u> se é o elemento principal (foco proposital); <u>negativo</u> se é secundário e está roubando atenção do que importa. Valide com um teste de 5 segundos.` };
  if (r.share >= 0.15) return { tone: "info", label: "Peso relevante",
    text: `Contribui com <b>${s}%</b> da atenção — divide o protagonismo com o topo. Saudável para uma hierarquia equilibrada.` };
  return { tone: "neutral", label: "Pouca influência",
    text: `Apenas <b>${s}%</b> da atenção — quase não pesa na nota. Se deveria ser importante, pode estar mal posicionado ou pouco visível.` };
}
function verdictRanking(r, i, cutIndex) {
  const top = cutIndex < 0 || i <= cutIndex;
  if (top) return { tone: "success", label: "Alto uso — invista aqui",
    text: `<b>${fmtPct(r.relevance)}</b> de relevância. Está entre os componentes que concentram 80% do uso — <u>positivo</u>: é onde os usuários estão. Priorize otimização e redesenho aqui, onde o impacto é maior.` };
  return { tone: "alert", label: "Cauda longa — decida",
    text: `Só <b>${fmtPct(r.relevance)}</b> de relevância. Na cauda longa pode ser <u>negativo</u> (ocupa espaço sem uso). Decida: <b>remover</b> se é realmente desnecessário, ou <b>testar reposicionamento/redesign</b> se é boa função com má comunicação.` };
}
function verdictScroll(p) {
  const deep = p.depth > 0.5, d = Math.round(p.depth * 100);
  if (p.residual > 0.2) return { tone: "success", label: deep ? "Oportunidade" : "Acima do esperado",
    text: deep
      ? `Relevância <b>acima</b> do esperado mesmo no rodapé (profundidade ${d}%). <u>Positivo</u>: conteúdo forte que vence a posição — teste <b>subir</b> na tela para ampliar o alcance.`
      : `Relevância <b>acima</b> do esperado para a posição (topo, ${d}%). <u>Positivo</u>: a hierarquia funciona aqui, o item performa bem onde está.` };
  if (p.residual < -0.2) return { tone: "error", label: "Atenção",
    text: deep
      ? `Relevância <b>abaixo</b> do esperado no rodapé (${d}%). <u>Ambíguo/negativo</u>: pode ser a posição ou desinteresse real — avalie <b>reposicionar</b> ou <b>remover</b>.`
      : `Relevância <b>abaixo</b> do esperado logo no topo (${d}%). <u>Negativo</u>: provável problema de <b>clareza/comunicação</b>, não de posição — teste se o usuário entende o que é.` };
  return { tone: "neutral", label: "Dentro do esperado",
    text: `Relevância coerente com a profundidade (${d}%) — segue a curva de decaimento esperada, sem anomalia.` };
}

let _insightItems = [];
function openInsightModal(kind) {
  if (!canAnalyze()) { toast("Mapeie componentes e informe o total de usuários para expandir.", "info"); return; }
  const body = $("#insight-body");
  const rows = ranking(activeRegions(), state.totalUsers, counts());
  $("#insight-title").textContent = kind === "concentration" ? "Concentração de atenção" : kind === "ranking" ? "Ranking & Pareto" : "Scroll × Relevância";

  let head = "", listHTML = "";
  _insightItems = [];
  const rowHTML = (idx, name, valTxt, w, rid) =>
    `<div class="rankrow" data-rid="${rid}" style="--rc:${regionColor(idx)}"><span class="rankrow__idx">${idx + 1}</span><span class="rankrow__body"><span class="rankrow__name">${name}</span><span class="rankrow__track"><span class="rankrow__fill" style="width:${w}%"></span></span></span><span class="rankrow__val">${valTxt}</span></div>`;

  if (kind === "concentration") {
    const g = concentration(activeRegions(), state.totalUsers, counts()), lvl = concentrationLevel(g);
    head = `<div class="big-metric"><span class="big-metric__val">${g.toFixed(2)}</span><span class="big-metric__level" style="color:var(--${lvl.tone}-pure)">${lvl.label}</span></div>
            <div class="conc__bar" style="height:12px"><div class="conc__fill" style="width:${(g * 100).toFixed(0)}%"></div></div>`;
    rows.forEach((r) => {
      const idx = regionIndex(r.region.id);
      _insightItems.push({ rid: r.region.id, name: r.event, idx, verdict: verdictConcentration(r) });
      listHTML += rowHTML(idx, r.event, Math.round(r.share * 100) + "%", clamp(r.share, 0.02, 1) * 100, r.region.id);
    });
  } else if (kind === "ranking") {
    rows.forEach((r, i) => {
      if (i === rows.cutIndex && rows.cutIndex > 0) listHTML += `<div class="pareto-cut">80% acumulado</div>`;
      const idx = regionIndex(r.region.id);
      _insightItems.push({ rid: r.region.id, name: r.event, idx, verdict: verdictRanking(r, i, rows.cutIndex) });
      listHTML += rowHTML(idx, r.event, fmtPct(r.relevance), clamp(r.relevance / rows.max, 0.02, 1) * 100, r.region.id);
    });
  } else {
    head = `<div class="scrollchart">${scrollSVG(560, 280)}</div>`;
    scrollModel(activeRegions(), state.totalUsers, counts()).forEach((p) => {
      const idx = regionIndex(p.region.id);
      _insightItems.push({ rid: p.region.id, name: p.event, idx, verdict: verdictScroll(p) });
      listHTML += rowHTML(idx, `${p.event} · prof. ${Math.round(p.depth * 100)}%`, fmtPct(p.rel * (rows.max || 1)), clamp(p.rel, 0.02, 1) * 100, p.region.id);
    });
  }

  body.innerHTML =
    `${head}
     <p class="insight-sub">${SUBTITLE[kind]}</p>
     <div class="rank" id="insight-list">${listHTML}</div>
     <div class="insight-verdict" id="insight-verdict"></div>
     <div class="modal-note">${NOTE[kind]}</div>`;

  $("#insight-list").addEventListener("click", (e) => { const row = e.target.closest("[data-rid]"); if (row) selectInsightItem(row.dataset.rid); });
  if (_insightItems.length) selectInsightItem(_insightItems[0].rid);
  $("#insight-modal").hidden = false;
}
function selectInsightItem(rid) {
  const item = _insightItems.find((x) => x.rid === rid);
  if (!item) return;
  $$("#insight-list .rankrow").forEach((n) => n.classList.toggle("is-active", n.dataset.rid === rid));
  const v = $("#insight-verdict");
  v.className = "insight-verdict tone-" + item.verdict.tone;
  v.innerHTML =
    `<span class="iv__dot" style="background:${regionColor(item.idx)}"></span>
     <div class="iv__body"><div class="iv__head"><span class="iv__name">${item.name}</span><span class="iv__tag">${item.verdict.label}</span></div>
     <p class="iv__text">${item.verdict.text}</p></div>`;
}
function closeInsightModal() { $("#insight-modal").hidden = true; }

/* Scroll chart SVG at a given size (shared by the card and the modal) */
function scrollSVG(W, H) {
  const pts = scrollModel(activeRegions(), state.totalUsers, counts());
  const pl = 12, pr = 12, pt = 14, pb = 22, plotW = W - pl - pr, plotH = H - pt - pb;
  const X = (d) => pl + d * plotW, Y = (v) => pt + (1 - v) * plotH;
  let curve = "";
  for (let d = 0; d <= 1.0001; d += 0.04) curve += (d === 0 ? "M" : "L") + X(d).toFixed(1) + " " + Y(Math.exp(-1.8 * d)).toFixed(1) + " ";
  let dots = "", flagN = 0;
  pts.forEach((p) => {
    const idx = regionIndex(p.region.id), color = regionColor(idx);
    const baseR = p.anomaly ? 6 : 5, cx = X(p.depth).toFixed(1), cy = Y(p.rel).toFixed(1);
    if (p.anomaly) { const above = flagN % 2 === 0, fy = (Y(p.rel) + (above ? -14 : 20)).toFixed(1); flagN++;
      dots += `<circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="${color}" stroke-opacity="0.35"/><text x="${cx}" y="${fy}" text-anchor="middle" class="anomaly-flag" style="font-size:11px">⚠ ${p.positive ? "acima" : "abaixo"}</text>`; }
    dots += `<circle cx="${cx}" cy="${cy}" r="${baseR}" fill="${color}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">
     <line x1="${pl}" y1="${pt + plotH}" x2="${W - pr}" y2="${pt + plotH}" stroke="var(--content-line)"/>
     <line x1="${pl}" y1="${pt}" x2="${pl}" y2="${pt + plotH}" stroke="var(--content-line)"/>
     <path class="decay-curve" d="${curve}"/>${dots}
     <text x="${pl}" y="${H - 5}" class="axis-label">topo</text>
     <text x="${W - pr}" y="${H - 5}" text-anchor="end" class="axis-label">rodapé</text></svg>`;
}

let exportURL = null, exportName = "heatmap.png", exportIsBlob = false;
function openExportModal(url, filename, isBlob) {
  if (exportURL && exportIsBlob) URL.revokeObjectURL(exportURL);
  exportURL = url; exportName = filename; exportIsBlob = !!isBlob;
  $("#export-img").src = url;
  const dl = $("#export-dl"); dl.href = url; dl.download = filename;
  $("#export-modal").hidden = false;
}
function closeExportModal() {
  $("#export-modal").hidden = true;
  if (exportURL && exportIsBlob) { URL.revokeObjectURL(exportURL); exportURL = null; }
}

/* Independent show/hide of the region + heatmap layers */
function applyLayers() {
  $$(".layer-toggle").forEach((b) => {
    const on = !!state.show[b.dataset.layer];
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  overlay.style.opacity = state.show.regions ? 1 : 0;
  overlay.style.pointerEvents = state.show.regions ? "" : "none";
  if (!state.show.regions) $("#region-detail").hidden = true;
  else renderRegionDetail(state.selectedId);
  if (state.show.heatmap) { heatlayer.classList.add("is-on"); drawHeatmap(1); }
  else heatlayer.classList.remove("is-on");
  $("#heat-settings").hidden = !state.show.heatmap;
}

function toggleLayer(layer) {
  state.show[layer] = !state.show[layer];
  if (layer === "heatmap" && state.show.heatmap && !canAnalyze()) {
    state.show.heatmap = false;
    toast("Mapeie componentes e informe o total de usuários para ver o heatmap.", "error");
    return;
  }
  applyLayers();
}

function generateHeatmap() {
  if (!canAnalyze()) { toast("Mapeie componentes e informe o total de usuários antes de gerar o heatmap.", "error"); return; }
  const btn = $("#btn-heatmap"), txt = $("#btn-heatmap-txt");
  btn.disabled = true; txt.textContent = "Gerando…";
  state.show.heatmap = true;
  heatlayer.classList.add("is-on");
  $("#heat-settings").hidden = false;
  applyLayers();
  const done = () => { btn.disabled = false; txt.textContent = "Atualizar heatmap"; toast("Heatmap gerado a partir de " + activeRegions().length + " componentes.", "success"); };
  if (reduceMotion) { drawHeatmap(1); done(); return; }
  const t0 = performance.now(), dur = 900;
  const step = (t) => { const k = clamp((t - t0) / dur, 0, 1); drawHeatmap(1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(step); else done(); };
  requestAnimationFrame(step);
}

/* ---- Zoom / pan ------------------------------------------ */
function computeFit() {
  const nW = screenImg.naturalWidth || 320, nH = screenImg.naturalHeight || 640;
  const cr = $("#canvas").getBoundingClientRect();
  const availW = Math.max(120, cr.width - 56), availH = Math.max(120, cr.height - 56);
  const scale = Math.min(availW / nW, availH / nH, 2.2);
  return { nW, nH, scale };
}
function applyZoom(recenter) {
  if (!hasImage()) return;
  const { nW, scale } = computeFit();
  const displayW = Math.max(60, Math.round(nW * scale * state.zoom));
  screenImg.style.width = displayW + "px";
  screenImg.style.height = "auto";
  $("#zoom-pct").textContent = Math.round(state.zoom * 100) + "%";
  if (recenter) requestAnimationFrame(centerCanvas);
  if (state.show.heatmap) drawHeatmap(1);
  renderRegionDetail(state.selectedId);
}
function centerCanvas() {
  const c = $("#canvas");
  c.scrollLeft = (c.scrollWidth - c.clientWidth) / 2;
  c.scrollTop = (c.scrollHeight - c.clientHeight) / 2;
}
function setZoom(z, recenter) { state.zoom = clamp(z, ZOOM_MIN, ZOOM_MAX); applyZoom(recenter); }

/* ============================================================
   Screen switching + orchestration
   ============================================================ */
function switchScreen(i) {
  if (i === state.screenIndex) return;
  state.screenIndex = i;
  state.selectedId = state.hoverId = state.armedEvent = null;
  state.zoom = 1;
  stage.classList.remove("is-armed"); overlay.classList.remove("is-drawing");
  renderAll();
}
function updateCounters() {
  $("#stat-images").textContent = state.screens.length;
  $("#img-count").textContent = state.screens.length;
  $("#stat-mapped").textContent = activeRegions().length;
  $("#event-count").textContent = hasEvents() ? `${activeRegions().length}/${state.events.length}` : "—";
}
function refreshScrollDependent() { renderScroll(); renderConcentration(); renderRegionDetail(state.selectedId); if (state.show.heatmap) drawHeatmap(1); }
function renderAll() {
  renderImageList(); renderTabs(); renderCanvas();
  renderDataSection(); renderColumns(); renderEvents();
  renderInsights(); applyLayers(); updateCounters();
  $("#zoombar").hidden = !hasImage();
  if (hasImage()) applyZoom(false);
}

/* ============================================================
   Uploads
   ============================================================ */
function addImages(files) {
  const imgs = [...files].filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) { toast("Selecione um arquivo de imagem (PNG, JPG ou WebP).", "error"); return; }
  Promise.all(imgs.map((f) => new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res({ id: "u" + Date.now() + Math.random().toString(36).slice(2, 6), name: `Imagem ${state.screens.length + 1}`, file: f.name, imageURL: fr.result, baseUsers: state.suggestedTotal, regions: [] });
    fr.readAsDataURL(f);
  }))).then((created) => {
    const first = state.screens.length === 0;
    state.screens.push(...created);
    created.forEach((s, k) => (s.name = `Imagem ${state.screens.length - created.length + k + 1}`));
    if (first) state.screenIndex = 0;
    closeAddModal();
    renderAll();
    toast(`${created.length} imagem(ns) adicionada(s).`, "success");
  });
}

async function loadSpreadsheet(file) {
  try {
    const { headers, rows } = await parseSpreadsheet(file);
    if (!headers.length || !rows.length) { toast("A planilha parece vazia.", "error"); return; }
    state.headers = headers; state.rawRows = rows;
    state.columns = detectColumns(headers);
    const { events, suggestedTotal } = deriveEvents(rows, state.columns);
    if (!events.length) { toast("Não encontrei eventos — confira as colunas do arquivo.", "error"); }
    state.events = events; state.suggestedTotal = suggestedTotal; state.fileName = file.name;
    if (!state.totalUsers && suggestedTotal > 0) setTotalUsers(suggestedTotal);
    renderAll();
    toast(`${events.length} eventos carregados de ${file.name}.`, "success");
  } catch (err) {
    toast(err.message || "Não consegui ler o arquivo.", "error", 4200);
  }
}

function reDeriveEvents() {
  if (!state.rawRows) return;
  const { events, suggestedTotal } = deriveEvents(state.rawRows, state.columns);
  state.events = events; state.suggestedTotal = suggestedTotal;
  if (!state.totalUsers && suggestedTotal > 0) setTotalUsers(suggestedTotal);
  renderDataSection(); renderEvents(); renderInsights(); updateCounters();
  if (state.show.heatmap) drawHeatmap(1);
}

function setTotalUsers(v) {
  state.totalUsers = v;
  $("#total-users").value = v ? String(v) : "";
  $("#tu-echo").textContent = v ? fmtInt(v) : "—";
  $("#total-users").closest(".inputwrap").classList.toggle("is-ok", v > 0);
}

/* Stack every screen (in current order) into one continuous image.
   Widths are normalized; each source's regions are repositioned into
   the merged coordinate space so the mapping is preserved. */
async function mergeScreens() {
  const rasters = state.screens.filter((s) => s.type !== "figma-embed" && s.imageURL);
  if (rasters.length < 2) { toast("Adicione ao menos duas imagens (prints ou frames do Figma) para juntar.", "info", 4200); return; }
  toast("Juntando imagens em uma página completa…", "info");
  try {
    const loaded = await Promise.all(rasters.map((s) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res({ s, im });
      im.onerror = () => rej(new Error("Falha ao carregar " + s.file));
      im.src = s.imageURL;
    })));
    const W = Math.max(...loaded.map((l) => l.im.naturalWidth || l.im.width || 320));
    const bands = loaded.map((l) => {
      const nw = l.im.naturalWidth || l.im.width || W;
      const nh = l.im.naturalHeight || l.im.height || Math.round(nw * 1.6);
      return { s: l.s, im: l.im, scaledH: nh * (W / nw) };
    });
    const totalH = bands.reduce((a, b) => a + b.scaledH, 0);
    const cv = document.createElement("canvas");
    cv.width = Math.round(W); cv.height = Math.round(totalH);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#0b0f1e"; ctx.fillRect(0, 0, cv.width, cv.height);
    const regions = [];
    let yOff = 0;
    for (const b of bands) {
      ctx.drawImage(b.im, 0, yOff, W, b.scaledH);
      b.s.regions.forEach((r) => regions.push({
        id: "m" + Math.random().toString(36).slice(2, 8),
        event: r.event, x: r.x, w: r.w,
        y: (yOff + r.y * b.scaledH) / totalH,
        h: (r.h * b.scaledH) / totalH,
      }));
      yOff += b.scaledH;
    }
    let imageURL;
    try { imageURL = cv.toDataURL("image/png"); }
    catch { toast("Não consegui exportar a imagem unificada (conteúdo protegido pelo navegador).", "error", 4200); return; }
    state.screens.push({
      id: "pg" + Date.now(), name: "Página completa", file: "pagina-completa.png",
      imageURL, baseUsers: state.suggestedTotal || state.totalUsers, regions,
    });
    state.screenIndex = state.screens.length - 1;
    state.selectedId = state.hoverId = null;
    renderAll();
    toast(`Página completa gerada de ${bands.length} imagens · ${regions.length} retângulos reposicionados.`, "success", 3800);
  } catch (err) {
    toast(err.message || "Falha ao juntar imagens.", "error", 4200);
  }
}

/* ============================================================
   Add-screen modal (print / Figma) + Figma embed integration
   ============================================================ */
function openAddModal(mode) { setAddMode(mode || "print"); $("#add-modal").hidden = false; }
function closeAddModal() { $("#add-modal").hidden = true; }
function setAddMode(mode) {
  $$("#add-mode .segmented__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
  $("#pane-print").hidden = mode !== "print";
  $("#pane-figma").hidden = mode !== "figma";
}

/* ---- Figma REST API (Personal Access Token) --------------- */
const parseFigmaKey = (url) => (url.match(/figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/i) || [])[1] || null;
function parseFigmaNode(url) {
  const m = url.match(/node[-_]id=([^&]+)/i);
  if (!m) return null;
  let n = decodeURIComponent(m[1]);
  if (n.includes("-") && !n.includes(":")) n = n.replace("-", ":");
  return n;
}
const viaProxy = (url) => state.figmaProxy ? state.figmaProxy.replace(/\/+$/, "") + "/" + url : url;
async function figmaGet(path, token) {
  const res = await fetch(viaProxy("https://api.figma.com" + path), { headers: { "X-Figma-Token": token } });
  if (res.status === 403) throw new Error("Token inválido ou sem acesso a este arquivo (403).");
  if (res.status === 404) throw new Error("Arquivo não encontrado — confira o link (404).");
  if (!res.ok) throw new Error("Figma respondeu " + res.status + ".");
  const json = await res.json();
  if (json.err) throw new Error("Figma: " + json.err);
  return json;
}

async function figmaImport() {
  const url = $("#figma-url").value.trim();
  const token = $("#figma-token").value.trim();
  const proxy = $("#figma-proxy").value.trim();
  const key = parseFigmaKey(url);
  if (!key) { toast("Cole um link válido do Figma (…/design/… , /file/… ou /proto/…).", "error", 4200); return; }
  if (!token) { toast("Informe seu Personal Access Token do Figma para importar os frames.", "error", 4200); return; }
  if (!proxy) { toast("A API do Figma não permite chamada direta do navegador (sem CORS). Informe um proxy CORS seu, ou use o embed.", "error", 5200); return; }

  const btn = $("#figma-import"), label = btn.textContent;
  btn.disabled = true; btn.textContent = "Importando…";
  state.figmaToken = token; state.figmaProxy = proxy;
  try {
    const node = parseFigmaNode(url);
    const file = await figmaGet(`/v1/files/${key}?depth=2`, token);
    // Collect top-level frames (children of each page)
    const frames = [], nameOf = {};
    (file.document?.children || []).forEach((page) =>
      (page.children || []).forEach((ch) => {
        if (ch.type === "FRAME" || ch.type === "COMPONENT" || ch.type === "COMPONENT_SET") {
          frames.push(ch.id); nameOf[ch.id] = ch.name;
        }
      }));
    let ids = node ? [node] : frames.slice(0, 10);
    if (node && !nameOf[node]) nameOf[node] = file.name || "Frame";
    if (!ids.length) throw new Error("Nenhum frame encontrado neste arquivo.");

    const img = await figmaGet(`/v1/images/${key}?ids=${encodeURIComponent(ids.join(","))}&format=png&scale=2`, token);
    const urls = img.images || {};
    let added = 0;
    for (const id of ids) {
      const src = urls[id];
      if (!src) continue;
      // Fetch as a same-origin blob so the canvas stays exportable (no CORS taint);
      // fall back to the remote URL if the blob fetch is blocked.
      let imageURL = src;
      try { const r = await fetch(viaProxy(src)); if (r.ok) imageURL = URL.createObjectURL(await r.blob()); } catch {}
      state.screens.push({
        id: "fg" + id.replace(/[:]/g, "-") + Date.now().toString(36),
        name: nameOf[id] || ("Frame " + id), file: `figma · ${key.slice(0, 6)}`,
        type: "figma-frame", imageURL, figmaKey: key, figmaNodeId: id,
        baseUsers: state.suggestedTotal || state.totalUsers, regions: [],
      });
      added++;
    }
    if (!added) throw new Error("O Figma não retornou imagens dos frames.");
    state.screenIndex = state.screens.length - 1;
    closeAddModal();
    $("#figma-url").value = ""; $("#figma-token").value = "";
    renderAll();
    toast(`${added} frame(s) importado(s) do Figma com nome real — mapeie os eventos por cima.`, "success", 4600);
  } catch (err) {
    const cors = /Failed to fetch|NetworkError|CORS/i.test(err.message || "");
    toast(cors
      ? "O proxy não respondeu ou não adicionou CORS. Confira a URL do proxy — ele precisa aceitar a URL alvo anexada e devolver Access-Control-Allow-Origin."
      : (err.message || "Falha ao importar do Figma."), "error", 6000);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

/* Interactive embed fallback (public prototype; requires Figma login; blocked in sandboxes) */
function figmaEmbedConnect() {
  const raw = $("#figma-url").value.trim();
  if (!/figma\.com\/(proto|design|file)\//i.test(raw)) {
    toast("Cole um link válido de protótipo do Figma.", "error", 4200); return;
  }
  // Show only the prototype (hide Figma's embed chrome / hotspot hints)
  let proto = raw;
  const add = (u, kv) => u + (u.includes("?") ? "&" : "?") + kv;
  if (!/hide-ui=/.test(proto)) proto = add(proto, "hide-ui=1");
  if (!/hotspot-hints=/.test(proto)) proto = add(proto, "hotspot-hints=0");
  if (!/scaling=/.test(proto)) proto = add(proto, "scaling=contain");
  const embed = "https://www.figma.com/embed?embed_host=uxanalytics&url=" + encodeURIComponent(proto);
  const n = state.screens.filter((s) => s.type === "figma-embed").length + 1;
  state.screens.push({
    id: "fge" + Date.now(), name: `Protótipo Figma ${n}`, file: "figma-embed",
    type: "figma-embed", figmaEmbed: embed, figmaSource: raw, updatedAt: Date.now(),
    baseUsers: state.suggestedTotal || state.totalUsers, regions: [],
  });
  state.screenIndex = state.screens.length - 1;
  state.figmaNode = null;
  closeAddModal();
  $("#figma-url").value = "";
  renderAll();
  toast("Embed conectado. Exige protótipo público + login no Figma e não funciona em prévias com CSP restrito.", "info", 5200);
}

/* Nav badge appears only when the embed actually reports navigation */
function setFigmaStatus(kind, node) {
  const badge = $("#figma-badge");
  badge.hidden = false;
  badge.textContent = kind === "variant" ? "🔁 Variação" : "🆕 Nova tela";
  $("#figma-node").textContent = node ? "id " + node : "";
}

/* ---- Refresh + "last updated" + loading motion ------------ */
function relTime(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "agora mesmo";
  if (s < 3600) return "há " + Math.max(1, Math.round(s / 60)) + " min";
  const d = new Date(ts);
  return "às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function updateFigmaBar() {
  if (!hasFigmaEmbed()) return;
  $("#figma-updated").textContent = "Atualizado " + relTime(curScreen().updatedAt);
}
let _loaderTimer = null;
function showFigmaLoader() {
  const l = $("#figma-loader");
  l.hidden = false;
  requestAnimationFrame(() => l.classList.add("is-on"));
}
function hideFigmaLoader() {
  clearTimeout(_loaderTimer);
  const l = $("#figma-loader");
  if (l.hidden) return;
  l.classList.remove("is-on");
  const done = () => { l.hidden = true; l.removeEventListener("transitionend", done); };
  if (reduceMotion) done(); else { l.addEventListener("transitionend", done); setTimeout(done, 400); }
}
function refreshFigma() {
  if (!hasFigmaEmbed()) return;
  const s = curScreen(), f = activeFigmaFrame();
  if (!f) return;
  showFigmaLoader();
  const src = s.figmaEmbed;
  f.src = "about:blank";
  requestAnimationFrame(() => { f.src = src; });
  s.updatedAt = Date.now();
  updateFigmaBar();
  state.figmaNode = null; $("#figma-badge").hidden = true;
  clearTimeout(_loaderTimer);
  _loaderTimer = setTimeout(hideFigmaLoader, 4500); // fallback if load doesn't fire
  toast("Recarregando o protótipo…", "info", 2000);
}

/* Figma Embed Kit posts navigation events via postMessage */
addEventListener("message", (e) => {
  if (!/figma\.com$/.test((() => { try { return new URL(e.origin).hostname; } catch { return ""; } })())) return;
  if (!hasFigmaEmbed()) return;
  let d = e.data;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { return; } }
  if (!d || !d.type) return;
  const payload = d.data || d;
  let changed = false;
  if (d.type === "PRESENTED_NODE_CHANGED") { state.figmaNode = payload.presentedNodeId || null; setFigmaStatus("new", state.figmaNode); changed = true; }
  else if (d.type === "NEW_STATE") { state.figmaNode = payload.nodeId || payload.newVariantId || null; setFigmaStatus("variant", state.figmaNode); changed = true; }
  if (changed) onFrameChanged();
});

/* Re-scope the analysis to the frame now shown in the prototype */
function onFrameChanged() {
  state.selectedId = null; state.hoverId = null;
  renderRegions(); renderEvents(); renderInsights(); updateCounters();
  if (state.show.heatmap) drawHeatmap(1);
}

function loadExample() {
  const { screen, events, suggestedTotal } = exampleData();
  state.screens.push(screen);
  state.screenIndex = state.screens.length - 1;
  state.events = events; state.suggestedTotal = suggestedTotal;
  state.fileName = "eventos-exemplo.csv";
  state.headers = ["event_name", "event_count", "total_users"];
  state.rawRows = events.map((e) => [e.name, e.count, e.users || suggestedTotal]);
  state.columns = { name: 0, count: 1, total: 2 };
  setTotalUsers(suggestedTotal);
  renderAll();
  toast("Exemplo carregado — arraste os retângulos e passe o mouse para ver o vínculo entre os painéis.", "success", 4200);
}

/* ============================================================
   Funil — sequência de páginas com volumetria → quedas e conversão
   ============================================================ */
const funnelSteps = () => state.funnel.steps;

function setMode(mode) {
  state.mode = mode;
  $$("#modenav .modenav__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
  $("#workspace-analysis").hidden = mode !== "analysis";
  $("#workspace-funnel").hidden = mode !== "funnel";
  $("#pill-images").hidden = mode !== "analysis";
  $("#pill-mapped").hidden = mode !== "analysis";
  if (mode === "funnel") renderFunnel();
}

function renderFunnel() { renderFunnelData(); renderFunnelList(); renderFunnelViz(); }

/* Value a bound step pulls from the spreadsheet (event_count or total_users). */
const stepMetricValue = (ev, metric) => (metric === "count" ? ev.count : ev.users) || 0;

/* Re-pull volume from the linked event (used after (re)loading a spreadsheet). */
function syncFunnelBindings() {
  funnelSteps().forEach((s) => {
    if (!s.eventName) return;
    const ev = state.events.find((e) => e.name === s.eventName);
    if (ev) s.volume = stepMetricValue(ev, s.metric || "users");
    else { s.eventName = null; } // event vanished after a new upload
  });
}

/* Data-source card in the funnel panel — reuses the same events as Análise. */
function renderFunnelData() {
  const slot = $("#funnel-data");
  if (!slot) return;
  if (hasEvents()) {
    slot.className = "funnel-data is-loaded";
    slot.innerHTML =
      `<span class="funnel-data__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg></span>
       <span class="funnel-data__meta"><b>${state.events.length} eventos</b><small>${state.fileName || "planilha carregada"}</small></span>
       <button class="funnel-data__act" id="funnel-data-replace">Trocar</button>`;
  } else {
    slot.className = "funnel-data";
    slot.innerHTML =
      `<span class="funnel-data__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg></span>
       <span class="funnel-data__meta"><b>Vincular planilha</b><small>opcional — puxe a volumetria dos eventos</small></span>
       <button class="funnel-data__act" id="funnel-data-add">Anexar</button>`;
  }
  slot.querySelector("#funnel-data-add, #funnel-data-replace")?.addEventListener("click", () => $("#funnel-data-fileinput").click());
}

function eventOptionsHTML(selected) {
  const opts = [`<option value="">— volume manual —</option>`];
  state.events.forEach((e) => {
    const sel = e.name === selected ? " selected" : "";
    opts.push(`<option value="${e.name.replace(/"/g, "&quot;")}"${sel}>${e.name}${e.macro ? " (macro)" : ""}</option>`);
  });
  return opts.join("");
}

function renderFunnelList() {
  const box = $("#funnel-list");
  box.innerHTML = "";
  const steps = funnelSteps();
  $("#funnel-empty").hidden = steps.length > 0;
  $("#funnel-count").textContent = steps.length;
  const linkable = hasEvents();
  steps.forEach((s, i) => {
    const item = el("div", "funnel-item");
    item.dataset.id = s.id; item.draggable = true;
    item.style.setProperty("--rc", funnelColor(i, steps.length));
    const ev = s.eventName ? state.events.find((e) => e.name === s.eventName) : null;
    const metric = s.metric || "users";
    const bindHTML = !linkable ? "" :
      `<div class="funnel-bind">
         <select class="funnel-ev" data-ev="${s.id}" title="Vincular a um evento da planilha">${eventOptionsHTML(s.eventName)}</select>
         ${ev ? `<div class="funnel-metric" role="group">
             <button type="button" data-m="users" class="${metric === "users" ? "is-active" : ""}" title="total_users">Usuários</button>
             <button type="button" data-m="count" class="${metric === "count" ? "is-active" : ""}" title="event_count">Cliques</button>
           </div>` : ""}
       </div>`;
    item.innerHTML =
      `<span class="funnel-item__handle" title="Arraste para reordenar"><svg viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="9" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="9" cy="13" r="1.3"/></svg></span>
       <span class="funnel-item__idx">${i + 1}</span>
       <img class="funnel-item__thumb" src="${s.imageURL}" alt="" data-fstep="${s.id}" />
       <span class="funnel-item__meta">
         <span class="funnel-item__name">${s.name}</span>
         ${bindHTML}
         <input class="funnel-vol${ev ? " is-linked" : ""}" inputmode="numeric" placeholder="usuários que acessaram" value="${s.volume ? fmtInt(s.volume) : ""}" data-vol="${s.id}" title="${ev ? "Puxado da planilha — edite para inserir manualmente" : "Digite a volumetria"}" />
       </span>
       <button class="funnel-item__remove" title="Remover etapa" data-remove="${s.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    item.querySelector("[data-remove]").addEventListener("click", (e) => { e.stopPropagation(); removeFunnelStep(s.id); });

    const vol = item.querySelector("[data-vol]");
    vol.addEventListener("input", () => {
      s.volume = parseInt(vol.value.replace(/\D/g, ""), 10) || 0;
      s.eventName = null; // digitar manualmente desvincula
      renderFunnelViz();
    });
    vol.addEventListener("blur", () => {
      vol.value = s.volume ? fmtInt(s.volume) : "";
      if (!s.eventName) renderFunnelList();
    });
    vol.addEventListener("pointerdown", (e) => e.stopPropagation());

    const sel = item.querySelector(".funnel-ev");
    if (sel) {
      sel.addEventListener("pointerdown", (e) => e.stopPropagation());
      sel.addEventListener("change", () => {
        const name = sel.value;
        if (!name) { s.eventName = null; }
        else {
          const e2 = state.events.find((e) => e.name === name);
          s.eventName = name; s.metric = s.metric || "users";
          if (e2) s.volume = stepMetricValue(e2, s.metric);
        }
        renderFunnelList(); renderFunnelViz();
      });
    }
    item.querySelectorAll(".funnel-metric button").forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", () => {
        s.metric = btn.dataset.m;
        const e2 = state.events.find((e) => e.name === s.eventName);
        if (e2) s.volume = stepMetricValue(e2, s.metric);
        renderFunnelList(); renderFunnelViz();
      });
    });

    // Hover preview + click-to-view on the thumbnail
    const thumb = item.querySelector(".funnel-item__thumb");
    thumb.addEventListener("mouseenter", (e) => showFunnelPreview(s, e));
    thumb.addEventListener("mousemove", moveFunnelPreview);
    thumb.addEventListener("mouseleave", hideFunnelPreview);
    thumb.addEventListener("click", (e) => { e.stopPropagation(); hideFunnelPreview(); openFunnelLightbox(s.id); });

    box.appendChild(item);
  });
  makeFunnelReorderable(box);
}

const funnelColor = (i, n) => {
  const t = n > 1 ? i / (n - 1) : 0; // brand (topo) → info (fundo)
  return `color-mix(in srgb, var(--brand-pure) ${Math.round((1 - t) * 100)}%, var(--info-pure))`;
};

function makeFunnelReorderable(container) {
  let dragId = null;
  const items = $$(".funnel-item", container);
  const clear = () => items.forEach((n) => n.classList.remove("drop-before", "drop-after"));
  items.forEach((node) => {
    node.addEventListener("dragstart", (e) => { dragId = node.dataset.id; node.classList.add("is-dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch {} });
    node.addEventListener("dragend", () => { node.classList.remove("is-dragging"); clear(); dragId = null; });
    node.addEventListener("dragover", (e) => { e.preventDefault(); if (node.dataset.id === dragId) return; const r = node.getBoundingClientRect(); const before = e.clientY < r.top + r.height / 2; clear(); node.classList.add(before ? "drop-before" : "drop-after"); });
    node.addEventListener("drop", (e) => {
      e.preventDefault(); const r = node.getBoundingClientRect(); const before = e.clientY < r.top + r.height / 2;
      const arr = funnelSteps(); const from = arr.findIndex((s) => s.id === dragId);
      if (from < 0 || dragId === node.dataset.id) { clear(); return; }
      const [moved] = arr.splice(from, 1);
      let to = arr.findIndex((s) => s.id === node.dataset.id); if (!before) to += 1;
      arr.splice(to, 0, moved); clear(); renderFunnel();
    });
  });
}

function funnelMetrics() {
  const steps = funnelSteps();
  const v0 = steps[0]?.volume || 0;
  const maxV = Math.max(...steps.map((s) => s.volume || 0), 1);
  return steps.map((s, i) => {
    const prev = i > 0 ? (steps[i - 1].volume || 0) : null;
    const pass = prev ? (s.volume || 0) / prev : 1;   // pass-through do passo anterior
    const drop = prev ? 1 - pass : 0;                 // queda (pode ser negativa = crescimento)
    const conv = v0 ? (s.volume || 0) / v0 : 0;        // conversão desde o topo
    return { step: s, i, prev, pass, drop, conv, barW: (s.volume || 0) / maxV };
  });
}

function renderFunnelViz() {
  const steps = funnelSteps();
  const ready = steps.length >= 2 && steps.every((s) => (s.volume || 0) > 0);
  $("#funnel-canvas-empty").hidden = steps.length > 0;
  $("#funnel-view").hidden = steps.length === 0;
  const summary = $("#funnel-summary"), chart = $("#funnel-chart"), toolbar = $("#funnel-toolbar");

  if (steps.length === 0) return;
  if (!ready) {
    summary.innerHTML = ""; toolbar.innerHTML = "";
    chart.innerHTML = `<div class="card__empty" style="text-align:center;padding:24px">Informe a volumetria (usuários que acessaram) de <b>todas</b> as etapas — digite ou vincule a um evento da planilha — para calcular quedas e conversão.</div>`;
    return;
  }

  const m = funnelMetrics();
  const overall = m[m.length - 1].conv;
  const biggest = m.slice(1).reduce((a, b) => (b.drop > a.drop ? b : a), m[1]);
  summary.innerHTML =
    `<div class="fsum"><span class="fsum__label">Conversão total</span><span class="fsum__val accent">${fmtPct(overall)}</span><span class="fsum__sub">${fmtInt(steps[steps.length - 1].volume)} de ${fmtInt(steps[0].volume)}</span></div>
     <div class="fsum"><span class="fsum__label">Etapas</span><span class="fsum__val">${steps.length}</span><span class="fsum__sub">${fmtInt(steps[0].volume - steps[steps.length - 1].volume)} usuários perdidos no total</span></div>
     <div class="fsum"><span class="fsum__label">Maior queda</span><span class="fsum__val bad">${fmtPct(biggest.drop)}</span><span class="fsum__sub">entre etapa ${biggest.i} e ${biggest.i + 1} · ${biggest.step.name}</span></div>`;

  // Toolbar: X→Y caption + visualization switcher
  toolbar.innerHTML =
    `<div class="funnel-cap"><b>${steps[0].name}</b> <span class="funnel-cap__arrow">→</span> <b>${steps[steps.length - 1].name}</b> · ${steps.length} etapas</div>
     <div class="funnel-vizswitch" role="group" aria-label="Modo de visualização">
       <button type="button" data-viz="bars" class="${state.funnel.viz === "bars" ? "is-active" : ""}" title="Barras horizontais">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h11M4 18h6"/></svg>Barras</button>
       <button type="button" data-viz="columns" class="${state.funnel.viz === "columns" ? "is-active" : ""}" title="Colunas (conversão do topo)">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 20V10M12 20V4M18 20v-7"/></svg>Colunas</button>
     </div>`;
  toolbar.querySelectorAll("[data-viz]").forEach((b) => b.addEventListener("click", () => {
    state.funnel.viz = b.dataset.viz; renderFunnelViz();
  }));

  chart.className = "funnel-chart viz-" + state.funnel.viz;
  chart.innerHTML = "";
  if (state.funnel.viz === "columns") renderFunnelColumns(chart, m, steps);
  else renderFunnelBars(chart, m, steps);
  wireFunnelChartInteractions(chart);
}

function renderFunnelBars(chart, m, steps) {
  m.forEach((row) => {
    if (row.i > 0) {
      const loss = row.drop >= 0;
      const conn = el("div", "funnel-drop",
        `<span class="funnel-drop__pill ${loss ? "loss" : "gain"}">${loss ? "▼ -" : "▲ +"}${(Math.abs(row.drop) * 100).toFixed(1).replace(".", ",")}%</span>
         <span class="funnel-drop__pass">${fmtInt(row.step.volume)} seguiram (${(row.pass * 100).toFixed(0)}%)</span>`);
      chart.appendChild(conn);
    }
    const stepEl = el("div", "funnel-step");
    stepEl.dataset.fstep = row.step.id;
    const w = Math.max(0.1, row.barW) * 100;
    stepEl.innerHTML =
      `<div class="funnel-step__label">${row.i + 1}. ${row.step.name}</div>
       <div class="funnel-step__barwrap">
         <div class="funnel-step__bar" style="width:${w}%;background:${funnelColor(row.i, steps.length)}">
           <span class="funnel-step__vol">${fmtInt(row.step.volume)}</span>
         </div>
       </div>
       <div class="funnel-step__side"><span class="funnel-step__conv">${fmtPct(row.conv)}</span><small>do topo</small></div>`;
    chart.appendChild(stepEl);
  });
}

/* Maze-style: full-height columns, solid fill to conversion-from-top, hatched remainder. */
function renderFunnelColumns(chart, m, steps) {
  m.forEach((row) => {
    const col = el("div", "fcol");
    col.dataset.fstep = row.step.id;
    const h = Math.max(0.6, row.conv * 100); // keep a sliver visible for tiny conversions
    const dropTag = row.i > 0
      ? `<span class="fcol__drop ${row.drop >= 0 ? "loss" : "gain"}">${row.drop >= 0 ? "▼ " : "▲ +"}${(Math.abs(row.drop) * 100).toFixed(1).replace(".", ",")}%</span>`
      : `<span class="fcol__drop is-top">topo</span>`;
    col.innerHTML =
      `<div class="fcol__val"><b>${fmtPct(row.conv)}</b><span>${fmtInt(row.step.volume)}</span></div>
       <div class="fcol__track">
         <div class="fcol__fill" style="height:${h}%;background:${funnelColor(row.i, steps.length)}"><img class="fcol__peek" src="${row.step.imageURL}" alt="" /></div>
       </div>
       ${dropTag}
       <div class="fcol__name" title="${row.step.name}">${row.i + 1}. ${row.step.name}</div>`;
    chart.appendChild(col);
  });
}

function wireFunnelChartInteractions(chart) {
  chart.querySelectorAll("[data-fstep]").forEach((node) => {
    const s = funnelSteps().find((x) => x.id === node.dataset.fstep);
    if (!s) return;
    node.classList.add("is-clickable");
    node.addEventListener("mouseenter", (e) => showFunnelPreview(s, e));
    node.addEventListener("mousemove", moveFunnelPreview);
    node.addEventListener("mouseleave", hideFunnelPreview);
    node.addEventListener("click", () => { hideFunnelPreview(); openFunnelLightbox(s.id); });
  });
}

/* ---- Hover preview (floating screenshot) ------------------ */
let _fpreview = null;
function fpreviewEl() {
  if (!_fpreview) {
    _fpreview = el("div", "funnel-preview");
    _fpreview.hidden = true;
    document.body.appendChild(_fpreview);
  }
  return _fpreview;
}
function showFunnelPreview(s, e) {
  if (document.querySelector(".funnel-item.is-dragging")) return;
  const p = fpreviewEl();
  p.innerHTML = `<img src="${s.imageURL}" alt="" /><span class="funnel-preview__cap">${s.name}${s.volume ? " · " + fmtInt(s.volume) + " acessos" : ""}</span>`;
  p.hidden = false;
  moveFunnelPreview(e);
}
function moveFunnelPreview(e) {
  const p = _fpreview; if (!p || p.hidden) return;
  const pad = 16, w = 240, h = 320;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth) x = e.clientX - w - pad;
  if (y + h > innerHeight) y = Math.max(pad, innerHeight - h - pad);
  p.style.left = x + "px"; p.style.top = y + "px";
}
function hideFunnelPreview() { if (_fpreview) _fpreview.hidden = true; }

/* ---- Lightbox (click a step to see its screenshot) -------- */
function openFunnelLightbox(id) {
  const steps = funnelSteps();
  const idx = steps.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const s = steps[idx];
  state.funnel.selectedId = id;
  const m = funnelMetrics()[idx];
  const ev = s.eventName ? state.events.find((e) => e.name === s.eventName) : null;
  const rows = [
    ["Volumetria", `${fmtInt(s.volume)} acessos`],
    ["Conversão do topo", m ? fmtPct(m.conv) : "—"],
    idx > 0 ? ["Passagem da etapa anterior", m ? `${(m.pass * 100).toFixed(1).replace(".", ",")}%` : "—"] : ["Posição", "Topo do funil"],
    ["Origem do dado", ev ? `${s.eventName} · ${s.metric === "count" ? "event_count" : "total_users"}` : "manual"],
  ];
  $("#funnel-lb-title").textContent = `${idx + 1}. ${s.name}`;
  $("#funnel-lb-img").src = s.imageURL;
  $("#funnel-lb-stats").innerHTML = rows.map(([k, v]) => `<div class="flb__row"><span>${k}</span><b>${v}</b></div>`).join("");
  const prev = $("#funnel-lb-prev"), next = $("#funnel-lb-next");
  prev.disabled = idx === 0; next.disabled = idx === steps.length - 1;
  prev.onclick = () => idx > 0 && openFunnelLightbox(steps[idx - 1].id);
  next.onclick = () => idx < steps.length - 1 && openFunnelLightbox(steps[idx + 1].id);
  $("#funnel-lightbox").hidden = false;
}
function closeFunnelLightbox() { $("#funnel-lightbox").hidden = true; state.funnel.selectedId = null; }

function addFunnelSteps(files) {
  const imgs = [...files].filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) { toast("Selecione arquivos de imagem (PNG, JPG ou WebP).", "error"); return; }
  Promise.all(imgs.map((f) => new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res({ id: "fs" + Date.now() + Math.random().toString(36).slice(2, 6), name: f.name.replace(/\.[^.]+$/, ""), file: f.name, imageURL: fr.result, volume: 0 });
    fr.readAsDataURL(f);
  }))).then((created) => {
    funnelSteps().push(...created);
    renderFunnel();
    toast(`${created.length} etapa(s) adicionada(s). Informe a volumetria de cada uma.`, "success");
  });
}

function removeFunnelStep(id) {
  const arr = funnelSteps(); const i = arr.findIndex((s) => s.id === id);
  if (i < 0) return;
  arr.splice(i, 1); renderFunnel();
}

function loadFunnelExample() {
  const svg = (label, tone) => "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='200'><rect width='120' height='200' fill='${tone}'/><rect x='14' y='20' width='92' height='24' rx='6' fill='#ffffff22'/><rect x='14' y='60' width='92' height='70' rx='8' fill='#ffffff14'/><rect x='14' y='150' width='92' height='30' rx='15' fill='#fbc10566'/></svg>`);
  const S = [
    ["Home", 120000, "#12203f"], ["Lista de produtos", 84000, "#182a52"],
    ["Detalhe do produto", 41000, "#20244a"], ["Carrinho", 22500, "#2a2140"],
    ["Checkout", 9800, "#3a2f12"],
  ];
  state.funnel.steps = S.map(([name, volume, tone], i) => ({ id: "fx" + i, name, file: name + ".png", imageURL: svg(name, tone), volume, eventName: null, metric: "users" }));
  renderFunnel();
  toast("Funil de exemplo carregado — arraste as etapas para reordenar e edite a volumetria.", "success", 4200);
}

/* Load a spreadsheet from within the funnel panel (shares state.events). */
async function loadFunnelSpreadsheet(file) {
  await loadSpreadsheet(file);      // parses + fills state.events, shows its own toast
  syncFunnelBindings();
  if (state.mode === "funnel") renderFunnel();
}

/* ============================================================
   Controls
   ============================================================ */
function initControls() {
  $("#theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    renderRegions(); renderRank(); renderScroll();
    if (state.show.heatmap) drawHeatmap(1);
  });

  const tu = $("#total-users");
  tu.addEventListener("input", () => {
    const v = parseInt(tu.value.replace(/\D/g, ""), 10) || 0;
    state.totalUsers = v;
    $("#tu-echo").textContent = v ? fmtInt(v) : "—";
    tu.closest(".inputwrap").classList.toggle("is-ok", v > 0);
    renderInsights(); renderRegionDetail(state.selectedId); if (state.show.heatmap) drawHeatmap(1);
  });

  // Mode nav (Análise / Funil)
  $("#modenav").addEventListener("click", (e) => { const b = e.target.closest(".modenav__btn"); if (b) setMode(b.dataset.mode); });

  // Funnel: uploads + example
  const ffi = $("#funnel-fileinput"), fdz = $("#funnel-dropzone");
  ffi.addEventListener("change", () => { if (ffi.files.length) addFunnelSteps(ffi.files); ffi.value = ""; });
  ["dragover", "dragenter"].forEach((ev) => fdz.addEventListener(ev, (e) => { e.preventDefault(); fdz.classList.add("is-drag"); }));
  ["dragleave", "drop"].forEach((ev) => fdz.addEventListener(ev, (e) => { e.preventDefault(); fdz.classList.remove("is-drag"); }));
  fdz.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) addFunnelSteps(e.dataTransfer.files); });
  $("#funnel-empty-add").addEventListener("click", () => ffi.click());
  $("#funnel-example").addEventListener("click", loadFunnelExample);
  $("#funnel-empty-example").addEventListener("click", loadFunnelExample);

  // Funnel: spreadsheet source (event → step binding)
  const fdi = $("#funnel-data-fileinput");
  fdi.addEventListener("change", () => { if (fdi.files.length) loadFunnelSpreadsheet(fdi.files[0]); fdi.value = ""; });

  // Funnel: lightbox (click a step to see its screenshot)
  $("#funnel-lb-close").addEventListener("click", closeFunnelLightbox);
  $("#funnel-lightbox").addEventListener("click", (e) => { if (e.target.id === "funnel-lightbox") closeFunnelLightbox(); });

  // Layer show/hide toggles (Regiões / Heatmap)
  $("#layers").addEventListener("click", (e) => { const b = e.target.closest(".layer-toggle"); if (b) toggleLayer(b.dataset.layer); });
  $("#btn-heatmap").addEventListener("click", generateHeatmap);

  // Zoom controls
  $("#zoom-in").addEventListener("click", () => setZoom(state.zoom * 1.25, false));
  $("#zoom-out").addEventListener("click", () => setZoom(state.zoom / 1.25, false));
  $("#zoom-reset").addEventListener("click", () => setZoom(1, true));
  $("#zoom-fit").addEventListener("click", () => setZoom(1, true));
  $("#canvas").addEventListener("wheel", (e) => {
    if (!hasImage() || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 0.9), false);
  }, { passive: false });

  // Insight info tips
  $$(".card__info[data-tip]").forEach((btn) => {
    const tip = btn.closest(".card")?.querySelector(".card-tip");
    if (!tip) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = tip.hidden;
      $$(".card-tip").forEach((t) => (t.hidden = true));
      $$(".card__info").forEach((b) => b.classList.remove("is-open"));
      tip.hidden = !open;
      btn.classList.toggle("is-open", open);
    });
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest(".card__info") || e.target.closest(".card-tip")) return;
    $$(".card-tip").forEach((t) => (t.hidden = true));
    $$(".card__info").forEach((b) => b.classList.remove("is-open"));
  });

  // Heatmap range + opacity
  const radius = $("#heat-radius"), opacity = $("#heat-opacity");
  radius.addEventListener("input", () => {
    state.heat.radius = radius.value / 100; $("#heat-radius-val").textContent = radius.value + "%";
    if (state.show.heatmap) drawHeatmap(1);
  });
  opacity.addEventListener("input", () => {
    state.heat.opacity = opacity.value / 100; $("#heat-opacity-val").textContent = opacity.value + "%";
    if (state.show.heatmap) drawHeatmap(1);
  });
  $("#btn-download-heat").addEventListener("click", exportHeatmap);

  // Expand insight cards → modal
  $$(".card__expand[data-expand]").forEach((b) => b.addEventListener("click", () => openInsightModal(b.dataset.expand)));
  $("#insight-close").addEventListener("click", closeInsightModal);
  $("#export-close").addEventListener("click", closeExportModal);
  $("#export-dl").addEventListener("click", (e) => {
    // Drive the download via a fresh in-DOM anchor (reliable for large blobs / Firefox / Safari)
    e.preventDefault();
    if (!exportURL) return;
    triggerDownload(exportURL, exportName, false);
    toast("Baixando…", "success", 1600);
  });

  // Add-screen modal (print / Figma)
  const openAdd = (mode) => openAddModal(mode);
  $("#btn-figma").addEventListener("click", () => openAdd("figma"));
  $("#empty-figma").addEventListener("click", () => openAdd("figma"));
  $("#add-close").addEventListener("click", closeAddModal);
  $("#add-mode").addEventListener("click", (e) => { const b = e.target.closest(".segmented__btn"); if (b) setAddMode(b.dataset.mode); });
  $("#add-dropzone").addEventListener("click", () => $("#fileinput").click());
  $("#figma-import").addEventListener("click", figmaImport);
  $("#figma-embed-btn").addEventListener("click", figmaEmbedConnect);
  $("#figma-url").addEventListener("keydown", (e) => { if (e.key === "Enter") figmaEmbedConnect(); });
  $("#figma-refresh").addEventListener("click", refreshFigma);

  // Backdrop click + Esc close modals
  $$(".modal-backdrop").forEach((m) => m.addEventListener("mousedown", (e) => { if (e.target === m) m.hidden = true; }));

  $("#btn-clear").addEventListener("click", () => {
    if (!regions().length) { toast("Não há posições para remover.", "info"); return; }
    const c = regions().length; curScreen().regions = [];
    state.selectedId = state.hoverId = null; state.show.heatmap = false; applyLayers();
    renderRegions(); renderEvents(); renderInsights(); updateCounters();
    toast(`${c} posições removidas desta tela.`, "success");
  });

  // Image upload paths
  const fi = $("#fileinput"), dz = $("#dropzone");
  fi.addEventListener("change", () => { if (fi.files.length) addImages(fi.files); fi.value = ""; });
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
  dz.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) addImages(e.dataTransfer.files); });

  // Canvas empty state
  $("#empty-add-image").addEventListener("click", () => fi.click());
  $("#empty-example").addEventListener("click", loadExample);
  const ce = $("#canvas-empty");
  ["dragover", "dragenter"].forEach((ev) => ce.addEventListener(ev, (e) => { e.preventDefault(); ce.classList.add("is-drag"); }));
  ["dragleave", "drop"].forEach((ev) => ce.addEventListener(ev, (e) => { e.preventDefault(); ce.classList.remove("is-drag"); }));
  ce.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) addImages(e.dataTransfer.files); });

  // Spreadsheet upload
  $("#excelinput").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) loadSpreadsheet(f); e.target.value = ""; });

  $("#btn-merge").addEventListener("click", mergeScreens);

  // Redraw heatmap when the image finishes loading (size known)
  screenImg.addEventListener("load", () => { applyZoom(true); syncHighlight(); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideFunnelPreview();
      const openModal = $$(".modal-backdrop").find((m) => !m.hidden);
      if (openModal) { openModal.hidden = true; return; }
      state.armedEvent = null; stage.classList.remove("is-armed"); overlay.classList.remove("is-drawing"); selectRegion(null); renderEvents();
    }
    if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId && e.target === document.body) { e.preventDefault(); removeRegion(state.selectedId); }
  });

  addEventListener("resize", () => { if (hasImage()) applyZoom(false); else if (hasFigmaEmbed()) sizeFigmaFrame(); });
}

/* Staggered reveal for the insight cards */
function initReveal() {
  $$(".reveal").forEach((n, i) => { if (reduceMotion) { n.classList.add("in"); return; } n.style.animationDelay = i * 70 + 60 + "ms"; requestAnimationFrame(() => n.classList.add("in")); });
}

/* ============================================================
   Boot
   ============================================================ */
function boot() { renderAll(); initControls(); initReveal(); }
boot();

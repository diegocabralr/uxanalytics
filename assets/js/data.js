/* ============================================================
   Data layer for UX Analytics.
   Nothing is hardcoded: screens come from uploaded images and
   events come from an uploaded spreadsheet (.xlsx / .csv).
   Anchoring is by component — each region binds one event.
   ============================================================ */

/* Chart color tokens, resolved live from CSS so themes stay in sync. */
export function chartColor(i) {
  const n = ((i - 1) % 20) + 1;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--chart-${String(n).padStart(2, "0")}`)
    .trim();
  return v || "#FBC105";
}

/* Events with no visual element → screen-level bucket, out of the
   per-component ranking (per the platform spec §7.1). */
const MACRO = new Set([
  "page_view", "screen_view", "scroll_depth", "session_start",
  "user_engagement", "first_visit", "first_open", "app_remove",
]);
export const isMacroName = (n) => MACRO.has(String(n).toLowerCase().trim());

/* ============================================================
   Spreadsheet parsing (dependency-free)
   ============================================================ */
export async function parseSpreadsheet(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return parseDelimited(await file.text());
  }
  return parseXlsx(await file.arrayBuffer());
}

/* ---- CSV / TSV -------------------------------------------- */
function parseDelimited(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.length);
  if (!lines.length) return { headers: [], rows: [] };
  const delim = detectDelim(lines[0]);
  const parseLine = (line) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}
function detectDelim(line) {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const c of line) if (c in counts) counts[c]++;
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ",";
}

/* ---- XLSX (ZIP + raw-deflate via DecompressionStream) ----- */
async function inflateRaw(u8) {
  if (typeof DecompressionStream === "undefined")
    throw new Error("Este navegador não descompacta .xlsx — exporte como .csv e tente de novo.");
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function parseXlsx(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const dec = new TextDecoder();

  // Locate End Of Central Directory
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Arquivo .xlsx inválido.");
  const cdOffset = dv.getUint32(eocd + 16, true);
  const cdCount = dv.getUint16(eocd + 10, true);

  const files = {};
  let p = cdOffset;
  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const fname = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    files[fname] = { method, compSize, localOff };
    p += 46 + nameLen + extraLen + commentLen;
  }

  const read = async (fname) => {
    const f = files[fname];
    if (!f) return null;
    const lo = f.localOff;
    const lnameLen = dv.getUint16(lo + 26, true);
    const lextraLen = dv.getUint16(lo + 28, true);
    const dataStart = lo + 30 + lnameLen + lextraLen;
    const comp = u8.subarray(dataStart, dataStart + f.compSize);
    return dec.decode(f.method === 0 ? comp : await inflateRaw(comp));
  };

  const sharedXml = await read("xl/sharedStrings.xml");
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  let sheetName = "xl/worksheets/sheet1.xml";
  if (!files[sheetName]) {
    sheetName = Object.keys(files).find((f) => /^xl\/worksheets\/.*\.xml$/.test(f)) || sheetName;
  }
  const sheetXml = await read(sheetName);
  if (!sheetXml) throw new Error("Planilha vazia ou ilegível.");
  return sheetToRows(sheetXml, shared);
}

function parseSharedStrings(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagName("si")].map((si) =>
    [...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
}

function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetToRows(xml, shared) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rows = [];
  for (const row of doc.getElementsByTagName("row")) {
    const arr = [];
    for (const c of row.getElementsByTagName("c")) {
      const ref = c.getAttribute("r") || "";
      const col = colIndex(ref.replace(/[0-9]/g, "")) || 0;
      const t = c.getAttribute("t");
      let val = "";
      if (t === "s") {
        const v = c.getElementsByTagName("v")[0];
        val = v ? shared[+v.textContent] || "" : "";
      } else if (t === "inlineStr") {
        const is = c.getElementsByTagName("t")[0];
        val = is ? is.textContent : "";
      } else {
        const v = c.getElementsByTagName("v")[0];
        val = v ? v.textContent : "";
      }
      arr[col] = val;
    }
    rows.push(arr);
  }
  const headers = (rows.shift() || []).map((h) => (h == null ? "" : String(h)));
  return { headers, rows };
}

/* ============================================================
   Column detection + event derivation
   ============================================================ */
export function detectColumns(headers) {
  const h = headers.map((x) => String(x).toLowerCase().trim());
  const find = (res, fallback) => {
    for (const re of res) { const i = h.findIndex((x) => re.test(x)); if (i >= 0) return i; }
    return fallback;
  };
  return {
    name: find([/^event_?name$/, /^evento$/, /event.*name|name.*event|evento|\bname\b|\bnome\b/], 0),
    count: find([/^event_?count$/, /count|contagem|eventos|quantidade|\bqtd\b|hits/], 1),
    total: find([/^total_?users$/, /total.*user|user.*total|usu[aá]rios|\busers\b/], -1),
  };
}

const toInt = (v) => {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

export function deriveEvents(rows, cols) {
  const countMap = new Map(), usersMap = new Map();
  let suggestedTotal = 0;
  for (const r of rows) {
    const name = String(r[cols.name] ?? "").trim();
    if (!name) continue;
    const count = toInt(r[cols.count]);
    countMap.set(name, (countMap.get(name) || 0) + count);
    if (cols.total >= 0) {
      const u = toInt(r[cols.total]);
      usersMap.set(name, Math.max(usersMap.get(name) || 0, u));
      suggestedTotal = Math.max(suggestedTotal, u);
    }
    if (/^screen_?view$/i.test(name) && !suggestedTotal) suggestedTotal = count;
  }
  const events = [...countMap.entries()]
    .map(([name, count]) => ({ name, count, users: usersMap.get(name) || 0, macro: isMacroName(name) }))
    .sort((a, b) => b.count - a.count);
  return { events, suggestedTotal };
}

/* ============================================================
   Derived metrics (counts come from a name→count map)
   ============================================================ */
export const countOf = (name, counts) => counts[name] || 0;

export function relevanceOf(region, totalUsers, counts) {
  return totalUsers > 0 ? countOf(region.event, counts) / totalUsers : 0;
}

export function ranking(regions, totalUsers, counts) {
  const rows = regions.map((r) => ({
    region: r,
    event: r.event,
    count: countOf(r.event, counts),
    relevance: relevanceOf(r, totalUsers, counts),
    area: r.w * r.h,
  }));
  rows.sort((a, b) => b.relevance - a.relevance);
  const total = rows.reduce((s, r) => s + r.relevance, 0) || 1;
  let acc = 0;
  rows.forEach((r) => { r.share = r.relevance / total; acc += r.share; r.cum = acc; });
  rows.cutIndex = rows.findIndex((r) => r.cum >= 0.8);
  rows.max = rows.length ? rows[0].relevance : 1;
  return rows;
}

export function concentration(regions, totalUsers, counts) {
  const vals = regions.map((r) => relevanceOf(r, totalUsers, counts)).filter((v) => v > 0);
  const n = vals.length;
  if (n < 2) return n === 1 ? 1 : 0;
  vals.sort((a, b) => a - b);
  const sum = vals.reduce((s, v) => s + v, 0);
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * vals[i];
  const gini = (2 * cum) / (n * sum) - (n + 1) / n;
  return Math.min(1, Math.max(0, gini));
}

export function concentrationLevel(g) {
  if (g >= 0.55) return { label: "Alta concentração", tone: "error" };
  if (g >= 0.35) return { label: "Concentração média", tone: "alert" };
  return { label: "Distribuição equilibrada", tone: "success" };
}

export function scrollModel(regions, totalUsers, counts) {
  const rows = ranking(regions, totalUsers, counts);
  const max = rows.max || 1;
  const pts = rows.map((r) => {
    const depth = r.region.y + r.region.h / 2;
    const rel = r.relevance / max;
    const expected = Math.exp(-1.8 * depth);
    const residual = rel - expected;
    return { region: r.region, event: r.event, depth, rel, expected, residual,
             anomaly: Math.abs(residual) > 0.32, positive: residual > 0 };
  });
  pts.hasAnomaly = pts.some((p) => p.anomaly);
  return pts;
}

export const fmtInt = (n) => Math.round(n).toLocaleString("pt-BR");
/* Adaptive decimals: no decimals for big values (≥100%), 1 casa entre
   1–100%, 2 casas abaixo de 1% — melhor leitura em toda a plataforma. */
export const fmtPct = (v) => {
  const p = v * 100;
  const d = p >= 100 ? 0 : p >= 1 ? 1 : p > 0 ? 2 : 0;
  return p.toFixed(d).replace(".", ",") + "%";
};

/* ============================================================
   Optional worked example (synthetic image + events)
   ============================================================ */
export function exampleData() {
  const svg = exampleSvg();
  const imageURL = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  const events = [
    ["select_acoes", 746000, 118400], ["select_etfs", 273400, 96200], ["select_tesouro", 270000, 94800],
    ["select_criptoativos", 183900, 71500], ["filtro_automatico", 178200, 88300], ["card_cdb_clear", 176300, 69100],
    ["filtro_longo_prazo", 160900, 82700], ["filtro_seguranca", 124500, 61200], ["hero_seguranca_click", 98700, 54900],
    ["maiores_altas", 88100, 47300], ["favoritos_view", 74300, 41100], ["search_open", 33600, 22800],
    ["page_view", 512000, 127000], ["screen_view", 127000, 127000], ["scroll_depth", 361000, 103500],
  ].map(([name, count, users]) => ({ name, count, users, macro: isMacroName(name) }));
  const R = (event, x, y, w, h) => ({ id: "r" + Math.random().toString(36).slice(2, 8), event, x, y, w, h });
  const screen = {
    id: "ex" + Date.now(),
    name: "Exemplo — Explorar",
    file: "explorar-exemplo.svg",
    imageURL, w: 340, h: 720, baseUsers: 127000,
    regions: [
      R("select_acoes", 0.044, 0.206, 0.212, 0.097),
      R("select_etfs", 0.277, 0.206, 0.212, 0.097),
      R("select_criptoativos", 0.508, 0.206, 0.212, 0.097),
      R("select_tesouro", 0.738, 0.206, 0.212, 0.097),
      R("filtro_longo_prazo", 0.044, 0.323, 0.263, 0.040),
      R("filtro_automatico", 0.325, 0.323, 0.263, 0.040),
      R("card_cdb_clear", 0.044, 0.566, 0.913, 0.091),
    ],
  };
  return { screen, events, suggestedTotal: 127000 };
}

function exampleSvg() {
  const card = (x, label) =>
    `<rect x="${x}" y="148" width="68" height="68" rx="12" fill="#ffffff0d" stroke="#ffffff12"/>
     <rect x="${x + 23}" y="164" width="22" height="22" rx="7" fill="#ffffff14"/>
     <text x="${x + 34}" y="205" text-anchor="middle" fill="#cdd3ea" font-size="9" font-family="sans-serif">${label}</text>`;
  const chip = (x, w, label, on) =>
    `<rect x="${x}" y="226" width="${w}" height="26" rx="13" fill="${on ? "#fff" : "#ffffff0d"}" stroke="#ffffff12"/>
     <text x="${x + w / 2}" y="243" text-anchor="middle" fill="${on ? "#121212" : "#cdd3ea"}" font-size="10" font-family="sans-serif">${label}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="720" viewBox="0 0 340 720">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0e1430"/><stop offset="1" stop-color="#090b1a"/></linearGradient>
      <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a2f12"/><stop offset="1" stop-color="#14131a"/></linearGradient></defs>
    <rect width="340" height="720" fill="url(#bg)"/>
    <text x="16" y="42" fill="#fff" font-size="12" font-weight="700" font-family="monospace">11:21</text>
    <text x="324" y="42" text-anchor="end" fill="#fff" font-size="12" font-family="monospace">100</text>
    <circle cx="28" cy="78" r="13" fill="#2a3566"/><text x="28" y="82" text-anchor="middle" fill="#fff" font-size="9" font-weight="700" font-family="sans-serif">DR</text>
    <text x="50" y="83" fill="#fff" font-size="13" font-weight="600" font-family="sans-serif">Diego</text>
    <rect x="14" y="104" width="312" height="34" rx="17" fill="#ffffff10"/>
    <rect x="17" y="107" width="150" height="28" rx="14" fill="#fff"/>
    <text x="92" y="125" text-anchor="middle" fill="#121212" font-size="11" font-weight="600" font-family="sans-serif">Swing Trade</text>
    <text x="245" y="125" text-anchor="middle" fill="#aeb6d6" font-size="11" font-family="sans-serif">Day Trade</text>
    ${card(14, "Ações")}${card(90, "ETFs")}${card(166, "Cripto")}${card(242, "Renda Fixa")}
    ${chip(14, 84, "Longo Prazo", true)}${chip(104, 84, "Automático", false)}${chip(196, 78, "Segurança", false)}
    <rect x="14" y="268" width="312" height="116" rx="14" fill="url(#hero)"/>
    <circle cx="300" cy="292" r="20" fill="#fbc10533"/>
    <text x="26" y="352" fill="#fff" font-size="13" font-weight="700" font-family="sans-serif">Segurança em</text>
    <text x="26" y="370" fill="#fff" font-size="13" font-weight="700" font-family="sans-serif">Renda Fixa</text>
    <rect x="14" y="396" width="312" height="64" rx="12" fill="#ffffff0d" stroke="#ffffff12"/>
    <text x="28" y="422" fill="#fff" font-size="12" font-weight="700" font-family="sans-serif">CDB PAGBANK</text>
    <text x="28" y="440" fill="#9aa2c4" font-size="9" font-family="sans-serif">FEV/2027 · Aplicação mínima</text>
    <text x="16" y="500" fill="#fff" font-size="12" font-weight="700" font-family="sans-serif">Acompanhe o mercado</text>
    ${chip(16, 96, "★ Favoritos", false).replace(/226/g, "512").replace(/243/g, "529")}
    ${chip(120, 96, "Maiores Altas", true).replace(/226/g, "512").replace(/243/g, "529")}
  </svg>`;
}

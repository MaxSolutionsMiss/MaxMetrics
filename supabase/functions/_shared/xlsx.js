// Reading a workbook, with nothing installed.
//
// An .xlsx is a ZIP of XML. The browser already has both halves of that — the ZIP is a
// container format anyone can walk, and `DecompressionStream` inflates the entries — so
// MaxMetrics reads the plant's spreadsheets without a parsing library, a CDN it has to
// stay reachable, or a build step. That matters more here than it sounds: the whole point
// of this project is that the file in the repository is the file the browser runs.
//
// What this does not do is worth stating plainly. It reads cell values, not formatting,
// formulas, charts or merged ranges. It has no opinion about which column means what —
// that lives in import.js — and none about dates: Excel stores those as numbers and only
// the caller knows which columns are supposed to be days.

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

const decoder = new TextDecoder();

// The end-of-central-directory record is the only fixed landmark in a ZIP, and it sits at
// the end behind a comment of unknown length, so it is found by scanning backwards.
function findEnd(view, bytes) {
  for (let at = bytes.length - 22; at >= 0 && at > bytes.length - 66000; at--) {
    if (view.getUint32(at, true) === SIG_EOCD) return at;
  }
  throw new Error('That file is not a workbook — no ZIP directory was found in it.');
}

function directory(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const end = findEnd(view, bytes);
  let at = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== SIG_CENTRAL) break;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, { method, compressed, localAt });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return { bytes, view, entries };
}

// The central directory records where an entry's *header* is, not where its bytes are, and
// the local header carries its own name and extra-field lengths. Trusting the central
// directory's copy of those is the classic way to read a workbook off by a few bytes.
async function extract(zip, name) {
  const entry = zip.entries.get(name);
  if (!entry) return null;
  const nameLength = zip.view.getUint16(entry.localAt + 26, true);
  const extraLength = zip.view.getUint16(entry.localAt + 28, true);
  const from = entry.localAt + 30 + nameLength + extraLength;
  const raw = zip.bytes.subarray(from, from + entry.compressed);
  if (entry.method === 0) return decoder.decode(raw);
  if (entry.method !== 8) throw new Error(`That workbook uses a compression this cannot read (method ${entry.method}).`);
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

// ── The XML ─────────────────────────────────────────────────────────────────────
//
// Scanned rather than parsed into a document. A single Data tab in the plant's DOR is
// 14,000 rows; building a DOM of every cell in it costs far more than walking the text
// once, and none of the structure is needed beyond "which row, which column, what value".

const unescapeXml = text => text.includes('&')
  ? text.replace(/&(?:lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, (whole, dec, hex) =>
      dec ? String.fromCodePoint(+dec) : hex ? String.fromCodePoint(parseInt(hex, 16))
      : ({ '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" })[whole])
  : text;

// One shared string can be several runs — Excel splits a cell the moment any of it is
// styled differently — so every <t> inside the <si> is part of the same value.
function sharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const [, block] of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = '';
    for (const [, run] of block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += run;
    out.push(unescapeXml(text));
  }
  return out;
}

// "BC7" → 54. Column letters are base-26 with no zero, which is why 'A' maps to 1.
export function columnOf(reference) {
  let n = 0;
  for (const ch of reference) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n;
}

export const letterOf = index => {
  let out = '', n = index;
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = (n - r - 1) / 26; }
  return out;
};

// Excel keeps a day as a count from 1900, with a deliberate bug: it believes 1900 was a
// leap year, so everything from March onwards is one too high and the epoch is offset to
// compensate. Serials below 61 are the days that bug affects and are not worth guessing at.
export function serialToDate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 61) return null;
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  return Number.isNaN(+d) ? null : d;
}

export const serialToISO = value => {
  const d = serialToDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
};

function readSheet(xml, strings) {
  const rows = [];
  for (const [, attributes, body] of xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    const at = /\br="(\d+)"/.exec(attributes);
    const cells = [];
    for (const [, cellAttrs, cellBody] of body.matchAll(/<c([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cellAttrs);
      const type = /\bt="([^"]+)"/.exec(cellAttrs)?.[1];
      const index = ref ? columnOf(ref[1]) : cells.length + 1;
      let value = null;
      if (cellBody != null) {
        if (type === 'inlineStr') {
          let text = '';
          for (const [, run] of cellBody.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += run;
          value = unescapeXml(text);
        } else {
          // A formula cell carries both <f> and <v>; only the cached result is wanted, and
          // taking the first <v> would otherwise pick up whatever the formula string held.
          const raw = /<v[^>]*>([\s\S]*?)<\/v>/.exec(cellBody)?.[1];
          if (raw != null) {
            if (type === 's') value = strings[Number(raw)] ?? '';
            else if (type === 'e') value = null;           // #DIV/0! and friends are absence
            else if (type === 'b') value = raw === '1';
            else if (type === 'str') value = unescapeXml(raw);
            else { const n = Number(raw); value = Number.isFinite(n) ? n : unescapeXml(raw); }
          }
        }
      }
      cells[index - 1] = value;
    }
    rows[(at ? Number(at[1]) : rows.length + 1) - 1] = cells;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

// ── The workbook ────────────────────────────────────────────────────────────────

// Sheets are named in workbook.xml and located in its relationships file, and the two are
// joined by an r:id. Guessing that "the third sheet is sheet3.xml" is wrong often enough
// to matter: deleting a tab leaves the numbering alone.
export async function openWorkbook(buffer) {
  const zip = directory(buffer);
  const [book, rels, sharedXml] = await Promise.all([
    extract(zip, 'xl/workbook.xml'),
    extract(zip, 'xl/_rels/workbook.xml.rels'),
    extract(zip, 'xl/sharedStrings.xml'),
  ]);
  if (!book) throw new Error('That file is not an Excel workbook.');

  const targets = new Map();
  for (const [, id, target] of (rels || '').matchAll(/<Relationship([^>]*)\/>/g)
      .map(m => [m[0], /Id="([^"]+)"/.exec(m[1])?.[1], /Target="([^"]+)"/.exec(m[1])?.[1]])) {
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const sheets = [];
  for (const [, attributes] of book.matchAll(/<sheet([^>]*)\/>/g)) {
    const name = unescapeXml(/name="([^"]*)"/.exec(attributes)?.[1] ?? '');
    const id = /r:id="([^"]+)"/.exec(attributes)?.[1];
    const path = targets.get(id);
    if (name && path) sheets.push({ name, path: `xl/${path}` });
  }

  const strings = sharedStrings(sharedXml);
  const cache = new Map();

  return {
    sheetNames: sheets.map(s => s.name),
    // Read on demand. The plant's DOR is eleven megabytes across eighteen tabs and only
    // three of them are wanted; inflating the rest would be most of the work for none of
    // the answer.
    async rows(name) {
      if (cache.has(name)) return cache.get(name);
      const sheet = sheets.find(s => s.name === name)
                 ?? sheets.find(s => s.name.trim().toLowerCase() === String(name).trim().toLowerCase());
      if (!sheet) return null;
      const xml = await extract(zip, sheet.path);
      const rows = xml ? readSheet(xml, strings) : [];
      cache.set(name, rows);
      return rows;
    },
  };
}

/* ============================================================
   ETF ENTRY STORE — localStorage-backed user entries
   ============================================================ */

const ETF_STORE_KEY = "btc-flow-desk:etf-entries:v1";

// Use local-date getters (not UTC) so dates never shift by timezone.
// localKey("2026-05-14") and new Date(2026,4,14) both produce "2026-05-14".
function localKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// Parse a "YYYY-MM-DD" string as local midnight (avoids UTC-midnight timezone shift).
function parseLocalDate(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(ETF_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(e => ({ ...e, date: parseLocalDate(e.date) }));
  } catch { return []; }
}

function saveEntries(entries) {
  const serialized = entries.map(e => ({ ...e, date: localKey(e.date) }));
  localStorage.setItem(ETF_STORE_KEY, JSON.stringify(serialized));
}

// Pub/sub so multiple components react to writes within the same tab
const _listeners = new Set();
function _emit() { _listeners.forEach(fn => { try { fn(); } catch {} }); }

function addEntry({ date, ibit, others }) {
  const entries = loadEntries();
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  const key = localKey(d);
  const filtered = entries.filter(e => localKey(e.date) !== key);
  filtered.push({ date: d, ibit: parseFloat(ibit), others: parseFloat(others) });
  filtered.sort((a, b) => a.date - b.date);
  saveEntries(filtered);
  _emit();
}

function removeEntry(dateStr) {
  const entries = loadEntries().filter(e => localKey(e.date) !== dateStr.slice(0, 10));
  saveEntries(entries);
  _emit();
}

function classifySignal(total) {
  if (total > 400)  return "STRONG IN";
  if (total > 60)   return "IN";
  if (total < -300) return "STRONG OUT";
  if (total < -50)  return "OUT";
  return "NEUTRAL";
}

// Returns the merged ETF history: mock baseline + user entries (user wins on date conflict)
function getMergedEtfHistory() {
  const userEntries = loadEntries();
  const userByDate = new Map();
  for (const e of userEntries) {
    userByDate.set(localKey(e.date), e);
  }
  const merged = window.MOCK_DATA.etfHistory.map(s => {
    const key = localKey(s.date);
    if (userByDate.has(key)) {
      const u = userByDate.get(key);
      const total = u.ibit + u.others;
      userByDate.delete(key);
      return { date: s.date, ibit: u.ibit, others: u.others, total, signal: classifySignal(total), userEntry: true };
    }
    return s;
  });
  // Append remaining user entries (dates not in mock)
  for (const [, e] of userByDate) {
    const total = e.ibit + e.others;
    merged.push({ date: e.date, ibit: e.ibit, others: e.others, total, signal: classifySignal(total), userEntry: true });
  }
  merged.sort((a, b) => a.date - b.date);
  return merged;
}

function computeAggregates(history) {
  const ibitFlows = history.map(s => s.ibit);
  const last30 = ibitFlows.slice(-30);
  const last14 = ibitFlows.slice(-14);
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avg30 = avg(last30);
  const avg14 = avg(last14);
  const buyDominance = Math.round((last30.filter(v => v > 0).length / Math.max(1, last30.length)) * 100);
  const posSum = last30.filter(v => v > 0).reduce((a, b) => a + b, 0);
  const negSum = Math.abs(last30.filter(v => v < 0).reduce((a, b) => a + b, 0));
  const buySellRatio = negSum > 0 ? (posSum / negSum).toFixed(2) : "∞";
  const streak5 = history.slice(-5).map(s => s.ibit > 0 ? "up" : s.ibit < 0 ? "down" : "flat");
  return { avg30, avg14, buyDominance, buySellRatio, streak5, lastEtf: history[history.length - 1] };
}

// React hook — subscribe to store changes
function useEtfStore() {
  const { useState, useEffect } = React;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick(t => t + 1);
    _listeners.add(fn);
    // Also listen for cross-tab updates
    const storageFn = (e) => { if (e.key === ETF_STORE_KEY) fn(); };
    window.addEventListener("storage", storageFn);
    return () => { _listeners.delete(fn); window.removeEventListener("storage", storageFn); };
  }, []);
  const history = getMergedEtfHistory();
  const agg = computeAggregates(history);
  const userEntries = loadEntries();
  return { history, ...agg, userEntries, addEntry, removeEntry };
}

// Fetch + parse the Farside ETF flow table via a CORS proxy.
// Returns array of { date: "YYYY-MM-DD", ibit, others } in millions.
async function fetchFarsideFlows() {
  const target = 'https://farside.co.uk/btc/';
  const res = await fetch(`/proxy?url=${encodeURIComponent(target)}`);
  if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, 'text/html');
  // The page has multiple tables; target the one with class "etf"
  const table = doc.querySelector('table.etf') || doc.querySelector('table');
  if (!table) throw new Error('No table found — Farside page structure may have changed');

  const rows = Array.from(table.querySelectorAll('tr'));

  // Header spans 3 rows (logo row, ticker row, fee row). Find the row with "IBIT".
  let ibitIdx = -1, dataStartRow = 1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const cells = Array.from(rows[i].querySelectorAll('th,td'));
    const idx = cells.findIndex(c => c.textContent.trim().toUpperCase() === 'IBIT');
    if (idx >= 0) { ibitIdx = idx; dataStartRow = i + 1; break; }
  }
  if (ibitIdx < 0) throw new Error('IBIT column not found');
  // Total is always the last column; its header cell is empty in the ticker row
  const totalIdx = Array.from(rows[0].querySelectorAll('th,td')).length - 1;

  // Negatives use accounting parentheses: (177.9) → -177.9
  const parseFlow = (s) => {
    const clean = s.replace(/,/g, '').trim();
    if (!clean || clean === '-' || clean === '—') return 0;
    const neg = clean.startsWith('(') && clean.endsWith(')');
    const n = parseFloat(clean.replace(/[()]/g, ''));
    return isFinite(n) ? (neg ? -n : n) : 0;
  };

  const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const parseDate = (s) => {
    s = s.trim();
    // "14 May 2026"
    const m1 = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m1) {
      const mo = MONTHS[m1[2].toLowerCase().slice(0, 3)];
      return mo ? `${m1[3]}-${String(mo).padStart(2,'0')}-${m1[1].padStart(2,'0')}` : null;
    }
    // "14/05/2026" (DD/MM/YYYY — Farside is UK-based)
    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m2) return `${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
    return null;
  };

  const entries = [];
  for (const row of rows.slice(dataStartRow)) {
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length <= Math.max(ibitIdx, totalIdx)) continue;
    const isoDate = parseDate(cells[0].textContent);
    if (!isoDate) continue;
    const ibit  = parseFlow(cells[ibitIdx].textContent);
    const total = parseFlow(cells[totalIdx].textContent);
    entries.push({ date: isoDate, ibit, others: parseFloat((total - ibit).toFixed(1)) });
  }

  if (!entries.length) throw new Error('No rows parsed — Farside layout may have changed');
  return entries;
}

window.ETFStore = { useEtfStore, addEntry, removeEntry, loadEntries, getMergedEtfHistory, computeAggregates, fetchFarsideFlows };

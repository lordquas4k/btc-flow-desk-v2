/* ============================================================
   LIVE DATA — Coinbase spot WS + Deribit options REST
   ============================================================ */

const { useState: useStateL, useEffect: useEffectL, useRef: useRefL } = React;

// ------------------------------------------------------------
// Black–Scholes gamma (needed because Deribit's book summary
// endpoint doesn't include greeks for every instrument)
// ------------------------------------------------------------
function bsGamma(S, K, T, sigma, r = 0.05) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const phi = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
  return phi / (S * sigma * Math.sqrt(T));
}

// ------------------------------------------------------------
// Parse Deribit instrument names: BTC-16MAY26-80000-C
// ------------------------------------------------------------
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
function parseInstrument(name) {
  const m = name.match(/^BTC-(\d+)([A-Z]{3})(\d+)-(\d+)-(C|P)$/);
  if (!m) return null;
  const [, dd, mmm, yy, strike, type] = m;
  const year = parseInt(yy) < 70 ? 2000 + parseInt(yy) : 1900 + parseInt(yy);
  const expiryDate = new Date(Date.UTC(year, MONTHS[mmm], parseInt(dd), 8, 0, 0));
  return {
    expiry: `${dd}${mmm}${yy}`,
    expiryDate,
    strike: parseInt(strike),
    type: type === "C" ? "call" : "put"
  };
}

// ------------------------------------------------------------
// Compute metrics from a Deribit book summary array
// ------------------------------------------------------------
function computeMetrics(books, spot) {
  if (!spot || !books || books.length === 0) return null;
  const now = Date.now();

  // 1) Parse + filter + enrich each book with gamma
  const all = [];
  for (const b of books) {
    const p = parseInstrument(b.instrument_name);
    if (!p) continue;
    const T = (p.expiryDate.getTime() - now) / (365.25 * 24 * 60 * 60 * 1000);
    if (T <= 0) continue;
    const oi = b.open_interest || 0;
    if (oi <= 0) continue;
    const iv = (b.mark_iv || 0) / 100;
    const gamma = bsGamma(spot, p.strike, T, iv);
    all.push({ ...p, oi, iv, gamma, T });
  }
  if (all.length === 0) return null;

  // 2) Find nearest weekly expiry (the soonest future expiry)
  const expiries = [...new Set(all.map(x => x.expiry))]
    .map(e => ({ str: e, date: all.find(x => x.expiry === e).expiryDate }))
    .sort((a, b) => a.date - b.date);
  const nearestExpiry = expiries[0].str;
  const nearestDate = expiries[0].date;

  // 3) Restrict to the nearest expiry for the weekly metrics
  const weekly = all.filter(x => x.expiry === nearestExpiry);

  // 4) OI by strike (within ±15% of spot for display)
  const strikeMap = new Map();
  for (const x of weekly) {
    if (!strikeMap.has(x.strike)) strikeMap.set(x.strike, { strike: x.strike, call: 0, put: 0 });
    if (x.type === "call") strikeMap.get(x.strike).call += x.oi;
    else                   strikeMap.get(x.strike).put += x.oi;
  }
  const allByStrike = [...strikeMap.values()].sort((a, b) => a.strike - b.strike);
  const minK = spot * 0.85;
  const maxK = spot * 1.15;
  const oiByStrike = allByStrike.filter(x => x.strike >= minK && x.strike <= maxK);

  // 5) Totals + PCR
  const callOI = weekly.filter(x => x.type === "call").reduce((s, x) => s + x.oi, 0);
  const putOI = weekly.filter(x => x.type === "put").reduce((s, x) => s + x.oi, 0);
  const pcr = callOI > 0 ? putOI / callOI : 0;

  // 6) Walls — strike with biggest single-side OI (calls must be above spot, puts below)
  let callWall = 0, callWallOI = 0;
  let putWall = 0, putWallOI = 0;
  for (const s of allByStrike) {
    if (s.strike > spot && s.call > callWallOI) { callWallOI = s.call; callWall = s.strike; }
    if (s.strike < spot && s.put  > putWallOI)  { putWallOI  = s.put;  putWall  = s.strike; }
  }

  // 7) GEX (SpotGamma-style assumption: dealers short calls, long puts)
  //    Deribit BTC options: 1 contract = 1 BTC (no equity 100x multiplier)
  //    gex_strike = (call_gamma * call_OI − put_gamma * put_OI) * S²
  const strikeGEX = new Map();
  for (const x of weekly) {
    const contrib = x.gamma * x.oi * spot * spot * (x.type === "call" ? 1 : -1);
    strikeGEX.set(x.strike, (strikeGEX.get(x.strike) || 0) + contrib);
  }
  const totalGEX = [...strikeGEX.values()].reduce((s, v) => s + v, 0);
  const gex = totalGEX / 1e9; // billions

  // 8) Gamma Flip — cumulative GEX zero-crossing from below
  const sortedStrikes = [...strikeGEX.keys()].sort((a, b) => a - b);
  let gammaFlip = null;
  let cum = 0, prevCum = 0, prevK = sortedStrikes[0];
  for (const k of sortedStrikes) {
    prevCum = cum;
    cum += strikeGEX.get(k);
    if ((prevCum < 0 && cum >= 0) || (prevCum > 0 && cum <= 0)) {
      const frac = Math.abs(prevCum) / (Math.abs(prevCum) + Math.abs(cum));
      gammaFlip = Math.round(prevK + (k - prevK) * frac);
      break;
    }
    prevK = k;
  }
  if (gammaFlip === null) {
    // Fallback: largest |GEX| strike near spot
    let maxAbs = 0, maxKK = spot;
    for (const [k, v] of strikeGEX) {
      if (Math.abs(v) > maxAbs && Math.abs(k - spot) < spot * 0.10) { maxAbs = Math.abs(v); maxKK = k; }
    }
    gammaFlip = Math.round(maxKK);
  }

  // 9) Max Pain — strike that minimises total ITM intrinsic value
  let minPain = Infinity, maxPainStrike = spot;
  for (const k of sortedStrikes) {
    let pain = 0;
    for (const x of weekly) {
      if (x.type === "call") pain += Math.max(k - x.strike, 0) * x.oi;
      else                   pain += Math.max(x.strike - k, 0) * x.oi;
    }
    if (pain < minPain) { minPain = pain; maxPainStrike = k; }
  }

  // 10) IV skew — average call IV vs average put IV (weighted by OI)
  const callsW = weekly.filter(x => x.type === "call");
  const putsW  = weekly.filter(x => x.type === "put");
  const avgIVw = (arr) => {
    const tot = arr.reduce((s, x) => s + x.oi, 0);
    if (tot === 0) return 0;
    return arr.reduce((s, x) => s + x.iv * x.oi, 0) / tot * 100; // percent
  };
  const callIV = avgIVw(callsW);
  const putIV  = avgIVw(putsW);

  return {
    nearestExpiry, nearestDate,
    gex, gammaFlip, pcr: parseFloat(pcr.toFixed(2)),
    callWall, callWallOI,
    putWall,  putWallOI,
    maxPain: maxPainStrike,
    callOI, putOI, totalOI: callOI + putOI,
    oiByStrike,
    callIV, putIV,
    spotUsed: spot
  };
}

// ------------------------------------------------------------
// Coinbase WS hook — real-time spot
// ------------------------------------------------------------
function useLiveSpot(enabled) {
  const [spot, setSpot] = useStateL(null);
  const [change, setChange] = useStateL(0);
  const [status, setStatus] = useStateL("off"); // off | connecting | connected | error
  const wsRef = useRefL(null);

  useEffectL(() => {
    if (!enabled) {
      if (wsRef.current) { try { wsRef.current.close(); } catch (e) {} wsRef.current = null; }
      setStatus("off");
      setSpot(null);
      return;
    }
    setStatus("connecting");
    let ws;
    try {
      ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
    } catch (e) {
      setStatus("error");
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "subscribe",
        channels: [{ name: "ticker", product_ids: ["BTC-USD"] }]
      }));
      setStatus("connected");
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "ticker" && d.price) {
          const price = parseFloat(d.price);
          setSpot(price);
          if (d.open_24h) {
            const open = parseFloat(d.open_24h);
            if (open > 0) setChange(((price - open) / open) * 100);
          }
        }
      } catch (_) {}
    };
    ws.onerror = () => setStatus("error");
    ws.onclose = () => { if (wsRef.current === ws) setStatus("off"); };

    return () => { try { ws.close(); } catch (e) {} wsRef.current = null; };
  }, [enabled]);

  return { spot, change, status };
}

// ------------------------------------------------------------
// Deribit REST hook — full BTC option book + computed metrics
// Auto-refreshes every 5 min while enabled
// ------------------------------------------------------------
function useLiveOptions(spot, enabled) {
  const [data, setData] = useStateL(null);
  const [status, setStatus] = useStateL("idle"); // idle | loading | live | error
  const [lastUpdate, setLastUpdate] = useStateL(null);
  const [error, setError] = useStateL(null);
  const refresh = useRefL(null);

  const fetchData = async (curSpot) => {
    if (!curSpot) return;
    setStatus("loading");
    setError(null);
    try {
      const url = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option";
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (!j.result) throw new Error("No result in response");
      const metrics = computeMetrics(j.result, curSpot);
      if (!metrics) throw new Error("Empty metrics");
      setData(metrics);
      setLastUpdate(new Date());
      setStatus("live");
    } catch (e) {
      console.error("Deribit fetch failed:", e);
      setError(e.message || String(e));
      setStatus("error");
    }
  };
  refresh.current = () => fetchData(spot);

  useEffectL(() => {
    if (!enabled || !spot) { setData(null); setStatus("idle"); return; }
    fetchData(spot);
    const id = setInterval(() => fetchData(spot), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [enabled, spot ? Math.round(spot / 100) : 0]); // re-fetch only if spot moves >= $100

  return { data, status, lastUpdate, error, refresh: () => fetchData(spot) };
}

window.LIVE = { useLiveSpot, useLiveOptions, computeMetrics };

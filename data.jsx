/* ============================================================
   DATA — BTC Flow Desk
   ETF history: real Glassnode data via TradingView MCP
   Last pull: 16 May 2026 · Glassnode has ~2-3 day delay
   Latest available session: 13 May 2026
   Options/levels: update manually or enable Live mode (Deribit)
   ============================================================ */

const DATA = (() => {

  // ── Real ETF sessions from Glassnode (IBIT + Total USD flows)
  // others = total − IBIT, all values converted to millions (1dp)
  // Good Friday (Apr 3) excluded — markets closed
  // ⚠ Data ends May 13 — add May 14, 15 via ETF Flows → Daily Entry
  const rawSessions = [
    // [year, month0, day, ibitUSD, totalUSD]
    [2026, 2, 16,  139180103,  217161491],
    [2026, 2, 17,  168973669,  179209859],
    [2026, 2, 18,  -33832413, -164575429],
    [2026, 2, 19,  -38240156,  -79184128],
    [2026, 2, 20,  -46131422,  -65880996],
    [2026, 2, 23,  160230733,  186480488],
    [2026, 2, 24,   -4716156,  -80559091],
    [2026, 2, 25,  -70671732,  -61616573],
    [2026, 2, 26,  -41931687,  -66229407],
    [2026, 2, 27, -202024445, -234214783],
    [2026, 2, 30,    7538012,   37638889],
    [2026, 2, 31,   98379930,  108645475],
    [2026, 3,  1,  -86521996, -168274389],
    [2026, 3,  2,   -3038724,  116994402],
    [2026, 3,  6,  181827518,  297489425],
    [2026, 3,  7,  -28754400, -130300183],
    [2026, 3,  8,   40420820,  -87353395],
    [2026, 3,  9,  269756312,  341391427],
    [2026, 3, 10,  137851902,  170771366],
    [2026, 3, 13,   34924212,  -54441148],
    [2026, 3, 14,  213779845,  171264989],
    [2026, 3, 15,  292477151,  247890991],
    [2026, 3, 16,   81997630,  189155001],
    [2026, 3, 17,  284444640,  462229499],
    [2026, 3, 20,  256052753,  282507026],
    [2026, 3, 21,   39118987,   18569377],
    [2026, 3, 22,  246694770,  319904927],
    [2026, 3, 23,  167427676,  225998347],
    [2026, 3, 24,   22883275,    5632236],
    [2026, 3, 27,          0, -209260248],
    [2026, 3, 28, -112480948, -136949025],
    [2026, 3, 29,  -54792297, -129290379],
    [2026, 3, 30,   19052022,   43991179],
    [2026, 4,  1,  284189307,  573275092],
    [2026, 4,  4,  335618972,  557155265],
    [2026, 4,  5,  251547935,  451295860],
    [2026, 4,  6,  122780979,   42842186],
    [2026, 4,  7,  -98078433, -259727568],
    [2026, 4,  8,  -27252429, -172483349],
    [2026, 4, 11,   -7428281,    3284896],
    [2026, 4, 12,  -32966336, -235100142],
    [2026, 4, 13, -285075702, -600855812],
  ];

  const toM = v => Math.round(v / 1e5) / 10;

  const etfHistory = rawSessions.map(([y, mo, d, ibitUSD, totalUSD]) => {
    const ibit   = toM(ibitUSD);
    const others = toM(totalUSD - ibitUSD);
    const total  = toM(totalUSD);
    let signal = "NEUTRAL";
    if (total > 400) signal = "STRONG IN";
    else if (total > 60) signal = "IN";
    else if (total < -300) signal = "STRONG OUT";
    else if (total < -50) signal = "OUT";
    return { date: new Date(y, mo, d), ibit, others, total, signal };
  });

  const lastEtf = etfHistory[etfHistory.length - 1];

  // -- aggregates
  const ibitFlows  = etfHistory.map(s => s.ibit);
  const last30     = ibitFlows.slice(-30);
  const last14     = ibitFlows.slice(-14);
  const avg        = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const avg30      = avg(last30);
  const avg14      = avg(last14);
  const posCount30 = last30.filter(v => v > 0).length;
  const buyDominance  = Math.round((posCount30 / 30) * 100);
  const posSum30   = last30.filter(v => v > 0).reduce((a, b) => a + b, 0);
  const negSum30   = Math.abs(last30.filter(v => v < 0).reduce((a, b) => a + b, 0));
  const buySellRatio = (posSum30 / negSum30).toFixed(2);
  const streak5    = etfHistory.slice(-5).map(s => s.ibit > 0 ? "up" : s.ibit < 0 ? "down" : "flat");

  // -- Expiry label helper: next Friday on or after session date (weekly options expire Fridays)
  const toExpiryLabel = (d) => {
    const daysToFri = d.getDay() === 5 ? 0 : (5 - d.getDay() + 7) % 7;
    const fri = new Date(d);
    fri.setDate(d.getDate() + daysToFri);
    const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${fri.getDate()}${M[fri.getMonth()]}${String(fri.getFullYear()).slice(2)}`;
  };

  // -- Options chain history (mock — live Deribit feed overrides current values)
  // GEX arc: starts mild positive → peaks ~+0.05 mid-period → fades to ~-0.04 at end,
  // so the manual curOpt override of -0.05 is a natural continuation of the trend.
  const baseDate = new Date(2026, 4, 13); // anchor for opt history dates
  const optHistory = [];
  let baseGex = 0.025;
  for (let i = 0; i < 30; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() - (29 - i));
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    const noise = (Math.sin(i * 0.6) + Math.cos(i * 0.9)) * 0.01;
    const phase = i / 29;
    baseGex = Math.max(-0.06, Math.min(0.08, 0.055 * Math.sin(phase * Math.PI) - 0.05 * phase + 0.005 + noise));
    const pcr = 0.5 + (Math.sin(i * 0.4) + 1.2) * 0.45 + (i < 8 ? 0.7 : 0);
    optHistory.push({
      date: d,
      expiry: toExpiryLabel(d),
      type: "Weekly",
      gex: baseGex,
      gammaFlip: 80000 + Math.round(Math.sin(i * 0.2) * 600),
      putWall:   76000 + Math.round(Math.cos(i * 0.3) * 800) - (i < 10 ? 1000 : 0),
      callWall:  83000 + Math.round(Math.sin(i * 0.25) * 500) + (i > 18 ? 1000 : 0),
      pcr: parseFloat(pcr.toFixed(2)),
      bias: pcr < 0.7 ? "Bullish" : pcr > 1.5 ? "Bearish" : "Neutral"
    });
  }

  // -- session stats
  const session = {
    date: new Date(2026, 4, 16),
    spot: 78029,
    spotChange: -0.21,
    btcChange: -165
  };

  // -- Open Interest by Strike (mock — update with live Deribit data or use Live mode)
  // Layout: puts concentrated BELOW spot = support (dealers buy BTC to hedge short puts)
  //         calls concentrated ABOVE spot = resistance (dealers sell BTC to hedge short calls)
  // Dominant put wall  → S1 (most put OI below spot)
  // Secondary put wall → S2, S3
  // Dominant call wall → R1 (most call OI above spot)
  // Secondary call wall→ R2, R3
  const oiByStrike = [
    { strike: 70000, call:  0, put: 28 },
    { strike: 71000, call:  0, put: 35 },  // S3 — third put peak
    { strike: 72000, call:  0, put: 26 },
    { strike: 73000, call:  0, put: 62 },  // S2 — second put peak (~$3.5k below S1)
    { strike: 74000, call:  0, put: 38 },
    { strike: 75000, call:  2, put: 22 },
    { strike: 76000, call:  5, put: 28 },
    { strike: 76500, call:  8, put: 96 },  // S1 — dominant put wall, closest to spot
    { strike: 77000, call: 12, put: 44 },
    { strike: 77500, call: 16, put: 32 },
    { strike: 78000, call: 20, put: 26 },  // near ATM
    { strike: 78500, call: 23, put: 18 },
    { strike: 79000, call: 21, put: 12 },
    { strike: 79500, call: 18, put:  7 },
    { strike: 80000, call: 29, put:  5 },  // gamma flip zone
    { strike: 80500, call: 26, put:  2 },
    { strike: 81000, call: 33, put:  1 },
    { strike: 82000, call: 46, put:  0 },
    { strike: 83000, call: 91, put:  0 },  // R1 — dominant call wall
    { strike: 84000, call: 64, put:  0 },
    { strike: 85000, call: 53, put:  0 },
    { strike: 86000, call: 70, put:  0 },  // R2
    { strike: 87000, call: 42, put:  0 },
    { strike: 88000, call: 34, put:  0 },
    { strike: 90000, call: 58, put:  0 },  // R3
    { strike: 95000, call: 30, put:  0 },
    { strike: 100000, call: 12, put: 0 },
  ];

  // Derive key levels from an OI dataset.
  // Naming: S1 = closest support to spot, S2 = next further down, S3 = third.
  //         R1 = closest resistance above spot, R2 = next up, R3 = third.
  // Method: find local-OI-peak strikes (real concentration clusters), keep top 3 by
  // contract count to filter out noise, then re-sort by proximity to spot so the
  // nearest meaningful peak gets the S1/R1 label.
  const deriveLevels = (oiData, spot) => {
    const sorted = [...oiData].sort((a, b) => a.strike - b.strike);

    const findPeaks = (arr, field) => {
      const peaks = [];
      for (let i = 0; i < arr.length; i++) {
        const prev = arr[i - 1]?.[field] ?? 0;
        const curr = arr[i][field];
        const next = arr[i + 1]?.[field] ?? 0;
        if (curr > prev && curr > next) peaks.push(arr[i]);
      }
      return peaks;
    };

    const putsBelow  = sorted.filter(d => d.strike < spot && d.put  > 0);
    const callsAbove = sorted.filter(d => d.strike > spot && d.call > 0);

    // Top 3 peaks by OI size → then sorted by proximity (closest = S1/R1)
    const putPeaks = findPeaks(putsBelow, 'put')
      .sort((a, b) => b.put  - a.put).slice(0, 3)
      .sort((a, b) => b.strike - a.strike); // desc = closest to spot first

    const callPeaks = findPeaks(callsAbove, 'call')
      .sort((a, b) => b.call - a.call).slice(0, 3)
      .sort((a, b) => a.strike - b.strike); // asc = closest to spot first

    let minV = Infinity, maxPain = spot;
    for (const { strike: s } of oiData) {
      const v = oiData.reduce((acc, { strike: k, call, put }) =>
        acc + (k < s ? call * (s - k) : 0) + (k > s ? put * (k - s) : 0), 0);
      if (v < minV) { minV = v; maxPain = s; }
    }

    return {
      callWall:   callPeaks[0]?.strike ?? null,  // R1 — closest call peak above spot
      callWallOI: callPeaks[0]?.call   ?? 0,
      r2:         callPeaks[1]?.strike ?? null,
      r2OI:       callPeaks[1]?.call   ?? 0,
      r3:         callPeaks[2]?.strike ?? null,
      putWall:    putPeaks[0]?.strike  ?? null,  // S1 — closest put peak below spot
      putWallOI:  putPeaks[0]?.put     ?? 0,
      s2:         putPeaks[1]?.strike  ?? null,
      s2OI:       putPeaks[1]?.put     ?? 0,
      s3:         putPeaks[2]?.strike  ?? null,
      s3OI:       putPeaks[2]?.put     ?? 0,
      maxPain,
      callOI:  oiData.reduce((s, d) => s + d.call, 0),
      putOI:   oiData.reduce((s, d) => s + d.put,  0),
      totalOI: oiData.reduce((s, d) => s + d.call + d.put, 0),
    };
  };

  const wk = deriveLevels(oiByStrike, session.spot);

  // -- Levels — derived from weekly OI above; update oiByStrike to change levels
  const levels = {
    spot: session.spot,
    r3: { price: wk.r3 || 90000, label: "R3", strength: 1,
          note: "Structural Cap · Long-Dated Call Concentration" },
    r2: { price: wk.r2 || 86000, label: "R2", strength: 2,
          note: `${wk.r2OI} Contracts · Secondary Call Wall` },
    r1: { price: wk.callWall || 83000, label: "R1", strength: 4,
          note: `${wk.callWallOI} Contracts At 15MAY26 · Dominant Call Wall` },
    gf: { price: 80000, label: "GF", strength: 4,
          note: "Dealer Gamma Flips Long → Short · GEX Peak", pin: true,
          tooltip: "The strike where dealer gamma turns from positive (long) to negative (short). Above the flip, hedging dampens moves and price tends to pin. Below the flip, hedging amplifies moves and breakouts follow through. The 'GEX peak' means net gamma is largest in absolute value at this level." },
    s1: { price: wk.putWall || 76500, label: "S1", strength: 4,
          note: `${wk.putWallOI} Contracts · Put Wall · Max Pain $${(wk.maxPain||78000).toLocaleString("en-US")}`, pin: true },
    s2: { price: wk.s2 || 75000, label: "S2", strength: 3,
          note: `${wk.s2OI} Contracts · Secondary Put Wall` },
    s3: { price: wk.s3 || 73000, label: "S3", strength: 2,
          note: "Cycle-Floor Puts · Long-Dated Support" }
  };

  // Convenience formatters
  const fmtM = (v) => {
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(1)}M`;
  };
  const fmt$      = (v) => `$${v.toLocaleString("en-US")}`;
  const fmtDate   = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtLongDate = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  // -- Current options snapshot (enable Live mode for real-time Deribit values)
  const curOpt = optHistory[optHistory.length - 1];
  curOpt.gex        = -0.05;
  curOpt.gammaFlip  = 80000;
  curOpt.pcr        = 1.15;
  curOpt.putWall    = wk.putWall  || 76500;
  curOpt.callWall   = wk.callWall || 83000;
  curOpt.putWallOI  = wk.putWallOI;
  curOpt.callWallOI = wk.callWallOI;
  curOpt.expiry     = "15MAY26";
  curOpt.bias       = "Neutral";

  // Monthly OI: scaled from weekly base — calls skew higher strikes, puts skew lower strikes
  const monthlyOI = oiByStrike.map((d, i) => ({
    ...d,
    call: Math.round(d.call * (i / oiByStrike.length + 0.6) * 2.4),
    put:  Math.round(d.put  * (1 - i / oiByStrike.length + 0.3) * 1.8)
  }));
  const mo = deriveLevels(monthlyOI, session.spot);

  // Combined OI: weekly + monthly additive
  const combinedOI = oiByStrike.map((d, i) => ({
    ...d,
    call: d.call + Math.round(d.call * (i / oiByStrike.length + 0.5) * 2.1),
    put:  d.put  + Math.round(d.put  * (1 - i / oiByStrike.length + 0.2) * 1.5)
  }));
  const cm = deriveLevels(combinedOI, session.spot);

  // -- Per-expiry-bucket snapshots (mock — enable Live mode for real values)
  const currentByExpiry = {
    weekly: {
      label: "Weekly", expiry: "15MAY26",
      gex: -0.05, gammaFlip: 80000, pcr: 1.15,
      callWall: wk.callWall || 83000, callWallOI: wk.callWallOI,
      putWall:  wk.putWall  || 76500, putWallOI:  wk.putWallOI,
      callOI: wk.callOI, putOI: wk.putOI, totalOI: wk.totalOI,
      maxPain: wk.maxPain,
      callIV: 37.6, putIV: 52.0,
      oiByStrike,
      levels: { ...levels }
    },
    monthly: {
      label: "Monthly", expiry: "30MAY26",
      gex: 0.024, gammaFlip: 80000, pcr: 1.42,
      callWall: mo.callWall || 95000, callWallOI: mo.callWallOI,
      putWall:  mo.putWall  || 75000, putWallOI:  mo.putWallOI,
      callOI: mo.callOI, putOI: mo.putOI, totalOI: mo.totalOI,
      maxPain: mo.maxPain,
      callIV: 42.8, putIV: 58.5,
      oiByStrike: monthlyOI,
      levels: { ...levels,
        r3: { ...levels.r3, strength: 2, note: "Cycle-Top Hedges · Long-Dated Calls" },
        r2: { ...levels.r2, price: mo.r2 || 88000, strength: 3,
              note: `${(monthlyOI.find(d=>d.strike===(mo.r2))?.call??0)} Contracts At 30 May · Mid-Range Cap` },
        r1: { ...levels.r1, price: mo.callWall || 85000, strength: 4,
              note: `${mo.callWallOI} Contracts At 30 May · Dominant Call Wall` },
        gf: { ...levels.gf, price: 80000, note: "Dealer Gamma Flips Long → Short · GEX Peak" },
        s1: { ...levels.s1, price: mo.putWall  || 76500, strength: 4,
              note: `${mo.putWallOI} Contracts · Put Wall · Max Pain $${(mo.maxPain||78000).toLocaleString("en-US")}` },
        s2: { ...levels.s2, price: mo.s2 || 75000, strength: 4,
              note: `${(monthlyOI.find(d=>d.strike===mo.s2)?.put??0)} Contracts At 30 May · Secondary Put Wall` },
        s3: { ...levels.s3, price: mo.s3 || 73000, strength: 2,
              note: "Cycle-Floor Hedges · Long-Dated Puts" }
      }
    },
    combined: {
      label: "Combined", expiry: "ALL",
      gex: 0.034, gammaFlip: 80000, pcr: 1.30,
      callWall: cm.callWall || 83000, callWallOI: cm.callWallOI,
      putWall:  cm.putWall  || 76500, putWallOI:  cm.putWallOI,
      callOI: cm.callOI, putOI: cm.putOI, totalOI: cm.totalOI,
      maxPain: cm.maxPain,
      callIV: 40.1, putIV: 55.2,
      oiByStrike: combinedOI,
      levels: { ...levels,
        r3: { ...levels.r3, price: cm.r3 || 100000, strength: 3, note: "Quarterly Calls · Cycle-Top Hedges" },
        r2: { ...levels.r2, price: cm.r2 || 90000,  strength: 3, note: "Aggregate Calls · Structural Cap" },
        r1: { ...levels.r1, strength: 5,                         note: "Aggregate Calls · Dominant Wall" },
        gf: { ...levels.gf, price: 80000,                        note: "Aggregate Gamma Flip · Pinning ↔ Momentum Boundary" },
        s1: { ...levels.s1, strength: 5,                         note: "Aggregate Puts · Defended Floor" },
        s2: { ...levels.s2, price: cm.s2 || 75000,  strength: 4, note: "Aggregate Puts · Strategic Support" },
        s3: { ...levels.s3, price: cm.s3 || 73000,  strength: 2, note: "Quarterly Puts · Cycle Floor" }
      }
    }
  };

  return {
    session,
    etfHistory,
    lastEtf,
    avg30, avg14, buyDominance, buySellRatio, streak5,
    optHistory,
    levels,
    oiByStrike,
    currentByExpiry,
    fmtM, fmt$, fmtDate, fmtLongDate
  };
})();

window.DATA = DATA;
window.MOCK_DATA = DATA;

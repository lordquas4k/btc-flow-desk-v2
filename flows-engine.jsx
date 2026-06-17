/* ============================================================
   FLOWS ENGINE
   Pure math core + Calendar / BarChart / FeDemandPanel / FeDemandDigest
   window.FlowsEngine = { feComputeAxes, feClassify, feColorFor,
                          FeCalendar, FeBarChart, FeDemandPanel, FeDemandDigest }
   ============================================================ */

// inject animation keyframe once
(function() {
  const s = document.createElement('style');
  s.textContent = '@keyframes fe-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.38)}}';
  document.head.appendChild(s);
})();

// ---- palette (private) -------------------------------------------------------
const _FE = {
  BORDER: "#1C2530",
  TEXT:   "#E7ECF3",
  MUTED:  "#76828F",
  GOLD:   "#C9A84C",
  GREEN:  [44, 224, 140],
  RED:    [248, 92, 92],
  NEUT:   [58, 67, 80],
  PANEL:  "#11161F",
  PANEL2: "#0C1017",
};

// ---- math (private) ----------------------------------------------------------
const _feClamp   = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const _feMean    = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const _feMedian  = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const _feMad     = (xs) => { const md = _feMedian(xs); return _feMedian(xs.map(x => Math.abs(x - md))); };
const _feRobustZ = (v, base) => { const s = 1.4826 * _feMad(base); return s === 0 ? 0 : (v - _feMedian(base)) / s; };
const _fePercentileAbs = (xs, p) => {
  if (!xs.length) return 1;
  const s = xs.map(Math.abs).sort((a, b) => a - b);
  const i = _feClamp(Math.floor(p * (s.length - 1)), 0, s.length - 1);
  return s[i] || 1;
};
const _feMix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const _feRgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// ---- public engine functions -------------------------------------------------

function feColorFor(value, scale) {
  const t = Math.pow(_feClamp(Math.abs(value) / scale, 0, 1), 0.78);
  const target = value >= 0 ? _FE.GREEN : _FE.RED;
  return { color: _feRgb(_feMix(_FE.NEUT, target, t)), t, target };
}

function feFmtDate(d) {
  if (!d || !(d instanceof Date)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function feComputeAxes(series) {
  const n = series.length;
  if (n < 4) return { level: 0, momentum: 0, extremity: 0 };
  const recent = _feMean(series.slice(-3));
  const base   = series.slice(0, -1);
  return {
    level:     _feMean(series.slice(-Math.min(7, n))),
    momentum:  _feMean(series.slice(-Math.min(7, n))) - _feMean(series.slice(-Math.min(30, n))),
    extremity: _feRobustZ(recent, base),
  };
}

function feClassify({ level, momentum, extremity }) {
  const z = Math.abs(extremity);
  if (z < 0.5) return {
    state: "Neutral", dir: "·", tier: 0, target: _FE.NEUT,
    tldr: "Flows near baseline — no actionable demand signal.",
  };
  const tier     = z > 2 ? 2 : 1;
  const inflow   = level > 0;
  const building = momentum > 0;
  let state;
  if (inflow)  state = building ? (tier === 2 ? "Surge" : "Accumulation") : "Cooling";
  else         state = building ? (tier === 2 ? "Capitulation" : "Outflow Pressure") : "Outflows Easing";
  const tldr = `Net ${inflow ? "inflows" : "outflows"}, ${building ? "accelerating" : "fading"} — ${z.toFixed(1)}σ vs 30d baseline.`;
  return { state, dir: building ? "↑" : "↓", tier, target: inflow ? _FE.GREEN : _FE.RED, tldr };
}

// ---- internal tooltip --------------------------------------------------------

function _FeTooltip({ data }) {
  if (!data) return null;
  return (
    <div style={{
      position: "absolute", top: data.y, left: data.x,
      transform: "translate(-50%, -115%)",
      background: "#000", border: `1px solid ${_FE.BORDER}`,
      borderRadius: 8, padding: "7px 10px", pointerEvents: "none",
      zIndex: 20, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.7)",
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
    }}>
      <div style={{ color: _FE.MUTED, fontSize: 10 }}>{data.label}</div>
      <div style={{ color: data.color, fontSize: 14, fontWeight: 700 }}>{data.value}</div>
    </div>
  );
}

// ---- Calendar heatmap --------------------------------------------------------

function FeCalendar({ series, dates, fmtVal }) {
  const [hover, setHover] = React.useState(null);
  const containerRef = React.useRef(null);
  const fmt = fmtVal || (v => (v >= 0 ? "+" : "−") + Math.round(Math.abs(v)) + "M");

  const s30 = series.slice(-30);
  const d30 = dates.slice(-30);
  const scale = _fePercentileAbs(s30, 0.9);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <_FeTooltip data={hover} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))", gap: 6 }}>
        {s30.map((v, i) => {
          const { color, t } = feColorFor(v, scale);
          const glow   = t > 0.5 ? `0 0 ${5 + t * 16}px rgba(${v >= 0 ? "44,224,140" : "248,92,92"},${(0.18 + t * 0.45).toFixed(2)})` : "none";
          const txtCol = t > 0.62 ? "#070A0F" : "#AEB8C4";
          return (
            <div key={i}
              onMouseEnter={e => {
                if (!containerRef.current) return;
                const r = e.currentTarget.getBoundingClientRect();
                const p = containerRef.current.getBoundingClientRect();
                setHover({ x: r.left - p.left + r.width / 2, y: r.top - p.top, label: feFmtDate(d30[i]), value: fmt(v), color });
              }}
              onMouseLeave={() => setHover(null)}
              onMouseOver={e => (e.currentTarget.style.transform = "scale(1.06)")}
              onMouseOut={e => (e.currentTarget.style.transform = "scale(1)")}
              style={{
                aspectRatio: "1 / 1", borderRadius: 8, background: color,
                boxShadow: glow, border: "1px solid rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 1,
                cursor: "default", transition: "transform 120ms ease",
                animation: t > 0.9 ? "fe-pulse 2.4s ease-in-out infinite" : "none",
              }}
            >
              <span style={{ fontSize: 7.5, color: txtCol, opacity: 0.65, fontFamily: "JetBrains Mono, ui-monospace, monospace", lineHeight: 1 }}>
                {feFmtDate(d30[i])}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: txtCol, fontFamily: "JetBrains Mono, ui-monospace, monospace", lineHeight: 1 }}>
                {fmt(v)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- bar chart (configurable days / height) ----------------------------------

function FeBarChart({ series, dates, fmtVal, days, chartHeight }) {
  const [hover, setHover] = React.useState(null);
  const containerRef = React.useRef(null);
  const fmt = fmtVal || (v => (v >= 0 ? "+" : "−") + Math.round(Math.abs(v)) + "M");

  const d        = days || 14;
  const ch       = chartHeight || 120;
  const bars     = series.slice(-d);
  const barDates = dates.slice(-d);
  const W = 100, H = ch, mid = H / 2, pad = 6;
  const maxAbs  = Math.max(...bars.map(b => Math.abs(b)), 1);
  const scale   = _fePercentileAbs(bars, 0.9);
  const colW    = (W - pad * 2) / Math.max(bars.length, 1);
  const winMean = _feMean(bars);
  const meanY   = mid - (winMean / maxAbs) * (mid - 10);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <_FeTooltip data={hover} />
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: "100%", height: ch, display: "block", overflow: "visible" }}>
        <line x1={pad} y1={mid} x2={W - pad} y2={mid} stroke={_FE.BORDER} strokeWidth="0.5" />
        <line x1={pad} y1={meanY} x2={W - pad} y2={meanY} stroke={_FE.GOLD} strokeWidth="0.5" strokeDasharray="1.5 1.5" opacity="0.8" />
        {bars.map((v, i) => {
          const { color } = feColorFor(v, scale);
          const h = (Math.abs(v) / maxAbs) * (mid - 10);
          const x = pad + i * colW + colW * 0.14;
          const w = colW * 0.72;
          const y = v >= 0 ? mid - h : mid;
          return (
            <rect key={i} x={x} y={y} width={w} height={Math.max(h, 0.6)} rx="1" fill={color}
              onMouseEnter={e => {
                if (!containerRef.current) return;
                const r = e.currentTarget.getBoundingClientRect();
                const p = containerRef.current.getBoundingClientRect();
                setHover({ x: r.left - p.left + r.width / 2, y: r.top - p.top, label: feFmtDate(barDates[i]), value: fmt(v), color });
              }}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "default" }}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ---- FeDemandPanel: full panel (regime card + calendar + bar chart) ----------

function FeDemandPanel({ series, dates, label, fmtVal, fmtAxis, mode, compact }) {
  const fmt    = fmtVal  || (v => (v >= 0 ? "+" : "−") + Math.round(Math.abs(v)) + "M");
  const fmtAx  = fmtAxis || fmt;
  const inSub  = mode === "pcr" ? "call-heavy" : "net inflow";
  const outSub = mode === "pcr" ? "put-heavy"  : "net outflow";

  const axes   = feComputeAxes(series);
  const regime = feClassify(axes);
  const accent = _feRgb(regime.target);
  const tier   = regime.tier === 2 ? "EXTREME" : regime.tier === 1 ? "ELEVATED" : "QUIET";

  if (compact) {
    return (
      <div style={{ background: _FE.PANEL2, border: `1px solid ${_FE.BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ color: _FE.GOLD, fontSize: 10, letterSpacing: "0.18em", fontWeight: 600, textTransform: "uppercase", fontFamily: "JetBrains Mono, ui-monospace, monospace", marginBottom: 8 }}>
          Demand Signal · {label}
        </div>
        <div style={{
          background: _FE.PANEL, border: `1px solid ${_FE.BORDER}`, borderLeft: `3px solid ${accent}`,
          borderRadius: 8, padding: "8px 12px", marginBottom: 10,
          boxShadow: regime.tier === 2 ? `0 0 20px rgba(${regime.target.join(",")},0.12)` : "none",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ color: accent, fontSize: 18, fontWeight: 800, fontFamily: "JetBrains Mono, ui-monospace, monospace", lineHeight: 1, display: "flex", alignItems: "center", gap: 6 }}>
              {regime.state} <span style={{ fontSize: 16 }}>{regime.dir}</span>
            </div>
            <div style={{ border: `1px solid ${accent}`, color: accent, borderRadius: 999, padding: "2px 8px", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "JetBrains Mono, ui-monospace, monospace", whiteSpace: "nowrap" }}>
              {tier}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 8, borderTop: `1px solid ${_FE.BORDER}` }}>
            {[
              { lbl: "Level",     val: fmtAx(axes.level),    sub: axes.level >= 0 ? inSub : outSub,  col: axes.level >= 0 ? _feRgb(_FE.GREEN) : _feRgb(_FE.RED) },
              { lbl: "Momentum",  val: fmtAx(axes.momentum) + " " + (axes.momentum >= 0 ? "↑" : "↓"), sub: axes.momentum >= 0 ? "building" : "fading", col: axes.momentum >= 0 ? _feRgb(_FE.GREEN) : _feRgb(_FE.RED) },
              { lbl: "Extremity", val: (axes.extremity >= 0 ? "+" : "−") + Math.abs(axes.extremity).toFixed(1) + "σ", sub: "vs 30d", col: Math.abs(axes.extremity) > 2 ? _FE.GOLD : _FE.TEXT },
            ].map(({ lbl, val, sub, col }) => (
              <div key={lbl} style={{ flex: 1, minWidth: 70 }}>
                <div style={{ color: _FE.MUTED, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "JetBrains Mono, ui-monospace, monospace", marginBottom: 2 }}>{lbl}</div>
                <div style={{ color: col, fontSize: 14, fontWeight: 700, fontFamily: "JetBrains Mono, ui-monospace, monospace", lineHeight: 1 }}>{val}</div>
                <div style={{ color: _FE.MUTED, fontSize: 9.5, marginTop: 2, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
        <FeBarChart series={series} dates={dates} fmtVal={fmt} days={30} chartHeight={90} />
      </div>
    );
  }

  return (
    <div style={{ background: _FE.PANEL2, border: `1px solid ${_FE.BORDER}`, borderRadius: 12, padding: "18px 20px" }}>

      <div style={{ color: _FE.GOLD, fontSize: 10, letterSpacing: "0.18em", fontWeight: 600, textTransform: "uppercase", fontFamily: "JetBrains Mono, ui-monospace, monospace", marginBottom: 14 }}>
        Demand Signal · {label}
      </div>

      {/* Regime card */}
      <div style={{
        background: _FE.PANEL, border: `1px solid ${_FE.BORDER}`, borderLeft: `3px solid ${accent}`,
        borderRadius: 10, padding: "14px 16px", marginBottom: 18,
        boxShadow: regime.tier === 2 ? `0 0 28px rgba(${regime.target.join(",")},0.14)` : "none",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ color: accent, fontSize: 24, fontWeight: 800, fontFamily: "JetBrains Mono, ui-monospace, monospace", lineHeight: 1, display: "flex", alignItems: "center", gap: 8 }}>
              {regime.state} <span style={{ fontSize: 20 }}>{regime.dir}</span>
            </div>
            <div style={{ color: _FE.TEXT, opacity: 0.72, fontSize: 12.5, marginTop: 6, lineHeight: 1.45, fontFamily: "system-ui, sans-serif" }}>{regime.tldr}</div>
          </div>
          <div style={{ border: `1px solid ${accent}`, color: accent, borderRadius: 999, padding: "3px 10px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "JetBrains Mono, ui-monospace, monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
            {tier}
          </div>
        </div>

        {/* 3 axes */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${_FE.BORDER}` }}>
          {[
            { lbl: "Level (7d avg)",    val: fmtAx(axes.level),    sub: axes.level >= 0 ? inSub : outSub,                col: axes.level >= 0 ? _feRgb(_FE.GREEN) : _feRgb(_FE.RED) },
            { lbl: "Momentum (7d−30d)", val: fmtAx(axes.momentum) + " " + (axes.momentum >= 0 ? "↑" : "↓"), sub: axes.momentum >= 0 ? "building" : "fading", col: axes.momentum >= 0 ? _feRgb(_FE.GREEN) : _feRgb(_FE.RED) },
            { lbl: "Extremity",          val: (axes.extremity >= 0 ? "+" : "−") + Math.abs(axes.extremity).toFixed(1) + "σ", sub: "vs 30d baseline", col: Math.abs(axes.extremity) > 2 ? _FE.GOLD : _FE.TEXT },
          ].map(({ lbl, val, sub, col }) => (
            <div key={lbl} style={{ flex: 1, minWidth: 90 }}>
              <div style={{ color: _FE.MUTED, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "JetBrains Mono, ui-monospace, monospace", marginBottom: 3 }}>{lbl}</div>
              <div style={{ color: col, fontSize: 17, fontWeight: 700, fontFamily: "JetBrains Mono, ui-monospace, monospace", lineHeight: 1 }}>{val}</div>
              <div style={{ color: _FE.MUTED, fontSize: 10, marginTop: 3, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 30-day calendar */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: _FE.GOLD, fontSize: 10, letterSpacing: "0.15em", fontWeight: 600, textTransform: "uppercase", fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            30-Day Flow Calendar
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10, color: _FE.MUTED, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            <span style={{ color: _feRgb(_FE.RED) }}>outflow</span>
            <span style={{ width: 50, height: 7, borderRadius: 4, background: `linear-gradient(90deg,${_feRgb(_FE.RED)},${_feRgb(_FE.NEUT)},${_feRgb(_FE.GREEN)})`, display: "inline-block" }} />
            <span style={{ color: _feRgb(_FE.GREEN) }}>inflow</span>
          </div>
        </div>
        <FeCalendar series={series} dates={dates} fmtVal={fmt} />
      </div>

      {/* 14-day bar chart */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <div style={{ color: _FE.GOLD, fontSize: 10, letterSpacing: "0.15em", fontWeight: 600, textTransform: "uppercase", fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            Last 14 Days · Sequence
          </div>
          <span style={{ fontSize: 10, color: _FE.GOLD, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>--- 14d mean</span>
        </div>
        <FeBarChart series={series} dates={dates} fmtVal={fmt} />
      </div>

    </div>
  );
}

// ---- FeDemandDigest: compact 2-column card for Overview ----------------------

function FeDemandDigest() {
  const { Panel } = window.UI;

  // ETF: IBIT daily flow ($M). Options: (1 − PCR) × 100 → positive = call-heavy, negative = put-heavy
  const etfSeries = DATA.etfHistory.map(s => s.ibit);
  const optSeries = DATA.optHistory.map(o => (1 - o.pcr) * 100);

  const etfAxes = feComputeAxes(etfSeries);
  const optAxes = feComputeAxes(optSeries);
  const etfReg  = feClassify(etfAxes);
  const optReg  = feClassify(optAxes);

  const etfFmt = v => (v >= 0 ? "+" : "−") + Math.round(Math.abs(v)) + "M";
  const optFmt = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(0); // PCR score, direction = call vs put lean

  const diverging = Math.sign(etfAxes.level) !== Math.sign(optAxes.level)
    && Math.abs(etfAxes.level) > 20 && Math.abs(optAxes.level) > 20;

  function DigestCol({ reg, axes, fmt, side }) {
    const accent = _feRgb(reg.target);
    const tier   = reg.tier === 2 ? "EXTREME" : reg.tier === 1 ? "ELEVATED" : "QUIET";
    return (
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ color: _FE.MUTED, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "JetBrains Mono, ui-monospace, monospace", marginBottom: 8 }}>
          {side}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ color: accent, fontSize: 20, fontWeight: 800, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            {reg.state}
          </span>
          <span style={{ color: accent, fontSize: 18 }}>{reg.dir}</span>
          <span style={{ border: `1px solid ${accent}`, color: accent, borderRadius: 999, padding: "2px 9px", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            {tier}
          </span>
        </div>
        <div style={{ color: _FE.TEXT, opacity: 0.68, fontSize: 11.5, marginBottom: 12, lineHeight: 1.45, fontFamily: "system-ui, sans-serif" }}>
          {reg.tldr}
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {[
            { lbl: "Level",     v: fmt(axes.level),  c: axes.level >= 0 ? _feRgb(_FE.GREEN) : _feRgb(_FE.RED) },
            { lbl: "Momentum",  v: fmt(axes.momentum) + " " + (axes.momentum >= 0 ? "↑" : "↓"), c: axes.momentum >= 0 ? _feRgb(_FE.GREEN) : _feRgb(_FE.RED) },
            { lbl: "Extremity", v: (axes.extremity >= 0 ? "+" : "−") + Math.abs(axes.extremity).toFixed(1) + "σ", c: Math.abs(axes.extremity) > 2 ? _FE.GOLD : _FE.TEXT },
          ].map(({ lbl, v, c }) => (
            <div key={lbl}>
              <div style={{ color: _FE.MUTED, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>{lbl}</div>
              <div style={{ color: c, fontSize: 13, fontWeight: 700, fontFamily: "JetBrains Mono, ui-monospace, monospace", marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Panel title="Demand Signal" dot="violet">
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <DigestCol reg={etfReg} axes={etfAxes} fmt={etfFmt} side="Spot ETF" />
        <div style={{ width: 1, background: _FE.BORDER, alignSelf: "stretch", flexShrink: 0 }} />
        <DigestCol reg={optReg} axes={optAxes} fmt={optFmt} side="Options (PCR)" />
      </div>
      {diverging && (
        <div style={{ marginTop: 14, background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.22)", borderRadius: 8, padding: "9px 13px", fontSize: 11.5, color: _FE.MUTED, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
          <span style={{ color: _FE.GOLD, fontWeight: 700 }}>Divergence · </span>
          ETF inflows and options positioning are pointing opposite directions — size carefully.
        </div>
      )}
    </Panel>
  );
}

// ---- BtcPriceChart: live 30-day candlestick chart (Lightweight Charts) ------

function BtcPriceChart() {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.LightweightCharts) return;

    const chart = window.LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 240,
      layout: { background: { color: _FE.PANEL2 }, textColor: _FE.MUTED },
      grid: { vertLines: { color: _FE.BORDER }, horzLines: { color: _FE.BORDER } },
      timeScale: { borderColor: _FE.BORDER, fixRightEdge: true, timeVisible: false },
      rightPriceScale: { borderColor: _FE.BORDER },
      crosshair: {
        vertLine: { color: _FE.MUTED, labelBackgroundColor: _FE.BORDER },
        horzLine: { color: _FE.MUTED, labelBackgroundColor: _FE.BORDER },
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: _feRgb(_FE.GREEN), downColor: _feRgb(_FE.RED),
      borderUpColor: _feRgb(_FE.GREEN), borderDownColor: _feRgb(_FE.RED),
      wickUpColor: _feRgb(_FE.GREEN), wickDownColor: _feRgb(_FE.RED),
    });

    fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=35")
      .then(r => r.json())
      .then(data => {
        const bars = data.map(k => ({
          time: k[0] / 1000,
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
        }));
        series.setData(bars);
        chart.timeScale().setVisibleLogicalRange({ from: bars.length - 30, to: bars.length - 1 });
      })
      .catch(() => {});

    const ro = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }));
    ro.observe(container);
    return () => { chart.remove(); ro.disconnect(); };
  }, []);

  return (
    <div style={{ background: _FE.PANEL2, border: `1px solid ${_FE.BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ color: _FE.GOLD, fontSize: 10, letterSpacing: "0.18em", fontWeight: 600, textTransform: "uppercase", fontFamily: "JetBrains Mono, ui-monospace, monospace", marginBottom: 8 }}>
        BTC/USDT · 30-Day Price
      </div>
      <div ref={containerRef} style={{ width: "100%", height: 240 }} />
    </div>
  );
}

window.FlowsEngine = { feComputeAxes, feClassify, feColorFor, FeCalendar, FeBarChart, FeDemandPanel, FeDemandDigest, BtcPriceChart };

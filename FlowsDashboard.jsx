import React, { useState, useMemo } from "react";

/* ============================================================================
   BTC FLOWS — INTERPRETATION ENGINE + DASHBOARD
   ----------------------------------------------------------------------------
   Three orthogonal axes, one color language (hue = direction, intensity = size):
     • LEVEL      — sign + size of recent flow vs zero        (mean of last 7)
     • MOMENTUM   — building vs fading (short minus long)      (mean7 − mean30)
     • EXTREMITY  — how unusual vs baseline, robust to fat tails (median/MAD z)
   The regime classifier is a pure function of (level, momentum, extremity)
   with a dead zone (refuses to label noise) and an extremity tier.
   ETF and options are scored by the SAME engine but never blended — two tabs.
   ========================================================================== */

// ---- palette -------------------------------------------------------------
const BG = "#090C12";
const PANEL = "#11161F";
const PANEL2 = "#0C1017";
const BORDER = "#1C2530";
const TEXT = "#E7ECF3";
const MUTED = "#76828F";
const GOLD = "#C9A84C";
const GREEN = [44, 224, 140];
const RED = [248, 92, 92];
const NEUTRAL = [58, 67, 80];

// ---- math helpers --------------------------------------------------------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mad = (xs) => {
  const md = median(xs);
  return median(xs.map((x) => Math.abs(x - md)));
};
// robust z: median/MAD instead of mean/std so one monster day can't blind it
const robustZ = (v, base) => {
  const s = 1.4826 * mad(base);
  return s === 0 ? 0 : (v - median(base)) / s;
};
const percentileAbs = (xs, p) => {
  const s = xs.map(Math.abs).sort((a, b) => a - b);
  const i = clamp(Math.floor(p * (s.length - 1)), 0, s.length - 1);
  return s[i] || 1;
};
const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// shared color language: returns {color, intensity} for any flow value
function colorFor(value, scale) {
  const t = Math.pow(clamp(Math.abs(value) / scale, 0, 1), 0.78);
  const target = value >= 0 ? GREEN : RED;
  return { color: rgb(mix(NEUTRAL, target, t)), t, target };
}

// compact money format ($M), proper minus glyph
function fmt(v, withSign = true) {
  const sign = v < 0 ? "\u2212" : withSign ? "+" : "";
  const a = Math.abs(v);
  const body = a >= 1000 ? (a / 1000).toFixed(1) + "k" : Math.round(a).toString();
  return sign + body;
}

// ---- interpretation engine ----------------------------------------------
function computeAxes(series) {
  const recent = mean(series.slice(-3)); // smoothed headline input
  const base = series.slice(0, -1); // baseline excludes the point being scored
  return {
    level: mean(series.slice(-7)),
    momentum: mean(series.slice(-7)) - mean(series.slice(-30)),
    extremity: robustZ(recent, base),
  };
}

function classify({ level, momentum, extremity }) {
  const z = Math.abs(extremity);
  if (z < 0.5)
    return {
      state: "Neutral",
      dir: "\u00B7",
      tier: 0,
      target: NEUTRAL,
      tldr: "Flows sitting near baseline — no actionable demand signal.",
    };
  const tier = z > 2 ? 2 : 1;
  const inflow = level > 0;
  const building = momentum > 0;
  let state;
  if (inflow) state = building ? (tier === 2 ? "Surge" : "Accumulation building") : "Cooling";
  else state = building ? (tier === 2 ? "Capitulation" : "Outflow pressure") : "Outflows easing";
  const tldr =
    `Net ${inflow ? "inflows" : "outflows"}, ${building ? "accelerating" : "fading"} — ` +
    `${z.toFixed(1)}\u03C3 vs the 30-day baseline.`;
  return { state, dir: building ? "\u2191" : "\u2193", tier, target: inflow ? GREEN : RED, tldr };
}

// ---- mock data: archetypes so each regenerate shows a real, legible regime --
const ARCHETYPES = [
  "accumulation",
  "cooling",
  "outflow",
  "easing",
  "neutral",
  "surge",
  "capitulation",
];
function genSeries(kind) {
  const n = 30;
  const out = [];
  const noise = (amp) => (Math.random() - 0.5) * 2 * amp;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let v = 0;
    switch (kind) {
      case "accumulation": v = 20 + t * 230 + noise(55); break;
      case "cooling":       v = 300 - t * 270 + noise(45); break;
      case "outflow":       v = -20 - t * 270 + noise(55); break;
      case "easing":        v = -300 + t * 270 + noise(45); break;
      case "neutral":       v = noise(38); break;
      case "surge":         v = 35 + noise(45) + (i >= n - 3 ? [380, 540, 700][i - (n - 3)] : 0); break;
      case "capitulation":  v = -25 + noise(45) - (i >= n - 3 ? [430, 600, 760][i - (n - 3)] : 0); break;
      default:              v = noise(40);
    }
    if (Math.random() < 0.06) v += noise(260); // occasional fat tail
    out.push(Math.round(v));
  }
  return out;
}
function genDates(n) {
  const out = [];
  const today = new Date(2026, 5, 16);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d);
  }
  return out;
}
const fmtDate = (d) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ============================================================================
//  UI PRIMITIVES
// ============================================================================
const Eyebrow = ({ children }) => (
  <div style={{ color: GOLD, fontSize: 10.5, letterSpacing: "0.18em", fontWeight: 600, textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}>
    {children}
  </div>
);

function Tooltip({ data }) {
  if (!data) return null;
  return (
    <div style={{ position: "absolute", top: data.y, left: data.x, transform: "translate(-50%,-115%)", background: "#000", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 10px", pointerEvents: "none", zIndex: 20, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}>
      <div style={{ color: MUTED, fontSize: 10, fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em" }}>{data.label}</div>
      <div style={{ color: data.color, fontSize: 14, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{fmt(data.value)}M</div>
    </div>
  );
}

// ============================================================================
//  CALENDAR HEATMAP — the signature element
// ============================================================================
function Calendar({ series, dates, scale, onHover }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(54px, 1fr))", gap: 8 }}>
      {series.map((v, i) => {
        const { color, t } = colorFor(v, scale);
        const glow = t > 0.5 ? `0 0 ${5 + t * 20}px rgba(${v >= 0 ? "44,224,140" : "248,92,92"},${0.2 + t * 0.55})` : "none";
        const textCol = t > 0.62 ? "#070A0F" : "#AEB8C4";
        const pulse = t > 0.9; // tier-2 days "shine"
        return (
          <div
            key={i}
            onMouseEnter={(e) => onHover({ x: e.currentTarget.offsetLeft + e.currentTarget.offsetWidth / 2, y: e.currentTarget.offsetTop, label: fmtDate(dates[i]), value: v, color })}
            onMouseLeave={() => onHover(null)}
            style={{
              aspectRatio: "1 / 1", borderRadius: 9, background: color, boxShadow: glow,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              cursor: "default", transition: "transform 120ms ease", border: `1px solid rgba(255,255,255,0.04)`,
              animation: pulse ? "flowpulse 2.4s ease-in-out infinite" : "none",
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
            onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, color: textCol, fontFamily: "ui-monospace, monospace", lineHeight: 1 }}>{fmt(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
//  RECENT-DAYS BAR CHART — restores the sequence the average erases
// ============================================================================
function BarChart({ series, dates, scale, onHover }) {
  const bars = series.slice(-14);
  const barDates = dates.slice(-14);
  const W = 100, H = 150, mid = H / 2, pad = 8;
  const maxAbs = Math.max(...bars.map((b) => Math.abs(b)), 1);
  const colW = (W - pad * 2) / bars.length;
  const winMean = mean(bars);
  const meanY = mid - (winMean / maxAbs) * (mid - 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150, display: "block" }}>
      <line x1={pad} y1={mid} x2={W - pad} y2={mid} stroke={BORDER} strokeWidth="0.5" />
      <line x1={pad} y1={meanY} x2={W - pad} y2={meanY} stroke={GOLD} strokeWidth="0.5" strokeDasharray="1.5 1.5" opacity="0.8" />
      {bars.map((v, i) => {
        const { color } = colorFor(v, scale);
        const h = (Math.abs(v) / maxAbs) * (mid - 12);
        const x = pad + i * colW + colW * 0.16;
        const w = colW * 0.68;
        const y = v >= 0 ? mid - h : mid;
        return (
          <rect key={i} x={x} y={y} width={w} height={Math.max(h, 0.6)} rx="1" fill={color}
            onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); const p = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect(); onHover({ x: r.left - p.left + r.width / 2, y: r.top - p.top, label: fmtDate(barDates[i]), value: v, color }); }}
            onMouseLeave={() => onHover(null)} style={{ cursor: "default" }} />
        );
      })}
    </svg>
  );
}

// ============================================================================
//  AXIS READOUT
// ============================================================================
function Axis({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, minWidth: 96 }}>
      <div style={{ color: MUTED, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "ui-monospace, monospace", marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || TEXT, fontSize: 19, fontWeight: 700, fontFamily: "ui-monospace, monospace", lineHeight: 1 }}>{value}</div>
      <div style={{ color: MUTED, fontSize: 10.5, marginTop: 3, fontFamily: "ui-monospace, monospace" }}>{sub}</div>
    </div>
  );
}

// ============================================================================
//  MAIN
// ============================================================================
export default function FlowsDashboard() {
  const dates = useMemo(() => genDates(30), []);
  const [seed, setSeed] = useState(0);
  const [tab, setTab] = useState("etf");
  const [hover, setHover] = useState(null);

  const data = useMemo(() => {
    const pick = () => ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
    return { etf: genSeries(pick()), options: genSeries(pick()) };
  }, [seed]);

  const series = data[tab];
  const scale = useMemo(() => percentileAbs(series, 0.9), [series]); // robust max
  const axes = useMemo(() => computeAxes(series), [series]);
  const regime = useMemo(() => classify(axes), [axes]);
  const accent = rgb(regime.target);

  // divergence meta-signal teaser: do the two desks disagree on direction?
  const etfLvl = mean(data.etf.slice(-7));
  const optLvl = mean(data.options.slice(-7));
  const diverging = Math.sign(etfLvl) !== Math.sign(optLvl) && Math.abs(etfLvl) > 20 && Math.abs(optLvl) > 20;

  const tierLabel = regime.tier === 2 ? "EXTREME" : regime.tier === 1 ? "ELEVATED" : "QUIET";

  const TabBtn = ({ id, children }) => (
    <button onClick={() => setTab(id)} style={{
      background: tab === id ? PANEL : "transparent", color: tab === id ? TEXT : MUTED,
      border: `1px solid ${tab === id ? BORDER : "transparent"}`, borderRadius: 7,
      padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
      fontFamily: "ui-monospace, monospace", letterSpacing: "0.05em",
    }}>{children}</button>
  );

  return (
    <div style={{ background: BG, color: TEXT, fontFamily: "system-ui, -apple-system, sans-serif", padding: 22, borderRadius: 16, position: "relative", border: `1px solid ${BORDER}` }}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes flowpulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.35)} }
        }
      `}</style>
      <Tooltip data={hover} />

      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <Eyebrow>Demand Signal</Eyebrow>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 2 }}>BTC Flows Monitor</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4, background: PANEL2, padding: 4, borderRadius: 9, border: `1px solid ${BORDER}` }}>
            <TabBtn id="etf">ETF</TabBtn>
            <TabBtn id="options">OPTIONS</TabBtn>
          </div>
          <button onClick={() => setSeed((s) => s + 1)} title="Regenerate mock data" style={{ background: PANEL2, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 13, fontFamily: "ui-monospace, monospace" }}>↻</button>
        </div>
      </div>

      {/* HEADLINE REGIME CARD */}
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${accent}`, borderRadius: 12, padding: "18px 20px", marginBottom: 14, boxShadow: regime.tier === 2 ? `0 0 28px rgba(${regime.target.join(",")},0.16)` : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Eyebrow>Current Regime · {tab === "etf" ? "Spot ETF" : "Options"}</Eyebrow>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", color: accent, marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
              {regime.state}
              <span style={{ fontSize: 24 }}>{regime.dir}</span>
            </div>
            <div style={{ color: TEXT, opacity: 0.8, fontSize: 13.5, marginTop: 6, maxWidth: 460 }}>{regime.tldr}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "inline-block", border: `1px solid ${accent}`, color: accent, borderRadius: 999, padding: "3px 11px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "ui-monospace, monospace" }}>{tierLabel}</div>
          </div>
        </div>

        {/* three axes */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
          <Axis label="Level (7d avg)" value={`${fmt(axes.level)}M`} sub={axes.level >= 0 ? "net inflow" : "net outflow"} color={rgb(colorFor(axes.level, scale).color === rgb(NEUTRAL) ? NEUTRAL : (axes.level >= 0 ? GREEN : RED))} />
          <Axis label="Momentum (7d−30d)" value={`${fmt(axes.momentum)}M ${axes.momentum >= 0 ? "↑" : "↓"}`} sub={axes.momentum >= 0 ? "building" : "fading"} color={axes.momentum >= 0 ? rgb(GREEN) : rgb(RED)} />
          <Axis label="Extremity" value={`${axes.extremity >= 0 ? "+" : "\u2212"}${Math.abs(axes.extremity).toFixed(1)}\u03C3`} sub="vs 30d baseline" color={Math.abs(axes.extremity) > 2 ? GOLD : TEXT} />
        </div>

        {diverging && (
          <div style={{ marginTop: 14, background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: MUTED }}>
            <span style={{ color: GOLD, fontWeight: 700 }}>Divergence · </span>
            ETF and options desks are pointing opposite ways right now — worth a closer look.
          </div>
        )}
      </div>

      {/* CALENDAR */}
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <Eyebrow>30-Day Flow Calendar</Eyebrow>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: MUTED, fontFamily: "ui-monospace, monospace" }}>
            <span style={{ color: rgb(RED) }}>outflow</span>
            <span style={{ width: 60, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${rgb(RED)}, ${rgb(NEUTRAL)}, ${rgb(GREEN)})` }} />
            <span style={{ color: rgb(GREEN) }}>inflow</span>
          </div>
        </div>
        <Calendar series={series} dates={dates} scale={scale} onHover={setHover} />
      </div>

      {/* BAR CHART */}
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <Eyebrow>Last 14 Days · Sequence</Eyebrow>
          <span style={{ fontSize: 10.5, color: GOLD, fontFamily: "ui-monospace, monospace" }}>--- 14d mean</span>
        </div>
        <BarChart series={series} dates={dates} scale={scale} onHover={setHover} />
      </div>

      {/* RAW STATS — secondary detail */}
      <div style={{ background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 18px" }}>
        <Eyebrow>Raw Detail</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22, marginTop: 10, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
          {[
            ["today", `${fmt(series[series.length - 1])}M`],
            ["7d mean", `${fmt(mean(series.slice(-7)))}M`],
            ["30d mean", `${fmt(mean(series))}M`],
            ["z (7d)", robustZ(series[series.length - 1], series.slice(-7, -1)).toFixed(2)],
            ["z (30d)", axes.extremity.toFixed(2)],
            ["σ scale", `${fmt(scale, false)}M`],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ color: MUTED, fontSize: 10 }}>{k}</div>
              <div style={{ color: TEXT, fontWeight: 600, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 10.5, color: MUTED, fontFamily: "ui-monospace, monospace", textAlign: "center" }}>
        mock data · hit ↻ to roll a new regime · values in $M net flow
      </div>
    </div>
  );
}

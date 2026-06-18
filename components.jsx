/* ============================================================
   SHARED COMPONENTS — BTC Flow Desk
   ============================================================ */

const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
//   DEFINITIONS — used by HoverDef tooltips
// ============================================================
const DEFINITIONS = {
  "GEX": {
    tag: "Gross Gamma Exposure",
    def: "Net dealer gamma position across all strikes, in billions $. Positive = dealers long gamma (volatility suppressed, mean-reverting). Negative = dealers short gamma (volatility amplified, momentum follows).",
    scale: "> +0.5B Suppressive · ±0.1B Neutral · < −0.5B Amplifying"
  },
  "Gamma Flip": {
    tag: "GF · Long ↔ Short Regime",
    def: "The strike where dealer gamma transitions from long to short. Above the flip, market makers dampen moves (pinning regime). Below it, hedging accelerates moves (momentum regime — do not fade).",
    scale: "Spot above GF = Pinning · Spot below GF = Momentum"
  },
  "PC Ratio": {
    tag: "Put / Call OI",
    def: "Total put open interest divided by total call open interest. A high reading means heavy put positioning relative to calls.",
    scale: "< 0.7 Bullish · 0.7 – 1.3 Balanced · > 1.5 Bearish · > 2.5 Often Contrarian Extreme"
  },
  "Call Wall": {
    tag: "Largest Call OI Strike",
    def: "Strike with the heaviest call open interest. Acts as a dealer-hedging ceiling on rallies. A clean break through often triggers a short-gamma squeeze.",
    scale: "Defended Resistance · Break = Squeeze Potential"
  },
  "Put Wall": {
    tag: "Largest Put OI Strike",
    def: "Strike with the heaviest put open interest. Acts as defended support — dealers buy the dip to hedge their books. A break below signals capitulation.",
    scale: "Defended Support · Break = Capitulation"
  },
  "Max Pain": {
    tag: "MP · Pin Magnet",
    def: "The strike at which the most options expire worthless on a given expiry. Spot tends to gravitate here as expiry approaches — the pull strengthens inside the last 48 hours.",
    scale: "Pin Magnet · Strongest Inside 48h of Expiry"
  },
  "IBIT Flow": {
    tag: "BlackRock iShares Bitcoin Trust",
    def: "Daily net subscription flow into IBIT, in millions $. The single largest spot-BTC ETF — its print is the cleanest read on institutional demand each session.",
    scale: "> +$200M Strong Bid · Sustained Negatives = Distribution"
  },
  "30D Avg": {
    tag: "IBIT 30-Day Average",
    def: "Trailing 30-session mean of IBIT daily net flow. Smooths out single-day noise and shows the prevailing demand regime."
  },
  "14D Avg": {
    tag: "IBIT 14-Day Average",
    def: "Trailing 14-session mean of IBIT daily net flow. The short-term demand tape — compare to the 30d to see if demand is accelerating or fading."
  },
  "vs 30D Avg": {
    tag: "14d vs 30d Differential",
    def: "How the recent 14-day demand compares to the longer 30-day baseline. Above-avg means demand is accelerating; below-avg means it is fading."
  },
  "Buy Dominance": {
    tag: "% Positive Days (30d)",
    def: "Share of the last 30 sessions with net positive IBIT flow. A breadth gauge — high readings show that demand is broad-based, not driven by a single big print.",
    scale: "> 70% Strong Demand · 40 – 60% Balanced · < 30% Distribution"
  },
  "Buy/Sell Ratio": {
    tag: "Σ Positive ÷ Σ Negative (30d)",
    def: "Sum of positive flow days divided by the absolute sum of negative flow days, over the trailing 30 sessions. Measures magnitude — not just frequency — of accumulation.",
    scale: "> 1.5x Clear Accumulation · < 0.8x Distribution"
  },
  "IV Skew": {
    tag: "Implied Volatility Tilt",
    def: "Difference between average put and call implied volatility. Put-skew dominant means traders are paying up for downside protection — a defensive market posture.",
    scale: "Put Skew = Defensive · Call Skew = Greedy / Squeeze Risk"
  },
  "Call OI": {
    tag: "Total Call Open Interest",
    def: "Sum of all outstanding call contracts across strikes for the selected expiry."
  },
  "Put OI": {
    tag: "Total Put Open Interest",
    def: "Sum of all outstanding put contracts across strikes for the selected expiry."
  },
  "Total": {
    tag: "Total Open Interest",
    def: "Sum of all outstanding option contracts (calls + puts) for the selected expiry."
  },
  "Notional Value": {
    tag: "USD Notional",
    def: "Aggregate $-notional represented by all open interest at the selected expiry."
  },
  "R1": { tag: "Primary Resistance", def: "First overhead ceiling from dealer positioning — usually the dominant call wall. Often holds on first test." },
  "R2": { tag: "Secondary Resistance", def: "Structural cap above R1 — typically the next major call-OI concentration or a longer-dated wall." },
  "R3": { tag: "Tertiary / Cycle Resistance", def: "Deep overhead — usually a longer-dated (quarterly+) call concentration. Rarely tested intraweek but defines the broader cycle ceiling." },
  "S1": { tag: "Primary Support", def: "First defended floor from dealer positioning — typically the dominant put wall or max-pain strike." },
  "S2": { tag: "Secondary Support", def: "Structural floor below S1 — a back-up level of put accumulation or a longer-dated put wall." },
  "S3": { tag: "Tertiary / Cycle Support", def: "Deep downside — a longer-dated put concentration that defines the broader cycle floor. Comes into play on flushes only." },
  "GF": { tag: "Gamma Flip · Long ↔ Short", def: "The strike where dealer gamma flips long → short. Above it, hedging dampens moves (pinning). Below it, hedging amplifies moves (momentum)." },
  "Spot": { tag: "Current BTC Price", def: "Live spot price of Bitcoin, in USD. The benchmark against which all option-derived levels are measured." },

  // Glossary-only entries (also surfaced on Glossary tab)
  "Positive Gamma": { tag: "Dealers Long Gamma", def: "Net dealer gamma is positive — they hedge by selling rallies and buying dips. Result: volatility is suppressed and price mean-reverts inside a range.",
                      scale: "Above GF · Pinning Regime · Fade Extremes" },
  "Negative Gamma": { tag: "Dealers Short Gamma", def: "Net dealer gamma is negative — they hedge by buying rallies and selling dips. Result: volatility expands and breakouts follow through.",
                      scale: "Below GF · Momentum Regime · Don't Fade" },
  "GEX Trend": { tag: "Direction Of Net Gamma",
                 def: "How net dealer gamma is changing session-over-session. A rising GEX means the suppressive dampening force is strengthening; a falling GEX means the market is drifting toward (or deeper into) a short-gamma momentum regime.",
                 scale: "Rising → More Pinning · Falling → More Momentum" }
};

function HoverDef({ term, custom, current, currentTone = "neu", children, className, block }) {
  const d = custom || DEFINITIONS[term];
  if (!d) return <>{children}</>;
  const Tag = block ? "div" : "span";
  return (
    <Tag className={"hover-host " + (className || "")} style={block ? {display:"block", width:"100%"} : undefined}>
      {children}
      <span className="hover-tip" role="tooltip">
        <span className="hover-tip-term">{term}{d.tag && <span className="tag">{d.tag}</span>}</span>
        <span className="hover-tip-def">{d.def}</span>
        {d.scale && <span className="hover-tip-range">{d.scale}</span>}
        {current && <span className={"hover-tip-current " + currentTone}>{current}</span>}
      </span>
    </Tag>
  );
}

// -- Top bar
function TopBar({ tab, setTab, session, live, liveStatus, spotStatus, optStatus, optError, lastUpdate, onToggleLive, onRefresh }) {
  const tabs = ["Overview", "Options Flow", "ETF Flows", "Glossary"];

  // Format "Updated N ago" — reset `now` whenever live flips on, then tick every 15s
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [live]);
  const ago = (() => {
    if (!lastUpdate) return null;
    const s = Math.max(0, Math.floor((now - lastUpdate.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  })();

  const statusColor = liveStatus === "live"       ? "var(--mint)"
                    : liveStatus === "connecting" ? "var(--amber)"
                    : liveStatus === "error"      ? "var(--red)"
                    : "var(--fg-3)";
  const statusLabel = liveStatus === "live"       ? "LIVE"
                    : liveStatus === "connecting" ? "CONNECTING"
                    : liveStatus === "error"      ? "ERROR"
                    : "MOCK";

  // Detailed status text shown below the pill on hover
  const detail = live
    ? `Coinbase WS: ${spotStatus || "—"}\nDeribit REST: ${optStatus || "—"}${optError ? `\nError: ${optError}` : ""}`
    : "Click to switch to live data";

  return (
    <div className="topbar">
      <div className="brand">
        <img className="brand-mark" src="river_icon_rounded.ico" alt="" />
        <div className="brand-text">
          <div className="brand-name">BTC FLOW DESK</div>
          <div className="brand-sub">v2 · TERMINAL</div>
        </div>
      </div>
      <div className="tabs">
        {tabs.map(t => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="top-right">
        <div className="live-pill-wrap">
          <button
            className={"live-pill " + (live ? "on " : "") + liveStatus}
            onClick={onToggleLive}
          >
            <span className="live-pill-dot" style={{background: statusColor, boxShadow: `0 0 calc(6px * var(--glow-strength)) ${statusColor}`}}></span>
            <span className="live-pill-label">{statusLabel}</span>
            {live && ago && <span className="live-pill-ago">· {ago}</span>}
            {live && liveStatus === "live" && (
              <span className="live-pill-refresh" onClick={(e) => { e.stopPropagation(); onRefresh && onRefresh(); }} title="Refresh now" role="button">↻</span>
            )}
          </button>
          {live && (
            <div className="live-pill-tip">
              <div className="lpt-row"><span>Coinbase WS</span><span className={"lpt-val " + (spotStatus === "connected" ? "ok" : spotStatus === "error" ? "err" : "wait")}>{spotStatus || "—"}</span></div>
              <div className="lpt-row"><span>Deribit REST</span><span className={"lpt-val " + (optStatus === "live" ? "ok" : optStatus === "error" ? "err" : "wait")}>{optStatus || "—"}</span></div>
              {optError && <div className="lpt-err">{optError}</div>}
              {liveStatus === "connecting" && !optError && (
                <div className="lpt-hint">Waiting for first response — usually &lt;5s. If stuck, check browser console (F12) for blocked requests.</div>
              )}
              {liveStatus === "error" && (
                <div className="lpt-hint">A feed failed. Hover the pill or open the console for details. Toggle off + on to retry.</div>
              )}
            </div>
          )}
        </div>
        <span className="session muted mono" style={{fontSize: 11}}>{DATA.fmtLongDate(session.date)}</span>
        <span className="spot mono">
          ${session.spot.toLocaleString("en-US")}
          <span className={"ch " + (session.spotChange >= 0 ? "pos" : "neg")} style={{marginLeft: 8}}>
            {session.spotChange >= 0 ? "▲" : "▼"} {Math.abs(session.spotChange).toFixed(2)}%
          </span>
        </span>
      </div>
    </div>
  );
}

// -- Stat strip (under top bar)
function StatStrip({ levels, lastEtf, optHist }) {
  const cur = optHist[optHist.length - 1];
  const items = [
    { k: "GEX", v: `${cur.gex >= 0 ? "+" : ""}${cur.gex.toFixed(3)}B`, cls: cur.gex >= 0 ? "glow-mint" : "glow-red" },
    { k: "FLIP", v: DATA.fmt$(cur.gammaFlip), cls: "glow-amber" },
    { k: "PC", v: cur.pcr.toFixed(2), cls: cur.pcr > 1.5 ? "glow-red" : cur.pcr < 0.7 ? "glow-mint" : "" },
    { k: "PUT WALL", v: DATA.fmt$(levels.s1.price), cls: "glow-mint" },
    { k: "CALL WALL", v: DATA.fmt$(levels.r1.price), cls: "glow-red" },
    { k: "IBIT", v: DATA.fmtM(lastEtf.ibit), cls: lastEtf.ibit >= 0 ? "glow-mint" : "glow-red" },
    { k: "30D AVG", v: DATA.fmtM(DATA.avg30), cls: DATA.avg30 >= 0 ? "pos" : "neg" },
    { k: "SIGNAL", v: <SignalBadge sig="NEUTRAL" />, isBadge: true }
  ];
  return (
    <div className="stat-strip">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <span className="item">
            <span className="k">{it.k}</span>
            {it.isBadge ? it.v : <span className={"v " + (it.cls || "")}>{it.v}</span>}
          </span>
          {i < items.length - 1 && <span className="sep"></span>}
        </React.Fragment>
      ))}
    </div>
  );
}

// -- Signal badge
function SignalBadge({ sig }) {
  const map = {
    "STRONG IN": "sig-strong-in",
    "IN": "sig-in",
    "OUT": "sig-out",
    "STRONG OUT": "sig-strong-out",
    "NEUTRAL": "sig-neutral"
  };
  return (
    <span className={"badge " + (map[sig] || "sig-neutral")}>
      <span className="dot"></span>{sig}
    </span>
  );
}

// -- Panel wrapper
function Panel({ title, action, dot, children, className = "" }) {
  const hasHead = title || action;
  return (
    <div className={"panel " + className}>
      {hasHead && (
        <div className="panel-head">
          <span className="panel-title">
            {title && dot !== false && <span className="dotchip" style={dot ? {background: `var(--${dot})`} : undefined}></span>}
            {title}
          </span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// -- Stat card (KPI tile) — now hoverable to surface a definition
function StatCard({ label, value, sub, info, accent, glow, valueClass, term, current, tone }) {
  const card = (
    <div className={"stat-card " + (accent ? "accent-" + accent + " glow-card " : "") + (term ? "hover-host " : "")}>
      <div className="head">
        <span className="label">{label}</span>
        {(info || term) && <span className="info" title={info || ""}>i</span>}
      </div>
      <div className={"v " + (glow ? "glow-" + glow : "") + " " + (valueClass || "")}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
      {term && DEFINITIONS[term] && (
        <span className="hover-tip" role="tooltip">
          <span className="hover-tip-term">{term}{DEFINITIONS[term].tag && <span className="tag">{DEFINITIONS[term].tag}</span>}</span>
          <span className="hover-tip-def">{DEFINITIONS[term].def}</span>
          {DEFINITIONS[term].scale && <span className="hover-tip-range">{DEFINITIONS[term].scale}</span>}
          {current && <span className={"hover-tip-current " + (tone || "neu")}>{current}</span>}
        </span>
      )}
    </div>
  );
  return card;
}

// -- Levels Table (vertical, the centerpiece)
// resistance/support: semantically fixed arrays — R stays R, S stays S regardless of spot
// spot: used for whipsaw detection (support level crossed above spot) and the spot row
function LevelsTable({ resistance = [], support = [], spot, regime = "negative-gamma" }) {
  const WHIPSAW = 0.008;

  // Strength → opacity: all levels shown, dimmer = weaker
  const strOpacity = (s) => ({ 1: 0.28, 2: 0.48, 3: 0.68, 4: 0.85, 5: 1.0 })[s] ?? 0.5;

  // Resistance: above spot (closest = R1). Drop any that have drifted below spot.
  const rSlots = [...resistance.filter(Boolean)]
    .filter(l => l.price > spot * (1 - 0.001))
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);

  // Support: at/below spot, plus whipsaw band (0–0.8% above). Drop stale levels far above spot.
  const sSlots = [...support.filter(Boolean)]
    .filter(l => l.price <= spot * (1 + WHIPSAW))
    .sort((a, b) => b.price - a.price)
    .slice(0, 3)
    .map(l => (l.price > spot) ? { ...l, whipsaw: true } : l);

  while (rSlots.length < 3) rSlots.push(null);
  while (sSlots.length < 3) sSlots.push(null);

  // Always render 5 dots to keep all rows the same height — unlit dots for empty/unfilled slots
  const dotsRow = (n, color) => [1, 2, 3, 4, 5].map(i => (
    <span key={i} className={"d" + (i <= n ? " on-" + color : "")}></span>
  ));

  const lbl = (term, content, customDef) => (
    <HoverDef term={term} custom={customDef ? { tag: DEFINITIONS[term]?.tag, def: customDef } : null}>
      <span>{content}</span>
    </HoverDef>
  );

  const makeRow = (slot, rank, type) => {
    const label = type + rank;
    const color = type === "R" ? "red" : "mint";
    const empty = !slot;
    const opacity = empty ? 0.18 : strOpacity(slot.strength);
    return (
      <div key={label} className={"row " + type.toLowerCase() + (slot?.whipsaw ? " whipsaw" : "")}>
        <div className="cell lbl">
          {lbl(label, slot?.whipsaw
            ? <>{label} <span style={{color: "var(--amber)", fontSize: 11}}>⚠</span></>
            : label
          )}
        </div>
        <div className="cell price" style={{opacity}}>
          {empty ? "—" : DATA.fmt$(slot.price)}
        </div>
        <div className="cell" style={{opacity}}>
          {/* always render dots to keep row height consistent */}
          <div className="strength">{dotsRow(empty ? 0 : slot.strength, color)}</div>
        </div>
        <div className="cell note" style={{opacity}}>
          {empty ? "" : slot.note + (slot.whipsaw ? " · Just Crossed" : "") + (slot.pin ? " ★" : "")}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="panel-head" style={{marginBottom: 12}}>
        <span className="panel-title">
          <span className="dotchip" style={{background: "var(--violet)"}}></span>
          Price Levels
        </span>
        <span className={"badge " + (regime === "negative-gamma" ? "b-red" : "b-mint")}>
          <span className="dot"></span>{regime === "negative-gamma" ? "negative gamma" : "positive gamma"}
        </span>
      </div>
      <div className="levels">
        {[...rSlots].reverse().map((slot, i) => makeRow(slot, rSlots.length - i, "R"))}
        <div className="row divider">
          <div className="cell"></div><div className="cell"></div><div className="cell"></div>
          <div className="cell" style={{textAlign: "right"}}>
            {regime === "negative-gamma" ? "↓ NEGATIVE GAMMA ZONE" : "↑ POSITIVE GAMMA ZONE"}
          </div>
        </div>
        <div className="row spot">
          <div className="cell lbl">{lbl("Spot", "Spot")}</div>
          <div className="cell price">{DATA.fmt$(spot)}</div>
          <div className="cell"></div>
          <div className="cell note">Current Price</div>
        </div>
        {sSlots.map((slot, i) => makeRow(slot, i + 1, "S"))}
      </div>
    </div>
  );
}

// -- Streak indicator
function Streak({ vals }) {
  return (
    <span className="streak">
      {vals.map((v, i) => (
        <span key={i} className={"pip " + v}>{v === "up" ? "▲" : v === "down" ? "▼" : "·"}</span>
      ))}
    </span>
  );
}

// -- Sparkline bar chart (used in panels)
function SparkBars({ data, height = 180, kind = "ibit", showAxis = true }) {
  const w = 800;
  const h = height;
  const pad = { top: 14, right: 12, bottom: 28, left: 36 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const max = Math.max(...data.map(d => Math.abs(d.value)), 50);
  const yScale = v => (innerH / 2) * (1 - v / max) + pad.top;
  const bw = innerW / data.length;
  const yMax = max;
  const zeroY = pad.top + innerH / 2;

  const yTicks = [yMax, yMax / 2, 0, -yMax / 2, -yMax];
  const xTickStep = Math.max(1, Math.floor(data.length / 8));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{height: h}}>
        <defs>
          <filter id={`glow-${kind}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        {/* grid */}
        <g className="chart-grid">
          {yTicks.map((t, i) => (
            <line key={i} x1={pad.left} x2={w - pad.right} y1={yScale(t)} y2={yScale(t)} strokeDasharray={t === 0 ? "0" : "2 4"} opacity={t === 0 ? 0.5 : 0.4} />
          ))}
        </g>
        {/* y axis */}
        {showAxis && (
          <g className="chart-axis">
            {yTicks.map((t, i) => (
              <text key={i} x={pad.left - 6} y={yScale(t) + 3} textAnchor="end">{t > 0 ? "+" : ""}{Math.round(t)}</text>
            ))}
          </g>
        )}
        {/* bars */}
        <g filter={`url(#glow-${kind})`} opacity="0.55">
          {data.map((d, i) => {
            const x = pad.left + i * bw + 1;
            const y = d.value >= 0 ? yScale(d.value) : zeroY;
            const barH = Math.abs(zeroY - yScale(d.value));
            return <rect key={i} x={x} y={y} width={bw - 2} height={barH} className={d.value >= 0 ? "chart-bar-pos" : "chart-bar-neg"} />;
          })}
        </g>
        <g>
          {data.map((d, i) => {
            const x = pad.left + i * bw + 1;
            const y = d.value >= 0 ? yScale(d.value) : zeroY;
            const barH = Math.abs(zeroY - yScale(d.value));
            return <rect key={i} x={x} y={y} width={bw - 2} height={Math.max(1, barH)} className={d.value >= 0 ? "chart-bar-pos" : "chart-bar-neg"} />;
          })}
        </g>
        {/* x axis */}
        {showAxis && (
          <g className="chart-axis">
            {data.map((d, i) => i % xTickStep === 0 ? (
              <text key={i} x={pad.left + i * bw + bw / 2} y={h - 10} textAnchor="middle">{d.label}</text>
            ) : null)}
          </g>
        )}
      </svg>
    </div>
  );
}

// -- Smooth line (area) chart
function AreaChart({ data, height = 180, showAxis = true, kind = "tot" }) {
  const w = 800;
  const h = height;
  const pad = { top: 14, right: 12, bottom: 28, left: 42 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const max = Math.max(...data.map(d => Math.abs(d.value)), 50);
  const yScale = v => (innerH / 2) * (1 - v / max) + pad.top;
  const xScale = i => pad.left + (i / (data.length - 1)) * innerW;
  const zeroY = pad.top + innerH / 2;

  // build a single path with positive and negative parts colored separately
  const points = data.map((d, i) => [xScale(i), yScale(d.value)]);
  const lineD = points.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

  // positive area (clip above zero)
  const posArea = "M" + points[0][0] + "," + zeroY + " " +
                  points.map(p => "L" + p[0].toFixed(1) + "," + Math.min(p[1], zeroY).toFixed(1)).join(" ") +
                  " L" + points[points.length-1][0] + "," + zeroY + " Z";
  const negArea = "M" + points[0][0] + "," + zeroY + " " +
                  points.map(p => "L" + p[0].toFixed(1) + "," + Math.max(p[1], zeroY).toFixed(1)).join(" ") +
                  " L" + points[points.length-1][0] + "," + zeroY + " Z";

  const yTicks = [max, max/2, 0, -max/2, -max];
  const xTickStep = Math.max(1, Math.floor(data.length / 8));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{height: h}}>
        <defs>
          <filter id={`glow-line-${kind}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <clipPath id={`pos-${kind}`}><rect x={pad.left} y={pad.top} width={innerW} height={zeroY - pad.top}/></clipPath>
          <clipPath id={`neg-${kind}`}><rect x={pad.left} y={zeroY} width={innerW} height={(pad.top + innerH) - zeroY}/></clipPath>
        </defs>
        <g className="chart-grid">
          {yTicks.map((t, i) => (
            <line key={i} x1={pad.left} x2={w - pad.right} y1={yScale(t)} y2={yScale(t)} strokeDasharray={t === 0 ? "0" : "2 4"} opacity={t === 0 ? 0.5 : 0.4} />
          ))}
        </g>
        {showAxis && (
          <g className="chart-axis">
            {yTicks.map((t, i) => (
              <text key={i} x={pad.left - 6} y={yScale(t) + 3} textAnchor="end">{t > 0 ? "+" : ""}{Math.round(t)}</text>
            ))}
          </g>
        )}
        <path d={posArea} className="chart-area-pos" />
        <path d={negArea} className="chart-area-neg" />
        <path d={lineD} clipPath={`url(#pos-${kind})`} className="chart-line-pos" filter={`url(#glow-line-${kind})`} opacity="0.7" />
        <path d={lineD} clipPath={`url(#pos-${kind})`} className="chart-line-pos" />
        <path d={lineD} clipPath={`url(#neg-${kind})`} className="chart-line-neg" filter={`url(#glow-line-${kind})`} opacity="0.7" />
        <path d={lineD} clipPath={`url(#neg-${kind})`} className="chart-line-neg" />
        {showAxis && (
          <g className="chart-axis">
            {data.map((d, i) => i % xTickStep === 0 ? (
              <text key={i} x={xScale(i)} y={h - 10} textAnchor="middle">{d.label}</text>
            ) : null)}
          </g>
        )}
      </svg>
    </div>
  );
}

// -- Open Interest by Strike (calls vs puts side-by-side bars)
function OIChart({ data, spot, maxPain, height = 230 }) {
  const w = 1000; const h = height;
  // pad.top reserves space for the top-right info box (sits at y=4..40, bars start at 44)
  const pad = { top: 44, right: 16, bottom: 32, left: 36 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const maxOI = Math.max(...data.map(d => Math.max(d.call, d.put)));
  const yScale = v => pad.top + innerH * (1 - v / maxOI);
  const bw = innerW / data.length;

  const outerGap = bw * 0.12;
  const innerGap = bw * 0.05;
  const barW     = (bw - 2 * outerGap - innerGap) / 2;
  const putBarX  = (x) => x + outerGap;
  const callBarX = (x) => x + outerGap + barW + innerGap;

  // Spot x — interpolate between strikes
  let spotPos = 0;
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i].strike <= spot && data[i + 1].strike >= spot) {
      spotPos = i + (spot - data[i].strike) / (data[i + 1].strike - data[i].strike);
      break;
    }
  }
  const spotX = pad.left + spotPos * bw + bw / 2;

  // Max pain x
  const mpIdx = data.findIndex(d => d.strike === maxPain);
  const mpX   = mpIdx >= 0 ? pad.left + mpIdx * bw + bw / 2 : -1;

  // Info box: fixed top-right corner, entirely within pad.top zone
  const boxW = 210; const boxH = 38;
  const boxX = w - pad.right - boxW;
  const boxY = 3;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{height: h}}>
        <g className="chart-grid">
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <line key={i} x1={pad.left} x2={w - pad.right} y1={pad.top + p * innerH} y2={pad.top + p * innerH} opacity={0.5}/>
          ))}
        </g>

        {/* bars */}
        {data.map((d, i) => {
          const x = pad.left + i * bw;
          const callH = (innerH * d.call) / maxOI;
          const putH  = (innerH * d.put)  / maxOI;
          return (
            <g key={i}>
              {d.put > 0 && <rect x={putBarX(x)}  y={yScale(d.put)}  width={barW} height={putH}  fill="var(--amber)" shapeRendering="crispEdges" />}
              {d.call > 0 && <rect x={callBarX(x)} y={yScale(d.call)} width={barW} height={callH} fill="var(--blue)"  shapeRendering="crispEdges" />}
            </g>
          );
        })}

        {/* max pain line — dashed red, triple-render for visible glow */}
        {mpX >= 0 && (
          <g>
            <line x1={mpX} x2={mpX} y1={pad.top} y2={h - pad.bottom} stroke="var(--red)" strokeDasharray="6 5" strokeWidth="9"  opacity="0.10"/>
            <line x1={mpX} x2={mpX} y1={pad.top} y2={h - pad.bottom} stroke="var(--red)" strokeDasharray="6 5" strokeWidth="4"  opacity="0.22"/>
            <line x1={mpX} x2={mpX} y1={pad.top} y2={h - pad.bottom} stroke="var(--red)" strokeDasharray="6 5" strokeWidth="1.5" opacity="0.95"/>
          </g>
        )}

        {/* spot line — solid violet, triple-render for visible glow */}
        <g>
          <line x1={spotX} x2={spotX} y1={pad.top} y2={h - pad.bottom} stroke="var(--violet)" strokeWidth="12" opacity="0.10"/>
          <line x1={spotX} x2={spotX} y1={pad.top} y2={h - pad.bottom} stroke="var(--violet)" strokeWidth="5"  opacity="0.25"/>
          <line x1={spotX} x2={spotX} y1={pad.top} y2={h - pad.bottom} stroke="var(--violet)" strokeWidth="2"  opacity="1"/>
        </g>

        {/* top-right info box — above bars, never overlaps */}
        <g>
          <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={5} fill="#080b10" stroke="#1C2530" strokeWidth="0.8"/>
          {/* Spot row */}
          <circle cx={boxX + 14} cy={boxY + 11} r="4.5" fill="var(--violet)"/>
          <text x={boxX + 26} y={boxY + 16} fill="var(--violet)" fontSize="13" fontWeight="700" fontFamily="JetBrains Mono, monospace" letterSpacing="0.04em">
            SPOT  ${spot.toLocaleString("en-US")}
          </text>
          <line x1={boxX + 4} x2={boxX + boxW - 4} y1={boxY + boxH / 2} y2={boxY + boxH / 2} stroke="#1C2530" strokeWidth="0.8"/>
          {/* Max pain row */}
          <circle cx={boxX + 14} cy={boxY + 28} r="4.5" fill="var(--red)"/>
          <text x={boxX + 26} y={boxY + 33} fill="var(--red)" fontSize="13" fontWeight="700" fontFamily="JetBrains Mono, monospace" letterSpacing="0.04em">
            MAX PAIN  ${maxPain.toLocaleString("en-US")}
          </text>
        </g>

        {/* x-axis labels */}
        <g>
          {data.map((d, i) => i % 3 === 0 ? (
            <text key={i} x={pad.left + i * bw + bw / 2} y={h - 10}
              textAnchor="middle" fill="var(--fg-2)" fontSize="13"
              fontFamily="JetBrains Mono, monospace">
              {(d.strike / 1000) + "k"}
            </text>
          ) : null)}
        </g>
      </svg>
    </div>
  );
}

window.UI = { TopBar, StatStrip, SignalBadge, Panel, StatCard, LevelsTable, Streak, SparkBars, AreaChart, OIChart, HoverDef };
window.DEFINITIONS = DEFINITIONS;

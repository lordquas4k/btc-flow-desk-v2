/* ============================================================
   AI ANALYSIS COMPONENT
   ============================================================ */

function AiAnalysis() {
  const [status, setStatus] = React.useState('idle');
  const [analysis, setAnalysis] = React.useState('');
  const [apiKey, setApiKey] = React.useState(() => {
    try { return localStorage.getItem('anthropic_key') || ''; } catch(e) { return ''; }
  });
  const [keyDraft, setKeyDraft] = React.useState('');

  function buildPrompt() {
    const d = window.DATA;
    const curOpt = d.optHistory[d.optHistory.length - 1];
    const isAboveFlip = d.levels.spot >= curOpt.gammaFlip;
    const gexRegime = curOpt.gex > 0
      ? 'Positive — dealers dampen moves, range-bound/pinning bias'
      : 'Negative — dealers amplify moves in direction of break, momentum follows through';
    const streakStr = d.streak5.map(v => v === 'up' ? '▲' : v === 'down' ? '▼' : '—').join(' ');
    const recent10 = d.etfHistory.slice(-10).map(s =>
      `${s.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${d.fmtM(s.ibit)}`
    ).join(' | ');

    return `You are an expert Bitcoin derivatives market analyst. Analyze this data snapshot and write a sharp, professional market analysis.

SESSION: ${d.session.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}

PRICE & OPTIONS STRUCTURE:
• BTC Spot: ${d.fmt$(d.levels.spot)} (${d.session.spotChange >= 0 ? '+' : ''}${d.session.spotChange}% session)
• GEX: ${(curOpt.gex >= 0 ? '+' : '') + curOpt.gex.toFixed(3)}B — ${gexRegime}
• Gamma Flip: ${d.fmt$(curOpt.gammaFlip)} — spot is ${Math.abs(curOpt.gammaFlip - d.levels.spot).toLocaleString()} ${isAboveFlip ? 'ABOVE' : 'BELOW'} the flip
• PCR: ${curOpt.pcr.toFixed(2)}
• Resistance: R1 ${d.fmt$(d.levels.r1.price)} (call wall), R2 ${d.fmt$(d.levels.r2.price)}, R3 ${d.fmt$(d.levels.r3.price)}
• Support: S1 ${d.fmt$(d.levels.s1.price)} (put wall), S2 ${d.fmt$(d.levels.s2.price)}, S3 ${d.fmt$(d.levels.s3.price)}

ETF FLOWS (IBIT):
• Last Session: ${d.fmtM(d.lastEtf.ibit)}
• 14d Average: ${d.fmtM(d.avg14)}
• 30d Average: ${d.fmtM(d.avg30)}
• Buy Dominance (30d): ${d.buyDominance}% positive sessions
• 5-Day Streak: ${streakStr}
• Recent 10 Sessions: ${recent10}

Write exactly 5 sections with these bold headers. Use specific price levels. Be direct and analytical. Total under 340 words.

**Day Environment**
What kind of tape is this? Pinning/trending/volatile? How does the current gamma regime shape expected behavior today?

**Bull Scenario**
If price moves up — what levels are the key gates, what does gamma do at each, where does the move ultimately target?

**Bear Scenario**
If price moves down — which support is critical, what a clean break signals, how dealer hedging amplifies the move?

**Bigger Picture**
Based on the 30d ETF trend, buy dominance, and gamma structure — what phase is this market in? Accumulation, distribution, breakout, or range?

**What's Changing**
Any notable shifts or divergences in the data recently that traders should be watching closely?`;
  }

  async function generate(keyOverride) {
    const key = keyOverride || apiKey;
    if (!key) { setStatus('needs-key'); return; }
    setStatus('loading');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 900,
          messages: [{ role: 'user', content: buildPrompt() }]
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setAnalysis(json.content[0].text);
      setStatus('done');
    } catch(e) {
      setAnalysis(e.message);
      setStatus('error');
    }
  }

  function saveKey() {
    try { localStorage.setItem('anthropic_key', keyDraft); } catch(e) {}
    setApiKey(keyDraft);
    setKeyDraft('');
    generate(keyDraft);
  }

  function mdToHtml(text) {
    const safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return safe
      .split(/\n\n+/)
      .map(block => {
        const hMatch = block.trim().match(/^\*\*([^*]+)\*\*$/);
        if (hMatch) return `<div class="ai-h">${hMatch[1]}</div>`;
        const withBold = block.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
        return `<p>${withBold.replace(/\n/g, '<br>')}</p>`;
      })
      .join('');
  }

  return (
    <div className="ai-analysis-section">
      <div className="ai-section-header">
        <span className="ai-section-label">◆ AI Analysis</span>
        {status === 'done' && (
          <button className="ai-regen-btn" onClick={() => { setStatus('idle'); setAnalysis(''); }}>Regenerate</button>
        )}
      </div>

      {status === 'idle' && (
        <button className="ai-generate-btn" onClick={() => generate()}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>✦</span>
          <span>Generate Analysis</span>
        </button>
      )}

      {status === 'needs-key' && (
        <div className="ai-key-prompt">
          <div className="ai-key-label">Enter your Anthropic API key to enable AI analysis:</div>
          <div className="ai-key-row">
            <input
              className="ai-key-input"
              type="password"
              placeholder="sk-ant-api03-..."
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && keyDraft && saveKey()}
            />
            <button className="ai-generate-btn" onClick={saveKey} disabled={!keyDraft}>Save &amp; Run</button>
          </div>
          <div className="ai-key-note">Stored in localStorage only — never sent anywhere except the Anthropic API.</div>
        </div>
      )}

      {status === 'loading' && (
        <div className="ai-loading">
          <span className="ai-spinner"></span>
          <span>Analyzing market data…</span>
        </div>
      )}

      {status === 'done' && (
        <div className="ai-result" dangerouslySetInnerHTML={{ __html: mdToHtml(analysis) }} />
      )}

      {status === 'error' && (
        <div className="ai-error">
          <span>Error: {analysis}</span>
          <button className="ai-regen-btn" onClick={() => { setStatus('idle'); setAnalysis(''); }}>Retry</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   OVERVIEW TAB
   ============================================================ */

function OverviewTab() {
  const { Panel, StatCard, LevelsTable, Streak, SignalBadge, HoverDef } = window.UI;
  const lastEtf = DATA.lastEtf;
  const curOpt = DATA.optHistory[DATA.optHistory.length - 1];
  const levels = DATA.levels;

  const gex5 = DATA.optHistory.slice(-5).map(o => o.gex > 0.02 ? "up" : o.gex < 0 ? "down" : "flat");

  // --- Derived context for dynamic Market Read ---
  const isPositiveGex  = curOpt.gex > 0;
  const isAboveFlip    = levels.spot >= curOpt.gammaFlip;
  const spotVsFlip     = Math.abs(curOpt.gammaFlip - levels.spot);
  const isPositiveEtf  = lastEtf.ibit > 0;
  const etfAboveAvg    = lastEtf.ibit > DATA.avg30;
  const posStreak      = DATA.streak5.filter(v => v === "up").length;

  const s1Price = DATA.fmt$(levels.s1.price);
  const s2Price = DATA.fmt$(levels.s2.price);
  const r1Price = DATA.fmt$(levels.r1.price);
  const gfPrice = DATA.fmt$(curOpt.gammaFlip);

  // Sort all key levels by price so takeaway text is always logically ordered
  const allKeyLevels = [
    { price: levels.r3?.price, label: 'R3' },
    { price: levels.r2?.price, label: 'R2' },
    { price: levels.r1?.price, label: 'R1' },
    { price: curOpt.gammaFlip,  label: 'GF' },
    { price: levels.s1?.price, label: 'S1' },
    { price: levels.s2?.price, label: 'S2' },
    { price: levels.s3?.price, label: 'S3' },
  ].filter(l => l.price).sort((a, b) => b.price - a.price);

  // Levels below spot (nearest first) and above spot (nearest first)
  const supBelow = allKeyLevels.filter(l => l.price < levels.spot);
  const resAbove = allKeyLevels.filter(l => l.price > levels.spot).reverse();

  const sup1 = supBelow[0], sup2 = supBelow[1], res1 = resAbove[0], res2 = resAbove[1];
  const fmtSup1 = sup1 ? DATA.fmt$(sup1.price) : s1Price;
  const fmtSup2 = sup2 ? DATA.fmt$(sup2.price) : s2Price;
  const fmtRes1 = res1 ? DATA.fmt$(res1.price) : gfPrice;
  const fmtRes2 = res2 ? DATA.fmt$(res2.price) : r1Price;

  const overallTone = isPositiveEtf && isPositiveGex
    ? "balanced with a mild bullish lean"
    : isPositiveEtf && !isPositiveGex
    ? "cautiously bullish — flow positive, gamma amplifying"
    : !isPositiveEtf && isPositiveGex
    ? "range-bound — flow negative, gamma suppressive"
    : "bearish — flow and gamma both negative";

  const gammaLabel  = isPositiveGex ? "long gamma" : "short gamma";
  const spotAction  = isAboveFlip ? "pinning above" : "pressing below";
  const watchNote   = isAboveFlip
    ? `Watch the GF break for the next move`
    : `Watch for a reclaim of GF at ${gfPrice}`;

  const gexLabel  = curOpt.gex > 0.05 ? "strong positive" : curOpt.gex > 0 ? "mild positive" : curOpt.gex > -0.05 ? "mild negative" : "strong negative";
  const gexEffect = isPositiveGex ? "range-bound" : "momentum-amplifying";
  const pcrLabel  = curOpt.pcr > 1.4 ? "heavy put skew" : curOpt.pcr > 1.1 ? "put lean" : curOpt.pcr < 0.8 ? "call lean" : "balanced";
  const avgLabel  = etfAboveAvg ? "short-term demand accelerating" : "short-term demand cooling";

  const optSignal      = isPositiveGex ? "NEUTRAL" : "WATCH";
  const etfSignal      = isPositiveEtf ? "IN" : "OUT";
  const combinedSignal = isPositiveEtf && isPositiveGex ? "NEUTRAL"
    : isPositiveEtf || isPositiveGex ? "NEUTRAL"
    : "WATCH";

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "var(--gap-grid)" }}>

      {/* KPI ROW */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        <StatCard term="GEX" label="GEX"
          value={(curOpt.gex >= 0 ? "+" : "") + curOpt.gex.toFixed(3) + "B"}
          glow={curOpt.gex >= 0 ? "mint" : "red"} accent={curOpt.gex >= 0 ? "mint" : "red"}
          sub={curOpt.gex > 0.1 ? "Strong Positive · Suppressive"
             : curOpt.gex > 0 ? "Mild Positive · Range-Bound"
             : curOpt.gex > -0.1 ? "Mild Negative · Watch For Momentum"
             : "Strong Negative · Amplifying"}
          current={`${(curOpt.gex>=0?"+":"")+curOpt.gex.toFixed(3)}B — ${curOpt.gex >= 0 ? "Positive Gamma" : "Negative Gamma"}`}
          tone={curOpt.gex >= 0 ? "neu" : "warn"} />
        <StatCard term="Gamma Flip" label="Gamma Flip"
          value={gfPrice} glow="amber" accent="amber"
          sub={isAboveFlip ? "Spot Above Flip" : "Spot Below Flip"}
          current={`Spot ${DATA.fmt$(levels.spot)} vs Flip ${gfPrice} — ${isAboveFlip ? "Above = Pinning Regime" : "Below = Momentum Regime"}`}
          tone={isAboveFlip ? "neu" : "warn"} />
        <StatCard term="PC Ratio" label="PC Ratio"
          value={curOpt.pcr.toFixed(2)}
          glow={curOpt.pcr > 1.2 ? "red" : curOpt.pcr < 0.8 ? "mint" : "red"}
          accent={curOpt.pcr > 1.2 ? "red" : curOpt.pcr < 0.8 ? "mint" : "red"}
          sub={curOpt.pcr > 1.2 ? "Put Skew" : curOpt.pcr < 0.8 ? "Call Skew" : "Slight Put Skew"}
          current={`${curOpt.pcr.toFixed(2)} — ${pcrLabel.charAt(0).toUpperCase() + pcrLabel.slice(1)}`}
          tone="neu" />
        <StatCard term="IBIT Flow" label="IBIT Flow"
          value={DATA.fmtM(lastEtf.ibit)} glow={lastEtf.ibit >= 0 ? "mint" : "red"} accent={lastEtf.ibit >= 0 ? "mint" : "red"}
          sub={(() => {
            const today = new Date(); const yest = new Date(today); yest.setDate(today.getDate() - 1);
            const label = lastEtf.date.toDateString() === yest.toDateString() ? "Yesterday" : "Last Available";
            return DATA.fmtDate(lastEtf.date) + " · " + label;
          })()}
          current={`${DATA.fmtM(lastEtf.ibit)} — ${lastEtf.ibit > 200 ? "Strong Demand Print" : lastEtf.ibit > 0 ? "Healthy Demand Print" : "Outflow Print"}`}
          tone="neu" />
        <StatCard term="vs 30D Avg" label="vs 30D Avg"
          value={lastEtf.ibit >= DATA.avg30
            ? <span className="badge b-mint" style={{fontSize: 12, padding: "4px 10px"}}><span className="dot"></span>ABOVE AVG</span>
            : <span className="badge b-red"  style={{fontSize: 12, padding: "4px 10px"}}><span className="dot"></span>BELOW AVG</span>}
          sub={`14d Avg ${DATA.fmtM(DATA.avg14)} · 30d ${DATA.fmtM(DATA.avg30)}`}
          current={etfAboveAvg ? "Short-Term Demand Accelerating" : "Short-Term Demand Cooling"}
          tone="neu" />
        <StatCard term="Buy Dominance" label="Buy Dominance"
          value={DATA.buyDominance + "%"}
          glow={DATA.buyDominance >= 60 ? "mint" : "red"}
          accent={DATA.buyDominance >= 60 ? "mint" : "red"}
          sub={DATA.buyDominance >= 70 ? "Strong Demand Regime" : DATA.buyDominance >= 50 ? "Moderate Demand" : "Weak Demand"}
          current={`${DATA.buyDominance}% ${DATA.buyDominance >= 70 ? "> 70% Threshold — Strong" : DATA.buyDominance >= 50 ? "> 50% Threshold — Moderate" : "< 50% — Weak"}`}
          tone="neu" />
      </div>

      {/* MARKET READ — dynamic summary */}
      <Panel title="Market Read" dot="violet" className="read-summary">
        <div className="lede">
          The tape reads <span className="em-amber">{overallTone}</span>. IBIT printed{" "}
          <span className={isPositiveEtf ? "em-mint" : "em-red"}>{DATA.fmtM(lastEtf.ibit)}</span> yesterday, dealers are{" "}
          <span className={isPositiveGex ? "em-mint" : "em-red"}>{gammaLabel}</span>, and spot is{" "}
          <span className="em-violet">{spotAction}</span> the gamma flip at{" "}
          <span className="em-amber">{gfPrice}</span>.{" "}
          <span className="em-red">{watchNote}</span>.
        </div>
        <div className="read-bullets">
          <div className={`read-bullet ${isPositiveEtf ? "b-mint" : "b-red"}`}>
            <div className="ev-label">ETF Tape</div>
            <div className="ev-text">
              <strong>{DATA.fmtM(lastEtf.ibit)}</strong> into IBIT yesterday. 30d avg <strong>{DATA.fmtM(DATA.avg30)}</strong>,{" "}
              14d <strong>{DATA.fmtM(DATA.avg14)}</strong> — {avgLabel}. Buy dominance <strong>{DATA.buyDominance}%</strong>.
            </div>
          </div>
          <div className="read-bullet b-amber">
            <div className="ev-label">Options Tape</div>
            <div className="ev-text">
              GEX <strong>{(curOpt.gex >= 0 ? "+" : "") + curOpt.gex.toFixed(3)}B</strong> ({gexLabel}).{" "}
              Spot sits <strong>${spotVsFlip.toLocaleString("en-US")} {isAboveFlip ? "above" : "below"}</strong> the gamma flip —{" "}
              technically {isAboveFlip ? "positive" : "negative"}-gamma territory{isAboveFlip ? ", pinning" : " but barely so"}.{" "}
              PCR <strong>{curOpt.pcr.toFixed(2)}</strong> = {pcrLabel}.
            </div>
          </div>
          <div className="read-bullet b-violet">
            <div className="ev-label">Levels</div>
            <div className="ev-text">
              S1 / Max Pain stacked at <strong>{s1Price}</strong> — {levels.s1.strength} of 5 strength.{" "}
              Call wall <strong>{r1Price}</strong>. Range <strong>{s1Price}–{r1Price}</strong> is the path of least resistance into expiry.
            </div>
          </div>
          <div className="read-bullet b-red">
            <div className="ev-label">Risk</div>
            <div className="ev-text">
              A clean break of <strong>{fmtSup1}</strong>{" "}
              {sup2
                ? <>opens <strong>{fmtSup2}</strong> fast — there is little OI cushion between the two.</>
                : <>opens uncharted territory with limited nearby structure below.</>
              }{" "}
              PCR {curOpt.pcr > 1.0 ? "elevated" : "rising"} into expiry is the early-warning signal.
            </div>
          </div>
        </div>
        <div className="read-takeaway">
          <span className="ta-label">Takeaway</span>
          <span className="ta-body">
            {isPositiveGex
              ? <><strong>Trade the range, not the trend.</strong> Long off {fmtSup1} with a stop under ${sup1 ? (sup1.price - 200).toLocaleString("en-US") : (levels.s1.price - 200).toLocaleString("en-US")}, short rallies into {fmtRes2 || fmtRes1}. Flip directional only on a clean break of either wall on heavy volume.</>
              : <><strong>Momentum regime — follow the break.</strong> Watch {fmtSup1} as key support.{" "}{sup2 ? <>A break lower targets {fmtSup2}.</> : <>Below has limited nearby structure.</>} Upside reclaim of {fmtRes1} flips back to range mode.</>
            }
          </span>
        </div>
        <AiAnalysis />
      </Panel>

      {/* SIGNAL READOUT */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Panel title="Options Signal" dot="amber">
          <div className="flex items-center justify-between">
            <SignalBadge sig={optSignal} />
            <span className="muted mono" style={{fontSize: 11}}>GEX {(curOpt.gex >= 0 ? "+" : "") + curOpt.gex.toFixed(3)}B</span>
          </div>
          <div className="mt-3 mono" style={{fontSize: 12, color: "var(--fg-2)", lineHeight: 1.55}}>
            {isPositiveGex ? "Positive" : "Negative"} gamma · {gexEffect}. Spot {isAboveFlip ? "pinning to" : "pressing"}{" "}
            <span className="glow-amber mono">{gfPrice}</span> into expiry.
          </div>
        </Panel>

        <Panel title="ETF Signal" dot="mint">
          <div className="flex items-center justify-between">
            <SignalBadge sig={etfSignal} />
            <span className="muted mono" style={{fontSize: 11}}>{DATA.fmtM(lastEtf.total)} total</span>
          </div>
          <div className="mt-3 mono" style={{fontSize: 12, color: "var(--fg-2)", lineHeight: 1.55}}>
            IBIT <span className={`${isPositiveEtf ? "glow-mint" : "glow-red"} mono`}>{DATA.fmtM(lastEtf.ibit)}</span> · Others {DATA.fmtM(lastEtf.others)}. <br/>
            Streak: {posStreak}-of-5 positive sessions.
          </div>
        </Panel>

        <Panel title="Combined Read" dot="violet">
          <div className="flex items-center justify-between">
            <SignalBadge sig={combinedSignal} />
            <span className="muted mono" style={{fontSize: 11}}>{isAboveFlip ? "Above GF" : "Watch GF break"}</span>
          </div>
          <div className="mt-3 mono" style={{fontSize: 12, color: "var(--fg-2)", lineHeight: 1.55}}>
            {isPositiveEtf && isPositiveGex
              ? <>Bullish confluence. Hold above <span className="glow-mint mono">{s1Price}</span> for continuation, break below opens S2.</>
              : isPositiveEtf && !isPositiveGex
              ? <>Flow positive but gamma amplifying — breakout risk. Reclaim of <span className="glow-amber mono">{gfPrice}</span> flips regime.</>
              : !isPositiveEtf && isPositiveGex
              ? <>Outflows into positive gamma — range still intact. Watch <span className="glow-mint mono">{s1Price}</span> as floor.</>
              : <>Both flow and gamma negative — momentum lower. Key risk level <span className="glow-red mono">{s1Price}</span>.</>
            }
          </div>
        </Panel>
      </div>

      {/* LEVELS */}
      <Panel>
        <LevelsTable levels={DATA.levels} regime={isPositiveGex ? "positive-gamma" : "negative-gamma"} />
      </Panel>

      {/* STREAKS */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Panel title="5-Day ETF Streak" dot="mint">
          <div className="flex items-center justify-between mt-1">
            <Streak vals={DATA.streak5} />
            <span className="mono muted" style={{fontSize: 11}}>
              {DATA.streak5.filter(v => v === "up").length} of 5 positive
            </span>
          </div>
        </Panel>
        <Panel title="5-Day GEX Trend (weekly)" dot="amber">
          <div className="flex items-center justify-between mt-1">
            <Streak vals={gex5} />
            <span className="mono muted" style={{fontSize: 11}}>
              {gex5.filter(v => v === "up").length} of 5 positive gamma
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

window.OverviewTab = OverviewTab;

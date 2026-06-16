/* ============================================================
   OPTIONS FLOW TAB
   ============================================================ */

function OptionsFlowTab() {
  const { Panel, StatCard, LevelsTable, OIChart, AreaChart, HoverDef } = window.UI;
  const [expirySet, setExpirySet] = useState("Weekly");
  const [weeklyFile, setWeeklyFile] = useState(null);
  const [monthlyFile, setMonthlyFile] = useState(null);

  // Active bucket — driven by the segmented control
  const bucket = DATA.currentByExpiry[expirySet.toLowerCase()] || DATA.currentByExpiry.weekly;
  const spot = DATA.session.spot;

  // Format helpers
  const fmtOI = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);

  // Regime label based on spot vs flip
  const regime = spot < bucket.gammaFlip ? "negative-gamma" : "positive-gamma";

  // IV skew %
  const putPct = bucket.putIV;
  const callPct = bucket.callIV;
  const skewBar = (putPct / (putPct + callPct)) * 100;

  // GEX/PCR sparkline data from history
  const gexHistory = DATA.optHistory.map((o) => ({
    label: DATA.fmtDate(o.date),
    value: Math.round(o.gex * 1000) / 10
  }));
  const pcrHistory = DATA.optHistory.map((o) => ({
    label: DATA.fmtDate(o.date),
    value: parseFloat((o.pcr - 1).toFixed(2)) * 100
  }));

  // Per-bucket tone for KPI tooltips
  const gexTone = bucket.gex > 0.1 ? "neu" : bucket.gex < -0.1 ? "warn" : "neu";
  const pcrTone = bucket.pcr > 1.5 ? "warn" : bucket.pcr < 0.7 ? "neu" : "neu";

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "var(--gap-grid)" }}>

      {/* UPLOAD ROW */}
      <Panel title="Upload Options Chain" dot="mint"
        action={
          <div className="flex items-center gap-3">
            <span className="mono muted" style={{fontSize: 11}}>Spot</span>
            <span className="mono glow-white" style={{fontSize: 14, fontWeight: 600}}>${spot.toLocaleString("en-US")}</span>
          </div>
        }>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <FileDrop label="Weekly Expiry CSV" file={weeklyFile} onFile={setWeeklyFile} hint="15 May 26 · ATM ±20%" />
          <FileDrop label="Monthly Expiry CSV" file={monthlyFile} onFile={setMonthlyFile} hint="30 May 26 · ATM ±25%" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="mono muted" style={{fontSize: 11}}>Required for GEX, walls and gamma flip calculations</span>
          <button className="btn primary">RUN ANALYSIS</button>
        </div>
      </Panel>

      {/* EXPIRY SEGMENT */}
      <div className="flex items-center justify-between">
        <div className="segment">
          {["Weekly", "Monthly", "Combined"].map(s => (
            <button key={s} className={expirySet === s ? "on" : ""} onClick={() => setExpirySet(s)}>{s}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="eyebrow">Showing</span>
          <span className="mono glow-white" style={{fontSize: 14, fontWeight: 600}}>{bucket.label} · {bucket.expiry}</span>
          <span className={"badge " + (regime === "negative-gamma" ? "b-red" : "b-mint")}>
            <span className="dot"></span>{regime === "negative-gamma" ? "negative gamma" : "positive gamma"}
          </span>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <StatCard term="GEX" label="GEX"
          value={(bucket.gex >= 0 ? "+" : "") + bucket.gex.toFixed(3) + "B"}
          glow={bucket.gex >= 0 ? "mint" : "red"} accent={bucket.gex >= 0 ? "mint" : "red"}
          sub={bucket.gex > 0.02 ? "Positive · Suppressive" : bucket.gex < -0.02 ? "Negative · Amplifying" : "Mild · Range-Bound"}
          current={`${bucket.label} GEX ${(bucket.gex>=0?"+":"")+bucket.gex.toFixed(3)}B`} tone={gexTone} />
        <StatCard term="Gamma Flip" label="Gamma Flip"
          value={DATA.fmt$(bucket.gammaFlip)} glow="amber" accent="amber"
          sub={spot < bucket.gammaFlip ? "Spot Below Flip" : "Spot Above Flip"}
          current={`Spot $${spot.toLocaleString("en-US")} vs Flip $${bucket.gammaFlip.toLocaleString("en-US")}`}
          tone={spot < bucket.gammaFlip ? "warn" : "neu"} />
        <StatCard term="PC Ratio" label="PC Ratio"
          value={bucket.pcr.toFixed(2)} glow={bucket.pcr > 1.5 ? "red" : "mint"} accent={bucket.pcr > 1.5 ? "red" : "mint"}
          sub={bucket.pcr > 1.5 ? "Bearish Positioning" : bucket.pcr < 0.7 ? "Bullish Positioning" : "Balanced"}
          current={`${bucket.label} ${bucket.pcr.toFixed(2)} — ${bucket.pcr > 1.5 ? "Heavy Put Skew" : bucket.pcr < 0.7 ? "Call Skew" : "Balanced"}`}
          tone={pcrTone} />
        <StatCard term="Call Wall" label="Call Wall"
          value={DATA.fmt$(bucket.callWall)} glow="red" accent="red" sub="Resistance / Ceiling"
          current={`${bucket.callWallOI.toLocaleString("en-US")} Contracts At ${bucket.expiry}`} tone="warn" />
        <StatCard term="Put Wall" label="Put Wall"
          value={DATA.fmt$(bucket.putWall)} glow="mint" accent="mint" sub="Support / Floor"
          current={`${bucket.putWallOI.toLocaleString("en-US")} Contracts At ${bucket.expiry}`} tone="neu" />
      </div>

      {/* IV SKEW */}
      <Panel title="IV Skew" dot="violet" action={<HoverDef term="IV Skew"><span className="info" style={{display:"inline-grid", placeItems:"center", width: 18, height: 18, borderRadius: "50%", border: "1px solid var(--line-strong)", fontSize: 9, color: "var(--fg-3)", cursor: "help"}}>i</span></HoverDef>}>
        <div className="flex items-center gap-4" style={{flexWrap: "wrap"}}>
          <span className="mono" style={{fontSize: 13}}>
            <span className="muted">Puts</span> <span className="glow-red mono" style={{fontWeight: 600}}>{putPct.toFixed(1)}%</span>
          </span>
          <span className="mono" style={{fontSize: 13}}>
            <span className="muted">Calls</span> <span className="glow-mint mono" style={{fontWeight: 600}}>{callPct.toFixed(1)}%</span>
          </span>
          <div className="iv-bar" style={{flex: 1, minWidth: 260, "--put-pct": skewBar + "%"}}></div>
          <span className={"badge " + (putPct > callPct + 5 ? "b-red" : callPct > putPct + 5 ? "b-mint" : "b-muted")}>
            <span className="dot"></span>{putPct > callPct + 5 ? "Put skew dominant" : callPct > putPct + 5 ? "Call skew dominant" : "Balanced skew"}
          </span>
        </div>
      </Panel>

      {/* LEVELS + OI ROW */}
      <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr" }}>
        <Panel><LevelsTable levels={bucket.levels} regime={regime} /></Panel>
        <Panel title="Open Interest by Strike" dot="blue"
          action={
            <div className="flex items-center gap-3">
              <span className="mono muted" style={{fontSize: 11}}>Calls</span><span className="dotchip" style={{background:"var(--blue)"}}></span>
              <span className="mono muted" style={{fontSize: 11}}>Puts</span><span className="dotchip" style={{background:"var(--amber)"}}></span>
              <span className="badge b-muted">{bucket.expiry}</span>
            </div>
          }>
          <OIChart data={bucket.oiByStrike} spot={spot} maxPain={bucket.maxPain} height={260} />
          <div className="grid mt-3" style={{ gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            <Mini term="Call OI" label="Call OI" v={fmtOI(bucket.callOI)} />
            <Mini term="Put OI" label="Put OI" v={fmtOI(bucket.putOI)} />
            <Mini term="Total" label="Total OI" v={fmtOI(bucket.totalOI)} />
            <Mini term="PC Ratio" label="PC Ratio" v={(bucket.putOI / bucket.callOI).toFixed(2)} cls={bucket.putOI / bucket.callOI > 1.5 ? "glow-red" : "glow-mint"} />
            <Mini term="Max Pain" label="Max Pain" v={DATA.fmt$(bucket.maxPain)} cls="glow-red" />
          </div>
        </Panel>
      </div>

      {/* TIME SERIES ROW */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Panel title="GEX History (last 30 sessions)" dot="mint">
          <AreaChart data={gexHistory} kind="gex" height={200} />
        </Panel>
        <Panel title="PC Ratio History (last 30 sessions)" dot="violet">
          <AreaChart data={pcrHistory} kind="pcr" height={200} />
        </Panel>
      </div>

      {/* HISTORY TABLE */}
      <Panel title="Expiry History">
        <table className="dt">
          <thead>
            <tr>
              <th>Date</th><th>Expiry</th><th>Type</th><th className="r">GEX</th><th className="r">Gamma Flip</th>
              <th className="r">Put Wall</th><th className="r">Call Wall</th><th className="r">PC Ratio</th><th>Bias</th>
            </tr>
          </thead>
          <tbody>
            {DATA.optHistory.slice().reverse().slice(0, 12).map((o, i) => (
              <tr key={i}>
                <td className="muted">{DATA.fmtDate(o.date)}, 2026</td>
                <td className="dim">{o.expiry}</td>
                <td><span className="badge b-muted">{o.type}</span></td>
                <td className={"r " + (o.gex >= 0 ? "pos" : "neg")}>{o.gex >= 0 ? "+" : ""}{o.gex.toFixed(3)}B</td>
                <td className="r dim">{DATA.fmt$(o.gammaFlip)}</td>
                <td className="r pos">{DATA.fmt$(o.putWall)}</td>
                <td className="r neg">{DATA.fmt$(o.callWall)}</td>
                <td className={"r " + (o.pcr > 1.5 ? "neg" : o.pcr < 0.7 ? "pos" : "dim")}>{o.pcr.toFixed(2)}</td>
                <td><span className={"badge " + (o.bias === "Bullish" ? "b-mint" : o.bias === "Bearish" ? "b-red" : "b-muted")}>
                  <span className="dot"></span>{o.bias}
                </span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function FileDrop({ label, file, onFile, hint }) {
  const inputRef = useRef(null);
  return (
    <div className="field">
      <label>{label}</label>
      <div className={"drop" + (file ? " has-file" : "")} onClick={() => inputRef.current && inputRef.current.click()}>
        <input ref={inputRef} type="file" accept=".csv" style={{display: "none"}}
          onChange={e => e.target.files[0] && onFile(e.target.files[0].name)} />
        <div className="icon">{file ? "✓" : "↑"}</div>
        <div className="title">{file ? file : `Drop CSV or click to browse`}</div>
        <div className="sub">{file ? "Ready · click to replace" : hint}</div>
      </div>
    </div>
  );
}

function Mini({ label, v, cls, term }) {
  const { HoverDef } = window.UI;
  const inner = (
    <>
      <div className="label" style={{marginBottom: 4}}>{label}</div>
      <div className={"mono " + (cls || "")} style={{fontSize: 14, fontWeight: 600}}>{v}</div>
    </>
  );
  const wrap = (
    <div style={{borderTop: "1px solid var(--line)", paddingTop: 8}}>{inner}</div>
  );
  if (!term) return wrap;
  return <HoverDef term={term} block className="w-full">{wrap}</HoverDef>;
}

window.OptionsFlowTab = OptionsFlowTab;

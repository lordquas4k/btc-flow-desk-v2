/* ============================================================
   OPTIONS FLOW TAB
   ============================================================ */

function OptionsFlowTab() {
  const { Panel, StatCard, LevelsTable, OIChart, HoverDef } = window.UI;
  const { FeDemandPanel, BtcPriceChart } = window.FlowsEngine;
  const [expirySet, setExpirySet] = useState("Weekly");

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

  // PCR demand series: (1 − PCR) × 100 → positive = call-heavy (bullish), negative = put-heavy (bearish)
  // Cells show the actual PCR value; axis shows the signed score (+/−)
  const pcrSeries   = DATA.optHistory.map(o => (1 - o.pcr) * 100);
  const pcrDates    = DATA.optHistory.map(o => o.date);
  const pcrCellFmt  = v => (1 - v / 100).toFixed(2);                      // cells: e.g. "0.85"
  const pcrAxisFmt  = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(0); // axis:  e.g. "+35"

  // Per-bucket tone for KPI tooltips
  const gexTone = bucket.gex > 0.1 ? "neu" : bucket.gex < -0.1 ? "warn" : "neu";
  const pcrTone = bucket.pcr > 1.5 ? "warn" : bucket.pcr < 0.7 ? "neu" : "neu";

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "var(--gap-grid)" }}>

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
        <Panel>
          <LevelsTable
            resistance={[bucket.levels?.r1, bucket.levels?.r2, bucket.levels?.r3]}
            support={[bucket.levels?.s1, bucket.levels?.s2, bucket.levels?.s3]}
            spot={spot}
            regime={regime}
          />
        </Panel>
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

      {/* PRICE + FLOWS ALIGNED */}
      <BtcPriceChart />
      <FeDemandPanel series={pcrSeries} dates={pcrDates} label="Options Demand (PCR)" fmtVal={pcrCellFmt} fmtAxis={pcrAxisFmt} mode="pcr" compact={true} />
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

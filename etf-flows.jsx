/* ============================================================
   ETF FLOWS TAB
   ============================================================ */

function ETFFlowsTab() {
  const { Panel, StatCard, Streak, SparkBars, AreaChart, SignalBadge, HoverDef } = window.UI;
  const store = window.ETFStore.useEtfStore();

  // Default date = the day AFTER the latest entry (mock or user) — "next day to log"
  // Use local getters (not toISOString/UTC) so the date never shifts in UTC+ timezones.
  const localDateStr = (d) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  const nextDate = (() => {
    const last = store.history[store.history.length - 1];
    if (!last) return localDateStr(new Date());
    const d = new Date(last.date);
    d.setDate(d.getDate() + 1);
    return localDateStr(d);
  })();

  const [date, setDate] = useState(nextDate);
  const [ibitInput, setIbitInput] = useState("");
  const [otherInput, setOtherInput] = useState("");
  const [savedFlash, setSavedFlash] = useState(null);
  const [error, setError] = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | loading | done | error
  const [syncMsg, setSyncMsg] = useState("");

  // Parse "+284" / "284" / "−50" / "-50" / "284.0M" / "+284M"
  const parseFlow = (raw) => {
    if (raw === "" || raw == null) return NaN;
    let s = String(raw).trim()
      .replace(/^\+/, "")        // leading +
      .replace(/−/g, "-")        // unicode minus
      .replace(/[Mm$,\s]/g, ""); // strip M, $, commas, spaces
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  };

  const handleSave = () => {
    setError(null);
    const ibit = parseFlow(ibitInput);
    const others = parseFlow(otherInput);
    if (!date) { setError("Pick a date"); return; }
    if (Number.isNaN(ibit) && Number.isNaN(others)) { setError("Enter at least one flow value"); return; }
    window.ETFStore.addEntry({
      date,
      ibit: Number.isNaN(ibit) ? 0 : ibit,
      others: Number.isNaN(others) ? 0 : others
    });
    setSavedFlash(`Saved ${date}`);
    setIbitInput("");
    setOtherInput("");
    // advance date by 1 for next entry (parse as local to avoid UTC shift)
    const [y, mo, dy] = date.split('-').map(Number);
    const d = new Date(y, mo - 1, dy + 1);
    setDate(localDateStr(d));
    setTimeout(() => setSavedFlash(null), 2200);
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  const handleFarsideSync = async () => {
    setSyncStatus("loading");
    setSyncMsg("");
    try {
      const remote = await window.ETFStore.fetchFarsideFlows();
      const existing = new Set(store.history.map(s => localDateStr(s.date)));
      const fresh = remote.filter(e => !existing.has(e.date));
      if (!fresh.length) {
        setSyncStatus("done");
        setSyncMsg("Already up to date");
      } else {
        fresh.forEach(e => window.ETFStore.addEntry(e));
        setSyncStatus("done");
        setSyncMsg(`+${fresh.length} session${fresh.length > 1 ? "s" : ""} imported`);
      }
    } catch(e) {
      setSyncStatus("error");
      setSyncMsg(e.message);
    }
    setTimeout(() => { setSyncStatus("idle"); setSyncMsg(""); }, 5000);
  };

  const lastEtf = store.lastEtf;
  const history = store.history;
  const ibitSeries = history.map(s => ({ label: DATA.fmtDate(s.date), value: s.ibit }));
  const totalSeries = history.map(s => ({ label: DATA.fmtDate(s.date), value: s.total }));

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "var(--gap-grid)" }}>

      {/* DAILY ENTRY */}
      <Panel title="Daily Entry" dot="mint"
        action={
          syncStatus === "loading" ? <span className="badge b-muted"><span className="dot"></span>Fetching Farside…</span>
          : syncStatus === "done"  ? <span className="badge b-mint"><span className="dot"></span>{syncMsg}</span>
          : syncStatus === "error" ? <span className="badge b-red" title={syncMsg}><span className="dot"></span>Sync failed</span>
          : savedFlash             ? <span className="badge b-mint"><span className="dot"></span>{savedFlash}</span>
          : error                  ? <span className="badge b-red"><span className="dot"></span>{error}</span>
          : <span className="mono muted" style={{fontSize: 11}}>Persisted Locally · {store.userEntries.length} Entries</span>
        }>
        <div className="flex items-center gap-3" style={{flexWrap: "wrap"}} onKeyDown={handleKeyDown}>
          <div className="field" style={{minWidth: 160}}>
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="field" style={{minWidth: 180}}>
            <label>IBIT Flow ($M)</label>
            <input className="input" placeholder="e.g.  +284.0" value={ibitInput} onChange={e => setIbitInput(e.target.value)} autoFocus />
          </div>
          <div className="field" style={{minWidth: 180}}>
            <label>Others Flow ($M)</label>
            <input className="input" placeholder="e.g.  −50.0" value={otherInput} onChange={e => setOtherInput(e.target.value)} />
          </div>
          <div style={{alignSelf: "flex-end", display: "flex", gap: 8}}>
            <button className="btn primary" onClick={handleSave}>SAVE ENTRY</button>
            <button className="btn" onClick={handleFarsideSync} disabled={syncStatus === "loading"}
              title="Fetch latest ETF flows from farside.co.uk and import new sessions">
              {syncStatus === "loading" ? "…" : "↓ Sync Farside"}
            </button>
          </div>
          <div style={{flex: 1, minWidth: 220, alignSelf: "flex-end"}} className="mono muted">
            <span className="kbd">⌘ ↵</span> save · advances to next day · accepts <span className="mono">+284</span>, <span className="mono">-50</span>, <span className="mono">284.0M</span>
          </div>
        </div>
      </Panel>

      {/* KPI ROW */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        <StatCard term="IBIT Flow" label="IBIT Flow"
          value={DATA.fmtM(lastEtf.ibit)} glow={lastEtf.ibit >= 0 ? "mint" : "red"} accent={lastEtf.ibit >= 0 ? "mint" : "red"}
          sub={DATA.fmtDate(lastEtf.date) + ", " + lastEtf.date.getFullYear() + (lastEtf.userEntry ? " · Yours" : "")}
          current={`${DATA.fmtM(lastEtf.ibit)} — ${lastEtf.ibit > 200 ? "Strong Bid" : lastEtf.ibit > 0 ? "Healthy Bid" : lastEtf.ibit > -100 ? "Mild Outflow" : "Heavy Distribution"}`}
          tone={lastEtf.ibit >= 0 ? "neu" : "warn"} />
        <StatCard term="30D Avg" label="30D Avg"
          value={DATA.fmtM(store.avg30)} glow={store.avg30 >= 0 ? "mint" : "red"} accent={store.avg30 >= 0 ? "mint" : "red"}
          sub="IBIT 30-Day Average"
          current={`${DATA.fmtM(store.avg30)} Per Session`} tone={store.avg30 >= 0 ? "neu" : "warn"} />
        <StatCard term="14D Avg" label="14D Avg"
          value={DATA.fmtM(store.avg14)} glow={store.avg14 >= 0 ? "mint" : "red"} accent={store.avg14 >= 0 ? "mint" : "red"}
          sub="IBIT 14-Day Average"
          current={`${DATA.fmtM(store.avg14)} Per Session`} tone={store.avg14 >= 0 ? "neu" : "warn"} />
        <StatCard term="vs 30D Avg" label="vs 30D Avg"
          value={
            store.avg30 === 0 ? "—"
            : <span className={"badge " + (store.avg14 > store.avg30 ? "b-mint" : "b-red")} style={{fontSize: 12, padding: "4px 10px"}}>
                <span className="dot"></span>{store.avg14 > store.avg30 ? "ABOVE AVG" : "BELOW AVG"}
              </span>
          }
          sub={(store.avg30 ? Math.round(((store.avg14 / store.avg30) - 1) * 100) : 0) + "% vs 30d"}
          current={store.avg14 > store.avg30 ? "Short-Term Demand Accelerating" : "Short-Term Demand Fading"}
          tone={store.avg14 > store.avg30 ? "neu" : "warn"} />
        <StatCard term="Buy Dominance" label="Buy Dominance"
          value={store.buyDominance + "%"} glow={store.buyDominance >= 50 ? "mint" : "red"} accent={store.buyDominance >= 50 ? "mint" : "red"}
          sub="Days Positive (30d)"
          current={`${store.buyDominance}% ${store.buyDominance >= 70 ? "> 70% — Strong" : store.buyDominance >= 40 ? "Balanced" : "< 40% — Distribution"}`}
          tone={store.buyDominance >= 50 ? "neu" : "warn"} />
        <StatCard term="Buy/Sell Ratio" label="Buy/Sell Ratio"
          value={store.buySellRatio + "x"} glow={parseFloat(store.buySellRatio) >= 1 ? "mint" : "red"} accent={parseFloat(store.buySellRatio) >= 1 ? "mint" : "red"}
          sub="Σ Positive ÷ Σ Negative"
          current={`${store.buySellRatio}x ${parseFloat(store.buySellRatio) > 1.5 ? "— Clear Accumulation" : parseFloat(store.buySellRatio) < 0.8 ? "— Distribution" : "— Balanced"}`}
          tone={parseFloat(store.buySellRatio) >= 1 ? "neu" : "warn"} />
      </div>

      {/* STREAK */}
      <Panel title="5-Day Streak" dot="mint">
        <div className="flex items-center justify-between">
          <Streak vals={store.streak5} />
          <span className="mono muted" style={{fontSize: 11}}>
            {store.streak5.filter(v => v === "up").length}-of-5 positive · last 5 sessions
          </span>
        </div>
      </Panel>

      {/* CHARTS */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Panel title="IBIT Daily Flow (last 60 sessions)" dot="mint">
          <SparkBars data={ibitSeries.slice(-60)} kind="ibit" height={220} />
        </Panel>
        <Panel title="Total Net Flow (last 60 sessions)" dot="violet">
          <AreaChart data={totalSeries.slice(-60)} kind="total" height={220} />
        </Panel>
      </div>

      {/* HISTORY */}
      <Panel title="Flow History" action={
        store.userEntries.length > 0 ? (
          <button className="btn" style={{padding: "5px 10px", fontSize: 11}}
            onClick={() => { if (confirm("Clear all your manually-entered ETF flow entries? This cannot be undone.")) { localStorage.removeItem("btc-flow-desk:etf-entries:v1"); window.location.reload(); } }}>
            Clear my entries
          </button>
        ) : null
      }>
        <table className="dt">
          <thead>
            <tr>
              <th>Date</th>
              <th className="r">IBIT ($M)</th>
              <th className="r">Others ($M)</th>
              <th className="r">Total ($M)</th>
              <th>Signal</th>
              <th className="r">Src</th>
            </tr>
          </thead>
          <tbody>
            {history.slice().reverse().slice(0, 20).map((s, i) => (
              <tr key={i}>
                <td className="muted">{DATA.fmtDate(s.date)}, {s.date.getFullYear()}</td>
                <td className={"r " + (s.ibit >= 0 ? "pos" : "neg")}>{DATA.fmtM(s.ibit)}</td>
                <td className={"r " + (s.others >= 0 ? "pos" : "neg")}>{DATA.fmtM(s.others)}</td>
                <td className={"r " + (s.total >= 0 ? "pos" : "neg")}>{DATA.fmtM(s.total)}</td>
                <td><SignalBadge sig={s.signal} /></td>
                <td className="r">
                  {s.userEntry
                    ? <span className="badge b-mint" style={{fontSize: 9, padding: "2px 6px"}}>YOURS</span>
                    : <span className="badge b-muted" style={{fontSize: 9, padding: "2px 6px"}}>MOCK</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

window.ETFFlowsTab = ETFFlowsTab;

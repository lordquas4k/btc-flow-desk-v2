/* ============================================================
   APP — BTC Flow Desk
   ============================================================ */

const { useState: useState_, useEffect: useEffect_, useMemo: useMemo_ } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "glow": "subtle",
  "density": "comfortable",
  "bg": "grid",
  "accent": "mint",
  "live": false
}/*EDITMODE-END*/;

function mergeLiveData(spot, change, opt) {
  // Start from the mock baseline; shallow-merge the parts live data covers.
  const m = window.MOCK_DATA;
  const merged = { ...m };

  if (spot) {
    merged.session = { ...m.session, spot: Math.round(spot), spotChange: change };
    merged.levels  = { ...m.levels,  spot: Math.round(spot) };
  }

  if (opt) {
    // Replace the most recent option-history entry
    const newHistory = m.optHistory.slice();
    const lastIdx = newHistory.length - 1;
    newHistory[lastIdx] = {
      ...newHistory[lastIdx],
      gex: opt.gex,
      gammaFlip: opt.gammaFlip,
      pcr: opt.pcr,
      putWall: opt.putWall,
      callWall: opt.callWall,
      expiry: opt.nearestExpiry,
      bias: opt.pcr < 0.7 ? "Bullish" : opt.pcr > 1.5 ? "Bearish" : "Neutral"
    };
    merged.optHistory = newHistory;

    // Replace key levels with live values
    const fmtCt = (n) => n.toLocaleString("en-US");
    merged.levels = {
      ...merged.levels,
      r1: { ...merged.levels.r1, price: opt.callWall,
            note: `${fmtCt(opt.callWallOI)} Contracts At ${opt.nearestExpiry} · Dominant Call Wall` },
      s1: { ...merged.levels.s1, price: opt.putWall, pin: true,
            note: `${fmtCt(opt.putWallOI)} Contracts · Put Wall · Max Pain ${opt.nearestExpiry}` },
      gf: { ...merged.levels.gf, price: opt.gammaFlip }
    };

    // Enforce ordering: S1 > S2 > S3 (S1 closest to spot), R1 < R2 < R3 (R1 closest to spot)
    const sArr = [merged.levels.s1, merged.levels.s2, merged.levels.s3]
      .sort((a, b) => b.price - a.price);
    const rArr = [merged.levels.r1, merged.levels.r2, merged.levels.r3]
      .sort((a, b) => a.price - b.price);
    merged.levels = {
      ...merged.levels,
      s1: sArr[0], s2: sArr[1], s3: sArr[2],
      r1: rArr[0], r2: rArr[1], r3: rArr[2]
    };

    // Replace OI by strike (already filtered to ±15% of spot inside computeMetrics)
    merged.oiByStrike = opt.oiByStrike;

    // Replace the WEEKLY bucket in currentByExpiry with live data
    // Monthly + Combined stay mocked until we extend the math layer to compute them
    merged.currentByExpiry = {
      ...m.currentByExpiry,
      weekly: {
        label: "Weekly", expiry: opt.nearestExpiry,
        gex: opt.gex, gammaFlip: opt.gammaFlip, pcr: opt.pcr,
        callWall: opt.callWall, callWallOI: opt.callWallOI,
        putWall: opt.putWall, putWallOI: opt.putWallOI,
        callOI: opt.callOI, putOI: opt.putOI, totalOI: opt.totalOI, maxPain: opt.maxPain,
        callIV: opt.callIV, putIV: opt.putIV,
        oiByStrike: opt.oiByStrike,
        levels: merged.levels
      }
    };
  }

  return merged;
}

function App() {
  const [tab, setTab] = useState_("Overview");
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const live = !!tweaks.live;

  // Live hooks
  const { spot: liveSpot, change: liveChange, status: spotStatus } = window.LIVE.useLiveSpot(live);
  const { data: liveOpt, status: optStatus, lastUpdate, error: optError, refresh } = window.LIVE.useLiveOptions(liveSpot, live);

  // ETF store — includes user-entered entries merged with mock baseline
  const etfStore = window.ETFStore.useEtfStore();

  // Sync window.DATA based on mode, always layering in live ETF store aggregates
  // so Overview + StatStrip reflect user entries without needing a page reload.
  const dataSnapshot = useMemo_(() => {
    const base = (!live || !liveSpot)
      ? window.MOCK_DATA
      : mergeLiveData(liveSpot, liveChange, liveOpt);
    return {
      ...base,
      etfHistory:   etfStore.history,
      lastEtf:      etfStore.lastEtf,
      avg30:        etfStore.avg30,
      avg14:        etfStore.avg14,
      avg7:         etfStore.avg7,
      buyDominance: etfStore.buyDominance,
      buySellRatio: etfStore.buySellRatio,
      streak5:      etfStore.streak5,
    };
  }, [live, liveSpot, liveChange, liveOpt, etfStore.history]);
  window.DATA = dataSnapshot;

  // Apply tweaks
  useEffect_(() => {
    const r = document.documentElement;
    r.setAttribute("data-glow", tweaks.glow);
    r.setAttribute("data-density", tweaks.density);
    r.setAttribute("data-bg", tweaks.bg);
    r.setAttribute("data-accent", tweaks.accent);
  }, [tweaks]);

  const TabComponent = {
    "Overview": window.OverviewTab,
    "Options Flow": window.OptionsFlowTab,
    "ETF Flows": window.ETFFlowsTab,
    "Glossary": window.GlossaryTab
  }[tab];

  // Overall live status — combine spot + options
  let combinedStatus = "off";
  if (live) {
    if (optStatus === "error" || spotStatus === "error") combinedStatus = "error";
    else if (spotStatus === "connected" && (optStatus === "live" || optStatus === "loading")) combinedStatus = "live";
    else combinedStatus = "connecting";
  }

  return (
    <>
      <div className="bg-fx bg-fx-grid"></div>
      <div className="bg-fx bg-fx-radial"></div>
      <div className="bg-fx bg-fx-scanline"></div>
      <div className="app">
        <window.UI.TopBar
          tab={tab} setTab={setTab}
          session={dataSnapshot.session}
          live={live} liveStatus={combinedStatus}
          spotStatus={spotStatus} optStatus={optStatus} optError={optError}
          lastUpdate={lastUpdate}
          onToggleLive={() => setTweak("live", !live)}
          onRefresh={refresh}
        />
        <window.UI.StatStrip levels={dataSnapshot.levels} lastEtf={dataSnapshot.lastEtf} optHist={dataSnapshot.optHistory} />
        <main className="content" data-screen-label={tab} key={live ? "live" : "mock"}>
          <TabComponent />
        </main>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Data">
          <TweakToggle label="Live Data"
            checked={live}
            onChange={v => setTweak("live", v)} />
          <div className="mono" style={{fontSize: 10, color: "var(--fg-3)", lineHeight: 1.5}}>
            Spot ← Coinbase WS · Options ← Deribit (5-min refresh) · ETF flows stay manual
          </div>
        </TweakSection>
        <TweakSection label="Visuals">
          <TweakRadio label="Glow" value={tweaks.glow}
            onChange={v => setTweak("glow", v)}
            options={[
              { value: "off", label: "Off" },
              { value: "subtle", label: "Subtle" },
              { value: "heavy", label: "Heavy" }
            ]} />
          <TweakRadio label="Density" value={tweaks.density}
            onChange={v => setTweak("density", v)}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Comfy" },
              { value: "airy", label: "Airy" }
            ]} />
        </TweakSection>
        <TweakSection label="Background">
          <TweakRadio label="Style" value={tweaks.bg}
            onChange={v => setTweak("bg", v)}
            options={[
              { value: "flat", label: "Flat" },
              { value: "grid", label: "Grid" },
              { value: "radial", label: "Glow" }
            ]} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

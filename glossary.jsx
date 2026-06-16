/* ============================================================
   GLOSSARY TAB
   ============================================================ */

const GLOSSARY = [
  {
    section: "Options & Dealer Positioning",
    color: "amber",
    items: [
      { title: "GEX", ticker: "Gross Gamma Exposure",
        desc: "Net dealer gamma position across all strikes, in $B.",
        read: "+0.5B+ suppressive · ±0.1B neutral · −0.5B amplifying" },
      { title: "GEX Trend", ticker: "Direction Of Net Gamma",
        desc: "Direction of session-over-session change in net dealer gamma exposure. Tells you whether the dampening force is strengthening or fading.",
        read: "Rising GEX → more pinning ahead · Falling GEX → drift toward momentum regime · Crosses through zero → regime change (watch GF)" },
      { title: "Positive Gamma", ticker: "Dealers Long Gamma",
        desc: "Dealer books are net long gamma. To stay hedged they sell rallies and buy dips — which suppresses realised volatility.",
        read: "Spot above GF · Pinning regime · Fade extremes · Range-bound · Low intraday vol" },
      { title: "Negative Gamma", ticker: "Dealers Short Gamma",
        desc: "Dealer books are net short gamma. To stay hedged they buy rallies and sell dips — which amplifies realised volatility.",
        read: "Spot below GF · Momentum regime · Don't fade · Breakouts follow through · High intraday vol" },
      { title: "Gamma Flip", ticker: "GF",
        desc: "Strike where dealer gamma transitions long↔short.",
        read: "Above GF = pinning regime · Below GF = momentum regime (don't fade)" },
      { title: "Max Pain ★", ticker: "MP",
        desc: "Strike where the most options expire worthless on a given expiry.",
        read: "Pin magnet · pull strengthens inside 48h of expiry" },
      { title: "PC Ratio", ticker: "Put / Call",
        desc: "Total put OI divided by total call OI.",
        read: "<0.7 bullish · 0.7–1.3 balanced · >1.5 bearish · >2.5 often contrarian" },
      { title: "Put Wall", ticker: "PW",
        desc: "Strike with the largest put open interest concentration.",
        read: "Defended support · break = capitulation signal" },
      { title: "Call Wall", ticker: "CW",
        desc: "Strike with the largest call open interest concentration.",
        read: "Dealer cap on rallies · break = squeeze potential" },
      { title: "Open Interest", ticker: "OI · Contracts",
        desc: "The total number of option contracts currently outstanding at a given strike. One contract = one option position. Heavy OI = the dealer is hedging more, which makes that strike a sticky level.",
        read: "Big single-strike OI = wall · Stacked OI across strikes = wider battlefield · Falling OI into expiry = positioning unwinds" }
    ]
  },
  {
    section: "S/R Framework",
    color: "violet",
    items: [
      { title: "S1 / S2 / S3", ticker: "Supports",
        desc: "Primary, secondary and tertiary support from dealer positioning.",
        read: "S1 = first defended floor · S2 = structural floor · S3 = cycle floor. Break S1 → expect S2 retest." },
      { title: "R1 / R2 / R3", ticker: "Resistances",
        desc: "Primary, secondary and tertiary resistance from dealer positioning.",
        read: "R1 = first ceiling · R2 = structural cap · R3 = cycle cap. Break R1 → expect R2 retest." },
      { title: "Pin Magnet", ticker: "PIN",
        desc: "A strike with stacked positioning (max pain + put/call wall + gamma peak).",
        read: "Trade ranges around it, not against it. Confluence beats single signals." },
      { title: "Negative Gamma Zone", ticker: "NGZ",
        desc: "Price territory below the gamma flip where dealers are short gamma.",
        read: "Volatility expands · don't fade momentum · breakouts often follow through" }
    ]
  },
  {
    section: "ETF Flows",
    color: "mint",
    items: [
      { title: "IBIT Flow", ticker: "IBIT",
        desc: "Daily net flow into BlackRock's iShares Bitcoin Trust ETF, in $M.",
        read: ">+$200M strong bid · sustained negatives = distribution" },
      { title: "Buy Dominance", ticker: "BD",
        desc: "% of last 30 days with net positive IBIT flow.",
        read: ">70% strong demand · 40–60% balanced · <30% distribution" },
      { title: "Buy/Sell Ratio", ticker: "B/S",
        desc: "30-day sum of positive flows / 30-day sum of negative flows.",
        read: ">1.5x clear accumulation · <0.8x distribution" },
      { title: "Signal States", ticker: "SIG",
        desc: "Daily classification: IN, OUT, STRONG IN/OUT, NEUTRAL.",
        read: "Consecutive STRONG days = regime confirmation" }
    ]
  }
];

function GlossaryTab() {
  const [open, setOpen] = useState({});
  const toggle = (key) => setOpen(o => ({ ...o, [key]: !o[key] }));

  return (
    <div>
      {GLOSSARY.map((sec, si) => (
        <div className="glossary-section" key={si}>
          <div className="gs-head" style={{color: `var(--${sec.color})`}}>
            <span className="eyebrow" style={{color: `var(--${sec.color})`}}>{sec.section}</span>
            <span className="line"></span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {sec.items.map((it, i) => {
              const key = si + "-" + i;
              const isOpen = open[key] !== false; // default open
              return (
                <div className="glossary-card" key={i}>
                  <div className="title" style={{color: `var(--${sec.color})`}}>
                    {it.title}<span className="ticker">{it.ticker}</span>
                  </div>
                  <div className="desc">{it.desc}</div>
                  <div className="read" style={{color: `var(--${sec.color})`, cursor: "pointer"}} onClick={() => toggle(key)}>
                    {isOpen ? "▾ READ" : "▸ READ"}
                  </div>
                  {isOpen && <div className="read-body">{it.read}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

window.GlossaryTab = GlossaryTab;

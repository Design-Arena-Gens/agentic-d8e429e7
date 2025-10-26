"use client";

import { useState } from "react";

type Match = {
  pattern: string;
  count: number;
  snippets: string[];
};

type ScriptFinding = {
  url: string;
  inline: boolean;
  size: number | null;
  matches: Match[];
};

type AnalyzeResponse = {
  url: string;
  fetchedAt: string;
  summary: {
    totalScripts: number;
    scriptsWithMatches: number;
    totalMatches: number;
    likelyHasCheckout: boolean;
    indicators: string[];
  };
  findings: ScriptFinding[];
  anchorsToCheckout: { href: string; text: string }[];
  formsToCheckout: { action: string; method: string }[];
  errors?: string[];
};

export default function Page() {
  const [url, setUrl] = useState("https://eng.polene-paris.com");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onAnalyze() {
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json: AnalyzeResponse = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 28 }}>Checkout Analyzer</h1>
      <p style={{ opacity: 0.85 }}>Enter a site URL. We'll scan for checkout-related code patterns.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #2d3350', background: '#0f1530', color: '#e6e9ef' }}
        />
        <button onClick={onAnalyze} disabled={loading} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #3b82f6', background: '#1d4ed8', color: 'white', cursor: 'pointer' }}>
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #7f1d1d', background: '#1f0d0d', color: '#fecaca', borderRadius: 8 }}>
          Error: {error}
        </div>
      )}

      {data && (
        <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
          <section style={{ padding: 16, border: '1px solid #273056', borderRadius: 12, background: '#0e1430' }}>
            <h3 style={{ marginTop: 0 }}>Summary</h3>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Stat label="Total scripts" value={String(data.summary.totalScripts)} />
              <Stat label="Scripts with matches" value={String(data.summary.scriptsWithMatches)} />
              <Stat label="Total matches" value={String(data.summary.totalMatches)} />
              <Stat label="Likely has checkout" value={data.summary.likelyHasCheckout ? 'Yes' : 'No'} />
            </div>
            {data.summary.indicators.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ opacity: 0.8, marginBottom: 8 }}>Indicators:</div>
                <ul>
                  {data.summary.indicators.map((i, idx) => (
                    <li key={idx}>{i}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section style={{ padding: 16, border: '1px solid #273056', borderRadius: 12, background: '#0e1430' }}>
            <h3 style={{ marginTop: 0 }}>Anchors to checkout</h3>
            {data.anchorsToCheckout.length === 0 ? (
              <div style={{ opacity: 0.8 }}>No obvious checkout anchors found.</div>
            ) : (
              <ul>
                {data.anchorsToCheckout.map((a, idx) => (
                  <li key={idx}><code>{a.href}</code> — {a.text || '(no text)'}</li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ padding: 16, border: '1px solid #273056', borderRadius: 12, background: '#0e1430' }}>
            <h3 style={{ marginTop: 0 }}>Forms that post to checkout</h3>
            {data.formsToCheckout.length === 0 ? (
              <div style={{ opacity: 0.8 }}>No obvious checkout forms found.</div>
            ) : (
              <ul>
                {data.formsToCheckout.map((f, idx) => (
                  <li key={idx}><code>{f.method.toUpperCase()} {f.action}</code></li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ padding: 16, border: '1px solid #273056', borderRadius: 12, background: '#0e1430' }}>
            <h3 style={{ marginTop: 0 }}>Script findings</h3>
            {data.findings.length === 0 ? (
              <div style={{ opacity: 0.8 }}>No scripts fetched or analyzed.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {data.findings.map((f, idx) => (
                  <div key={idx} style={{ border: '1px solid #273056', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div style={{ fontWeight: 600 }}>{f.inline ? 'inline-script' : f.url}</div>
                      <div style={{ opacity: 0.7, fontSize: 12 }}>{f.size ? `${f.size} B` : ''}</div>
                    </div>
                    {f.matches.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>No matches</div>
                    ) : (
                      <ul>
                        {f.matches.map((m, j) => (
                          <li key={j}>
                            <strong>{m.pattern}</strong> — {m.count}
                            {m.snippets.length > 0 && (
                              <details>
                                <summary style={{ cursor: 'pointer' }}>Snippets</summary>
                                <pre style={{ whiteSpace: 'pre-wrap' }}>{m.snippets.join("\n\n---\n\n")}</pre>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {data.errors && data.errors.length > 0 && (
            <section style={{ padding: 16, border: '1px solid #7f1d1d', borderRadius: 12, background: '#1f0d0d', color: '#fecaca' }}>
              <h3 style={{ marginTop: 0 }}>Errors</h3>
              <ul>
                {data.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #273056', borderRadius: 8, padding: 12, minWidth: 160 }}>
      <div style={{ opacity: 0.7, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

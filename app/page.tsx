"use client";

import { FormEvent, useState } from "react";

type RunResult = { status: string; message: string; draftOrder: { id: string; total: number; lines: { sku: string; supplier: string; qty: number; unitPrice: number }[] } | null; verification: { passed: boolean; errors: string[] }; runLog: { tool: string; attempt: number; status: string; detail: unknown }[] };
const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

export default function Home() {
  const [goal, setGoal] = useState("Restock items that are running low. Prioritize fast sellers and stay within the budget.");
  const [budget, setBudget] = useState(250000);
  const [maxDeliveryDays, setMaxDeliveryDays] = useState(5);
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal, budget, maxDeliveryDays }) });
      const data = await response.json();
      if (!response.ok && data.status !== "failed") throw new Error(data.error || "The run could not be started.");
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error."); }
    finally { setBusy(false); }
  }

  return <main>
    <header><span className="mark">S</span><span>Stockpilot</span><span className="badge">PHASE 1 · AGENT CORE</span></header>
    <section className="intro"><p className="eyebrow">KEMI’S CORNER SHOP · LAGOS, NIGERIA</p><h1>Restock with a clear plan.</h1><p>Stockpilot checks stock, compares supplier offers, and prepares a draft order for your review.</p></section>
    <div className="columns">
      <form onSubmit={submit} className="card"><h2>Set your goal</h2><label htmlFor="goal">What should Stockpilot do?</label><textarea id="goal" value={goal} onChange={e => setGoal(e.target.value)} rows={4} required />
        <div className="fields"><label>Budget <span>₦</span><input type="number" min="1" value={budget} onChange={e => setBudget(Number(e.target.value))} /></label><label>Delivery within <span>days</span><input type="number" min="0" value={maxDeliveryDays} onChange={e => setMaxDeliveryDays(Number(e.target.value))} /></label></div>
        <button disabled={busy}>{busy ? "Working through the plan…" : "Run Stockpilot"}</button><p className="hint">Creates a draft only. No purchase will be made.</p>
      </form>
      <section className="card output"><h2>Run results</h2>{!result && !error && <p className="empty">Your plan, draft order, and verification will appear here.</p>}{error && <p className="error">{error}</p>}{result && <><div className={`status ${result.status}`}>{result.status === "success" ? "Draft verified" : "Run needs attention"}</div><p>{result.message}</p>{result.draftOrder && <><h3>Draft order · {result.draftOrder.id.slice(0, 8)}</h3>{result.draftOrder.lines.map(line => <div className="line" key={line.sku}><span><b>{line.sku}</b><small>{line.qty} × {money(line.unitPrice)} · {line.supplier}</small></span><strong>{money(line.qty * line.unitPrice)}</strong></div>)}<div className="total"><span>Draft total</span><b>{money(result.draftOrder.total)}</b></div></>}
        <h3>Independent check · {result.verification.passed ? "Passed" : "Failed"}</h3>{result.verification.errors.map(e => <p className="error" key={e}>{e}</p>)}<h3>Execution history</h3><ol className="log">{result.runLog.map((event, i) => <li key={i}><span className={event.status === "error" ? "dot bad" : "dot"} /> <b>{event.tool}</b><span>attempt {event.attempt} · {event.status}</span><small>{typeof event.detail === "string" ? event.detail : JSON.stringify(event.detail)}</small></li>)}</ol><p className="hint">Draft only. No purchase was made.</p></>}</section>
    </div><footer>Seeded demo data · Nigerian naira · Drafts require your approval</footer>
  </main>;
}

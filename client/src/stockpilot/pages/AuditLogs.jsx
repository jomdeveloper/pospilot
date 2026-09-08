import React, { useCallback, useEffect, useState } from "react";
import { Activity, Check, Clock3, Copy, Filter, RefreshCw, ShieldCheck, X } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { api } from "../../api";

const initialFilters = { q: "", actor: "", action: "", category: "", entityType: "", outcome: "", from: "", to: "" };

export default function AuditLogsPage({ t, sessionToken }) {
  const [logs, setLogs] = useState([]);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async ({ append = false, beforeId = null } = {}) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const result = await api.getAuditLogs({ ...filters, ...(beforeId ? { beforeId } : {}) }, sessionToken);
      setLogs((previous) => append ? [...previous, ...result.logs] : result.logs);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setTotal(result.total || 0);
    } catch (requestError) {
      setError(requestError.message || "Unable to load audit activity.");
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [filters, sessionToken]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = (name, value) => setDraftFilters((previous) => ({ ...previous, [name]: value }));
  const applyFilters = () => setFilters({ ...draftFilters });
  const resetFilters = () => { setDraftFilters(initialFilters); setFilters(initialFilters); };
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const copyRequestId = async () => {
    if (!selectedLog?.request_id || !navigator.clipboard) return;
    await navigator.clipboard.writeText(selectedLog.request_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const formatDetails = (details) => Object.entries(details || {})
    .filter(([key]) => key !== "_parseError" && key !== "raw")
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(" · ") || "-";

  return <div className="space-y-4">
    <Card t={t} className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft, color: t.primary }}><ShieldCheck size={22} /></div>
          <div><h2 className="font-bold" style={{ color: t.text }}>Audit Logs</h2><p className="text-xs mt-1" style={{ color: t.sub }}>Search system changes, register activity, and transaction movements</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="text-xs px-2.5 py-1.5 rounded-full" style={{ background: t.bg, color: t.sub }}>{total.toLocaleString()} events</span><Button t={t} onClick={() => load()}><RefreshCw size={14} /> Refresh</Button><Button t={t} onClick={resetFilters}><Filter size={14} /> Reset</Button></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <input value={draftFilters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search details or record" className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
        <input value={draftFilters.actor} onChange={(event) => updateFilter("actor", event.target.value)} placeholder="User or actor ID" className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
        <input value={draftFilters.action} onChange={(event) => updateFilter("action", event.target.value)} placeholder="Action contains" className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
        <select value={draftFilters.category} onChange={(event) => updateFilter("category", event.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">All categories</option>{["Authentication", "Register", "Sales", "Inventory", "Approvals", "Master Data", "System"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <input value={draftFilters.entityType} onChange={(event) => updateFilter("entityType", event.target.value)} placeholder="Entity type" className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
        <select value={draftFilters.outcome} onChange={(event) => updateFilter("outcome", event.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">All outcomes</option><option value="Success">Success</option><option value="Rejected">Rejected</option><option value="Failed">Failed</option></select>
        <input type="date" value={draftFilters.from} onChange={(event) => updateFilter("from", event.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
        <input type="date" value={draftFilters.to} onChange={(event) => updateFilter("to", event.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4"><span className="text-xs" style={{ color: t.sub }}>{activeFilterCount ? `${activeFilterCount} filters active` : "All system activity"}</span><Button t={t} onClick={applyFilters}><Check size={14} /> Apply filters</Button></div>
    </Card>
    {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}
    <Card t={t} className="overflow-hidden">
      {loading ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>Loading audit activity...</p> : logs.length === 0 ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>No audit activity found.</p> : <>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: t.bg }}>{["Time", "Category", "User", "Action", "Record", "Result", "Details"].map((heading) => <th key={heading} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide whitespace-nowrap" style={{ color: t.sub }}>{heading}</th>)}</tr></thead><tbody>{logs.map((log) => <tr key={log.id} onClick={() => setSelectedLog(log)} className="cursor-pointer hover:opacity-80" style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}><span className="inline-flex items-center gap-1.5"><Clock3 size={13} />{log.created_at}</span></td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{log.category}</td><td className="px-4 py-3 whitespace-nowrap"><div className="font-semibold" style={{ color: t.text }}>{log.actor_username}</div><div className="text-xs" style={{ color: t.sub }}>{log.actor_role}</div></td><td className="px-4 py-3 whitespace-nowrap"><span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: t.text }}><Activity size={14} style={{ color: t.primary }} />{log.action}</span></td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ""}</td><td className="px-4 py-3"><Badge t={t} tone={log.outcome === "Success" ? "success" : log.outcome === "Rejected" ? "warning" : "danger"}>{log.outcome}</Badge></td><td className="px-4 py-3 max-w-sm truncate" style={{ color: t.sub }}>{formatDetails(log.details)}{log.terminal ? ` · terminal: ${log.terminal}` : ""}</td></tr>)}</tbody></table></div>
        {hasMore && <div className="p-4 text-center border-t" style={{ borderColor: t.border }}><Button t={t} onClick={() => load({ append: true, beforeId: cursor })} disabled={loadingMore}>{loadingMore ? "Loading..." : "Load older activity"}</Button></div>}
      </>}
    </Card>
    {selectedLog && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15, 23, 42, 0.42)" }} onClick={() => setSelectedLog(null)}>
      <div className="w-full max-w-2xl rounded-2xl p-6 shadow-2xl" style={{ background: t.card, border: `1px solid ${t.border}` }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] uppercase tracking-[0.16em] font-bold" style={{ color: t.primary }}>{selectedLog.category}</p><h3 className="text-xl font-extrabold mt-1" style={{ color: t.text }}>{selectedLog.action}</h3><p className="text-xs mt-1" style={{ color: t.sub }}>{selectedLog.created_at} · {selectedLog.entity_type}{selectedLog.entity_id ? ` #${selectedLog.entity_id}` : ""}</p></div><button type="button" onClick={() => setSelectedLog(null)} className="p-2 rounded-lg" style={{ color: t.sub }} aria-label="Close audit detail"><X size={18} /></button></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5"><div><p className="text-[10px] uppercase" style={{ color: t.sub }}>Actor</p><strong className="text-sm" style={{ color: t.text }}>{selectedLog.actor_username}</strong></div><div><p className="text-[10px] uppercase" style={{ color: t.sub }}>Role</p><strong className="text-sm" style={{ color: t.text }}>{selectedLog.actor_role}</strong></div><div><p className="text-[10px] uppercase" style={{ color: t.sub }}>Outcome</p><Badge t={t} tone={selectedLog.outcome === "Success" ? "success" : selectedLog.outcome === "Rejected" ? "warning" : "danger"}>{selectedLog.outcome}</Badge></div><div><p className="text-[10px] uppercase" style={{ color: t.sub }}>Terminal</p><strong className="text-sm" style={{ color: t.text }}>{selectedLog.terminal || "System"}</strong></div></div>
        <div className="mt-5 rounded-xl p-4" style={{ background: t.bg }}><p className="text-[10px] uppercase tracking-wide font-bold mb-3" style={{ color: t.sub }}>Event details</p>{Object.entries(selectedLog.details || {}).map(([key, value]) => <div key={key} className="flex gap-4 py-2 text-sm border-t first:border-t-0" style={{ borderColor: t.border }}><span className="w-36 shrink-0" style={{ color: t.sub }}>{key}</span><span className="break-all" style={{ color: t.text }}>{typeof value === "object" ? JSON.stringify(value) : String(value)}</span></div>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5 text-xs" style={{ color: t.sub }}><span>Request ID: {selectedLog.request_id || "not available"}</span>{selectedLog.request_id && <Button t={t} onClick={copyRequestId}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy ID"}</Button>}</div>
      </div>
    </div>}
  </div>;
}

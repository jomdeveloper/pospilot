import React, { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Search, ShieldCheck } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { api } from "../../api";

export default function AuditLogsPage({ t, sessionToken }) {
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getAuditLogs(sessionToken).then(setLogs).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  }, [sessionToken]);

  const filtered = useMemo(() => logs.filter((log) => `${log.actor_username} ${log.actor_role} ${log.action} ${log.entity_type} ${log.entity_id || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [logs, query]);

  return <div className="space-y-4">
    <Card t={t} className="p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft, color: t.primary }}><ShieldCheck size={22} /></div><div><h2 className="font-bold" style={{ color: t.text }}>Audit Logs</h2><p className="text-xs mt-1" style={{ color: t.sub }}>Track important changes and system activity</p></div></div><div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></div></div></Card>
    {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}
    <Card t={t} className="overflow-hidden">{loading ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>Loading audit activity...</p> : filtered.length === 0 ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>No audit activity found.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: t.bg }}>{["Time", "User", "Action", "Record", "Result", "Details"].map((heading) => <th key={heading} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide whitespace-nowrap" style={{ color: t.sub }}>{heading}</th>)}</tr></thead><tbody>{filtered.map((log) => <tr key={log.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}><span className="inline-flex items-center gap-1.5"><Clock3 size={13} />{log.created_at}</span></td><td className="px-4 py-3 whitespace-nowrap"><div className="font-semibold" style={{ color: t.text }}>{log.actor_username}</div><div className="text-xs" style={{ color: t.sub }}>{log.actor_role}</div></td><td className="px-4 py-3 whitespace-nowrap"><span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: t.text }}><Activity size={14} style={{ color: t.primary }} />{log.action}</span></td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ""}</td><td className="px-4 py-3"><Badge t={t} tone={log.outcome === "Success" ? "success" : "danger"}>{log.outcome}</Badge></td><td className="px-4 py-3 max-w-sm" style={{ color: t.sub }}>{Object.entries(log.details || {}).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join(" · ") || "-"}</td></tr>)}</tbody></table></div>}</Card>
  </div>;
}

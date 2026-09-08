import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, CircleDashed, ShieldAlert, Search, XCircle } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { api } from "../../api";

export default function ApprovalsPage({ t, sessionToken, loggedInRole }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const canReview = ["administrator", "admin", "manager"].includes(String(loggedInRole || "").trim().toLowerCase());

  const loadRequests = useCallback(() => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api.getApprovalRequests({}, sessionToken)
      .then((response) => setRequests(response.requests || []))
      .catch((requestError) => setError(requestError.message || "Unable to load approval requests."))
      .finally(() => setLoading(false));
  }, [sessionToken]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return requests;
    return requests.filter((request) => `${request.title} ${request.type} ${request.reason} ${request.requestedByUsername || ""} ${request.requestRef || ""}`.toLowerCase().includes(needle));
  }, [requests, query]);

  const handleDecision = async (id, status) => {
    if (!canReview || !sessionToken) return;
    setBusyId(id);
    try {
      await api.updateApprovalRequest(id, {
        status,
        reviewNote: (reviewDrafts[id] || "").trim(),
      }, sessionToken);
      setReviewDrafts((prev) => ({ ...prev, [id]: "" }));
      loadRequests();
    } catch (requestError) {
      setError(requestError.message || "Unable to update approval request.");
    } finally {
      setBusyId(null);
    }
  };

  const renderDetails = (details) => {
    if (!details || typeof details !== "object" || !Object.keys(details).length) return null;
    return (
      <div className="mt-3 space-y-1 text-xs" style={{ color: t.sub }}>
        {Object.entries(details).map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <span className="font-medium" style={{ color: t.text }}>{key}:</span>
            <span>{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card t={t} className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft, color: t.primary }}>
              <ShieldAlert size={22} />
            </div>
            <div>
              <h2 className="font-bold" style={{ color: t.text }}>Approval Queue</h2>
              <p className="text-xs mt-1" style={{ color: t.sub }}>Manager review for overrides, stock interventions, and exceptions</p>
            </div>
          </div>

          <div className="relative w-full md:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search approvals"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
            />
          </div>
        </div>
      </Card>

      {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}

      <Card t={t} className="overflow-hidden">
        {loading ? (
          <p className="p-12 text-center text-sm" style={{ color: t.sub }}>Loading approval queue...</p>
        ) : filtered.length === 0 ? (
          <p className="p-12 text-center text-sm" style={{ color: t.sub }}>No approval requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: t.bg }}>
                  {['Request', 'Type', 'Requested by', 'Reason', 'Status', 'Actions'].map((heading) => (
                    <th key={heading} className="text-left px-4 py-3 text-[11px] uppercase tracking-wide whitespace-nowrap" style={{ color: t.sub }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((request) => (
                  <tr key={request.id} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td className="px-4 py-3">
                      <div className="font-semibold" style={{ color: t.text }}>{request.title}</div>
                      <div className="text-xs" style={{ color: t.sub }}>{request.requestRef || `#${request.id}`}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{request.type}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium" style={{ color: t.text }}>{request.requestedByUsername}</div>
                      <div className="text-xs" style={{ color: t.sub }}>{new Date(request.createdAt).toLocaleString()}</div>
                    </td>
                    <td className="px-4 py-3 max-w-md" style={{ color: t.sub }}>
                      <div>{request.reason}</div>
                      {renderDetails(request.details)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge
                        t={t}
                        tone={
                          request.status === 'approved' ? 'success' :
                          request.status === 'rejected' ? 'danger' : 'warning'
                        }
                      >
                        {request.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {request.status === 'pending' && canReview ? (
                        <div className="space-y-2">
                          <textarea
                            value={reviewDrafts[request.id] || ""}
                            onChange={(event) => setReviewDrafts((prev) => ({
                              ...prev,
                              [request.id]: event.target.value,
                            }))}
                            rows={3}
                            placeholder="Review note for this approval decision"
                            className="w-full min-w-[220px] rounded-lg border px-2.5 py-2 text-xs outline-none resize-none"
                            style={{ background: t.bg, borderColor: t.border, color: t.text }}
                          />
                          <div className="flex items-center gap-2">
                            <Button t={t} variant="primary" size="sm" onClick={() => handleDecision(request.id, 'approved')} disabled={busyId === request.id}>
                              <CheckCheck size={14} /> Approve
                            </Button>
                            <Button t={t} variant="outline" size="sm" onClick={() => handleDecision(request.id, 'rejected')} disabled={busyId === request.id}>
                              <XCircle size={14} /> Reject
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1 text-xs" style={{ color: t.sub }}>
                          <span>{request.status === 'pending' ? 'Awaiting review' : 'Reviewed'}</span>
                          {request.reviewNote && <div className="max-w-[220px] break-words">Note: {request.reviewNote}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card t={t} className="p-4">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: t.text }}>
          <CircleDashed size={16} style={{ color: t.warning }} />
          Recommended use
        </div>
        <p className="mt-2 text-sm" style={{ color: t.sub }}>
          Cashiers can raise exceptions, managers approve overrides, and the queue keeps every action visible for audit review.
        </p>
      </Card>
    </div>
  );
}

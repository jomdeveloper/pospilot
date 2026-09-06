import React, { useEffect, useMemo, useState } from "react";
import { Mail, Plus, Power, Search, ShieldCheck, UserCog, UserRound, X } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import { api } from "../../api";

const EMPTY_FORM = { name: "", username: "", email: "", password: "", role: "Cashier" };
const ROLES = ["Administrator", "Manager", "Pharmacist", "Cashier", "Inventory Clerk", "Auditor"];

export default function UsersPage({ t, sessionToken, canManageUsers }) {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getUsers()
      .then((result) => {
        if (!cancelled) setUsers(result);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || "Unable to load users");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return users;
    return users.filter((user) =>
      [user.name, user.username, user.email, user.role, user.status]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, users]);

  const activeCount = users.filter((user) => user.status === "Active").length;
  const cashierCount = users.filter((user) => user.role === "Cashier").length;

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setFormError("");
  };

  const saveUser = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const username = form.username.trim();
    const email = form.email.trim();
    const password = form.password;

    if (!name || !username || !password) {
      setFormError("Name, username, and password are required.");
      return;
    }

    api.createUser({ name, username, email, password, role: form.role }, sessionToken)
      .then((createdUser) => {
        setUsers((currentUsers) => [...currentUsers, createdUser].sort((a, b) => a.name.localeCompare(b.name)));
        closeForm();
      })
      .catch((error) => setFormError(error.message || "Unable to create user"));
  };

  const toggleStatus = (id) => {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    const nextStatus = user.status === "Active" ? "Inactive" : "Active";
    api.updateUserStatus(id, nextStatus)
      .then((updatedUser) => setUsers((currentUsers) => currentUsers.map((item) => item.id === id ? updatedUser : item)))
      .catch((error) => setLoadError(error.message || "Unable to update user status"));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card t={t} className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft }}><UserCog size={18} style={{ color: t.primary }} /></div>
            <div><p className="text-2xl font-extrabold" style={{ color: t.text }}>{users.length}</p><p className="text-xs" style={{ color: t.sub }}>Total users</p></div>
          </div>
        </Card>
        <Card t={t} className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: t.successSoft }}><ShieldCheck size={18} style={{ color: t.success }} /></div>
            <div><p className="text-2xl font-extrabold" style={{ color: t.text }}>{activeCount}</p><p className="text-xs" style={{ color: t.sub }}>Active accounts</p></div>
          </div>
        </Card>
        <Card t={t} className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: t.infoSoft }}><UserRound size={18} style={{ color: t.info }} /></div>
            <div><p className="text-2xl font-extrabold" style={{ color: t.text }}>{cashierCount}</p><p className="text-xs" style={{ color: t.sub }}>Cashier accounts</p></div>
          </div>
        </Card>
      </div>

      <Card t={t} className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users, roles, or email…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
            />
          </div>
          {canManageUsers && <Button t={t} onClick={() => setShowForm(true)}><Plus size={15} /> Add User</Button>}
        </div>
      </Card>

      {loadError && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{loadError}</div>}

      <Card t={t} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: t.bg }}>
                {["User", "Email", "Role", "Status", "Last login", ""].map((heading) => (
                  <th key={heading} className="text-left font-semibold px-4 py-3 whitespace-nowrap" style={{ color: t.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && filteredUsers.map((user) => (
                <tr key={user.id} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: t.primary }}>{user.name.slice(0, 2).toUpperCase()}</div>
                      <div><p className="font-semibold" style={{ color: t.text }}>{user.name}</p><p className="text-xs" style={{ color: t.sub }}>@{user.username}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}><span className="inline-flex items-center gap-1.5"><Mail size={13} />{user.email || "Not provided"}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: t.text }}>{user.role}</td>
                  <td className="px-4 py-3"><Badge t={t} tone={user.status === "Active" ? "success" : "neutral"}>{user.status}</Badge></td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{user.lastLogin}</td>
                  <td className="px-4 py-3 text-right">
                    {!canManageUsers ? null : user.role === "Administrator" ? (
                      <span className="text-xs font-semibold" style={{ color: t.sub }} title="Administrator accounts cannot be deactivated">
                        Protected
                      </span>
                    ) : (
                      <Button
                        t={t}
                        variant={user.status === "Active" ? "danger" : "outline"}
                        size="sm"
                        onClick={() => toggleStatus(user.id)}
                        title={user.status === "Active" ? `Deactivate ${user.username}` : `Activate ${user.username}`}
                        aria-label={user.status === "Active" ? `Deactivate ${user.username}` : `Activate ${user.username}`}
                      >
                        <Power size={14} />
                        {user.status === "Active" ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="py-12 text-center text-sm" style={{ color: t.sub }}>Loading users…</div>}
        {!loading && filteredUsers.length === 0 && <div className="py-12 text-center text-sm" style={{ color: t.sub }}>No users match your search.</div>}
        <div className="px-4 py-3 text-xs" style={{ borderTop: `1px solid ${t.border}`, color: t.sub }}>Showing {filteredUsers.length} of {users.length} users</div>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }} onClick={closeForm}>
          <form className="w-full max-w-md rounded-2xl p-5" style={{ background: t.card }} onSubmit={saveUser} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h3 className="font-bold" style={{ color: t.text }}>Add User</h3><button type="button" onClick={closeForm} style={{ color: t.sub }}><X size={18} /></button></div>
            <div className="space-y-3">
              {[{ key: "name", label: "Full name", placeholder: "Juan Dela Cruz", type: "text" }, { key: "username", label: "Username", placeholder: "juan.delacruz", type: "text" }, { key: "email", label: "Email (optional)", placeholder: "juan@example.com", type: "email" }, { key: "password", label: "Password", placeholder: "Create a password", type: "password" }].map((field) => (
                <label key={field.key} className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{field.label}</span><input type={field.type} value={form[field.key]} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} placeholder={field.placeholder} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label>
              ))}
              <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select></label>
            </div>
            {formError && <p className="text-xs mt-3" style={{ color: t.danger }}>{formError}</p>}
            <div className="flex justify-end gap-2 mt-5"><Button t={t} type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button t={t} type="submit">Create User</Button></div>
          </form>
        </div>
      )}
    </div>
  );
}

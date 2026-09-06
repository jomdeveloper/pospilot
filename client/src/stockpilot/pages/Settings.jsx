import React, { useEffect, useState } from "react";
import { Archive, Building2, Check, Download, FileText, FolderOpen, Globe, HardDrive, KeyRound, LogOut, MonitorCheck, RefreshCw, RotateCcw, Settings as SettingsIcon, ShieldCheck, Timer, Trash2, Upload } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { DEFAULT_SETTINGS, readStoreSettings, saveStoreSettings, STORE_DEFAULT_LOGO } from "../settings";
import { api } from "../../api";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export default function SettingsPage({ t, sessionToken }) {
  const [form, setForm] = useState(readStoreSettings);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("success");
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [backupDirTest, setBackupDirTest] = useState(null);
  const [backupDirBusy, setBackupDirBusy] = useState(false);
  const [launchStartupState, setLaunchStartupState] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  // Load the server-persisted store info on mount (multi-device safe) so the
  // form always reflects the authoritative values, not just the local cache.
  useEffect(() => {
    if (!sessionToken) return;
    let active = true;
    api.getSettings(sessionToken)
      .then((db) => { if (active) setForm({ ...DEFAULT_SETTINGS, ...(db || {}) }); })
      .catch(() => { /* keep local cache */ });
    return () => { active = false; };
  }, [sessionToken]);

  // Read the desktop's actual "launch at sign-in" state so the toggle mirrors
  // reality (only in the packaged Electron app).
  useEffect(() => {
    if (typeof window.desktop?.getLaunchOnStartup !== "function") return;
    let active = true;
    window.desktop.getLaunchOnStartup()
      .then((enabled) => { if (active) setLaunchStartupState(Boolean(enabled)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Load the latest backup snapshot list for the Backups section (admin only).
  useEffect(() => {
    if (!sessionToken) return;
    let active = true;
    setBackupError("");
    api.listBackups(sessionToken)
      .then((res) => { if (active) setBackups((res && res.backups) || []); })
      .catch(() => { if (active) setBackupError("Unable to load backups."); });
    return () => { active = false; };
  }, [sessionToken]);

  const notify = (text, tone = "success") => {
    setMessage(text);
    setMessageTone(tone);
  };

  const applyBackups = (res) => setBackups((res && res.backups) || []);

  const refreshBackups = (event) => {
    event.preventDefault();
    if (!sessionToken) return;
    setBackupError("");
    api.listBackups(sessionToken).then(applyBackups).catch(() => setBackupError("Unable to load backups."));
  };

  // Browse for an off-machine backup folder (desktop only — the OS picker).
  const browseBackupDir = async (event) => {
    event.preventDefault();
    if (typeof window.desktop?.selectBackupDirectory !== "function") {
      notify("Folder browsing is only available in the desktop app. Type the path manually.", "error");
      return;
    }
    const chosen = await window.desktop.selectBackupDirectory();
    if (chosen) {
      update("backupDir", chosen);
      setBackupDirTest(null);
    }
  };

  // Test-and-save the entered backup folder so a bad network path fails loudly
  // right here instead of silently at the next scheduled backup.
  const testBackupDir = async (event) => {
    event.preventDefault();
    if (backupDirBusy || !sessionToken) return;
    setBackupDirBusy(true);
    setBackupDirTest(null);
    setBackupError("");
    try {
      const result = await api.testBackupDir(form.backupDir || "", sessionToken);
      setBackupDirTest({ ...result, checkedAt: new Date() });
      setForm((current) => ({ ...current, backupDir: result.path }));
      notify("Backup folder is writable.");
    } catch (requestError) {
      setBackupDirTest({ ok: false, error: (requestError && requestError.message) || "Folder is not usable." });
      notify("Backup folder test failed.", "error");
    } finally {
      setBackupDirBusy(false);
    }
  };

  const toggleLaunchOnStartup = async (event) => {
    const wanted = event.target.checked;
    setForm((current) => ({ ...current, launchOnStartup: String(wanted) }));
    if (typeof window.desktop?.setLaunchOnStartup === "function") {
      const applied = await window.desktop.setLaunchOnStartup(wanted);
      setLaunchStartupState(Boolean(applied));
      if (applied !== wanted) notify("Could not update the Windows start-up entry.", "error");
    }
  };

  const revokeAllSessions = async (event) => {
    event.preventDefault();
    if (!sessionToken || revokeBusy) return;
    setRevokeBusy(true);
    try {
      const result = await api.revokeAllSessions(sessionToken);
      notify(`Signed out ${result.revoked} other session(s) on this account.`, "success");
    } catch (requestError) {
      notify((requestError && requestError.message) || "Unable to revoke sessions.", "error");
    } finally {
      setRevokeBusy(false);
    }
  };

  const createBackupNow = async (event) => {
    event.preventDefault();
    if (!sessionToken || backupBusy) return;
    setBackupBusy(true);
    setBackupError("");
    try {
      await api.createBackup(sessionToken);
      api.listBackups(sessionToken).then(applyBackups).catch(() => {});
      notify("Database backup created.");
    } catch (requestError) {
      setBackupError((requestError && requestError.message) || "Unable to create backup.");
    } finally {
      setBackupBusy(false);
    }
  };

  const downloadBackup = async (filename, event) => {
    event.preventDefault();
    if (!sessionToken || backupBusy) return;
    setBackupBusy(true);
    setBackupError("");
    try {
      const blob = await api.downloadBackupFile(filename, sessionToken);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify("Backup downloaded.");
    } catch (requestError) {
      setBackupError((requestError && requestError.message) || "Unable to download backup.");
    } finally {
      setBackupBusy(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // ------------------------------------------------------------------
  //  Password rotation (any logged-in user can change their own password)
  // ------------------------------------------------------------------
  const [pwdForm, setPwdForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwdError, setPwdError] = useState("");
  const [pwdMessage, setPwdMessage] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const updatePwd = (key, value) => setPwdForm((current) => ({ ...current, [key]: value }));

  const submitPasswordChange = async (event) => {
    event.preventDefault();
    if (!sessionToken || pwdBusy) return;
    setPwdError("");
    setPwdMessage("");
    const { currentPassword, newPassword, confirmPassword } = pwdForm;
    if (!newPassword || newPassword.length < 8) {
      setPwdError("New password must be at least 8 characters long.");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPwdError("New password must contain at least one letter and one number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("New password and confirmation do not match.");
      return;
    }
    setPwdBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword }, sessionToken);
      setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPwdMessage("Password updated.");
      notify("Password updated.");
    } catch (requestError) {
      setPwdError((requestError && requestError.message) || "Unable to change password.");
    } finally {
      setPwdBusy(false);
    }
  };

  const pwdField = (key, label, autoComplete, placeholder) => (
    <label className="block">
      <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{label}</span>
      <input
        type="password"
        name={key}
        value={pwdForm[key] ?? ""}
        onChange={(event) => updatePwd(key, event.target.value)}
        placeholder={placeholder || "••••••••"}
        autoComplete={autoComplete}
        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
        style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
      />
    </label>
  );

  const persist = async (settings) => {
    // Write to the database (survives cache clears and is shared with the
    // cashier mode); also mirror to localStorage for instant reflection.
    saveStoreSettings(settings);
    if (sessionToken) {
      try {
        await api.saveSettings(settings, sessionToken);
        return true;
      } catch (requestError) {
        notify("Saved locally, but could not reach the server: " + (requestError.message || "unknown"), "error");
        return false;
      }
    }
    notify("Settings saved locally (server connection not available).");
    return true;
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const ok = await persist(form);
    // Keep the OS start-up entry in sync with what was saved (desktop only).
    if (typeof window.desktop?.setLaunchOnStartup === "function") {
      try {
        const applied = await window.desktop.setLaunchOnStartup(form.launchOnStartup === "true");
        setLaunchStartupState(Boolean(applied));
      } catch (_error) { /* non-fatal */ }
    }
    setSaving(false);
    if (ok) notify("Settings saved.");
  };

  const reset = async () => {
    setSaving(true);
    await persist(DEFAULT_SETTINGS);
    setForm({ ...DEFAULT_SETTINGS });
    setSaving(false);
    notify("Settings restored to defaults.");
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify("Please choose an image file.", "error"); return; }
    if (file.size > MAX_LOGO_BYTES) { notify("Logo must be smaller than 2 MB.", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, logoUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setForm((current) => ({ ...current, logoUrl: "" }));
  };

  const field = (key, label, type = "text", placeholder = "", span2 = false) => (
    <label className={"block" + (span2 ? " sm:col-span-2" : "")}>
      <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{label}</span>
      <input
        type={type}
        value={form[key] ?? ""}
        onChange={(event) => update(key, event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
        style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
      />
    </label>
  );

  const textArea = (key, label, span2 = true) => (
    <label className={"block" + (span2 ? " sm:col-span-2" : "")}>
      <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{label}</span>
      <textarea
        rows={2}
        value={form[key] ?? ""}
        onChange={(event) => update(key, event.target.value)}
        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
        style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
      />
    </label>
  );

  const section = (title, icon, children) => {
    const IconCmp = icon;
    return (
      <Card t={t} className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <IconCmp size={17} style={{ color: t.primary }} />
          <h3 className="font-bold text-sm" style={{ color: t.text }}>{title}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
      </Card>
    );
  };
return (
    <div className="space-y-4">
      <Card t={t} className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft }}>
            <SettingsIcon size={20} style={{ color: t.primary }} />
          </div>
          <div>
            <h2 className="font-bold" style={{ color: t.text }}>Settings</h2>
            <p className="text-xs mt-1" style={{ color: t.sub }}>Configure store details, branding, receipts, and inventory defaults.</p>
          </div>
        </div>
      </Card>

      {message && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: messageTone === "error" ? t.dangerSoft : t.successSoft, color: messageTone === "error" ? t.danger : t.success }}>
          {message}
        </div>
      )}

      <form onSubmit={save} className="space-y-4">
        {section("Store Information", Building2,
          <>
            {field("storeName", "Store name", "text", "Your store name")}
            {field("businessName", "Business / registered name", "text", "Registered business name")}
            {field("branchName", "Branch name", "text", "e.g. Main Branch")}
            {field("branchCode", "Branch code", "text", "e.g. MAIN-01")}
            {field("tagline", "Store tagline", "text", "A short tagline", true)}
            <div className="sm:col-span-2">
              <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Store logo</span>
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
                  <img src={form.logoUrl || STORE_DEFAULT_LOGO} alt={form.logoUrl ? "Store logo preview" : "Default logo preview"} className="w-full h-full object-contain" />
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer" style={{ background: t.primary, color: "#fff" }}>
                  <Upload size={15} /> Choose logo
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
                {form.logoUrl && (
                  <Button t={t} type="button" variant="outline" onClick={removeLogo}>
                    <Trash2 size={15} /> Remove logo
                  </Button>
                )}
              </div>
              <p className="text-[11px] mt-2" style={{ color: t.sub }}>
                {form.logoUrl ? "Custom logo set — used across login, splash, POS header, and receipts." : "No custom logo — the default logo is used automatically."}
              </p>
            </div>
          </>
        )}

        {section("Contact Details", Globe,
          <>
            {field("phone", "Contact number", "tel", "Store phone number")}
            {field("email", "Email address", "email", "Store email address")}
            {field("website", "Website", "url", "https://...")}
            {field("facebook", "Facebook page", "text", "Facebook URL or page name")}
            {field("address", "Store address", "text", "Full store address", true)}
          </>
        )}

        {section("Registration & Ownership", FileText,
          <>
            {field("ownerName", "Owner name", "text", "Owner / proprietor")}
            {field("authorizedRep", "Authorized representative", "text", "Name of authorized person")}
            {field("cashierManagerContact", "Cashier / manager contact", "text", "Contact for cashiers/managers")}
            {field("tinNumber", "TIN", "text", "Tax Identification Number")}
            {field("businessRegNumber", "Business registration number", "text", "Business permit / registration no.")}
            {field("dtiSecRegNumber", "DTI / SEC registration number", "text", "DTI or SEC registration no.")}
            {field("birRegNumber", "BIR registration details", "text", "BIR registration / RDO details", true)}
          </>
        )}

        {section("Receipt & Defaults", FileText,
          <>
            {textArea("receiptFooter", "Receipt / invoice footer message")}
            {field("taxRate", "Tax rate (%)", "number", "0")}
            {field("priceOverrideMaxPct", "Max price override (%)", "number", "50")}
            {field("defaultLocation", "Default location", "text", "Main Store")}
            {field("lowStockThreshold", "Low stock threshold", "number", "10")}
            {field("terminalName", "POS terminal name", "text", "POS-02")}
          </>
        )}

        {sessionToken && section("Backups", Archive,
          <div className="sm:col-span-2 space-y-3">
            <p className="text-xs" style={{ color: t.sub }}>
              Full snapshots of the database (sales, inventory, users, and settings). The server writes
              one automatically on startup and every 6 hours, keeping the newest 20. To restore, close the
              app and run <code>npm run restore:backup</code>.
            </p>
            <div className="rounded-xl p-3 space-y-2" style={{ background: t.bg, border: `1px solid ${t.border}`, textAlign: "left" }}>
              <span className="text-xs font-semibold block mb-1" style={{ color: t.sub }}>
                Backup destination folder
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={form.backupDir || ""}
                  onChange={(event) => { update("backupDir", event.target.value); setBackupDirTest(null); }}
                  placeholder={"Default: next to the database (e.g. D:\\POS-Backups)"}
                  className="flex-1 min-w-[220px] px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ background: t.bgSoft || "#fff", color: t.text, border: `1px solid ${t.border}` }}
                />
                <Button t={t} type="button" variant="outline" onClick={browseBackupDir} disabled={backupDirBusy}>
                  <FolderOpen size={14} /> Browse
                </Button>
                <Button t={t} type="button" variant="outline" onClick={testBackupDir} disabled={backupDirBusy}>
                  <HardDrive size={14} /> {backupDirBusy ? "Testing..." : "Test"}
                </Button>
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: t.sub }}>
                Leave blank to keep backups next to the database. Point this at a network share, USB drive, or a
                second disk so a terminal failure never takes the only copy with it.
              </div>
              {backupDirTest && (
                <div className="text-[11px] font-semibold" style={{ color: backupDirTest.ok ? t.success : t.danger }}>
                  {backupDirTest.ok ? "✓ Writable — snapshots will be written here." : `✗ ${backupDirTest.error || "Not usable."}`}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button t={t} type="button" variant="outline" onClick={refreshBackups} disabled={backupBusy}>
                <RefreshCw size={14} /> Refresh
              </Button>
              <Button t={t} type="button" onClick={createBackupNow} disabled={backupBusy}>
                <Archive size={14} /> {backupBusy ? "Working..." : "Back up now"}
              </Button>
            </div>
            {backupError && <p className="text-xs" style={{ color: t.danger }}>{backupError}</p>}
            <ul className="space-y-1.5 max-h-64 overflow-auto pr-1">
              {backups.length === 0 && !backupBusy && (
                <li className="text-xs" style={{ color: t.sub }}>No backups yet.</li>
              )}
              {backups.map((backup) => (
                <li key={backup.filename} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs" style={{ background: t.bg }}>
                  <span style={{ color: t.text }}>{backup.filename}</span>
                  <span className="shrink-0 flex items-center gap-2">
                    <span style={{ color: t.sub }}>{formatBytes(backup.size)}</span>
                    <Button t={t} type="button" variant="outline" onClick={(event) => downloadBackup(backup.filename, event)} disabled={backupBusy}>
                      <Download size={13} /> Download
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {section("Security & Desktop", ShieldCheck,
          <div className="sm:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
              <div className="flex items-start gap-3">
                <MonitorCheck size={18} style={{ color: t.primary }} className="mt-0.5" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: t.text }}>Launch PosPilot at sign-in</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: t.sub }}>
                    Start the register automatically when this Windows user signs in (kiosk mode).
                    {typeof window.desktop?.setLaunchOnStartup !== "function" && " Available in the desktop app."}
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={launchStartupState || form.launchOnStartup === "true"}
                  onChange={toggleLaunchOnStartup}
                  disabled={typeof window.desktop?.setLaunchOnStartup !== "function"}
                />
                <span className="w-11 h-6 bg-slate-300 peer-checked:bg-blue-600 rounded-full transition-colors peer-disabled:opacity-40 peer-disabled:cursor-not-allowed after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block" style={{ textAlign: "left" }}>
                <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>
                  Auto sign-out after idle (minutes)
                </span>
                <div className="flex items-center gap-2">
                  <Timer size={14} style={{ color: t.sub }} />
                  <input
                    type="number"
                    min="0"
                    value={form.idleTimeoutMinutes || "0"}
                    onChange={(event) => update("idleTimeoutMinutes", event.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
                  />
                </div>
                <span className="text-[11px] mt-1 block" style={{ color: t.sub }}>
                  Signs out the register after this many minutes with no activity. 0 disables.
                </span>
              </label>

              <div className="flex flex-col justify-end gap-1" style={{ textAlign: "left" }}>
                <Button t={t} type="button" variant="outline" onClick={revokeAllSessions} disabled={revokeBusy}>
                  <LogOut size={14} /> {revokeBusy ? "Signing out..." : "Sign out other sessions"}
                </Button>
                <span className="text-[11px]" style={{ color: t.sub }}>
                  Logs out this account on every other terminal/device. Current session stays.
                </span>
              </div>
            </div>

            <div className="rounded-xl px-3 py-2.5 text-[11px] leading-relaxed" style={{ background: t.bg, border: `1px dashed ${t.border}`, color: t.sub }}>
              <strong>Password policy:</strong> at least 8 characters, must contain letters and numbers, must not
              contain your username, and can't be one of your last 3 passwords.
            </div>
          </div>
        )}

        {section("Change Password", KeyRound,
          <div className="sm:col-span-2">
            <form onSubmit={submitPasswordChange} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {pwdField("currentPassword", "Current password", "current-password", "Your current password")}
              {pwdField("newPassword", "New password", "new-password", "At least 8 characters")}
              {pwdField("confirmPassword", "Confirm new password", "new-password", "Repeat the new password")}
              <div className="sm:col-span-3 flex items-center gap-3">
                <Button t={t} type="submit" disabled={pwdBusy}>
                  <Check size={15} /> {pwdBusy ? "Saving..." : "Update password"}
                </Button>
                {pwdMessage && <span className="text-xs" style={{ color: t.success }}>{pwdMessage}</span>}
                {pwdError && <span className="text-xs" style={{ color: t.danger }}>{pwdError}</span>}
              </div>
            </form>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button t={t} type="button" variant="outline" onClick={reset} disabled={saving}>
            <RotateCcw size={15} /> Reset to defaults
          </Button>
          <Button t={t} type="submit" disabled={saving}>
            <Check size={15} /> {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
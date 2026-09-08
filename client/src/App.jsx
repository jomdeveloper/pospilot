import { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Power,
  X,
} from 'lucide-react';
import './App.css';
import { api, setAuthToken } from './api';
import { validateLogin } from './auth';
import StockPilotApp from './stockpilot/App';
import BarcodeScannerPage from './stockpilot/pages/BarcodeScanner';
import { DEFAULT_STORE_SETTINGS, getStoreLogo, readStoreSettings, useStoreSettings } from './stockpilot/settings';
import CashierPOS from './cashierpos/App';

const SESSION_STORAGE_KEY = 'pospilot.session';

/**
 * Floating "close" button shown on the login screen only in the packaged
 * Electron app (the frameless window has no OS title bar to close it).
 * Opens the quit confirmation dialog instead of quitting immediately.
 */
function LoginCloseButton({ onClick }) {
  return (
    <button
      type="button"
      className="login-close-btn"
      onClick={onClick}
      aria-label="Close PosPilot"
      title="Close PosPilot"
    >
      <X size={17} strokeWidth={2.4} />
    </button>
  );
}

/**
 * Premium confirmation dialog shown before quitting. Cancel keeps the app
 * running; "Yes, Exit" calls window.desktop.quit() so the Electron main
 * process releases the server port and closes the database before exiting.
 */
function QuitConfirmDialog({ open, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="quit-confirm-overlay">
      <div className="quit-confirm-modal" role="dialog" aria-modal="true" aria-label="Exit PosPilot">
        <div className="quit-confirm-modal__icon" aria-hidden="true">
          <Power size={24} strokeWidth={2.2} />
        </div>
        <h3 className="quit-confirm-modal__title">Exit PosPilot?</h3>
        <p className="quit-confirm-modal__desc">
          The application and its local server will shut down cleanly, releasing
          the port it uses.
        </p>
        <div className="quit-confirm-modal__actions">
          <button type="button" className="btn btn--outline-blue" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            Yes, Exit
          </button>
        </div>
      </div>
    </div>
  );
}
export default function App() {
  const storeSettings = useStoreSettings();
  const storeName = storeSettings.storeName || DEFAULT_STORE_SETTINGS.storeName;
  const pharmacySuffix = /\s+Pharmacy$/i.test(storeName) ? "Pharmacy" : "";
  const storeNamePrefix = pharmacySuffix ? storeName.slice(0, -pharmacySuffix.length).trimEnd() : storeName;
  const storeLogo = getStoreLogo(storeSettings);

  // Keep the browser/app tab title brand-consistent with the stored store name.
  useEffect(() => {
    document.title = storeName ? storeName + " — POS" : "Pharmacy POS";
  }, [storeName]);

  const [loggedIn, setLoggedIn] = useState(false);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState('');
  const [loggedInRole, setLoggedInRole] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [passwordChangeForm, setPasswordChangeForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeSubmitting, setPasswordChangeSubmitting] = useState(false);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  // Only the packaged Electron app exposes a desktop bridge — in the regular
  // browser the login screen simply doesn't show a close button.
  const canQuitApp = typeof window.desktop?.quit === 'function';

  // Restore a persisted session on boot (survives a browser/desktop restart).
  useEffect(() => {
    const storedSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!storedSession) {
      setAuthInitializing(false);
      return undefined;
    }

    let session;
    try {
      session = JSON.parse(storedSession);
    } catch {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      setAuthInitializing(false);
      return undefined;
    }

    if (!session?.token) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      setAuthInitializing(false);
      return undefined;
    }

    setAuthToken(session.token);
    api.getSession(session.token)
      .then((result) => {
        setLoggedIn(true);
        setLoggedInUser(result.user.username);
        setLoggedInRole(result.user.role);
        setSessionToken(session.token);
        setMustChangePassword(Boolean(result.user && result.user.mustChangePassword));
      })
      .catch(() => {
        setAuthToken('');
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      })
      .finally(() => setAuthInitializing(false));

    return undefined;
  }, []);
const openQuitConfirm = () => setQuitConfirmOpen(true);
  const closeQuitConfirm = () => setQuitConfirmOpen(false);

  const confirmQuitApp = () => {
    // In Electron this hits the 'app-quit' IPC channel in the main process,
    // which shuts down the Express server (releasing port 4000), closes the
    // SQLite database and only then exits. Nothing happens in plain browsers.
    window.desktop?.quit();
  };

  // Quit-confirmation keyboard handling — the ONLY key handling the login /
  // password-change screens need. F1..F11 / Delete / arrows are owned by the
  // CashierPOS and StockPilot apps once logged in, so no legacy handler is
  // attached here.
  useEffect(() => {
    const handleQuitKeys = (event) => {
      if (!quitConfirmOpen) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmQuitApp();
        return;
      }
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        closeQuitConfirm();
        return;
      }
    };

    window.addEventListener('keydown', handleQuitKeys);
    return () => window.removeEventListener('keydown', handleQuitKeys);
  }, [quitConfirmOpen]);

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
    if (loginError) setLoginError('');
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setLoginSubmitting(true);

    const result = await validateLogin(loginForm.username, loginForm.password);

    if (!result.ok) {
      setLoginError(result.message);
      setLoginSubmitting(false);
      return;
    }

    setIsTransitioning(true);
    setLoginSubmitting(true);

    window.setTimeout(() => {
      setAuthToken(result.token);
      setLoggedIn(true);
      setLoggedInUser(result.user);
      setLoggedInRole(result.role);
      setSessionToken(result.token);
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: result.token }));
      setMustChangePassword(Boolean(result.mustChangePassword));
      if (result.mustChangePassword) {
        setPasswordChangeForm({ currentPassword: loginForm.password, newPassword: '', confirmPassword: '' });
      }
      setLoginError('');
      setLoginForm({ username: '', password: '' });
      setLoginSubmitting(false);
      setIsTransitioning(false);
    }, 1800);
  };

  const handleLogout = () => {
    if (sessionToken) {
      api.logout(sessionToken).catch(() => {});
    }
    setLoggedIn(false);
    setAuthToken('');
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setLoggedInUser('');
    setLoggedInRole('');
    setSessionToken('');
    setMustChangePassword(false);
    setPasswordChangeForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordChangeError('');
    setLoginForm({ username: '', password: '' });
    setLoginError('');
    setShowPassword(false);
  };
// Idle auto sign-out (protects an unattended register). Reads the configured
  // timeout from store settings, then resets a timer on any user activity and
  // logs out after the timeout elapses. 0 (the default) disables it entirely.
  useEffect(() => {
    if (!loggedIn) return undefined;
    const minutes = Number(readStoreSettings().idleTimeoutMinutes || 0);
    if (!Number.isFinite(minutes) || minutes <= 0) return undefined;

    let timer = null;
    const events = ['keydown', 'mousemove', 'click', 'touchstart', 'scroll'];
    const arm = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        handleLogout();
      }, minutes * 60 * 1000);
    };
    events.forEach((name) => window.addEventListener(name, arm, { passive: true }));
    arm();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, arm));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, sessionToken]);

  const handlePasswordChangeChange = (event) => {
    const { name, value } = event.target;
    setPasswordChangeForm((prev) => ({ ...prev, [name]: value }));
    if (passwordChangeError) setPasswordChangeError('');
  };

  const handlePasswordChangeSubmit = async (event) => {
    event.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = passwordChangeForm;

    if (!newPassword || newPassword.length < 8) {
      setPasswordChangeError('New password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordChangeError('New password must contain at least one letter and one number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('New password and confirmation do not match.');
      return;
    }

    setPasswordChangeSubmitting(true);
    setPasswordChangeError('');
    try {
      await api.changePassword({ currentPassword, newPassword }, sessionToken);
      setMustChangePassword(false);
      setPasswordChangeForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setPasswordChangeError(error.message || 'Unable to change password.');
    } finally {
      setPasswordChangeSubmitting(false);
    }
  };

  const handleLoginKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleLoginSubmit(event);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword((visible) => !visible);
  };
if (isTransitioning) {
    const loadingStockPilot = loginForm.username.trim().toLowerCase() !== 'cashier';

    return (
      <div className="login-screen login-screen--transition">
        <div className="app-transition">
          <div className="app-transition__logo">
            <img src={storeLogo} alt={loadingStockPilot ? 'StockPilot' : 'PosPilot'} className="app-transition__logo-image" />
          </div>
          <div className="app-transition__text">Loading {loadingStockPilot ? 'StockPilot' : 'POSPilot'}</div>
        </div>
      </div>
      );
  }

  if (authInitializing) {
    return (
      <div className="login-screen login-screen--transition">
        <div className="app-transition__text">Restoring session...</div>
      </div>
    );
  }

  if (window.location.pathname === '/scanner') {
    const scannerTheme = { primary: '#2563EB', primarySoft: '#EFF4FF', bg: '#F8FAFC', card: '#FFFFFF', text: '#1E293B', sub: '#64748B', border: '#E7EBF1', danger: '#EF4444', warningSoft: '#FEF6E7' };
    return <BarcodeScannerPage t={scannerTheme} sessionToken={sessionToken} />;
  }

  if (!loggedIn) {
    return (
      <div className="login-screen">
        {canQuitApp && <LoginCloseButton onClick={openQuitConfirm} />}
        <QuitConfirmDialog open={quitConfirmOpen} onCancel={closeQuitConfirm} onConfirm={confirmQuitApp} />
        <div className="login-card">
          <div className="login-card__brand">
            <div className="login-card__logo">
              <img src={storeLogo} alt="Store logo" className="login-card__logo-image" />
            </div>
            <div className="login-card__brand-copy">
              <p className="login-card__eyebrow login-card__eyebrow--brand"><span>{storeNamePrefix}</span>{pharmacySuffix && <strong>{pharmacySuffix}</strong>}</p>
            </div>
          </div>

          <form className="login-form" onSubmit={handleLoginSubmit}>
            <label className="login-field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                value={loginForm.username}
                onChange={handleLoginChange}
                onKeyDown={handleLoginKeyDown}
                placeholder="admin"
                autoComplete="username"
                autoFocus
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={loginForm.password}
                  onChange={handleLoginChange}
                  onKeyDown={handleLoginKeyDown}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={0}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {loginError && <div className="login-error">{loginError}</div>}

            <button type="submit" className="btn btn--blue login-submit" disabled={loginSubmitting}>
              {loginSubmitting ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="login-card__footer">
            <span>Powered by</span>
            <strong>POSpilot</strong>
          </div>
        </div>
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div className="login-screen">
        {canQuitApp && <LoginCloseButton onClick={openQuitConfirm} />}
        <QuitConfirmDialog open={quitConfirmOpen} onCancel={closeQuitConfirm} onConfirm={confirmQuitApp} />
        <div className="login-card">
          <div className="login-card__brand">
            <div className="login-card__logo">
              <img src={storeLogo} alt="Store logo" className="login-card__logo-image" />
            </div>
            <div className="login-card__brand-copy">
              <p className="login-card__eyebrow login-card__eyebrow--brand"><span>{storeNamePrefix}</span>{pharmacySuffix && <strong>{pharmacySuffix}</strong>}</p>
            </div>
          </div>

          <h2 className="login-card__title">Set a new password</h2>
          <p className="login-card__hint">You are signed in with a temporary default password. Choose a new one (at least 8 characters) before continuing.</p>
<form className="login-form" onSubmit={handlePasswordChangeSubmit}>
            <label className="login-field">
              <span>Current password</span>
              <input
                type="password"
                name="currentPassword"
                value={passwordChangeForm.currentPassword}
                onChange={handlePasswordChangeChange}
                autoComplete="current-password"
                autoFocus
              />
            </label>

            <label className="login-field">
              <span>New password</span>
              <input
                type="password"
                name="newPassword"
                value={passwordChangeForm.newPassword}
                onChange={handlePasswordChangeChange}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </label>

            <label className="login-field">
              <span>Confirm new password</span>
              <input
                type="password"
                name="confirmPassword"
                value={passwordChangeForm.confirmPassword}
                onChange={handlePasswordChangeChange}
                placeholder="Repeat the new password"
                autoComplete="new-password"
              />
            </label>

            {passwordChangeError && <div className="login-error">{passwordChangeError}</div>}

            <button type="submit" className="btn btn--blue login-submit" disabled={passwordChangeSubmitting}>
              {passwordChangeSubmitting ? 'Saving...' : 'Update password'}
            </button>
          </form>

          <div className="login-card__change-footer">
            <button type="button" className="login-card__change-logout" onClick={handleLogout}>Continue to sign out</button>
          </div>

          <div className="login-card__footer">
            <span>Powered by</span>
            <strong>POSpilot</strong>
          </div>
        </div>
      </div>
    );
  }

  if (String(loggedInRole || '').toLowerCase() !== 'cashier') {
    return <StockPilotApp loggedInUser={loggedInUser} loggedInRole={loggedInRole} sessionToken={sessionToken} onLogout={handleLogout} />;
  }
  return <CashierPOS loggedInUser={loggedInUser} loggedInRole={loggedInRole} sessionToken={sessionToken} onLogout={handleLogout} />;
}
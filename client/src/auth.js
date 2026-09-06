import { api } from './api';

export async function validateLogin(username, password) {
  const normalizedUser = String(username || '').trim();
  const normalizedPassword = String(password || '');

  if (!normalizedUser || !normalizedPassword) {
    return {
      ok: false,
      message: 'Username and password are required.',
    };
  }

  try {
    const result = await api.login({ username: normalizedUser, password: normalizedPassword });
    return {
      ok: true,
      user: result.user.username,
      role: result.user.role,
      token: result.token,
      mustChangePassword: Boolean(result.user && result.user.mustChangePassword),
      message: 'Login successful.',
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || 'Unable to sign in.',
    };
  }
}

/* =========================================================================
 * auth.js — Production API Authentication & Session Client (Token Auth)
 * Never stores plaintext passwords or sensitive credentials in localStorage.
 * ========================================================================= */
'use strict';

const Auth = (() => {
  const TOKEN_KEY = 'cpu_sched_auth_token';
  const USER_KEY = 'cpu_sched_current_user';
  const API_BASE = '/api';

  // Clean up any legacy insecure localStorage keys from the static prototype
  try {
    localStorage.removeItem('cpu_sched_users');
    localStorage.removeItem('cpu_sched_saved_credentials');
  } catch (_) {}

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (_) { return null; }
  }

  function setSession(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify({
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          name: user.name || user.username,
          role: user.role || 'STUDENT',
          is_verified: !!user.is_verified,
          avatarColor: user.avatar_color || '#6c8cff',
          created_at: user.created_at,
          last_login: user.last_login,
        }));
      }
    } catch (e) {
      console.error('Failed to persist session', e);
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (_) {}
  }

  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function extractError(data, fallback = 'Request failed') {
    if (!data) return fallback;
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.message === 'string') return data.message;
    if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) return data.non_field_errors[0];
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (Array.isArray(val) && val.length) return `${key}: ${val[0]}`;
      if (typeof val === 'string') return `${key}: ${val}`;
    }
    return fallback;
  }

  async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Token ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const contentType = res.headers.get('content-type') || '';
    if (options.rawResponse) return res;

    let data = null;
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => null);
    }
    if (!res.ok) {
      if (res.status === 401) clearSession();
      throw new Error(extractError(data, `HTTP ${res.status}`));
    }
    return data;
  }

  async function register({ name, username, email, password }) {
    try {
      const data = await apiFetch('/auth/register/', {
        method: 'POST',
        body: JSON.stringify({ name, username, email, password }),
      });
      setSession(data.token, data.user);
      return { success: true, user: getCurrentUser(), message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async function login({ identifier, password }) {
    try {
      const data = await apiFetch('/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      setSession(data.token, data.user);
      return { success: true, user: getCurrentUser(), message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async function logout() {
    try {
      if (getToken()) await apiFetch('/auth/logout/', { method: 'POST' });
    } catch (_) {
      // Clear local session regardless of network response
    } finally {
      clearSession();
    }
  }

  async function refreshProfile() {
    if (!getToken()) return null;
    try {
      const data = await apiFetch('/auth/me/');
      setSession(null, data.user);
      return getCurrentUser();
    } catch (_) {
      return getCurrentUser();
    }
  }

  async function updateProfile(payload) {
    try {
      const data = await apiFetch('/auth/me/', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setSession(null, data.user);
      return { success: true, user: getCurrentUser(), message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async function changePassword(currentPassword, newPassword) {
    try {
      const data = await apiFetch('/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (data.token) setSession(data.token, getCurrentUser());
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async function verifyEmail(token) {
    try {
      const data = await apiFetch('/auth/verify-email/', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      if (data.user && getToken()) setSession(null, data.user);
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async function resendVerification() {
    try {
      const data = await apiFetch('/auth/resend-verification/', { method: 'POST' });
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async function requestPasswordReset(email) {
    try {
      const data = await apiFetch('/auth/password-reset/', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async function confirmPasswordReset(token, newPassword) {
    try {
      const data = await apiFetch('/auth/password-reset/confirm/', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  return {
    getToken,
    getCurrentUser,
    isAuthenticated: () => !!(getToken() && getCurrentUser()),
    isAdmin: () => {
      const u = getCurrentUser();
      return !!(u && u.role === 'ADMIN');
    },
    apiFetch,
    register,
    login,
    logout,
    refreshProfile,
    updateProfile,
    changePassword,
    verifyEmail,
    resendVerification,
    requestPasswordReset,
    confirmPasswordReset,
  };
})();

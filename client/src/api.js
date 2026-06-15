const TOKEN_KEY = 'hx_token';
const USER_KEY = 'hx_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.includes('/login')) {
    clearSession();
    window.location.reload();
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// SSP currency formatting
export function money(n) {
  const v = Number(n) || 0;
  return 'SSP ' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function toCSV(rows, columns) {
  const head = columns.map(c => `"${c.label}"`).join(',');
  const body = rows.map(r =>
    columns.map(c => {
      const val = typeof c.value === 'function' ? c.value(r) : r[c.value];
      return `"${String(val ?? '').replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');
  return head + '\n' + body;
}

export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

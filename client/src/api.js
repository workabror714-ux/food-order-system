// Markazlashgan API mijozi — base URL, auth header, 401 boshqaruvi, xato.
// CommonJS-mos ESM: barcha komponentlar shu orqali server bilan gaplashadi.
const BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const getToken = () => localStorage.getItem("token");

async function request(path, { method = "GET", body, auth = false, form = false } = {}) {
  const headers = {};
  if (!form && body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ? body : (body !== undefined ? JSON.stringify(body) : undefined),
  });

  // Token eskirgan — login'ga qaytaramiz
  if (res.status === 401 && auth) {
    localStorage.clear();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Sessiya tugadi");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Xatolik (${res.status})`);
  return data;
}

export const API_BASE = BASE;
export const api = {
  get: (p, auth = false) => request(p, { auth }),
  post: (p, body, auth = false) => request(p, { method: "POST", body, auth }),
  put: (p, body, auth = false) => request(p, { method: "PUT", body, auth }),
  patch: (p, body, auth = false) => request(p, { method: "PATCH", body, auth }),
  del: (p, auth = false) => request(p, { method: "DELETE", auth }),
  // Multipart yuklash (rasm/media) — auth bilan; method (POST/PUT) bering
  upload: (p, formData, method = "POST") => request(p, { method, body: formData, auth: true, form: true }),
};

import axios from "axios";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && !window.location.pathname.includes("/login")) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(e);
  }
);

export function markSaved() {
  window.dispatchEvent(new CustomEvent("app:saved"));
}

export function errMsg(e) {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(", ");
  return e?.message || "Something went wrong";
}

export const BACKEND = process.env.REACT_APP_BACKEND_URL;
export default api;

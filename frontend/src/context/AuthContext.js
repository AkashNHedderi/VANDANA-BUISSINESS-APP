import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/apiClient";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=logged out, obj=in
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) {
      setUser(false);
      setReady(true);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setUser(false))
      .finally(() => setReady(true));
  }, []);

  const login = async (pin) => {
    const r = await api.post("/auth/login", { pin });
    localStorage.setItem("token", r.data.token);
    setUser({ email: r.data.email });
    return r.data;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(false);
    window.location.href = "/login";
  };

  return <AuthCtx.Provider value={{ user, ready, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

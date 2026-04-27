/**
 * Auth context — wraps the app and exposes user/login/logout/register.
 * `user === null`     → still loading
 * `user === false`    → unauthenticated
 * `user === { ... }`  → authenticated
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { API } from "../lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/auth/me`);
      setUser(res.data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    setUser(res.data);
    return res.data;
  };

  const register = async (name, email, password, role) => {
    const res = await axios.post(`${API}/auth/register`, { name, email, password, role });
    setUser(res.data);
    return res.data;
  };

  const logout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch { /* swallow */ }
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

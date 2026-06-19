import { useCallback, useEffect, useState } from "react";
import { api, getStoredUser, getToken, setSession, clearSession, User } from "./api";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const stored = await getStoredUser();
      if (stored) setUser(stored);
      try {
        const fresh = await api.me();
        setUser(fresh);
      } catch {
        // token invalid → clear
        await clearSession();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    await setSession(res.token, res.user);
    setUser(res.user);
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    extras?: { birth_year?: number; guardian_email?: string },
  ) => {
    const res = await api.signup(email, password, name, extras);
    await setSession(res.token, res.user);
    setUser(res.user);
  };

  const logout = async () => {
    await clearSession();
    setUser(null);
  };

  return { user, loading, login, signup, logout, refresh };
}

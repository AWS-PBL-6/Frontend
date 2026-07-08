import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  fetchUserAttributes,
  getCurrentUser,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

interface AuthContextValue {
  email: string | null;
  authenticated: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  email: null,
  authenticated: false,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await getCurrentUser();
      let mail: string | null = null;
      try {
        const attrs = await fetchUserAttributes();
        mail = attrs.email ?? null;
      } catch {
        /* attributes optional */
      }
      setEmail(mail ?? "signed-in");
    } catch {
      setEmail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn" || payload.event === "signInWithRedirect") refresh();
      if (payload.event === "signedOut") setEmail(null);
    });
    return unsubscribe;
  }, [refresh]);

  const signOut = useCallback(async () => {
    await amplifySignOut();
    setEmail(null);
  }, []);

  return (
    <AuthContext.Provider value={{ email, authenticated: !!email, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

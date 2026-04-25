import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { mapPerfilRoleForOperationalUi, type AppRole } from "@/lib/roles";
import { supabase } from "@/lib/supabase";

export type { AppRole };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  /** Quando definido, o usuário participa da estrutura por equipe (RLS no Supabase). */
  equipeId: string | null;
  roleLoading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithPassword: (email: string, password: string) => Promise<boolean>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const lastFetchedUserIdRef = useRef<string | null>(null);

  const fetchRole = useCallback(async (userId?: string | null) => {
    if (!userId) {
      setRole(null);
      setEquipeId(null);
      setRoleLoading(false);
      lastFetchedUserIdRef.current = null;
      return;
    }

    if (lastFetchedUserIdRef.current !== userId) {
      setRoleLoading(true);
    }
    lastFetchedUserIdRef.current = userId;
    let data: { role?: string; equipe_id?: string | null } | null = null;

    const full = await supabase
      .from("perfis")
      .select("role, equipe_id")
      .eq("usuario_id", userId)
      .maybeSingle();

    if (full.error) {
      const legacy = await supabase
        .from("perfis")
        .select("role")
        .eq("usuario_id", userId)
        .maybeSingle();
      if (legacy.error) {
        setRole(null);
        setEquipeId(null);
        setRoleLoading(false);
        return;
      }
      data = legacy.data;
    } else {
      data = full.data;
    }

    setRole(mapPerfilRoleForOperationalUi(data?.role));
    setEquipeId((data?.equipe_id as string | null | undefined) ?? null);
    setRoleLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
      fetchRole(data.session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      fetchRole(nextSession?.user?.id ?? null);

      // Timeline login: apenas quando o usuário logado é `cliente_gestao`.
      // Se a migration do timeline ainda não estiver aplicada, ignoramos o erro.
      if (_event === "SIGNED_IN" && nextSession?.user?.id) {
        const userId = nextSession.user.id;
        void (async () => {
          try {
            const { data: full } = await supabase
              .from("perfis")
              .select("role, equipe_id")
              .eq("usuario_id", userId)
              .maybeSingle();

            const rawRole = (full?.role as string | undefined) ?? null;
            if (rawRole !== "cliente_gestao") return;

            await supabase.rpc("timeline_eventos_push", {
              p_cliente_id: userId,
              p_gestor_id: null,
              p_equipe_id: (full as { equipe_id?: string | null } | null)?.equipe_id ?? null,
              p_tipo_evento: "LOGIN",
              p_titulo: "Login",
              p_descricao: "Usuário efetuou login no app.",
              p_metadata: {},
              p_data_evento: new Date().toISOString(),
            });
          } catch {
            // noop: evita quebrar login caso timeline_eventos_push não exista ainda
          }
        })();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/me`,
      },
    });
    if (error) throw error;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return Boolean(data.session);
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    // true when session is created immediately (email confirmation disabled).
    return Boolean(data.session);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/me`,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const refreshRole = useCallback(async () => {
    await fetchRole(user?.id ?? null);
  }, [fetchRole, user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      role,
      equipeId,
      roleLoading,
      signInWithPassword,
      signUpWithPassword,
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
      refreshRole,
    }),
    [
      user,
      session,
      loading,
      role,
      equipeId,
      roleLoading,
      signInWithPassword,
      signUpWithPassword,
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
      refreshRole,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

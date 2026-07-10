/* eslint-disable react-refresh/only-export-components -- Context API intentionally keeps provider, hook, and exported types together. */
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

import { authRedirectUrl, isNativePlatform } from "@/lib/nativeAuth";
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
  /** null enquanto carrega ou sem perfil; true/false conforme coluna plano_ativo do perfil. */
  planoAtivo: boolean | null;
  /** null enquanto carrega ou sem perfil; string conforme coluna subscription_status do perfil. */
  subscriptionStatus: string | null;
  roleLoading: boolean;
  roleError: string | null;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithPassword: (email: string, password: string) => Promise<boolean>;
  /** Reenvia o e-mail de confirmação de cadastro (quando o "Confirm email" do GoTrue está ligado). */
  resendConfirmation: (email: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ROLE_FETCH_TIMEOUT_MS = 8000;
const ROLE_FETCH_TIMEOUT_ERROR = "role_fetch_timeout";
const ROLE_LOAD_ERROR_MESSAGE =
  "Nao foi possivel validar seu perfil agora. Tente novamente antes de concluir que a conta nao tem acesso.";

function isMissingEquipeIdColumn(error: { code?: string; message?: string; details?: string } | null) {
  if (!error) return false;
  const text = [error.message, error.details].filter(Boolean).join(" ");
  return (
    error.code === "42703" ||
    (/equipe_id/i.test(text) &&
      /column|coluna|schema cache|not found|does not exist/i.test(text))
  );
}

async function queryWithTimeout<T>(queryFactory: (signal: AbortSignal) => PromiseLike<T>) {
  let timedOut = false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ROLE_FETCH_TIMEOUT_MS);

  try {
    const result = await queryFactory(controller.signal);
    if (timedOut) throw new Error(ROLE_FETCH_TIMEOUT_ERROR);
    return result;
  } catch (error) {
    if (timedOut) throw new Error(ROLE_FETCH_TIMEOUT_ERROR);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [planoAtivo, setPlanoAtivo] = useState<boolean | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [roleError, setRoleError] = useState<string | null>(null);
  const lastFetchedUserIdRef = useRef<string | null>(null);

  const fetchRole = useCallback(async (userId?: string | null) => {
    if (!userId) {
      setRole(null);
      setEquipeId(null);
      setPlanoAtivo(null);
      setSubscriptionStatus(null);
      setRoleError(null);
      setRoleLoading(false);
      lastFetchedUserIdRef.current = null;
      return;
    }

    if (lastFetchedUserIdRef.current !== userId) {
      setRoleLoading(true);
    }
    setRoleError(null);
    lastFetchedUserIdRef.current = userId;
    let data: { role?: string; equipe_id?: string | null; plano_ativo?: boolean | null; subscription_status?: string | null } | null = null;

    try {
      const full = await queryWithTimeout((signal) =>
        supabase
          .from("perfis")
          .select("role, equipe_id, plano_ativo, subscription_status")
          .eq("usuario_id", userId)
          .abortSignal(signal)
          .maybeSingle(),
      );

      if (full.error) {
        if (!isMissingEquipeIdColumn(full.error)) {
          setRole(null);
          setEquipeId(null);
          setPlanoAtivo(null);
          setSubscriptionStatus(null);
          setRoleError(ROLE_LOAD_ERROR_MESSAGE);
          return;
        }

        const legacy = await queryWithTimeout((signal) =>
          supabase
            .from("perfis")
            .select("role")
            .eq("usuario_id", userId)
            .abortSignal(signal)
            .maybeSingle(),
        );
        if (legacy.error) {
          setRole(null);
          setEquipeId(null);
          setPlanoAtivo(null);
          setSubscriptionStatus(null);
          setRoleError(ROLE_LOAD_ERROR_MESSAGE);
          return;
        }
        data = legacy.data;
      } else {
        data = full.data;
      }
    } catch {
      setRole(null);
      setEquipeId(null);
      setPlanoAtivo(null);
      setSubscriptionStatus(null);
      setRoleError(ROLE_LOAD_ERROR_MESSAGE);
      return;
    } finally {
      setRoleLoading(false);
    }

    setRole(mapPerfilRoleForOperationalUi(data?.role));
    setEquipeId((data?.equipe_id as string | null | undefined) ?? null);
    setPlanoAtivo((data?.plano_ativo as boolean | null | undefined) ?? null);
    setSubscriptionStatus((data?.subscription_status as string | null | undefined) ?? null);
    setRoleError(null);
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
        emailRedirectTo: authRedirectUrl("/me"),
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
      // Pra onde o link de confirmação volta quando o "Confirm email" está ligado.
      // Mesmo destino do magic link / OAuth (/me faz o bootstrap pós-auth);
      // no app nativo vira o deep link (authRedirectUrl cuida da troca).
      options: { emailRedirectTo: authRedirectUrl("/me") },
    });
    if (error) throw error;
    // true when session is created immediately (email confirmation disabled).
    return Boolean(data.session);
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authRedirectUrl("/me") },
    });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (isNativePlatform()) {
      // Google bloqueia OAuth em WebView (disallowed_useragent): abre em
      // Chrome Custom Tab e o retorno chega pelo deep link (NativeAuthDeepLinkHandler).
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authRedirectUrl("/me"), skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (data?.url) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url });
      }
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl("/me"),
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
      planoAtivo,
      subscriptionStatus,
      roleLoading,
      roleError,
      signInWithPassword,
      signUpWithPassword,
      resendConfirmation,
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
      planoAtivo,
      subscriptionStatus,
      roleLoading,
      roleError,
      signInWithPassword,
      signUpWithPassword,
      resendConfirmation,
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

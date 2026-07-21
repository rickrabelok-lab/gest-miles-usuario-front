import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  CreditCard,
  HelpCircle,
  Info,
  LogOut,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
} from "lucide-react";

import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type GestorInfo = { nome: string };

const getInitials = (base: string) => {
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const letters = base.replace(/[^a-zA-Z]/g, "").slice(0, 2);
  return letters.toUpperCase() || "?";
};

/** Hub do perfil (design 1h): conta, equipe de gestão, preferências e suporte. */
const PerfilPage = () => {
  const navigate = useNavigate();
  const { user, role, signOut } = useAuth();
  const [gestores, setGestores] = useState<GestorInfo[]>([]);

  const displayName = useMemo(() => {
    const meta = (user?.user_metadata as Record<string, unknown> | undefined)?.full_name;
    if (typeof meta === "string" && meta.trim()) return meta.trim();
    const prefix = user?.email?.split("@")[0] ?? "";
    return prefix
      .split(/[._-]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }, [user]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!user?.id || role !== "cliente_gestao") return;
      try {
        const { data: links, error: linksErr } = await supabase
          .from("cliente_gestores")
          .select("gestor_id")
          .eq("cliente_id", user.id);
        if (linksErr || !links?.length) return;
        const ids = [...new Set(links.map((l) => l.gestor_id as string).filter(Boolean))];
        if (!ids.length) return;
        const { data: perfis, error: perfisErr } = await supabase
          .from("perfis")
          .select("usuario_id, nome_completo")
          .in("usuario_id", ids);
        if (perfisErr || !alive) return;
        setGestores(
          (perfis ?? [])
            .map((p) => ({ nome: String(p.nome_completo ?? "").trim() }))
            .filter((g) => g.nome)
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        );
      } catch {
        // gracioso: sem card de equipe
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [user?.id, role]);

  const handleLogout = async () => {
    try {
      await signOut();
    } finally {
      navigate("/auth");
    }
  };

  const primeirosNomes = gestores.map((g) => g.nome.split(/\s+/)[0]);
  const equipeLabel =
    primeirosNomes.length > 1
      ? `${primeirosNomes.slice(0, -1).join(", ")} e ${primeirosNomes[primeirosNomes.length - 1]}`
      : (primeirosNomes[0] ?? "");

  const menuRow = (
    Icon: typeof User,
    label: string,
    onClick: () => void,
    trailing?: React.ReactNode,
  ) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors hover:bg-nubank-bg/60"
    >
      <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl bg-nubank-tint text-nubank-primary">
        <Icon size={17} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="flex-1 text-sm font-semibold text-nubank-text">{label}</span>
      {trailing}
      <ChevronRight size={17} strokeWidth={2} className="text-[#C4C3C9]" aria-hidden />
    </button>
  );

  const divider = <div className="mx-3.5 h-px bg-[#F1F0F3]" />;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-28 pt-[var(--gm-safe-top)]">
      <div className="flex flex-col items-center px-5 pt-8 text-center">
        <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-[#8A05BE] to-[#B56CFF] font-display text-2xl font-bold text-white shadow-[0_6px_18px_-4px_rgba(138,5,190,0.5)]">
          {getInitials(displayName || user?.email || "?")}
        </span>
        <h1 className="mt-3 font-display text-xl font-bold tracking-tight text-nubank-text">
          {displayName || "Minha conta"}
        </h1>
        {user?.email && (
          <p className="mt-0.5 text-[13px] text-nubank-text-secondary">{user.email}</p>
        )}
        {role === "cliente_gestao" && (
          <span className="mt-2.5 rounded-full bg-nubank-tint px-3 py-1.5 text-[11.5px] font-semibold leading-none text-nubank-dark">
            Cliente assessorado
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 px-5 pb-6 pt-5">
        {gestores.length > 0 && (
          <div className="rounded-[20px] bg-white p-4 shadow-nubank-card">
            <p className="section-label mb-0">Sua equipe de gestão</p>
            <div className="mt-3 flex items-center gap-2.5">
              <span className="flex">
                {gestores.slice(0, 2).map((g, i) => (
                  <span
                    key={g.nome}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-white font-display text-[13px] font-bold text-white ${
                      i === 0 ? "bg-nubank-text" : "-ml-2.5 bg-nubank-primary"
                    }`}
                  >
                    {getInitials(g.nome)}
                  </span>
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-nubank-text">
                  {equipeLabel}
                </span>
                <span className="block text-xs text-nubank-text-secondary">
                  {gestores.length > 1 ? "sua equipe de gestão" : "seu gestor de milhas"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => navigate("/fale-conosco")}
                className="flex h-[42px] flex-none items-center gap-1.5 rounded-[14px] bg-nubank-tint px-3.5 text-[13px] font-semibold text-nubank-dark transition-colors hover:bg-primary/15"
              >
                <MessageCircle size={15} strokeWidth={1.75} aria-hidden />
                Falar
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="section-label px-0.5">Conta</p>
          <div className="rounded-[20px] bg-white p-1 shadow-nubank-card">
            {menuRow(User, "Dados pessoais e viajantes", () => navigate("/perfil/dados"))}
            {divider}
            {menuRow(CreditCard, "Assinatura e plano", () => navigate("/assinatura"))}
          </div>
        </div>

        <div>
          <p className="section-label px-0.5">Preferências</p>
          <div className="rounded-[20px] bg-white p-1 shadow-nubank-card">
            {menuRow(Sparkles, "Preferências de sugestões", () =>
              navigate("/preferencias-sugestoes"),
            )}
            {role === "cliente_gestao" && (
              <>
                {divider}
                {menuRow(Bell, "Notificações", () => navigate("/notificacoes"))}
              </>
            )}
          </div>
        </div>

        <div>
          <p className="section-label px-0.5">Suporte</p>
          <div className="rounded-[20px] bg-white p-1 shadow-nubank-card">
            {menuRow(UserPlus, "Convide amigos", () => navigate("/convide-amigos"))}
            {divider}
            {menuRow(MessageCircle, "Fale conosco", () => navigate("/fale-conosco"))}
            {divider}
            {menuRow(HelpCircle, "Dúvidas frequentes", () => navigate("/duvidas"))}
            {divider}
            {menuRow(Info, "Sobre a GestMiles", () => navigate("/sobre"))}
            {divider}
            {menuRow(ShieldCheck, "Privacidade e LGPD", () => navigate("/privacidade"))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex h-12 items-center justify-center gap-2 rounded-[16px] bg-destructive-soft text-sm font-semibold text-destructive-strong transition-colors hover:bg-destructive/15"
        >
          <LogOut size={17} strokeWidth={1.75} aria-hidden />
          Sair da conta
        </button>

        <p className="text-center text-[11.5px] text-nubank-text-secondary/70">
          Gest<span className="font-semibold">Miles</span> — gestão de milhas
        </p>
      </div>

      <BottomNav />
    </div>
  );
};

export default PerfilPage;

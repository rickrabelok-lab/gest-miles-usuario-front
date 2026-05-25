import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type ClientePerfilData = {
  cpf: string;
  rg: string;
  dataNascimento: string;
  emailContato: string;
  passaporte: string;
  informacoesFamiliares: string;
  endereco: string;
  inicioGestao: string;
  planoAcao: {
    latam: boolean;
    azul: boolean;
    smiles: boolean;
    avios: boolean;
    copa: boolean;
    allAccor: boolean;
  };
  cartaoPrincipal: string;
  hub: string;
  clubesAssinados: string;
  gestoresResponsaveis: string;
  pauta: string;
};

const defaultPerfilData: ClientePerfilData = {
  cpf: "",
  rg: "",
  dataNascimento: "",
  emailContato: "",
  passaporte: "",
  informacoesFamiliares: "",
  endereco: "",
  inicioGestao: "",
  planoAcao: {
    latam: false,
    azul: false,
    smiles: false,
    avios: false,
    copa: false,
    allAccor: false,
  },
  cartaoPrincipal: "",
  hub: "",
  clubesAssinados: "",
  gestoresResponsaveis: "",
  pauta: "",
};

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function rethrowWithStage(stage: string, err: { message?: string } | null | undefined): void {
  if (!err) return;
  const m = typeof err.message === "string" && err.message ? err.message : "erro desconhecido";
  throw new Error(`${stage}: ${m}`);
}

function formatProfileLoadError(error: unknown): string {
  console.warn("[ClientProfile] load failed", error);
  return "Não foi possível carregar seu perfil agora. Tente novamente em instantes.";
}

function formatProfileSaveError(error: unknown): string {
  console.warn("[ClientProfile] save failed", error);
  return "Não foi possível salvar seu perfil agora. Revise sua conexão e tente novamente.";
}

/** Clona via JSON para remover `undefined` e garantir payload válido em `jsonb` (PostgREST). */
function jsonSafeForDb<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepEqualJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return a === b;
  const ta = typeof a;
  const tb = typeof b;
  if (ta !== tb) return false;
  if (ta !== "object") return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualJson(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keysA = Object.keys(ao).sort();
  const keysB = Object.keys(bo).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
  }
  for (const k of keysA) {
    if (!deepEqualJson(ao[k], bo[k])) return false;
  }
  return true;
}

async function verifyPersistenciaPerfilCliente(
  usuarioId: string,
  expectedClientePerfil: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from("perfis")
    .select("configuracao_tema")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (error) throw new Error(`Confirmação de gravação: ${error.message}`);
  if (!data) throw new Error("Confirmação de gravação: perfil não encontrado após salvar.");
  const cfg = (data.configuracao_tema ?? null) as Record<string, unknown> | null;
  const raw = cfg?.clientePerfil;
  if (raw === undefined || raw === null || typeof raw !== "object") {
    throw new Error("Confirmação de gravação: bloco clientePerfil não encontrado no Supabase após salvar.");
  }
  const expected = jsonSafeForDb(expectedClientePerfil);
  const actual = jsonSafeForDb(raw as Record<string, unknown>);
  if (!deepEqualJson(expected, actual)) {
    throw new Error(
      "Confirmação de gravação: os dados lidos do servidor não coincidem com os enviados. Tente novamente.",
    );
  }
}

function buildClientePerfilPayload(
  existingClientePerfil: Record<string, unknown>,
  perfilData: ClientePerfilData,
): Record<string, unknown> {
  const dbPlanoAcao = (existingClientePerfil.planoAcao ?? {}) as Record<string, unknown>;
  const formPlanoAcao = perfilData.planoAcao as Record<string, unknown>;

  const planoAcao = {
    ...defaultPerfilData.planoAcao,
    ...dbPlanoAcao,
    ...formPlanoAcao,
  };

  const next: Record<string, unknown> = {
    ...existingClientePerfil,
    ...perfilData,
    planoAcao,
  };

  delete next.acessos;

  return jsonSafeForDb(next);
}

function resolveContactEmail(inputEmail: string, existingEmail?: string | null, authEmail?: string | null): string | null {
  const normalized = inputEmail.trim().toLowerCase();
  if (normalized) return normalized;
  return existingEmail ?? authEmail ?? null;
}

const ClientProfile = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [perfilData, setPerfilData] = useState<ClientePerfilData>(defaultPerfilData);
  const [profileReady, setProfileReady] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const profileLoadSeqRef = useRef(0);

  const fallbackSlug = useMemo(() => {
    const fromEmail = user?.email?.split("@")[0] ?? "usuario";
    return slugify(fromEmail) || `user-${Date.now().toString().slice(-6)}`;
  }, [user?.email]);

  const loadProfile = useCallback(() => {
    if (!user?.id) {
      setProfileReady(false);
      setProfileLoadError(null);
      return;
    }
    setProfileReady(false);
    setProfileLoadError(null);
    const seq = ++profileLoadSeqRef.current;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("perfis")
          .select("nome_completo, email, configuracao_tema")
          .eq("usuario_id", user.id)
          .maybeSingle();
        if (error) {
          if (seq !== profileLoadSeqRef.current) return;
          setProfileLoadError(formatProfileLoadError(error));
          setProfileReady(false);
          return;
        }
        if (seq !== profileLoadSeqRef.current) return;

        const nome = data?.nome_completo ?? user.email?.split("@")[0] ?? "";
        setFullName(nome);

        const cfg = (data?.configuracao_tema ?? {}) as Record<string, unknown>;
        const existing = (cfg.clientePerfil ?? {}) as Partial<ClientePerfilData>;
        setPerfilData({
          ...defaultPerfilData,
          ...existing,
          emailContato: existing.emailContato || data?.email || user.email || "",
          planoAcao: {
            ...defaultPerfilData.planoAcao,
            ...(existing.planoAcao ?? {}),
          },
        });
        if (seq === profileLoadSeqRef.current) setProfileReady(true);
      } catch (err) {
        if (seq !== profileLoadSeqRef.current) return;
        setProfileLoadError(formatProfileLoadError(err));
        setProfileReady(false);
      }
    };
    void load();
  }, [user?.id, user?.email]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const togglePlano = (key: keyof ClientePerfilData["planoAcao"]) =>
    setPerfilData((prev) => ({
      ...prev,
      planoAcao: { ...prev.planoAcao, [key]: !prev.planoAcao[key] },
    }));

  const handleSave = async () => {
    if (!user?.id) return;
    if (!profileReady) {
      toast.error("Aguarde o carregamento do perfil antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from("perfis")
        .select("id, slug, email, configuracao_tema")
        .eq("usuario_id", user.id)
        .maybeSingle();
      rethrowWithStage("Ler perfil", existingError);

      const existingConfig = jsonSafeForDb((existing?.configuracao_tema as Record<string, unknown>) ?? {});
      const existingClientePerfil = ((existingConfig.clientePerfil as Record<string, unknown>) ?? {}) as Record<
        string,
        unknown
      >;

      const nextClientePerfil = buildClientePerfilPayload(existingClientePerfil, perfilData);

      const nomeGravar = fullName.trim();
      const contactEmail = resolveContactEmail(perfilData.emailContato, existing?.email, user.email);

      const { data: saved, error: saveError } = await supabase.rpc("cliente_perfil_save_self", {
        p_nome_completo: nomeGravar,
        p_email_contato: contactEmail,
        p_slug: existing?.slug ?? `${fallbackSlug}-${user.id.slice(0, 8)}`,
        p_cliente_perfil: nextClientePerfil,
      });
      rethrowWithStage("Gravar perfil no Supabase", saveError);
      if (!saved || typeof saved !== "object" || !(saved as { ok?: unknown }).ok) {
        throw new Error("Gravar perfil: confirmação inválida retornada pelo servidor.");
      }

      await verifyPersistenciaPerfilCliente(user.id, nextClientePerfil);
      toast.success("Perfil do cliente salvo com sucesso.");
    } catch (error) {
      toast.error(formatProfileSaveError(error));
    } finally {
      setSaving(false);
    }
  };

  if (!loading && !user) return <Navigate to="/auth" replace />;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background px-4 pb-24 pt-5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-2 -ml-1 h-8 px-2 text-xs text-muted-foreground"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>
      <h1 className="text-lg font-semibold">Perfil do cliente</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        Preencha os dados estratégicos e operacionais da conta.
      </p>

      {profileLoadError ? (
        <div className="mb-4 space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p>{profileLoadError}</p>
          <Button type="button" variant="outline" size="sm" onClick={loadProfile}>
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <div className="space-y-4">
        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground">Dados pessoais</p>
          <Input placeholder="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="CPF" value={perfilData.cpf} onChange={(e) => setPerfilData((p) => ({ ...p, cpf: e.target.value }))} />
            <Input placeholder="RG" value={perfilData.rg} onChange={(e) => setPerfilData((p) => ({ ...p, rg: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" placeholder="Data de nascimento" value={perfilData.dataNascimento} onChange={(e) => setPerfilData((p) => ({ ...p, dataNascimento: e.target.value }))} />
            <Input placeholder="Passaporte" value={perfilData.passaporte} onChange={(e) => setPerfilData((p) => ({ ...p, passaporte: e.target.value }))} />
          </div>
          <Input placeholder="Email" value={perfilData.emailContato} onChange={(e) => setPerfilData((p) => ({ ...p, emailContato: e.target.value }))} />
          <Textarea placeholder="Informações familiares" value={perfilData.informacoesFamiliares} onChange={(e) => setPerfilData((p) => ({ ...p, informacoesFamiliares: e.target.value }))} />
          <Textarea placeholder="Endereço" value={perfilData.endereco} onChange={(e) => setPerfilData((p) => ({ ...p, endereco: e.target.value }))} />
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground">Gestão e estratégia</p>
          <Input type="date" placeholder="Quando iniciou na gestão" value={perfilData.inicioGestao} onChange={(e) => setPerfilData((p) => ({ ...p, inicioGestao: e.target.value }))} />
          <Input placeholder="Cartão de crédito principal de uso" value={perfilData.cartaoPrincipal} onChange={(e) => setPerfilData((p) => ({ ...p, cartaoPrincipal: e.target.value }))} />
          <Input placeholder="Hub (aeroporto principal)" value={perfilData.hub} onChange={(e) => setPerfilData((p) => ({ ...p, hub: e.target.value }))} />
          <Input placeholder="Clubes assinados" value={perfilData.clubesAssinados} onChange={(e) => setPerfilData((p) => ({ ...p, clubesAssinados: e.target.value }))} />
          <Textarea placeholder="Gestores que cuidam da carteira desse cliente" value={perfilData.gestoresResponsaveis} onChange={(e) => setPerfilData((p) => ({ ...p, gestoresResponsaveis: e.target.value }))} />
          <Textarea
            placeholder="Pauta do cliente (especificações, prioridades, combinados e restrições)"
            value={perfilData.pauta}
            onChange={(e) => setPerfilData((p) => ({ ...p, pauta: e.target.value }))}
          />
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground">Plano de ação</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {([
              ["latam", "Latam"],
              ["azul", "Azul"],
              ["smiles", "Smiles"],
              ["avios", "Avios"],
              ["copa", "Copa"],
              ["allAccor", "All Accor"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={perfilData.planoAcao[key]}
                  onChange={() => togglePlano(key)}
                  className="h-4 w-4"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground">Acessos (programas e companhias)</p>
          <p className="text-xs text-muted-foreground">
            Acessos e senhas seguem disponiveis para quem tem permissao. A gestao deve acontecer no cofre seguro,
            com criptografia, permissoes por perfil e auditoria.
          </p>
        </section>

        <Button type="button" className="w-full" onClick={handleSave} disabled={saving || !profileReady}>
          {saving ? "Salvando..." : profileLoadError ? "Carregue o perfil para salvar" : "Salvar perfil"}
        </Button>
      </div>
    </div>
  );
};

export default ClientProfile;

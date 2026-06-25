import { supabase } from "@/lib/supabase";

export type AccountInfo = {
  id: string;
  email: string | null;
  criadoEm: string | null;
};

export type DataExportBundle = {
  exportadoEm: string;
  aplicacao: string;
  conta: AccountInfo;
  perfil: unknown | null;
  programas: unknown[];
  demandas: unknown[];
  preferencias: unknown | null;
  timeline: unknown[];
  npsAvaliacoes: unknown[];
  csatAvaliacoes: unknown[];
  alertas: unknown[];
  mensagensContato: unknown[];
  indicacoes: unknown | null;
  observacoes: string[];
};

// Só os métodos que usamos — mantém o service testável com um mock simples.
type SupabaseLike = Pick<typeof supabase, "from" | "rpc">;

const APLICACAO = "Gest Miles — app do cliente";

const CREDENCIAIS_NOTE =
  "Por segurança, logins e senhas de programas de fidelidade ficam cifrados no servidor e não são incluídos neste arquivo. Você os gerencia diretamente no app.";

// Allowlist de colunas pessoais de `perfis` (fora: stripe_*/subscription_*/admin_level
// /organizacao_id/plano_* — controle interno/billing, sem valor de portabilidade).
const PERFIL_COLUMNS =
  "usuario_id, slug, nome_completo, nome, email, data_nascimento, cpf, numero_telefone, endereco, equipe, role, equipe_id, configuracao_tema, created_at";

async function unwrap(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown> {
  const { data, error } = await query;
  if (error) {
    const msg =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "erro ao consultar";
    throw new Error(msg);
  }
  return data;
}

type Source = {
  key: keyof DataExportBundle;
  label: string;
  fetch: (client: SupabaseLike, userId: string) => Promise<unknown>;
};

const SOURCES: Source[] = [
  {
    key: "perfil",
    label: "Perfil",
    fetch: (c, uid) =>
      unwrap(c.from("perfis").select(PERFIL_COLUMNS).eq("usuario_id", uid).maybeSingle()),
  },
  {
    key: "programas",
    label: "Programas",
    fetch: (c, uid) => unwrap(c.from("programas_cliente").select("*").eq("cliente_id", uid)),
  },
  {
    key: "demandas",
    label: "Demandas e cotações",
    fetch: (c, uid) => unwrap(c.from("demandas_cliente").select("*").eq("cliente_id", uid)),
  },
  {
    key: "preferencias",
    label: "Preferências",
    fetch: (c, uid) =>
      unwrap(
        c.from("preferencias_usuario").select("preferencias").eq("usuario_id", uid).maybeSingle(),
      ),
  },
  {
    key: "timeline",
    label: "Timeline",
    fetch: (c, uid) => unwrap(c.from("timeline_eventos").select("*").eq("cliente_id", uid)),
  },
  {
    key: "npsAvaliacoes",
    label: "Avaliações NPS",
    fetch: (c, uid) => unwrap(c.from("nps_avaliacoes").select("*").eq("cliente_id", uid)),
  },
  {
    key: "csatAvaliacoes",
    label: "Avaliações CSAT",
    fetch: (c, uid) => unwrap(c.from("csat_avaliacoes").select("*").eq("cliente_id", uid)),
  },
  {
    key: "alertas",
    label: "Alertas",
    fetch: (c, uid) => unwrap(c.from("alertas_sistema").select("*").eq("cliente_id", uid)),
  },
  {
    key: "mensagensContato",
    label: "Mensagens de contato",
    fetch: (c, uid) =>
      unwrap(c.from("mensagens_contato").select("*").eq("cliente_usuario_id", uid)),
  },
  {
    key: "indicacoes",
    label: "Indicações",
    fetch: (c) => unwrap(c.rpc("indicacao_meu_resumo")),
  },
];

export async function gatherUserData(
  userId: string,
  account: AccountInfo,
  client: SupabaseLike = supabase,
): Promise<DataExportBundle> {
  const bundle: DataExportBundle = {
    exportadoEm: new Date().toISOString(),
    aplicacao: APLICACAO,
    conta: account,
    perfil: null,
    programas: [],
    demandas: [],
    preferencias: null,
    timeline: [],
    npsAvaliacoes: [],
    csatAvaliacoes: [],
    alertas: [],
    mensagensContato: [],
    indicacoes: null,
    observacoes: [CREDENCIAIS_NOTE],
  };

  const results = await Promise.allSettled(
    SOURCES.map((s) => s.fetch(client, userId).then((data) => ({ key: s.key, data }))),
  );
  results.forEach((result, i) => {
    const source = SOURCES[i];
    if (result.status === "fulfilled") {
      (bundle as Record<string, unknown>)[source.key] = result.value.data;
    } else {
      bundle.observacoes.push(`${source.label}: não foi possível ler estes dados agora.`);
    }
  });

  return bundle;
}

export function downloadJson(bundle: DataExportBundle): void {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const data = bundle.exportadoEm.slice(0, 10); // AAAA-MM-DD
  const a = document.createElement("a");
  a.href = url;
  a.download = `gest-miles-meus-dados-${data}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

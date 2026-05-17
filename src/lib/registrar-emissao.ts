import { supabase } from "@/lib/supabase";

export type EmissaoInput = {
  cliente_id: string;
  programa: string;
  origem: string;
  destino: string;
  classe: string;
  data_ida?: string | null;
  data_volta?: string | null;
  milhas_utilizadas: number;
  taxa_embarque: number;
  data_emissao: string;
  usuario_responsavel: string;
  observacoes?: string | null;
  /** Sobrenome como na bilheteira (obrigatório para cruzar com o localizador). */
  sobrenome_emissao: string;
};

function normalizeProgramKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Registra uma emissão na tabela emissoes e debita as milhas da conta do cliente
 * em programas_cliente (conta do programa correspondente).
 * Não modifica outros módulos.
 */
export async function registrarEmissao(input: EmissaoInput): Promise<void> {
  const milhas = Number(input.milhas_utilizadas) || 0;
  if (milhas <= 0) {
    throw new Error("Quantidade de milhas deve ser maior que zero.");
  }

  const sobrenomeEmissao = input.sobrenome_emissao?.trim() ?? "";
  if (!sobrenomeEmissao) {
    throw new Error("Informe o sobrenome na emissão (como na bilheteira).");
  }

  const { data: programRows, error: fetchError } = await supabase
    .from("programas_cliente")
    .select("id, program_id, program_name, saldo")
    .eq("cliente_id", input.cliente_id);

  if (fetchError) throw fetchError;

  const key = normalizeProgramKey(input.programa);
  const match = (programRows ?? []).find((row) => {
    const idNorm = normalizeProgramKey(String(row.program_id ?? ""));
    const nameNorm = normalizeProgramKey(String(row.program_name ?? ""));
    return idNorm === key || nameNorm === key;
  });

  if (!match) {
    throw new Error(
      "Cliente não possui conta neste programa. Cadastre o programa na carteira do cliente primeiro."
    );
  }

  const currentSaldo = Number(match.saldo ?? 0);
  if (currentSaldo < milhas) {
    throw new Error(
      `Saldo insuficiente no programa. Disponível: ${currentSaldo.toLocaleString("pt-BR")} milhas.`
    );
  }

  const { error: rpcError } = await supabase.rpc("cliente_registrar_emissao", {
    p_cliente_id: input.cliente_id,
    p_programa_cliente_id: match.id,
    p_programa: input.programa,
    p_origem: input.origem,
    p_destino: input.destino,
    p_classe: input.classe,
    p_data_ida: input.data_ida || null,
    p_data_volta: input.data_volta || null,
    p_milhas_utilizadas: milhas,
    p_taxa_embarque: Number(input.taxa_embarque) || 0,
    p_data_emissao: input.data_emissao,
    p_observacoes: input.observacoes ?? null,
    p_sobrenome_emissao: sobrenomeEmissao,
  });

  if (rpcError) throw rpcError;
}

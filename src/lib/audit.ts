import { supabase } from "@/lib/supabase";

type AuditPayload = {
  tipoAcao: string;
  entidadeAfetada: string;
  entidadeId?: string;
  details?: Record<string, unknown>;
};

export const logAcao = async ({
  tipoAcao,
  entidadeAfetada,
  entidadeId,
  details,
}: AuditPayload) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("logs_acoes").insert({
    user_id: user.id,
    tipo_acao: tipoAcao,
    entidade_afetada: entidadeAfetada,
    entidade_id: entidadeId ?? null,
    details: details ?? {},
  });
};

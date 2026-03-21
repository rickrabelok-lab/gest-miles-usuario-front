import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

function toQueryError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return new Error((err as { message: string }).message);
  }
  return new Error(fallback);
}

export type CsGestorItem = {
  gestorId: string;
  gestorNome: string;
  clientes: Array<{ clienteId: string; clienteNome: string }>;
};

export const useCsGestores = (enabled: boolean) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["cs_gestores_dashboard"],
    enabled,
    queryFn: async (): Promise<CsGestorItem[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return [];

      const { data: csRows, error: csError } = await supabase
        .from("cs_gestores")
        .select("gestor_id")
        .eq("cs_id", user.id);
      if (csError) throw toQueryError(csError, "Não foi possível ler cs_gestores (verifique RLS e se a migration foi aplicada).");
      const gestorIds = [...new Set((csRows ?? []).map((r) => r.gestor_id as string).filter(Boolean))];
      if (gestorIds.length === 0) return [];

      const { data: perfisGestores, error: perfisGErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", gestorIds);
      if (perfisGErr) throw toQueryError(perfisGErr, "Não foi possível ler perfis dos gestores.");

      const gestorNames = new Map<string, string>();
      (perfisGestores ?? []).forEach((row) => {
        const id = row.usuario_id as string;
        gestorNames.set(id, (row.nome_completo as string) ?? "Gestor");
      });

      const { data: clienteGestoresRows, error: cgErr } = await supabase
        .from("cliente_gestores")
        .select("gestor_id, cliente_id")
        .in("gestor_id", gestorIds);
      if (cgErr)
        throw toQueryError(
          cgErr,
          "Sem permissão para ler cliente_gestores da equipe. Rode a migration 20260321160000_cs_read_team_cliente_gestores no Supabase.",
        );

      const clienteIds = [...new Set((clienteGestoresRows ?? []).map((r) => r.cliente_id as string).filter(Boolean))];
      const clientesByGestor = new Map<string, string[]>();
      (clienteGestoresRows ?? []).forEach((row) => {
        const gid = row.gestor_id as string;
        const cid = row.cliente_id as string;
        if (!clientesByGestor.has(gid)) clientesByGestor.set(gid, []);
        clientesByGestor.get(gid)!.push(cid);
      });

      let clienteNames = new Map<string, string>();
      if (clienteIds.length > 0) {
        const { data: perfisClientes } = await supabase
          .from("perfis")
          .select("usuario_id, nome_completo")
          .in("usuario_id", clienteIds);
        (perfisClientes ?? []).forEach((row) => {
          clienteNames.set(row.usuario_id as string, (row.nome_completo as string) ?? "Cliente");
        });
      }

      return gestorIds.map((gestorId) => ({
        gestorId,
        gestorNome: gestorNames.get(gestorId) ?? "Gestor",
        clientes: (clientesByGestor.get(gestorId) ?? []).map((clienteId) => ({
          clienteId,
          clienteNome: clienteNames.get(clienteId) ?? "Cliente",
        })),
      }));
    },
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["cs_gestores_dashboard"] }),
  };
};

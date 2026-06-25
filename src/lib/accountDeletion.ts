import { apiFetch } from "@/services/api";

export type DeletionStatus = {
  status: "pendente" | "cancelada" | "concluida" | "sem_pendente";
  agendado_para?: string;
};

/** Solicita a exclusão da conta (POST /api/account/deletion-request). */
export async function solicitarExclusaoConta(token: string): Promise<DeletionStatus> {
  return apiFetch<DeletionStatus>("/api/account/deletion-request", {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
}

/** Cancela a solicitação pendente (POST /api/account/deletion-request/cancel). */
export async function cancelarExclusaoConta(token: string): Promise<DeletionStatus> {
  return apiFetch<DeletionStatus>("/api/account/deletion-request/cancel", {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
}

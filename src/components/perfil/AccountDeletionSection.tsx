import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountDeletion } from "@/hooks/useAccountDeletion";

const PRIVACY_EMAIL = "privacidade@gestmiles.com.br";

const formatData = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

const AccountDeletionSection = () => {
  const { role, signOut } = useAuth();
  const { pending, loading, solicitar, cancelar } = useAccountDeletion();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  // Banner de carência (só quem solicitou — sempre 'cliente' — tem pendência).
  if (pending) {
    return (
      <section className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <p className="font-medium text-destructive">Exclusão de conta agendada</p>
        <p className="text-destructive/90">
          Sua conta será excluída em {formatData(pending.agendado_para)}. Você pode cancelar até lá.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={async () => {
            try {
              await cancelar();
              toast.success("Exclusão cancelada.");
            } catch {
              toast.error("Não foi possível cancelar agora. Tente novamente.");
            }
          }}
        >
          Cancelar exclusão
        </Button>
      </section>
    );
  }

  // Só cadastro próprio exclui por aqui.
  if (role !== "cliente") {
    return (
      <section className="space-y-1 rounded-xl border border-border bg-card p-3 text-sm">
        <p className="font-medium">Excluir minha conta</p>
        <p className="text-muted-foreground">
          Para excluir sua conta, fale com seu gestor ou escreva para{" "}
          <a className="underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        </p>
      </section>
    );
  }

  const handleConfirm = async () => {
    if (typed.trim().toUpperCase() !== "EXCLUIR") {
      toast.error('Digite "EXCLUIR" para confirmar.');
      return;
    }
    try {
      const res = await solicitar();
      const dataFmt = res.agendado_para ? formatData(res.agendado_para) : "";
      toast.success(`Solicitação registrada. Sua conta será excluída em ${dataFmt}.`);
      await signOut();
      navigate("/auth");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível solicitar a exclusão.");
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-medium text-destructive">Excluir minha conta</p>
      <p className="text-muted-foreground">
        Isso solicita a exclusão definitiva da sua conta e dos seus dados, após uma carência de 7
        dias. Você poderá cancelar nesse período.
      </p>
      {!confirming ? (
        <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
          Excluir minha conta
        </Button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs text-muted-foreground" htmlFor="confirm-delete-account">
            Digite <strong>EXCLUIR</strong> para confirmar:
          </label>
          <input
            id="confirm-delete-account"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          />
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={loading} onClick={handleConfirm}>
              Confirmar exclusão
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default AccountDeletionSection;

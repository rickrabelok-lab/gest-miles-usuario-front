/** Mostrada quando o gate B2C bloqueia um cliente com plano inativo. */
export default function PlanoInativoScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-lg font-semibold text-foreground">Acesso temporariamente indisponível</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu acesso ao Gest Miles está inativo no momento. Fale com a sua agência para reativar o seu plano.
        </p>
      </div>
    </div>
  );
}

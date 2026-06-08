/** Tela de upsell mostrada quando um cliente free tenta um recurso do plano pago. */
export default function PlanoInativoScreen() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-lg font-semibold text-foreground">Recurso do plano completo</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Este recurso está disponível no plano completo. Fale com a sua agência para liberar o acesso.
        </p>
      </div>
    </div>
  );
}

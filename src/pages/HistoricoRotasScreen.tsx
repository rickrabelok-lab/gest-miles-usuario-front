import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePromoHistoricoRotas } from '@/hooks/usePromoHistoricoRotas'
import { formatUltima, type HistoricoRotaLista } from '@/lib/promo-alerts/historico'

function statsLinha(r: HistoricoRotaLista): string {
  const parts = [`${r.vezes}×`]
  if (r.bonusMedio != null) parts.push(`média ${r.bonusMedio}%`)
  if (r.bonusMax != null) parts.push(`máx ${r.bonusMax}%`)
  return parts.join(' · ')
}

export default function HistoricoRotasScreen() {
  const navigate = useNavigate()
  const { data, isPending, error } = usePromoHistoricoRotas()
  const rotas = data ?? []

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg">
      <div className="flex items-center gap-2.5 px-5 pb-1 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
        >
          <ArrowLeft size={19} strokeWidth={2} />
        </button>
        <h1 className="font-display text-xl font-bold tracking-tight text-nubank-text">
          Histórico de rotas
        </h1>
      </div>

      <div className="px-5 pt-3 pb-24">
        {isPending && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">Carregando…</p>
        )}
        {!isPending && error && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">
            Não foi possível carregar o histórico agora.
          </p>
        )}
        {!isPending && !error && rotas.length === 0 && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">
            Ainda estamos acumulando o histórico das rotas — volte em breve.
          </p>
        )}
        <div className="space-y-3">
          {rotas.map((r) => (
            <div key={`${r.sourceId}>${r.targetId}`} className="rounded-[20px] bg-white p-4 shadow-nubank">
              <p className="font-display text-[15px] font-bold text-nubank-text">
                {r.sourceNome} → {r.targetNome}
              </p>
              <p className="mt-1 text-[13px] text-nubank-text-secondary">{statsLinha(r)}</p>
              <p className="mt-1 text-[11.5px] text-nubank-text-secondary">última {formatUltima(r.ultima)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// src/components/bonus/RotaHistoricoBlock.tsx — histórico da rota no detalhe da transferência.
import { usePromoHistoricoRota } from '@/hooks/usePromoHistoricoRota'
import { resumoHistorico } from '@/lib/promo-alerts/historico'

interface Props {
  source: string
  target: string
  bonusAtual: number | null
}

export function RotaHistoricoBlock({ source, target, bonusAtual }: Props) {
  const { data, isPending } = usePromoHistoricoRota(source, target, true)
  if (isPending) return null
  const resumo = resumoHistorico(data ?? null, bonusAtual)
  return (
    <div className="rounded-[20px] bg-white p-4 shadow-nubank">
      <p className="section-label mb-1.5">Histórico da rota</p>
      <p className="text-[13px] leading-snug text-nubank-text">{resumo.texto}</p>
      {resumo.sinal === 'acima' && (
        <span className="mt-2.5 inline-block rounded-full bg-nubank-tint px-2.5 py-1 text-[11px] font-bold text-nubank-dark">
          🔥 Acima da média — bom momento
        </span>
      )}
    </div>
  )
}

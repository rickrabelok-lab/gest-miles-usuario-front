// src/components/bonus/PraVoceSection.tsx — transferências que casam com a carteira do cliente.
import { Fragment, RefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { usePersonalizedPromos } from '@/hooks/usePersonalizedPromos'
import { PromoRow } from '@/components/bonus/PromoRow'

interface Props {
  sectionRef?: RefObject<HTMLDivElement>
}

export function PraVoceSection({ sectionRef }: Props) {
  const { items, loading } = usePersonalizedPromos()

  if (loading || items.length === 0) return null

  return (
    <div ref={sectionRef} className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="section-label mb-0 flex items-center gap-1.5">
          <Sparkles size={14} strokeWidth={2.4} className="text-primary" />
          Pra você
        </h3>
        <span className="text-[11px] font-medium text-nubank-text-secondary">
          {items.length} {items.length === 1 ? 'oportunidade' : 'oportunidades'}
        </span>
      </div>

      <div className="rounded-[20px] bg-white py-1 shadow-nubank">
        {items.map((item, index) => (
          <Fragment key={item.promo.id}>
            {index > 0 && <div className="mx-3.5 h-px bg-[#F1F0F3]" />}
            <div>
              <div className="px-3.5 pt-3 text-[12px] font-semibold leading-snug text-primary">
                {item.resultado != null
                  ? `Seus ${item.saldo.toLocaleString('pt-BR')} ${item.promo.sourceProgram} → ${item.resultado.toLocaleString('pt-BR')} na ${item.promo.targetProgram}`
                  : `Você tem ${item.promo.sourceProgram} — dá pra aproveitar`}
              </div>
              <PromoRow promo={item.promo} />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

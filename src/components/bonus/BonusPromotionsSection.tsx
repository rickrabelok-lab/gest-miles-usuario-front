// src/components/bonus/BonusPromotionsSection.tsx
import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { BONUS_PROMOTIONS_SOURCE_NOTICE } from '@/lib/bonusTypes'
import { CATEGORY_CONFIG, bonusBadge, formatExpiryShort, isExpiringToday } from '@/lib/bonusUtils'
import { BonusProgramLogo } from '@/components/bonus/BonusProgramLogo'
import { PromoRow } from '@/components/bonus/PromoRow'

export default function BonusPromotionsSection() {
  const navigate = useNavigate()
  const { promotions, highlight, activeCount, expiringToday, loading } = useBonusPromotions()
  if (loading || promotions.length === 0) return null

  const quickList = promotions.filter(p => !p.isHighlight).slice(0, 3)
  const highlightBadge = highlight ? bonusBadge(highlight.bonusValue, highlight.milheiroCost) : null
  const highlightExpiry = highlight ? formatExpiryShort(highlight.expiresAt) : null

  return (
    <section className="px-5 pb-6">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="section-label mb-0">Promoções bonificadas</h2>
          <p className="mt-1 text-xs text-nubank-text-secondary">
            {activeCount} {activeCount === 1 ? 'ativa' : 'ativas'}
            {expiringToday > 0
              ? ` · ${expiringToday} ${expiringToday === 1 ? 'encerra' : 'encerram'} hoje`
              : ''}
          </p>
        </div>
        <button
          onClick={() => navigate('/bonus-offers')}
          className="rounded-full bg-nubank-tint px-3 py-1.5 text-xs font-semibold text-nubank-dark"
        >
          Ver tudo →
        </button>
      </div>

      {/* Destaque do dia — o cartão-assinatura da seção: marca em primeiro plano */}
      {highlight && (
        <button
          onClick={() => navigate(`/bonus-offers/${highlight.id}`)}
          className="relative mb-3 w-full overflow-hidden rounded-[24px] p-5 text-left shadow-[0_12px_28px_-10px_rgba(106,0,163,0.55)] transition-transform active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #8A05BE 0%, #6A00A3 55%, #500A82 100%)' }}
        >
          {/* brilho sutil no canto — profundidade sem ruído */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full"
            style={{ background: 'radial-gradient(closest-side, rgba(181,108,255,0.45), transparent)' }}
          />
          <span className="relative flex items-center gap-3">
            <span className="flex-none rounded-full bg-white p-0.5">
              <BonusProgramLogo program={highlight.targetProgram} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">
                Destaque do dia
              </span>
              <span className="mt-0.5 block text-[12px] font-medium text-white/70">
                {CATEGORY_CONFIG[highlight.category].label}
              </span>
            </span>
            {highlightExpiry && (
              <span
                className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] font-bold ${
                  isExpiringToday(highlight.expiresAt)
                    ? 'bg-white text-destructive-strong'
                    : 'bg-white/15 text-white backdrop-blur-sm'
                }`}
              >
                {highlightExpiry}
              </span>
            )}
          </span>

          <span className="relative mt-3.5 block font-display text-[22px] font-bold leading-snug tracking-tight text-white">
            {highlight.title}
          </span>

          {highlightBadge && (
            <span className="relative mt-2 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-[38px] font-bold leading-none tracking-tight tabular-nums text-white">
                {highlightBadge.value}
              </span>
              {highlightBadge.label && (
                <span className="text-sm font-medium text-white/75">{highlightBadge.label}</span>
              )}
            </span>
          )}

          {highlight.participatingBanks && (
            <span className="relative mt-3 flex flex-wrap gap-1.5">
              {highlight.participatingBanks.slice(0, 4).map(bank => (
                <span
                  key={bank}
                  className="rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-sm"
                >
                  {bank}
                </span>
              ))}
            </span>
          )}

          <span className="relative mt-4 flex h-12 w-full items-center justify-center rounded-[16px] bg-white text-sm font-bold text-nubank-dark shadow-[0_4px_14px_-4px_rgba(24,6,38,0.35)]">
            Ver oferta completa
          </span>
        </button>
      )}

      {/* Quick list */}
      {quickList.length > 0 && (
        <div className="rounded-[20px] bg-white py-1 shadow-nubank">
          {quickList.map((promo, index) => (
            <Fragment key={promo.id}>
              {index > 0 && <div className="mx-3.5 h-px bg-[#F1F0F3]" />}
              <PromoRow promo={promo} />
            </Fragment>
          ))}
        </div>
      )}

      <p className="mt-3 px-2 text-center text-[11px] leading-snug text-[#A9A8AE]">
        {BONUS_PROMOTIONS_SOURCE_NOTICE}
      </p>
    </section>
  )
}

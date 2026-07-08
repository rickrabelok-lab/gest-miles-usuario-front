// src/components/bonus/BonusPromotionsSection.tsx
import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { BONUS_PROMOTIONS_SOURCE_NOTICE, BonusPromotion } from '@/lib/bonusMockData'
import { CATEGORY_CONFIG, isExpiringToday } from '@/lib/bonusUtils'
import { BonusProgramLogo } from '@/components/bonus/BonusProgramLogo'

function QuickItem({ promo }: { promo: BonusPromotion }) {
  const navigate = useNavigate()
  const cat = CATEGORY_CONFIG[promo.category]
  const subtitle = promo.partnerStores
    ? `${promo.partnerStores}+ lojas parceiras`
    : promo.participatingBanks?.slice(0, 2).join(', ')

  return (
    <button
      onClick={() => navigate(`/bonus-offers/${promo.id}`)}
      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
    >
      <BonusProgramLogo program={promo.targetProgram} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-nubank-text">
          {promo.targetProgram}
        </span>
        <span className="block truncate text-xs text-nubank-text-secondary">
          {cat.label}
          {subtitle ? ` · ${subtitle}` : ''}
        </span>
      </span>
      <span className="text-right">
        <span className="block font-display text-xl font-bold tabular-nums text-primary">
          {promo.bonusValue}
        </span>
        <span className="block text-[10.5px] font-medium text-nubank-text-secondary">
          {promo.bonusLabel}
        </span>
      </span>
    </button>
  )
}

export default function BonusPromotionsSection() {
  const navigate = useNavigate()
  const { promotions, highlight, activeCount, expiringToday } = useBonusPromotions()

  const quickList = promotions.filter(p => !p.isHighlight).slice(0, 3)

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

      {/* Destaque do dia */}
      {highlight && (
        <button
          onClick={() => navigate(`/bonus-offers/${highlight.id}`)}
          className="mb-3 w-full rounded-[24px] bg-white p-5 text-left shadow-nubank transition-transform active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <BonusProgramLogo program={highlight.targetProgram} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.09em] text-nubank-text-secondary">
                Destaque do dia
              </span>
              <span className="mt-0.5 block text-[15px] font-semibold text-nubank-text">
                {highlight.targetProgram} — {CATEGORY_CONFIG[highlight.category].label.toLowerCase()}
              </span>
            </span>
            {isExpiringToday(highlight.expiresAt) && (
              <span className="flex-none rounded-full bg-destructive-soft px-2.5 py-1 text-[10.5px] font-bold text-destructive-strong">
                ATÉ 23:59
              </span>
            )}
          </span>
          <span className="mt-3.5 flex flex-wrap items-baseline gap-2">
            <span className="font-display text-[44px] font-bold leading-none tracking-tight tabular-nums text-primary">
              {highlight.bonusValue}
            </span>
            <span className="text-sm font-medium text-nubank-text-secondary">
              {highlight.bonusLabel}
            </span>
          </span>
          {highlight.participatingBanks && (
            <span className="mt-3 flex flex-wrap gap-1.5">
              {highlight.participatingBanks.slice(0, 4).map(bank => (
                <span
                  key={bank}
                  className="rounded-full bg-[#F1F0F3] px-2.5 py-1 text-[11.5px] font-semibold text-[#54535A]"
                >
                  {bank}
                </span>
              ))}
            </span>
          )}
          <span className="gradient-primary mt-4 flex h-12 w-full items-center justify-center rounded-[16px] text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(138,5,190,0.45)]">
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
              <QuickItem promo={promo} />
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

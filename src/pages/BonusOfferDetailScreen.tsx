// src/pages/BonusOfferDetailScreen.tsx
import { Fragment, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import {
  BONUS_PROMOTIONS,
  BONUS_PROMOTIONS_SOURCE_NOTICE,
  BonusCategory,
  BonusPromotion,
} from '@/lib/bonusMockData'
import { isExpiringToday } from '@/lib/bonusUtils'
import { BonusProgramLogo } from '@/components/bonus/BonusProgramLogo'

type ActiveTab = 'promotion' | 'rules'

const CATEGORY_SUBTITLE: Record<BonusCategory, string> = {
  transfer: 'transferência de pontos',
  shopping: 'compras bonificadas',
  miles: 'compra de milhas',
  cards: 'oferta de cartão',
}

function ExpiryPill({ promo }: { promo: BonusPromotion }) {
  if (!promo.expiresAt) return null
  const expiry = new Date(promo.expiresAt)

  if (isExpiringToday(promo.expiresAt)) {
    const time = expiry.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return (
      <span className="flex-none rounded-full bg-destructive-soft px-2.5 py-1 text-[10.5px] font-bold text-destructive-strong">
        ATÉ {time}
      </span>
    )
  }

  return (
    <span className="flex-none rounded-full bg-[#F1F0F3] px-2.5 py-1 text-[10.5px] font-bold text-[#54535A]">
      até {expiry.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
    </span>
  )
}

export default function BonusOfferDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ActiveTab>('promotion')

  const promo = BONUS_PROMOTIONS.find(p => p.id === id)

  if (!promo) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 bg-nubank-bg px-6 text-center">
        <p className="text-nubank-text-secondary">Promoção não encontrada.</p>
        <button
          onClick={() => navigate('/bonus-offers')}
          className="rounded-full bg-nubank-tint px-4 py-2 text-sm font-semibold text-nubank-dark"
        >
          Ver promoções
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pb-1 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
        >
          <ArrowLeft size={19} strokeWidth={2} />
        </button>
        <BonusProgramLogo program={promo.targetProgram} size={36} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[17px] font-bold tracking-tight text-nubank-text">
            {promo.targetProgram}
          </h1>
          <p className="truncate text-xs text-nubank-text-secondary">
            {CATEGORY_SUBTITLE[promo.category]}
          </p>
        </div>
        <ExpiryPill promo={promo} />
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3">
        <div className="flex rounded-[16px] bg-[#EDECEF] p-1">
          {(['promotion', 'rules'] as ActiveTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-[13px] py-2.5 text-[13.5px] transition-all ${
                activeTab === tab
                  ? 'bg-white font-semibold text-nubank-text shadow-[0_1px_4px_rgba(24,6,38,0.08)]'
                  : 'font-medium text-nubank-text-secondary'
              }`}
            >
              {tab === 'promotion' ? 'Promoção' : 'Regras'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 pb-24 pt-4">
        {activeTab === 'promotion' ? (
          <>
            {/* Hero */}
            <div className="rounded-[24px] bg-white px-5 py-6 text-center shadow-nubank">
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-display text-[56px] font-bold leading-none tracking-tight tabular-nums text-primary">
                  {promo.bonusValue}
                </span>
                <span className="text-base font-medium text-nubank-text-secondary">
                  {promo.bonusLabel}
                </span>
              </div>
              <p className="mt-2 text-[13.5px] text-nubank-text-secondary">
                {promo.category === 'transfer'
                  ? `Transfira seus pontos para o ${promo.targetProgram}`
                  : promo.targetProgram}
              </p>
              {promo.participatingBanks && promo.participatingBanks.length > 0 && (
                <div className="mt-3.5 flex flex-wrap justify-center gap-1.5">
                  {promo.participatingBanks.map(bank => (
                    <span
                      key={bank}
                      className="rounded-full bg-[#F1F0F3] px-2.5 py-1 text-[11.5px] font-semibold text-[#54535A]"
                    >
                      {bank}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bônus por perfil */}
            {promo.tiers && promo.tiers.length > 0 && (
              <div>
                <p className="section-label mb-2.5">Bônus por perfil</p>
                <div className="rounded-[20px] bg-white p-1 shadow-nubank">
                  {promo.tiers.map((tier, index) =>
                    tier.isBest ? (
                      <div
                        key={index}
                        className="flex items-center gap-2.5 rounded-[16px] border border-[#E5CCF2] bg-nubank-tint px-3.5 py-3"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-semibold text-nubank-text">
                            {tier.label}
                          </span>
                          <span className="block text-[11px] font-semibold text-nubank-dark">
                            maior bônus
                          </span>
                        </span>
                        <span className="font-display text-lg font-bold tabular-nums text-primary">
                          {tier.value}
                        </span>
                      </div>
                    ) : (
                      <Fragment key={index}>
                        {index > 0 && !promo.tiers[index - 1].isBest && (
                          <div className="mx-3.5 h-px bg-[#F1F0F3]" />
                        )}
                        <div className="flex items-center gap-2.5 px-3.5 py-3">
                          <span className="min-w-0 flex-1 text-[13.5px] font-medium text-nubank-text">
                            {tier.label}
                          </span>
                          <span className="font-display text-base font-bold tabular-nums text-primary">
                            {tier.value}
                          </span>
                        </div>
                      </Fragment>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Bônus máximo */}
            {promo.maxBonus && (
              <div className="flex items-center gap-2.5 rounded-[16px] bg-warning-soft px-3.5 py-3">
                <AlertTriangle size={16} strokeWidth={1.9} className="flex-none text-warning-strong" />
                <p className="text-[12.5px] font-medium leading-snug text-warning-strong">
                  Bônus máximo da promoção:{' '}
                  <strong>{promo.maxBonus.toLocaleString('pt-BR')} pts</strong>.
                </p>
              </div>
            )}

            {/* CTA */}
            {promo.ctaUrl && (
              <div className="flex gap-2.5">
                <a
                  href={promo.ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gradient-primary flex h-[52px] flex-1 items-center justify-center rounded-[18px] text-[15px] font-bold text-white shadow-[0_6px_18px_-4px_rgba(138,5,190,0.5)]"
                >
                  Quero aproveitar
                </a>
                <button
                  type="button"
                  onClick={() => setActiveTab('rules')}
                  className="flex h-[52px] items-center justify-center rounded-[18px] border border-nubank-border bg-white px-[18px] text-sm font-semibold text-nubank-text"
                >
                  Ver regras
                </button>
              </div>
            )}

            <p className="px-2 text-center text-[11px] leading-snug text-[#A9A8AE]">
              {BONUS_PROMOTIONS_SOURCE_NOTICE}
            </p>
          </>
        ) : (
          <div className="rounded-[20px] bg-white p-4 shadow-nubank">
            <p className="text-[13px] leading-relaxed text-nubank-text">
              {promo.rules ??
                'Consulte o site do programa para mais informações sobre as regras desta promoção.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

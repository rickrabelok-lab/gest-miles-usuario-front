// src/pages/BonusOfferDetailScreen.tsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BONUS_PROMOTIONS, BonusCategory } from '@/lib/bonusMockData'

const DETAIL_GRADIENT: Record<BonusCategory, string> = {
  transfer: 'linear-gradient(135deg, #8A05BE, #B56CFF)',
  shopping: 'linear-gradient(135deg, #e67e22, #f39c12)',
  miles: 'linear-gradient(135deg, #27ae60, #2ecc71)',
  cards: 'linear-gradient(135deg, #2c3e50, #3498db)',
}

const DETAIL_COLOR: Record<BonusCategory, string> = {
  transfer: '#8A05BE',
  shopping: '#e67e22',
  miles: '#27ae60',
  cards: '#3498db',
}

type ActiveTab = 'promotion' | 'rules'

export default function BonusOfferDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ActiveTab>('promotion')

  const promo = BONUS_PROMOTIONS.find(p => p.id === id)

  if (!promo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f7f7f8] px-6 text-center">
        <p className="text-nubank-text-secondary">Promoção não encontrada.</p>
        <button
          onClick={() => navigate('/bonus-offers')}
          className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
        >
          Ver promoções
        </button>
      </div>
    )
  }

  const gradient = DETAIL_GRADIENT[promo.category]
  const color = DETAIL_COLOR[promo.category]

  function formatExpiry(): string | null {
    if (!promo!.expiresAt) return null
    const expiry = new Date(promo!.expiresAt)
    const date = expiry.toLocaleDateString('pt-BR')
    const time = expiry.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return `⏰ Encerra em ${date} às ${time}`
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: 'linear-gradient(135deg, #8A05BE 0%, #9E2FD4 100%)' }}
      >
        <button onClick={() => navigate(-1)} className="text-xl font-light leading-none text-white">
          ←
        </button>
        <h1 className="text-base font-bold text-white">{promo.targetProgram}</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#f0e8ff] bg-white">
        {(['promotion', 'rules'] as ActiveTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-[12px] font-bold transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-primary text-primary'
                : 'text-nubank-text-secondary'
            }`}
          >
            {tab === 'promotion' ? 'Promoção' : 'Regras'}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 pb-24">
        {activeTab === 'promotion' ? (
          <>
            {/* Hero badge */}
            <div
              className="relative mb-4 overflow-hidden rounded-2xl p-5 text-center text-white"
              style={{ background: gradient }}
            >
              <div className="pointer-events-none absolute right-[-30px] top-[-30px] h-28 w-28 rounded-full bg-white/5" />
              <p className="text-6xl font-black leading-none">{promo.bonusValue}</p>
              <p className="mt-2 text-sm opacity-90">{promo.bonusLabel}</p>
              <p className="mt-1 text-xs opacity-75">
                {promo.category === 'transfer'
                  ? `Transfira seus pontos para ${promo.targetProgram}`
                  : promo.targetProgram}
              </p>
            </div>

            {/* Tiers */}
            {promo.tiers && promo.tiers.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-nubank-text-secondary">
                  Bônus por perfil
                </p>
                <div className="flex flex-col gap-2">
                  {promo.tiers.map((tier, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                        tier.isBest
                          ? 'border border-[#8A05BE]/30 bg-[#f0e8ff]'
                          : 'border border-[#f0e8ff] bg-white'
                      }`}
                    >
                      <span className="text-[11px] text-nubank-text">{tier.label}</span>
                      <span className="text-base font-black" style={{ color }}>
                        {tier.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Max bonus */}
            {promo.maxBonus && (
              <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2.5 text-center">
                <p className="text-[10px] font-semibold text-yellow-700">
                  ⚠️ Bônus máximo da promoção: {promo.maxBonus.toLocaleString('pt-BR')} pts
                </p>
              </div>
            )}

            {/* Participating banks */}
            {promo.participatingBanks && promo.participatingBanks.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-nubank-text-secondary">
                  Bancos participantes
                </p>
                <div className="flex flex-wrap gap-2">
                  {promo.participatingBanks.map(bank => (
                    <span
                      key={bank}
                      className="rounded-full bg-[#f0e8ff] px-3 py-1 text-[10px] font-semibold text-[#8A05BE]"
                    >
                      {bank}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Expiry */}
            {formatExpiry() && (
              <p className="mb-4 text-center text-[10px] font-semibold text-red-500">
                {formatExpiry()}
              </p>
            )}

            {/* CTA */}
            {promo.ctaUrl && (
              <a
                href={promo.ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-2xl py-4 text-center text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(138,5,190,0.3)]"
                style={{ background: 'linear-gradient(135deg, #8A05BE, #B56CFF)' }}
              >
                Cadastrar-se na promoção →
              </a>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-[#f0e8ff] bg-white p-4">
            <p className="text-[12px] leading-relaxed text-nubank-text">
              {promo.rules ??
                'Consulte o site do programa para mais informações sobre as regras desta promoção.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

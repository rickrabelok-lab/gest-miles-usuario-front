// src/components/bonus/BonusOfferSection.tsx
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { BonusCategory, BonusPromotion } from '@/lib/bonusMockData'

const CATEGORY_CONFIG: Record<BonusCategory, { emoji: string; color: string; label: string }> = {
  transfer: { emoji: '🔄', color: '#8A05BE', label: 'Transferência' },
  shopping: { emoji: '🛍', color: '#e67e22', label: 'Compras' },
  miles: { emoji: '✈️', color: '#27ae60', label: 'Milhas' },
  cards: { emoji: '💳', color: '#3498db', label: 'Cartão' },
}

function isExpiringToday(expiresAt?: string): boolean {
  if (!expiresAt) return false
  const expiry = new Date(expiresAt)
  const today = new Date()
  return (
    expiry.getFullYear() === today.getFullYear() &&
    expiry.getMonth() === today.getMonth() &&
    expiry.getDate() === today.getDate()
  )
}

function QuickItem({ promo }: { promo: BonusPromotion }) {
  const navigate = useNavigate()
  const cat = CATEGORY_CONFIG[promo.category]
  return (
    <button
      onClick={() => navigate(`/bonus-offers/${promo.id}`)}
      className="flex w-full items-center justify-between rounded-xl border border-[#f0e8ff] bg-white px-3 py-2.5 text-left shadow-nubank active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#f8f5ff] text-base">
          {cat.emoji}
        </span>
        <div>
          <p className="text-[11px] font-bold text-nubank-text">
            {promo.targetProgram} — {cat.label}
          </p>
          {promo.partnerStores && (
            <p className="text-[9px] text-nubank-text-secondary">
              {promo.partnerStores}+ lojas parceiras
            </p>
          )}
          {promo.participatingBanks && !promo.partnerStores && (
            <p className="text-[9px] text-nubank-text-secondary">
              {promo.participatingBanks.slice(0, 2).join(', ')}
            </p>
          )}
        </div>
      </div>
      <span className="ml-3 text-base font-black" style={{ color: cat.color }}>
        {promo.bonusValue}
      </span>
    </button>
  )
}

export default function BonusOfferSection() {
  const navigate = useNavigate()
  const { promotions, highlight, activeCount, expiringToday } = useBonusPromotions()

  const quickList = promotions.filter(p => !p.isHighlight).slice(0, 3)

  return (
    <section className="px-5 pb-6">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-nubank-text">
            Promoções Bonificadas
          </h2>
          <p className="mt-0.5 text-xs text-nubank-text-secondary">
            {activeCount} ativas
            {expiringToday > 0 ? ` · ${expiringToday} encerram hoje` : ''}
          </p>
        </div>
        <button
          onClick={() => navigate('/bonus-offers')}
          className="rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
        >
          Ver tudo →
        </button>
      </div>

      {/* Hero banner */}
      {highlight && (
        <button
          onClick={() => navigate(`/bonus-offers/${highlight.id}`)}
          className="mb-3 w-full overflow-hidden rounded-2xl text-left shadow-[0_4px_20px_rgba(138,5,190,0.25)] active:scale-[0.99] transition-transform"
          style={{ background: 'linear-gradient(135deg, #8A05BE 0%, #B56CFF 100%)' }}
        >
          <div className="relative p-4">
            <div className="pointer-events-none absolute right-[-20px] top-[-20px] h-24 w-24 rounded-full bg-white/5" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">
              🔥 Destaque do dia
            </p>
            <p className="mt-0.5 text-sm font-bold text-white">
              {highlight.targetProgram} — {CATEGORY_CONFIG[highlight.category].label}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-4xl font-black leading-none text-white">
                {highlight.bonusValue}
              </span>
              <span className="text-sm text-white/90">{highlight.bonusLabel}</span>
            </div>
            {highlight.participatingBanks && (
              <p className="mt-1 text-[10px] text-white/70">
                {highlight.participatingBanks.slice(0, 4).join(' · ')}
              </p>
            )}
            {isExpiringToday(highlight.expiresAt) && (
              <span className="mt-2 inline-block rounded-lg bg-white/20 px-2 py-0.5 text-[10px] text-white">
                ⏰ Encerra hoje às 23:59
              </span>
            )}
          </div>
        </button>
      )}

      {/* Quick list */}
      <div className="flex flex-col gap-2">
        {quickList.map(promo => (
          <QuickItem key={promo.id} promo={promo} />
        ))}
      </div>
    </section>
  )
}

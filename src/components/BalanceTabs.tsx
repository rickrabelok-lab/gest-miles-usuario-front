import { Sparkles, TrendingUp, History, Lightbulb } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";

interface BalanceTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  canShowInsights?: boolean;
  canShowTimeline?: boolean;
}

// "Vencendo" e "R$" (economia) saíram da barra: os atalhos do dashboard
// (Vencimentos / Economia) já abrem as mesmas seções via setActiveTab.
const tabs = [
  { id: "saldo", label: "Inicio", icon: null },
  { id: "extrato", label: "Extrato", icon: TrendingUp },
  { id: "sugestoes", label: "Sugestões", icon: Sparkles },
  { id: "insights", label: "Insights", icon: Lightbulb },
  { id: "timeline", label: "Timeline", icon: History },
];

const BalanceTabs = ({
  activeTab,
  onTabChange,
  canShowInsights,
  canShowTimeline,
}: BalanceTabsProps) => {
  const { role, roleLoading } = useAuth();

  // Regras: segurança real vem das queries do backend/RLS. Aqui é apenas UX/permissão de navegação.
  const roleCanShowInsights = role === "gestor" || role === "cs" || role === "admin";
  const roleCanShowTimeline =
    role === "gestor" || role === "cs" || role === "admin" || role === "cliente_gestao";

  const resolvedCanShowInsights = canShowInsights ?? (!roleLoading && roleCanShowInsights);
  const resolvedCanShowTimeline = canShowTimeline ?? (!roleLoading && roleCanShowTimeline);

  const visibleTabs = tabs.filter((tab) => {
    if (tab.id === "insights") return resolvedCanShowInsights;
    if (tab.id === "timeline") return resolvedCanShowTimeline;
    return true;
  });

  return (
    <div className="flex overflow-x-auto border-b border-[#F1F0F3] px-5 scrollbar-hide">
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`-mb-px flex shrink-0 items-center justify-center gap-1 border-b-2 px-3 py-3 text-[12px] transition-colors ${
              isActive
                ? "border-[#8A05BE] font-bold text-[#8A05BE]"
                : "border-transparent font-medium text-[#8E8D93] hover:text-nubank-text"
            }`}
          >
            {Icon ? (
              <>
                <Icon size={14} strokeWidth={2} />
                <span>{tab.label}</span>
              </>
            ) : (
              <span>{tab.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default BalanceTabs;

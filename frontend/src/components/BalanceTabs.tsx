import { ArrowDownRight, ArrowUpRight, Clock, TrendingUp } from "lucide-react";

interface BalanceTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  economyTrend?: "up" | "down" | "none";
  economyLabel?: string;
}

const tabs = [
  { id: "saldo", label: "Inicio", icon: null },
  { id: "vencendo", label: "Vencendo", icon: Clock },
  { id: "extrato", label: "Extrato", icon: TrendingUp },
  { id: "economia", label: "R$", icon: null },
];

const BalanceTabs = ({
  activeTab,
  onTabChange,
  economyTrend = "none",
  economyLabel = "R$",
}: BalanceTabsProps) => {
  return (
    <div className="grid grid-cols-4 gap-2 px-5 py-4">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        const isEconomyTab = tab.id === "economia";
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center justify-center gap-1 rounded-full px-2 py-2 text-xs font-semibold transition-all ${
              isActive
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-card text-muted-foreground card-miles"
            }`}
          >
            {Icon ? (
              <>
                <Icon size={14} />
                {tab.label}
              </>
            ) : isEconomyTab ? (
              <span className={economyLabel === "R$" ? "text-xs font-bold" : "text-[10px] font-semibold"}>
                {economyLabel}
              </span>
            ) : (
              tab.label
            )}
            {isEconomyTab && economyTrend === "up" && (
              <ArrowUpRight size={13} className="text-emerald-600" />
            )}
            {isEconomyTab && economyTrend === "down" && (
              <ArrowDownRight size={13} className="text-red-600" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default BalanceTabs;

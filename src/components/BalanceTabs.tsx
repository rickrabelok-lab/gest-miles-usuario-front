import { ArrowDownRight, ArrowUpRight, BarChart3, Clock, TrendingUp } from "lucide-react";

interface BalanceTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  economyTrend?: "up" | "down" | "none";
}

const tabs = [
  { id: "saldo", label: "Saldo", icon: BarChart3 },
  { id: "vencendo", label: "Vencendo", icon: Clock },
  { id: "extrato", label: "Extrato", icon: TrendingUp },
  { id: "economia", label: "R$", icon: null },
];

const BalanceTabs = ({ activeTab, onTabChange, economyTrend = "none" }: BalanceTabsProps) => {
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
            ) : (
              <span className="text-xs font-bold">R$</span>
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

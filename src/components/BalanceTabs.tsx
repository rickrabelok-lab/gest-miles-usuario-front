import { BarChart3, Clock, TrendingUp } from "lucide-react";

interface BalanceTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "saldo", label: "Saldo", icon: BarChart3 },
  { id: "vencendo", label: "Vencendo", icon: Clock },
  { id: "extrato", label: "Extrato", icon: TrendingUp },
];

const BalanceTabs = ({ activeTab, onTabChange }: BalanceTabsProps) => {
  return (
    <div className="flex gap-2 px-5 py-4">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
              isActive
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-card text-muted-foreground card-miles"
            }`}
          >
            <Icon size={16} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default BalanceTabs;

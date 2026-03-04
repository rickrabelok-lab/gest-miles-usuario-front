import { useState } from "react";
import { ChevronDown } from "lucide-react";
import DashboardHeader from "@/components/DashboardHeader";
import BalanceTabs from "@/components/BalanceTabs";
import ProgramCard from "@/components/ProgramCard";
import QuickSearch from "@/components/QuickSearch";
import ExploreDestinations from "@/components/ExploreDestinations";
import BottomNav from "@/components/BottomNav";

const programs = [
  {
    name: "LATAM Pass",
    logo: "LP",
    logoColor: "#1a3a6b",
    balance: "523.747",
    valueInBRL: "7.893",
    lastUpdate: "03/03",
    variation: "up" as const,
  },
  {
    name: "Livelo",
    logo: "Lv",
    logoColor: "#e91e63",
    balance: "51.255",
    valueInBRL: "1.750",
    lastUpdate: "03/03",
    variation: "up" as const,
  },
  {
    name: "Esfera",
    logo: "Es",
    logoColor: "#333",
    balance: "10.248",
    valueInBRL: "276",
    lastUpdate: "03/03",
    variation: "none" as const,
  },
  {
    name: "Smiles",
    logo: "Sm",
    logoColor: "#f59e42",
    balance: "13.408",
    valueInBRL: "262",
    lastUpdate: "03/03",
    variation: "up" as const,
    error: "Código de validação necessário.",
  },
  {
    name: "LATAM Pass",
    logo: "LP",
    logoColor: "#1a3a6b",
    balance: "8.965",
    valueInBRL: "259",
    lastUpdate: "03/03",
    variation: "down" as const,
    error: "Solicita código de validação.",
    expiring: true,
  },
  {
    name: "KMV",
    logo: "KM",
    logoColor: "#2e7d32",
    balance: "2.749",
    valueInBRL: "75",
    lastUpdate: "03/03",
    variation: "up" as const,
    error: "Erro na conexão.",
  },
];

const Index = () => {
  const [activeTab, setActiveTab] = useState("saldo");
  const [activeNav, setActiveNav] = useState("programas");
  const [showAll, setShowAll] = useState(false);

  const visiblePrograms = showAll ? programs : programs.slice(0, 4);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <DashboardHeader />

      <BalanceTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Program cards grid */}
      <div className="grid grid-cols-2 gap-3 px-5">
        {visiblePrograms.map((prog, i) => (
          <ProgramCard key={i} {...prog} />
        ))}
      </div>

      {!showAll && programs.length > 4 && (
        <button
          onClick={() => setShowAll(true)}
          className="mx-auto mt-3 flex items-center gap-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown size={16} />
          Ver todos
        </button>
      )}

      <QuickSearch />

      <ExploreDestinations />

      <BottomNav activeItem={activeNav} onItemChange={setActiveNav} />
    </div>
  );
};

export default Index;

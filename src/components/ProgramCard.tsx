import { ArrowUp, ArrowDown, AlertCircle } from "lucide-react";

interface ProgramCardProps {
  name: string;
  logo: string;
  logoColor: string;
  balance: string;
  valueInBRL: string;
  lastUpdate: string;
  variation: "up" | "down" | "none";
  error?: string;
  expiring?: boolean;
}

const ProgramCard = ({
  name,
  logo,
  logoColor,
  balance,
  valueInBRL,
  lastUpdate,
  variation,
  error,
  expiring,
}: ProgramCardProps) => {
  return (
    <div className="relative rounded-2xl bg-card p-4 card-miles animate-fade-in">
      {/* Expiring badge */}
      {expiring && (
        <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-card" />
      )}

      <div className="flex items-start justify-between">
        {/* Logo */}
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold"
          style={{ backgroundColor: logoColor + "20", color: logoColor }}
        >
          {logo}
        </div>

        {/* Variation arrow + balance */}
        <div className="flex items-center gap-1">
          {variation === "up" && <ArrowUp size={14} className="text-success" />}
          {variation === "down" && <ArrowDown size={14} className="text-destructive" />}
          <span
            className={`font-display text-xl font-bold ${
              variation === "up"
                ? "text-success"
                : variation === "down"
                ? "text-destructive"
                : "text-foreground"
            }`}
          >
            {balance}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs text-muted-foreground">{lastUpdate}</p>
        <p className="mt-0.5 text-sm font-semibold text-muted-foreground">R$ {valueInBRL}</p>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default ProgramCard;

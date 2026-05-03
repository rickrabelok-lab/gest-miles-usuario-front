import { AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AirlineLogo from "@/components/AirlineLogo";

/**
 * Programas que mapeam diretamente para um asset curado (`AirlineLogo`):
 *  - garantem ratio/qualidade consistentes;
 *  - sobrepõem a logo subida no Admin SE essa for genérica/com fundo;
 *  - se preferires usar a logo subida pelo admin, basta o admin definir uma
 *    logo dedicada nesse programa (ex.: wordmark «Smiles» da própria marca).
 */
const PROGRAM_TO_AIRLINE: Record<string, string> = {
  "latam-pass": "LATAM",
  smiles: "GOL",
  "tudo-azul": "AZUL",
};

interface ProgramCardProps {
  programId?: string;
  name: string;
  logo: string;
  logoColor: string;
  balance: string;
  valueInBRL: string;
  lastUpdate: string;
  variation: "up" | "down" | "none";
  error?: string;
  expiring?: boolean;
  expiringTag?: "-90d" | "-60d" | "-30d";
  managerClientId?: string | null;
  managerClientName?: string | null;
  logoImageUrl?: string;
}

const ProgramCard = (props: ProgramCardProps) => {
  const {
    programId,
    name,
    logo,
    logoColor,
    balance,
    valueInBRL,
    lastUpdate,
    variation,
    error,
    expiring,
    expiringTag,
    managerClientId,
    managerClientName,
    logoImageUrl,
  } = props;
  const navigate = useNavigate();

  const handleOpenDetails = () => {
    const slug = programId ?? name.toLowerCase().replace(/\s+/g, "-");
    navigate(`/program/${encodeURIComponent(slug)}`, {
      state: {
        program: {
          programId,
          name,
          logo,
          logoColor,
          logoImageUrl,
          balance,
          valueInBRL,
          lastUpdate,
          variation,
          error,
          expiring,
          expiringTag,
          managerClientId,
          managerClientName,
        },
      },
    });
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenDetails();
    }
  };

  const curatedAirline = programId ? PROGRAM_TO_AIRLINE[programId] : undefined;
  const useCuratedAirline = !logoImageUrl && Boolean(curatedAirline);
  const hasBrandImage = Boolean(logoImageUrl) || useCuratedAirline;

  return (
    <div
      className="relative cursor-pointer rounded-xl border border-[#EBEBEB] bg-white p-3 text-nubank-text outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/20 active:scale-[0.99]"
      role="button"
      tabIndex={0}
      onClick={handleOpenDetails}
      onKeyDown={handleKeyDown}
    >
      {expiring && (
        <div className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-white shadow-sm" />
      )}

      <div className="mb-1.5 flex items-start justify-between">
        <div
          className={
            hasBrandImage
              ? "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 ring-1 ring-black/[0.06]"
              : "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[11px] font-bold ring-1 ring-black/[0.04]"
          }
          style={
            hasBrandImage
              ? undefined
              : { backgroundColor: logoColor + "1A", color: logoColor }
          }
          aria-hidden
        >
          {logoImageUrl ? (
            <img
              src={logoImageUrl}
              alt={`Logo ${name}`}
              className="h-full w-full object-contain mix-blend-multiply"
              loading="lazy"
              decoding="async"
            />
          ) : useCuratedAirline ? (
            <AirlineLogo airline={curatedAirline as string} size={30} />
          ) : (
            <span>{logo}</span>
          )}
        </div>

        {variation === "up" && (
          <span className="rounded bg-green-50 px-1.5 py-0.5 text-[8px] font-bold text-green-700">↑</span>
        )}
        {variation === "down" && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[8px] font-bold text-red-600">↓</span>
        )}
        {variation === "none" && (
          <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[8px] font-bold text-gray-300">—</span>
        )}
      </div>

      <div className="mb-1 font-extrabold tabular-nums leading-tight tracking-tight text-gray-900" style={{ fontSize: "15px" }}>
        {balance}
      </div>

      <div className="leading-tight text-gray-400" style={{ fontSize: "9px" }}>
        R$ {valueInBRL} · {lastUpdate}
      </div>

      {error && (
        <div className="mt-1 flex items-center justify-between gap-1 rounded-lg bg-black/[0.03] px-1.5 py-1 text-[10px] text-nubank-text-secondary">
          <div className="flex items-center gap-0.5">
            <AlertCircle size={10} />
            <span className="truncate">{error}</span>
          </div>
          {expiringTag && (
            <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">
              {expiringTag}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgramCard;

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

  // Badge de vencimento no canto (design 2a): -30d urgente, -60d atenção, -90d informativo.
  const expiringBadgeClass =
    expiringTag === "-30d"
      ? "bg-destructive-soft text-destructive-strong"
      : expiringTag === "-60d"
        ? "bg-warning-soft text-warning-strong"
        : "bg-info-soft text-info-strong";

  return (
    <div
      className="relative cursor-pointer rounded-[18px] bg-white p-3.5 text-nubank-text shadow-nubank-card outline-none transition-all duration-300 ease-out hover:shadow-nubank-hover focus-visible:ring-2 focus-visible:ring-primary/20 active:scale-[0.99]"
      role="button"
      tabIndex={0}
      onClick={handleOpenDetails}
      onKeyDown={handleKeyDown}
    >
      {expiring && !expiringTag && (
        <div className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-white shadow-sm" />
      )}

      <div className="flex items-center justify-between">
        <div
          className={
            hasBrandImage
              ? "flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-nubank-border bg-white p-0.5"
              : "flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-xl text-[11px] font-bold ring-1 ring-black/[0.04]"
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

        {expiringTag ? (
          <span className={`rounded-full px-2 py-1 text-[10.5px] font-bold leading-none ${expiringBadgeClass}`}>
            {expiringTag.replace("-", "")}
          </span>
        ) : variation === "up" ? (
          <span className="rounded-full bg-success-soft px-2 py-1 text-[10.5px] font-bold leading-none text-success-strong">↑</span>
        ) : variation === "down" ? (
          <span className="rounded-full bg-destructive-soft px-2 py-1 text-[10.5px] font-bold leading-none text-destructive-strong">↓</span>
        ) : null}
      </div>

      <div className="mt-2.5 truncate text-[12.5px] font-semibold leading-tight text-nubank-text">
        {name}
      </div>

      <div className="mt-0.5 font-display text-lg font-bold tabular-nums leading-tight tracking-tight text-nubank-text">
        {balance}
      </div>

      <div className="mt-0.5 text-[11.5px] font-medium tabular-nums leading-tight text-nubank-text-secondary">
        ≈ R$ {valueInBRL} <span className="text-[9.5px] font-normal opacity-70">· {lastUpdate}</span>
      </div>

      {error && (
        <div className="mt-1.5 flex items-center gap-1 rounded-lg bg-black/[0.03] px-1.5 py-1 text-[10px] text-nubank-text-secondary">
          <AlertCircle size={10} className="shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}
    </div>
  );
};

export default ProgramCard;

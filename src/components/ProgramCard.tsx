import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BonusProgramLogo, hasCuratedProgramMark } from "@/components/bonus/BonusProgramLogo";


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

  // Símbolo SVG empacotado vence tudo (qualidade garantida); depois a logo
  // custom (admin/branding); se faltar ou falhar o carregamento, cai no
  // tile-padrão (wordmark curado ou chip de iniciais) — nunca quebra.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [logoImageUrl]);
  const showBrandImage =
    Boolean(logoImageUrl) && !imageFailed && !hasCuratedProgramMark(programId ?? name);

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
        {showBrandImage ? (
          <div
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-nubank-border bg-white p-0.5"
            aria-hidden
          >
            <img
              src={logoImageUrl}
              alt={`Logo ${name}`}
              width={30}
              height={30}
              className="h-full w-full object-contain mix-blend-multiply"
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          </div>
        ) : (
          <BonusProgramLogo
            program={programId ?? name}
            size={38}
            fallbackInitials={logo}
            fallbackColor={logoColor}
          />
        )}

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

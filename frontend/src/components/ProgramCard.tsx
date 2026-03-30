import { ArrowUp, ArrowDown, AlertCircle, ImagePlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";

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
  logoImageUrl?: string;
  onLogoImageChange?: (imageDataUrl: string) => void;
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
    logoImageUrl,
    onLogoImageChange,
  } =
    props;
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleOpenLogoPicker: React.MouseEventHandler<HTMLButtonElement> = (
    event,
  ) => {
    event.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleLogoFileChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        onLogoImageChange?.(result);
      }
    };
    reader.readAsDataURL(file);
    event.currentTarget.value = "";
  };

  return (
    <div
      className="relative cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm outline-none transition hover:shadow-md hover:ring-2 hover:ring-slate-300 focus-visible:ring-2 focus-visible:ring-slate-400"
      role="button"
      tabIndex={0}
      onClick={handleOpenDetails}
      onKeyDown={handleKeyDown}
    >
      {/* Expiring badge */}
      {expiring && (
        <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-destructive ring-2 ring-white" />
      )}

      <div className="flex items-start justify-between">
        {/* Logo */}
        <button
          type="button"
          onClick={handleOpenLogoPicker}
          className="group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-sm font-bold ring-1 ring-black/10 transition hover:brightness-95"
          style={{ backgroundColor: logoColor + "20", color: logoColor }}
          title="Alterar imagem do programa"
          aria-label={`Alterar imagem do programa ${name}`}
        >
          {logoImageUrl ? (
            <img
              src={logoImageUrl}
              alt={`Logo ${name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            logo
          )}
          <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-white group-hover:flex">
            <ImagePlus size={14} />
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoFileChange}
            onClick={(event) => event.stopPropagation()}
          />
        </button>

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
        <p className="text-xs text-slate-500">{lastUpdate}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-600">R$ {valueInBRL}</p>
      </div>

      {error && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <AlertCircle size={12} />
            <span>{error}</span>
          </div>
          {expiringTag && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-destructive/30">
              {expiringTag}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgramCard;

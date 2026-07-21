import type { ReactNode } from "react";
import { PlaneTakeoff } from "lucide-react";

import { cn } from "@/lib/utils";

type AuthFlowShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Shell comum às telas de auth — design system v2 (claro, roxo só nos acentos):
 * tile de avião + wordmark à esquerda, formulário direto sobre o fundo #F7F7F8.
 */
export function AuthFlowShell({ title, description, children, className }: AuthFlowShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-nubank-bg px-6 py-10 pt-[calc(2.5rem+var(--gm-safe-top))] antialiased",
        className,
      )}
    >
      <div className="w-full shrink-0">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] bg-nubank-tint text-nubank-primary">
          <PlaneTakeoff size={27} strokeWidth={1.75} aria-hidden />
        </span>
        <p className="mt-4 font-display text-3xl font-bold leading-none tracking-tight">
          <span className="text-nubank-text">Gest</span>
          <span className="text-nubank-primary">Miles</span>
        </p>
        {title ? (
          <h1 className="mt-4 font-display text-[22px] font-bold tracking-tight text-nubank-text">
            {title}
          </h1>
        ) : null}
        {description ? (
          <p className="mt-1.5 max-w-[280px] text-[14.5px] leading-relaxed text-nubank-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      <div className="mt-7 w-full space-y-4">{children}</div>
    </div>
  );
}

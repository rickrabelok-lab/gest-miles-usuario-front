import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AuthFlowShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Shell comum aos ecrãs de recuperação / redefinição — paleta Gest Miles (roxo #8A05BE, fundo #F7F7F8).
 */
export function AuthFlowShell({ title, description, children, className }: AuthFlowShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-nubank-bg p-5 antialiased",
        className,
      )}
    >
      <div className="mb-5 w-full max-w-md shrink-0 text-center">
        <p className="font-display text-[1.35rem] font-bold tracking-tight text-nubank-primary">Gest Miles</p>
      </div>
      <Card className="w-full max-w-md rounded-[24px] border border-nubank-border/90 bg-white shadow-[0_8px_36px_-10px_rgba(138,5,190,0.18)] transition-shadow duration-300 ease-out hover:translate-y-0 hover:shadow-[0_12px_40px_-12px_rgba(138,5,190,0.22)]">
        <CardHeader className="space-y-2 px-8 pb-2 pt-8">
          <CardTitle className="font-display text-2xl font-bold tracking-tight text-nubank-text">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-[15px] leading-snug text-nubank-text-secondary">{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5 px-8 pb-8 pt-2">{children}</CardContent>
      </Card>
    </div>
  );
}

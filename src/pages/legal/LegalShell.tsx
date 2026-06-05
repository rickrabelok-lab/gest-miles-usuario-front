import { type ReactNode } from "react";
import { Link } from "react-router-dom";

interface LegalShellProps {
  title: string;
  /** Data legível, ex.: "5 de junho de 2026". */
  updatedAt: string;
  children: ReactNode;
}

/** Layout das páginas legais públicas (Termos, Privacidade, Cookies). Conteúdo estático. */
export function LegalShell({ title, updatedAt, children }: LegalShellProps) {
  return (
    <div className="min-h-screen bg-nubank-bg text-nubank-text">
      <header className="border-b border-nubank-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-nubank-primary"
          >
            Gest Miles
          </Link>
          <Link
            to="/"
            className="text-sm font-semibold text-nubank-primary underline-offset-4 hover:underline"
          >
            Voltar ao app
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-nubank-text">{title}</h1>
        <p className="mt-1 text-sm text-nubank-text-secondary">Última atualização: {updatedAt}</p>

        <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-nubank-text [&_a]:font-semibold [&_a]:text-nubank-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-nubank-text [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-nubank-text [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_li]:marker:text-nubank-primary">
          {children}
        </div>

        <footer className="mt-10 border-t border-nubank-border pt-6 text-sm text-nubank-text-secondary">
          <p>
            START TECH PLATAFORMAS DIGITAIS LTDA · CNPJ 66.686.910/0001-88
            <br />
            Rod. Nelson Gonçalves, 498, Quadra F Lote 2, Capão Ilhas Resort, Capão da Canoa/RS, CEP
            94.690-370
          </p>
          <p className="mt-2">
            Dúvidas sobre privacidade e dados pessoais:{" "}
            <a
              href="mailto:privacidade@gestmiles.com.br"
              className="font-semibold text-nubank-primary underline-offset-4 hover:underline"
            >
              privacidade@gestmiles.com.br
            </a>
          </p>
          <p className="mt-3 text-xs text-nubank-text-secondary/80">
            Versão preliminar — documento sujeito a revisão jurídica.
          </p>
        </footer>
      </main>
    </div>
  );
}

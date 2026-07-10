/**
 * Geração e entrega de PDF por plataforma.
 * Web: download normal (pdf.save — comportamento que sempre existiu).
 * App nativo: o WebView não trata download de blob nem window.print, então o
 * arquivo vai pro cache (Filesystem) e abre o share sheet do Android (Share).
 * Spec: docs/superpowers/specs/2026-07-10-mobile-web-only-fixes-design.md
 */
import type { jsPDF } from "jspdf";

import { isNativePlatform } from "@/lib/nativeAuth";

export function isShareCancelledError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = String((err as { message?: string }).message ?? "").toLowerCase();
  return msg.includes("cancel");
}

/** Pipeline html2canvas -> jsPDF A4 retrato com paginação (extraído do Index.tsx). */
export async function renderElementToA4Pdf(
  el: HTMLElement,
  backgroundColor = "#F7F7F8",
): Promise<jsPDF> {
  const [{ default: html2canvas }, { jsPDF: JsPdf }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(el, { scale: 2, backgroundColor, useCORS: true });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new JsPdf("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 12;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 6;
  pdf.addImage(imgData, "PNG", 6, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - 12;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + 6;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 6, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 12;
  }

  return pdf;
}

/** Entrega por plataforma; "cancelled" = usuário fechou o share sheet (não é erro). */
export async function deliverPdf(
  pdf: jsPDF,
  filename: string,
): Promise<"delivered" | "cancelled"> {
  if (!isNativePlatform()) {
    pdf.save(filename);
    return "delivered";
  }

  const dataUri = pdf.output("datauristring");
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  // data base64 sem `encoding` = escrita binária (contrato do Filesystem).
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({ title: filename, url: written.uri });
  } catch (err) {
    if (isShareCancelledError(err)) return "cancelled";
    throw err;
  }
  return "delivered";
}

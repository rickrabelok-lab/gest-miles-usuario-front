import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { jsPDF } from "jspdf";

const mocks = vi.hoisted(() => {
  const addImage = vi.fn();
  const addPage = vi.fn();
  const pdfInstance = {
    addImage,
    addPage,
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  };
  return {
    addImage,
    addPage,
    pdfInstance,
    JsPdfCtor: vi.fn(() => pdfInstance),
    html2canvas: vi.fn(),
    writeFile: vi.fn(),
    share: vi.fn(),
  };
});

vi.mock("html2canvas", () => ({ default: mocks.html2canvas }));
vi.mock("jspdf", () => ({ jsPDF: mocks.JsPdfCtor }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: mocks.writeFile },
  Directory: { Cache: "CACHE" },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: mocks.share } }));

import { deliverPdf, isShareCancelledError, renderElementToA4Pdf } from "./pdfDelivery";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const fakeCanvas = (height: number) => ({
  width: 800,
  height,
  toDataURL: () => "data:image/png;base64,IMG",
});

const fakePdf = () =>
  ({
    save: vi.fn(),
    output: vi.fn(() => "data:application/pdf;base64,QUJDRA=="),
  }) as unknown as jsPDF;

describe("isShareCancelledError", () => {
  it("reconhece cancelamento do share sheet e ignora erros reais", () => {
    expect(isShareCancelledError(new Error("Share canceled"))).toBe(true);
    expect(isShareCancelledError({ message: "Share cancelled" })).toBe(true);
    expect(isShareCancelledError(new Error("disk full"))).toBe(false);
    expect(isShareCancelledError(null)).toBe(false);
  });
});

describe("renderElementToA4Pdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("conteúdo curto vira 1 página (sem addPage)", async () => {
    mocks.html2canvas.mockResolvedValue(fakeCanvas(800)); // imgHeight = 198mm < 285
    const el = document.createElement("div");
    await renderElementToA4Pdf(el);
    expect(mocks.html2canvas).toHaveBeenCalledWith(el, {
      scale: 2,
      backgroundColor: "#F7F7F8",
      useCORS: true,
    });
    expect(mocks.addImage).toHaveBeenCalledTimes(1);
    expect(mocks.addPage).not.toHaveBeenCalled();
  });

  it("conteúdo longo pagina com addPage", async () => {
    mocks.html2canvas.mockResolvedValue(fakeCanvas(4000)); // imgHeight = 990mm -> várias páginas
    await renderElementToA4Pdf(document.createElement("div"), "#FFFFFF");
    expect(mocks.html2canvas).toHaveBeenCalledWith(expect.anything(), {
      scale: 2,
      backgroundColor: "#FFFFFF",
      useCORS: true,
    });
    expect(mocks.addPage.mock.calls.length).toBeGreaterThan(0);
    expect(mocks.addImage.mock.calls.length).toBe(mocks.addPage.mock.calls.length + 1);
  });
});

describe("deliverPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeFile.mockResolvedValue({ uri: "file:///cache/x.pdf" });
    mocks.share.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web usa pdf.save (comportamento atual)", async () => {
    const pdf = fakePdf();
    const result = await deliverPdf(pdf, "relatorio.pdf");
    expect(result).toBe("delivered");
    expect(pdf.save).toHaveBeenCalledWith("relatorio.pdf");
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it("no nativo grava no cache e abre o share sheet", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    const pdf = fakePdf();
    const result = await deliverPdf(pdf, "relatorio.pdf");
    expect(result).toBe("delivered");
    expect(pdf.save).not.toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: "relatorio.pdf",
      data: "QUJDRA==",
      directory: "CACHE",
    });
    expect(mocks.share).toHaveBeenCalledWith({ title: "relatorio.pdf", url: "file:///cache/x.pdf" });
  });

  it("usuário fechando o share sheet é silencioso (cancelled)", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    mocks.share.mockRejectedValue(new Error("Share canceled"));
    const result = await deliverPdf(fakePdf(), "x.pdf");
    expect(result).toBe("cancelled");
  });

  it("erro real na escrita propaga", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    mocks.writeFile.mockRejectedValue(new Error("disk full"));
    await expect(deliverPdf(fakePdf(), "x.pdf")).rejects.toThrow("disk full");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { COOKIE_NOTICE_DISMISSED_KEY } from "@/lib/authFlowStorage";
import CookieNotice from "./CookieNotice";

describe("CookieNotice", () => {
  beforeEach(() => localStorage.clear());

  it("mostra o aviso quando não foi dispensado", () => {
    render(<CookieNotice />);
    expect(screen.getByText(/cookies essenciais/i)).toBeTruthy();
  });

  it("some e persiste ao clicar em Entendi", () => {
    render(<CookieNotice />);
    fireEvent.click(screen.getByRole("button", { name: /entendi/i }));
    expect(screen.queryByText(/cookies essenciais/i)).toBeNull();
    expect(localStorage.getItem(COOKIE_NOTICE_DISMISSED_KEY)).toBe("1");
  });

  it("não mostra se já foi dispensado", () => {
    localStorage.setItem(COOKIE_NOTICE_DISMISSED_KEY, "1");
    render(<CookieNotice />);
    expect(screen.queryByText(/cookies essenciais/i)).toBeNull();
  });
});

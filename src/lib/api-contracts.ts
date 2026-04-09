/**
 * Contratos alinhados com `@gest/core` (manager) e `@gest-miles/shared` (admin).
 * Repo usuário não importa esses pacotes — duplicar aqui evita acoplamento Git.
 */

export type LoyaltyProgram =
  | "Livelo"
  | "Smiles"
  | "LATAM Pass"
  | "Azul Fidelidade";

export type BonusOffer = {
  id: string;
  program: LoyaltyProgram;
  store: string;
  multiplier: number;
  validUntil: string;
  conditions: string;
  offerUrl: string;
};

export type DemoFlight = {
  id: string;
  originCode: string;
  destinationCode: string;
  origin: string;
  destination: string;
  airline: string;
  points: number;
  money: number;
};

export type CalendarPricesParams = {
  originCode: string;
  destinationCode: string;
  mode: "money" | "points";
  month: string;
};

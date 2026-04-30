export interface ScheduledFlight {
  id: string
  airline: string
  flightNumber: string
  originCode: string
  destinationCode: string
  departureTime: string   // "06:40"
  arrivalTime: string     // "07:45"
  durationMinutes: number
  stops: number
  points: number
  money: number
}

export interface DatePrice {
  date: Date
  cheapestMoney: number | null
  isCheapest: boolean
}

export interface PaymentOption {
  id: string
  points: number
  money: number
  label: string
}

export interface EmissionFlightState {
  from: string
  fromName: string
  to: string
  toName: string
  departureFlight: ScheduledFlight
  returnFlight: ScheduledFlight | null
  departureDate: string   // "yyyy-MM-dd"
  returnDate: string | null
  paymentOption: PaymentOption
  passengers: number
}

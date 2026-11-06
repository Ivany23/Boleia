export type LatLng = { lat: number; lng: number };
export type Place = LatLng & { address: string };
export type Category = 'moto' | 'economico' | 'conforto';
export type Payment = 'dinheiro' | 'mpesa' | 'emola';
export type RideStatus =
  | 'searching'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_drivers';

export type DriverPublic = {
  id: string;
  name: string;
  car: string;
  plate: string;
  category: Category;
  rating: number;
  location: LatLng;
};

/** Repartição do preço (MZN). driverEarnings + platformFee = total. */
export type Fare = {
  total: number;
  driverEarnings: number;
  platformFee: number;
  multiplier: number;
  breakdown: {
    base: number;
    distance: number;
    time: number;
    surcharge: number;
    /** ida do motorista até à recolha */
    pickup?: number;
    /** complemento para o motorista atingir o ganho mínimo por hora */
    guarantee?: number;
    /** taxa de serviço fixa da plataforma */
    serviceFee?: number;
  };
};

export type PeriodId = 'normal' | 'ponta_manha' | 'ponta_tarde' | 'noite';
export type PricePeriod = { id: PeriodId; label: string; multiplier: number };
export type Traffic = 'livre' | 'moderado' | 'intenso' | 'desconhecido';

export type Ride = {
  id: string;
  status: RideStatus;
  passengerId: string;
  passengerName: string;
  pickup: Place;
  dropoff: Place;
  category: Category;
  payment: Payment;
  /** Nota do passageiro para o motorista (ex.: "portão azul"). */
  note?: string;
  cancelledBy?: 'passenger' | 'driver';
  cancelReason?: string;
  price: number;
  fare?: Fare;
  period?: PricePeriod;
  traffic?: Traffic;
  highDemand?: boolean;
  distanceMeters: number;
  durationSeconds: number;
  polyline: LatLng[];
  driver?: DriverPublic;
  createdAt: number;
};

export type Suggestion = { placeId: string; main: string; secondary: string };
export type Quote = {
  quoteId?: string;
  validForSeconds?: number;
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds?: number;
  polyline: LatLng[];
  prices: Record<Category, number>;
  fares?: Record<Category, Fare>;
  period?: PricePeriod;
  traffic?: Traffic;
  highDemand?: boolean;
};
export type RideOffer = {
  ride: Ride;
  expiresInSeconds: number;
  pickupDistanceMeters: number;
};
export type AckResult = { ok: true; ride: Ride } | { ok: false; error: string };


export type PricingInfo = {
  fuel: { gasolina: number; gasoleo: number; fonte: string };
  platformFee: number;
  serviceFee?: number;
  /** lucro mínimo garantido ao motorista por hora de trabalho (MZN) */
  driverMinHourly?: number;
  period: PricePeriod;
};

// Only used inside the app (not part of the server contract)
export type Profile = {
  role: 'passenger' | 'driver';
  name: string;
  car?: string;
  plate?: string;
  category?: Category;
};

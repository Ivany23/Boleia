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

    pickup?: number;

    guarantee?: number;

    serviceFee?: number;

    stops?: number;

    sand?: number;

    waiting?: number;

    delay?: number;
  };
};

export type Rain = { level: 'fraca' | 'forte'; multiplier: number };

export type Surface = {
  sandMeters: number;
  sandRatio: number;

  pickupSand: boolean;

  dropoffSand: boolean;
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

  stops?: Place[];
  surface?: Surface | null;
  rain?: Rain | null;

  freeWaitMin?: number;
  waitRatePerMin?: number;

  arrivedAt?: number;
  extraWaitMin?: number;
  extraDelayMin?: number;
  category: Category;
  payment: Payment;

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
  stops?: LatLng[];
  surface?: Surface | null;
  rain?: Rain | null;

  fewDrivers?: Category[];

  local?: boolean;
  freeWaitMin?: number;
  waitRates?: Record<Category, number>;
  period?: PricePeriod;
  traffic?: Traffic;
  highDemand?: boolean;
  /** Todas as rotas possíveis (a recomendada primeiro), cada uma com o seu preço e quoteId. */
  routes?: Quote[];
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
  maxStops?: number;

  driverMinHourly?: number;
  period: PricePeriod;
};

export type Profile = {
  role: 'passenger' | 'driver';
  name: string;

  phone: string;
  car?: string;
  plate?: string;
  category?: Category;
};

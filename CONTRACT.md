# Boleia: contrato entre a app e o servidor

Boleia é uma app de transporte (táxi/boleias) para Maputo e Matola, Moçambique.
Moeda: MZN (Metical). Língua da interface: português de Moçambique.

- `server/`: Node.js (ESM, Express + Socket.IO), porta `process.env.PORT` (3000). As chaves Google ficam SÓ no servidor (`server/.env`).
- `app/`: Expo SDK 58 + React Native (TypeScript). URL do servidor em `process.env.EXPO_PUBLIC_SERVER_URL`.

## Tipos partilhados

```ts
type LatLng = { lat: number; lng: number };
type Place = LatLng & { address: string };
type Category = 'moto' | 'economico' | 'conforto';
type Payment = 'dinheiro' | 'mpesa' | 'emola';
type RideStatus =
  | 'searching'    // à procura de motorista
  | 'accepted'     // motorista aceitou, a caminho do passageiro
  | 'arrived'      // motorista chegou ao ponto de recolha
  | 'in_progress'  // viagem a decorrer
  | 'completed'
  | 'cancelled'
  | 'no_drivers';  // nenhum motorista disponível/aceitou

type DriverPublic = {
  id: string; name: string; car: string; plate: string;
  category: Category; rating: number; location: LatLng;
};

type Ride = {
  id: string;
  status: RideStatus;
  passengerId: string;          // socket id do passageiro
  passengerName: string;
  pickup: Place;
  dropoff: Place;
  category: Category;
  payment: Payment;
  price: number;                // MZN, arredondado a múltiplos de 5
  distanceMeters: number;
  durationSeconds: number;
  polyline: LatLng[];           // rota recolha → destino
  driver?: DriverPublic;
  createdAt: number;
};
```

## REST (JSON)

| Método | Caminho | Entrada | Resposta |
|---|---|---|---|
| GET | `/api/health` | | `{ ok: true, drivers: number }` |
| GET | `/api/places/autocomplete` | query `input`, `lat?`, `lng?`, `session` | `{ suggestions: { placeId: string; main: string; secondary: string }[] }` |
| GET | `/api/places/details` | query `placeId`, `session` | `Place` |
| POST | `/api/quote` | `{ origin: LatLng, destination: LatLng }` | `{ quoteId, validForSeconds, distanceMeters, durationSeconds, staticDurationSeconds, polyline, prices: Record<Category, number>, fares: Record<Category, Fare>, period, traffic, highDemand }` |
| GET | `/api/pricing` | | `{ fuel: { gasolina, gasoleo, fonte }, platformFee, period, rates }` |

`Fare = { total, driverEarnings, platformFee, multiplier, breakdown: { base, distance, time, surcharge } }` (`driverEarnings + platformFee = total`). A `Ride` inclui também `fare`, `period`, `traffic`, `highDemand`.

Erros: HTTP 4xx/5xx com `{ error: string }` (mensagem em português).

### Regras do servidor
- Autocomplete: Places API (New) `POST https://places.googleapis.com/v1/places:autocomplete`, header `X-Goog-Api-Key: GOOGLE_PLACES_API_KEY`, `includedRegionCodes: ["mz"]`, `languageCode: "pt"`, `sessionToken`, `locationBias` circular (raio 30 km) se houver lat/lng. Ignorar inputs com menos de 2 caracteres (devolver lista vazia).
- Details: `GET https://places.googleapis.com/v1/places/{placeId}?sessionToken=...` com `X-Goog-FieldMask: location,formattedAddress,displayName`.
- Quote: Routes API `POST https://routes.googleapis.com/directions/v2:computeRoutes`, header `X-Goog-Api-Key: GOOGLE_ROUTES_API_KEY`, `X-Goog-FieldMask: routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline`, `travelMode: DRIVE`. Descodificar a polyline (algoritmo padrão do Google, implementado à mão, sem dependência).
- Cache em memória das cotações (chave = coordenadas arredondadas a 4 casas) durante 5 min, para poupar pedidos à Google.
- Rota com trânsito real (`routingPreference: TRAFFIC_AWARE`, campo `routes.staticDuration` para comparar). Se a Google recusar, recua para `TRAFFIC_UNAWARE` durante 30 min. `ROUTES_TRAFFIC=0` desliga.
- Preço (MZN), em `server/src/pricing.js`, indexado ao preço da gasolina (ARENE, `FUEL_GASOLINA_MZN`):
  - `porKm = consumo/100 × gasolina × 1,25 + desgaste + ganhoKm`; `porMin = ralenti × gasolina + ganhoMin`
  - líquido do motorista = `(base + km × porKm + min × porMin) × multiplicador`
  - total = líquido / (1 − comissão), mínimo `minimo`, arredondado a 5. Comissão `PLATFORM_FEE` (0,12).
  - multiplicador = horário × procura (máx. 1,6). Horário (hora de Maputo): noite 21h–05h ×1,25; ponta seg–sex 06h–09h ×1,15 e 16h30–19h30 ×1,20. Procura: pedidos à espera vs. motoristas livres a 5 km, até ×1,3.
- Cotação com preço garantido: guardada 5 min com `quoteId`; `ride:request` com o mesmo `quoteId` e os mesmos locais (±150 m) paga esse valor.
- NÃO usar a Geocoding API nem a Route Matrix API (o projeto ainda não tem faturação). A morada da posição atual vem do telemóvel (`expo-location` `reverseGeocodeAsync`).

## Socket.IO (mesmo servidor/porta)

Cliente → servidor:
| Evento | Payload | Notas |
|---|---|---|
| `passenger:hello` | `{ name: string, location: LatLng }` | passa a receber `drivers:nearby` |
| `driver:online` | `{ name, car, plate, category: Category, location: LatLng }` | |
| `driver:location` | `LatLng` | a cada ~3 s ou ao mover |
| `driver:offline` | | |
| `ride:request` | `{ pickup: Place, dropoff: Place, category, payment, passengerName }` | ack: `{ ok: true, ride } \| { ok: false, error }` |
| `ride:cancel` | `{ rideId }` | passageiro ou motorista |
| `ride:accept` / `ride:decline` | `{ rideId }` | motorista |
| `ride:arrived` / `ride:start` / `ride:complete` | `{ rideId }` | motorista |
| `ride:request` (campos extra) | `quoteId?: string`, `note?: string` (máx. 140) | preço garantido; nota que o motorista vê na oferta |
| `ride:cancel` (campo extra) | `reason?: string` (máx. 80) | a `Ride` cancelada traz `cancelledBy: 'passenger' \| 'driver'` e `cancelReason` |
| `ride:rate` | `{ rideId, stars: 1..5 }` | passageiro, viagem concluída, uma vez; ack `{ ok }` |

Servidor → cliente:
| Evento | Payload | Para |
|---|---|---|
| `drivers:nearby` | `DriverPublic[]` (livres, até 5 km, máx. 20) | passageiros, a cada 5 s |
| `ride:offer` | `{ ride: Ride, expiresInSeconds: 15, pickupDistanceMeters: number }` | motorista escolhido |
| `ride:update` | `Ride` | passageiro e motorista da viagem |
| `ride:driver_location` | `LatLng` | passageiro da viagem |

Não há conversa entre passageiro e motorista. A avaliação (`ride:rate`) é opcional. Viagens terminadas saem da memória após 30 min.

### Atribuição de viagens
1. O servidor calcula a cotação (mesma lógica de `/api/quote`), cria a `Ride` com status `searching` e devolve-a no ack.
2. Escolhe o motorista **livre** mais próximo da recolha, com a mesma categoria, em linha reta (Haversine) e até 10 km; envia `ride:offer`.
3. Se recusar ou não responder em 15 s, passa ao próximo (nunca repete o mesmo motorista). Se acabarem, status `no_drivers`.
4. Ao aceitar: status `accepted`, `driver` preenchido, motorista fica ocupado. Depois `arrived` → `in_progress` → `completed` (motorista volta a livre).
5. Se o socket do motorista cair durante a viagem: voltar a `searching` e procurar outro. Se o passageiro cair: cancelar.

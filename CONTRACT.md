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
| POST | `/api/quote` | `{ origin: LatLng, destination: LatLng, stops?: LatLng[] }` (até 3 paragens, pela ordem) | `{ quoteId, validForSeconds, distanceMeters, durationSeconds, staticDurationSeconds, polyline, stops, surface, rain, fewDrivers, freeWaitMin, waitRates, prices: Record<Category, number>, fares: Record<Category, Fare>, period, traffic, highDemand }` |
| GET | `/api/pricing` | | `{ fuel: { gasolina, gasoleo, fonte }, platformFee, serviceFee, driverMinHourly, driverMinHourlyByCategory, period, rates, learning }` |
| GET | `/api/geocode/reverse` | query `lat`, `lng` | `Place` (morada do ponto; `"Ponto no mapa"` se não houver) |
| GET | `/api/config` | | `{ googleMapsWebKey: string \| null }` (chave do Google Maps do site, `GOOGLE_MAPS_WEB_KEY`) |

`/api/health` devolve também `storage: 'postgres' | 'memoria'`.

**WhatsApp (obrigatório):** `ride:request` e `driver:online` levam `phone` (Moçambique, redes 82–87; aceita `84 123 4567`, `+258 84 123 4567`, `258841234567`; guardado como `+2588XXXXXXXX`). Sem número válido: `ride:request` responde `{ ok:false, error }` e `driver:online` emite `driver:error { error }`. O WhatsApp do motorista nunca é enviado ao passageiro. Do cliente guarda-se só nome e WhatsApp; as viagens são guardadas sem moradas nem dados do passageiro (`server/src/db.js`).

`Fare = { total, driverEarnings, platformFee, multiplier, driverCost, breakdown: { base, distance, time, pickup, stops, sand, waiting?, delay?, guarantee, surcharge, serviceFee } }` (`driverEarnings + platformFee = total`; a soma do `breakdown` é o `total`; `surcharge` é negativo quando há desconto). A `Ride` inclui também `fare`, `period`, `traffic`, `highDemand`, `stops: Place[]` e `surface`.

`Surface = { sandMeters, sandRatio, pickupSand, dropoffSand } | null`: troços do percurso em estrada de areia/terra (dados do OpenStreetMap guardados no servidor, `server/src/data/sand-maputo.json`; `null` fora da Grande Maputo ou com `SURFACE_CHECK=0`).

**Fórmula base (combustível):** combustível por km = preço do litro ÷ km por litro (Mota 35 — ex. LF49-D, Rolls —, Económico 9,5 — carro 1.5 —, Conforto 8 km/L). Preço por km = combustível + desgaste + lucro do motorista. Só se cobram os minutos **parados** (abaixo de 25 km/h). Ida até à recolha: 1.º km grátis, máx. 3 km pagos. **Tarifa de bairro** (`local: true` na cotação): destino e paragens até 2,5 km em linha recta da partida → metade da base e mínimo × 0,85. Taxa de serviço 5 MZN; ganho mínimo do motorista 150 MZN/h (Económico), depois do combustível.

**Ajustes automáticos** (multiplicador total limitado a 0,9–1,6): horário; procura na zona (pedidos à espera por carro livre; **nenhum carro livre perto ×1,15, só um ×1,05**; **pico de pedidos** nos últimos 15 min acima de 2 por carro livre, até +15%; procura total máx. ×1,3); **chuva** em Maputo (Open-Meteo, fraca ×1,10, forte ×1,20; `rain` na cotação; desligar `WEATHER_CHECK=0`); aprendizagem. Sem dados de trânsito na hora de ponta, o tempo é estimado com +30%.

**Carro parado:** `freeWaitMin` (3) minutos de espera grátis depois de `ride:arrived`; depois `waitRatePerMin` por minuto (combustível ao ralenti + ganho mínimo por hora), cobrado em `ride:start` (`breakdown.waiting`, `extraWaitMin`). Se a viagem demorar mais do que o previsto × 1,25 + 5 min (parado no trânsito), o excesso é cobrado em `ride:complete` (`breakdown.delay`, `extraDelayMin`). Máx. 60 min de cada; estes extras vão todos para o motorista e `ride.price` é actualizado.

**Paragens:** até 3 (`MAX_STOPS`). Cada paragem soma um valor fixo (Mota 5, Económico 10, Conforto 15 MZN) mais 3 min de espera à tarifa por minuto. **Areia:** cada km em areia soma uma fracção do preço por km (Mota 30%, Económico 50%, Conforto 35%); a garantia do motorista inclui este custo extra.

Erros: HTTP 4xx/5xx com `{ error: string }` (mensagem em português).

### Regras do servidor
- Autocomplete: Places API (New) `POST https://places.googleapis.com/v1/places:autocomplete`, header `X-Goog-Api-Key: GOOGLE_PLACES_API_KEY`, `includedRegionCodes: ["mz"]`, `languageCode: "pt"`, `sessionToken`, `locationBias` circular (raio 30 km) se houver lat/lng. Ignorar inputs com menos de 2 caracteres (devolver lista vazia).
- Details: `GET https://places.googleapis.com/v1/places/{placeId}?sessionToken=...` com `X-Goog-FieldMask: location,formattedAddress,displayName`.
- Quote: Routes API `POST https://routes.googleapis.com/directions/v2:computeRoutes`, header `X-Goog-Api-Key: GOOGLE_ROUTES_API_KEY`, `X-Goog-FieldMask: routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline`, `travelMode: DRIVE`. Descodificar a polyline (algoritmo padrão do Google, implementado à mão, sem dependência).
- Cache em memória das cotações (chave = coordenadas arredondadas a 4 casas) durante 5 min, para poupar pedidos à Google.
- Rota com trânsito real (`routingPreference: TRAFFIC_AWARE`, campo `routes.staticDuration` para comparar). Se a Google recusar, recua para `TRAFFIC_UNAWARE` durante 30 min. `ROUTES_TRAFFIC=0` desliga.
- Preço (MZN), em `server/src/pricing.js`, indexado ao preço da gasolina (ARENE, `FUEL_GASOLINA_MZN`):
  - `custoKm = consumo/100 × gasolina + desgaste`; `porKm = custoKm + ganhoKm`; `porMin = ralenti × gasolina + ganhoMin`
  - tarifa = `base + km × porKm + min × porMin + min(recolha, 5 km) × custoKm` (recolha = motorista livre mais próximo; sem nenhum, 1,5 km)
  - garantia = custo real (km da recolha + viagem, ralenti) + ganho mínimo/hora × (minutos da viagem + recolha a 20 km/h); ganho mínimo `DRIVER_MIN_HOURLY` (300) × 0,7 moto / 1 económico / 1,3 conforto
  - líquido = `max(max(tarifa, garantia) × multiplicador, garantia)`
  - total = `arredonda5(max(líquido / (1 − comissão), mínimo × multiplicador)) + SERVICE_FEE` (10). Comissão `PLATFORM_FEE` (0,12).
  - multiplicador = horário × procura na zona × aprendizagem (0,9 a 1,6). Horário (hora de Maputo): noite 21h–05h ×1,25; ponta seg–sex 06h–09h ×1,15 e 16h30–19h30 ×1,20.
  - procura (`server/src/market.js`): pedidos à espera vs. motoristas livres a 5 km, até ×1,3, suavizada por zona (~2 km) com média exponencial de 2 min.
  - aprendizagem (`server/src/market.js`): por zona × horário (e categoria), contadores de cotações, pedidos, aceites, recusas e expiradas com meia-vida de 3 dias. Taxa de aceitação < 60% → sobe até +20%; > 85% com conversão < 30% → desce até −10%. Com poucos dados usa a cidade inteira. Guardada em PostgreSQL (`DATABASE_URL`), ou em memória.
- Cotação com preço garantido: guardada 5 min com `quoteId`; `ride:request` com o mesmo `quoteId`, os mesmos locais (±150 m) e as mesmas paragens (mesma ordem) paga esse valor.
- Rotas com paragens: Routes API com `intermediates`.
- Morada de um ponto (`/api/geocode/reverse`): Places API (New) `places:searchNearby` (raio 120 m, por distância); se falhar, OpenStreetMap Nominatim (máx. 1 pedido/s). Cache de 24 h. A Geocoding API da Google não é usada (exige faturação).

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
| `ride:request` (campos extra) | `quoteId?: string`, `note?: string` (máx. 140), `stops?: Place[]` (máx. 3) | preço garantido; nota que o motorista vê na oferta; paragens pelo caminho |
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

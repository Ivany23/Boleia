# Boleia: servidor

Servidor Node.js (Express + Socket.IO) da app Boleia (Maputo/Matola). O contrato com a app está em `../CONTRACT.md`.

## Como correr

1. Node 22 ou superior (testado com Node 24).
2. Criar `server/.env` com `PORT`, `GOOGLE_ROUTES_API_KEY` e `GOOGLE_PLACES_API_KEY` (o ficheiro está no `.gitignore`; nunca o partilhar).
3. `npm install`
4. `npm start` (escuta em `0.0.0.0:PORT`, por omissão 3000)

## Testes

- `npm test`: testes unitários e de integração (Google simulada, sem custos).
- `RUN_LIVE=1 npm test`: inclui o teste real contra a Google (rota Baixa para Matola e pesquisa "Shoprite").

## Endpoints REST

| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/health` | `{ ok, drivers }` |
| GET | `/api/places/autocomplete?input=&lat=&lng=&session=` | sugestões de locais (mín. 2 caracteres) |
| GET | `/api/places/details?placeId=&session=` | `{ lat, lng, address }` |
| POST | `/api/quote` | `{ origin, destination }` devolve `quoteId` (preço garantido 5 min), distância, duração com e sem trânsito, polyline, preços e repartição (`fares`) por categoria, horário e trânsito |
| GET | `/api/pricing` | preço dos combustíveis, comissão, horário em vigor e tarifas por categoria |

Erros: `{ "error": "mensagem em português" }`.

## Socket.IO

Mesma porta. Eventos cliente para servidor: `passenger:hello`, `driver:online`, `driver:location`, `driver:offline`, `ride:request`, `ride:cancel`, `ride:accept`, `ride:decline`, `ride:arrived`, `ride:start`, `ride:complete`, `ride:rate`. Servidor para cliente: `drivers:nearby`, `ride:offer`, `ride:update`, `ride:driver_location`. Detalhes no contrato.

## Estrutura

- `src/index.js`: arranque
- `src/server.js`: Express + Socket.IO
- `src/google.js`: Places, Routes (com trânsito e recuo automático), descodificador de polyline, cache de 5 min
- `src/pricing.js`: motor de preços (combustível ARENE, horários de Maputo, procura, comissão)
- `src/quotes.js`: cotações com preço garantido
- `src/rides.js`: estado em memória, atribuição e avaliações
- `src/geo.js`: distância Haversine

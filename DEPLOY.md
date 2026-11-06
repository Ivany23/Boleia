# Publicar a Boleia: servidor no Render, base de dados na Neon e app na Vercel

Ordem: **primeiro o servidor** (a app precisa do endereço dele).

## 1. Servidor no Render

1. Entrar em https://render.com com a conta do GitHub.
2. **New → Blueprint** e escolher o repositório `Ivany23/Boleia`. O Render lê o `render.yaml` e cria o serviço `boleia-server`.
   (Se o serviço já existe: abrir o serviço → **Environment** e acrescentar as variáveis abaixo.)
3. Variáveis (copiar do `server/.env` do PC, que nunca vai para o GitHub):
   | Variável | O quê |
   |---|---|
   | `GOOGLE_ROUTES_API_KEY` | rotas e trânsito |
   | `GOOGLE_PLACES_API_KEY` | pesquisa de locais e moradas |
   | `DATABASE_URL` | base de dados Neon (linha `DATABASE_URL=` do `server/.env`) |
   | `GOOGLE_MAPS_WEB_KEY` | chave do Google Maps **do site** (ver secção 3) |
4. **Save / Deploy**. Quando terminar, abrir `https://<endereço-do-render>/api/health`. Deve aparecer `{"ok":true,"drivers":0,"storage":"postgres"}`.
   - `"storage":"postgres"`: ligado à base de dados. `"memoria"`: o `DATABASE_URL` falta ou está errado (ver os Logs).
5. Copiar o endereço (ex.: `https://boleia-server.onrender.com`).

Notas:
- No plano gratuito, o servidor adormece após 15 min sem uso. O primeiro acesso demora cerca de 1 minuto a acordar, e a app religa-se sozinha.
- As viagens em curso ficam em memória: um reinício do servidor apaga as viagens a decorrer (as terminadas já estão na base de dados).
- **Google Cloud:** se as chaves do servidor tiverem restrição por IP, retirar essa restrição ou acrescentar os IPs do Render.

## 2. Base de dados (Neon)

O servidor cria sozinho as tabelas no primeiro arranque (`server/src/db.js`):

| Tabela | O que guarda |
|---|---|
| `passengers` | clientes: **só nome e número de WhatsApp** |
| `drivers` | motoristas: nome, WhatsApp, carro, matrícula, categoria, avaliação |
| `rides` | viagens terminadas **sem moradas nem dados do passageiro**: categoria, pagamento, estado, preço, parte do motorista, parte da plataforma, distância, duração, horário, zona (~2 km), avaliação |
| `pricing_stats` | aprendizagem dos preços |

O `DATABASE_URL` aceita o formato da Neon para Node (`postgres://…?sslmode=require`) ou o JDBC (`jdbc:postgresql://…?user=…&password=…`).

Consultas úteis (no **SQL Editor** da Neon):
```sql
-- Receita dos últimos 30 dias
SELECT count(*) AS viagens, sum(price) AS total, sum(driver_earnings) AS motoristas, sum(platform_fee) AS plataforma
FROM rides WHERE status = 'completed' AND created_at > now() - interval '30 days';

-- Ganhos por motorista (últimos 7 dias)
SELECT d.name, d.phone, count(*) AS viagens, sum(r.driver_earnings) AS ganhos, round(d.rating::numeric, 2) AS nota
FROM rides r JOIN drivers d ON d.phone = r.driver_phone
WHERE r.status = 'completed' AND r.created_at > now() - interval '7 days'
GROUP BY d.name, d.phone, d.rating ORDER BY ganhos DESC;
```

## 3. Chave do Google Maps para o site (5 minutos)
Sem esta chave o site mostra o **OpenStreetMap**. Esta chave fica visível no site, por isso **tem de ser uma chave nova e limitada**. Nunca use a chave do servidor (`GOOGLE_ROUTES_API_KEY`).
1. Abrir https://console.cloud.google.com/apis/credentials, no mesmo projecto das outras chaves.
2. **Criar credenciais → Chave de API**.
3. Em **Restrições da aplicação**, escolher **Referenciadores HTTP (sites)** e acrescentar:
   - `https://boleia-nine.vercel.app/*`
   - `https://*.vercel.app/*` (opcional: pré-visualizações da Vercel)
4. Em **Restrições da API**, escolher só **Maps JavaScript API**.
5. Pôr a chave **no Render** como `GOOGLE_MAPS_WEB_KEY` (o site vai buscá-la ao servidor; não é preciso refazer o deploy na Vercel).
   Alternativa: na Vercel como `EXPO_PUBLIC_GOOGLE_MAPS_KEY` + **Redeploy**.

Se a chave falhar, o site passa sozinho para o OpenStreetMap e continua a funcionar.

## 4. App na Vercel

1. Entrar em https://vercel.com com a conta do GitHub.
2. **Add New → Project** e importar `Ivany23/Boleia`.
3. Em **Root Directory**, escolher **`app`**. O `app/vercel.json` já define o build.
4. Em **Environment Variables**: `EXPO_PUBLIC_SERVER_URL` = o endereço do Render (ex.: `https://boleia-server.onrender.com`, sem `/` no fim).
5. **Deploy**.

> Se mudar o endereço do servidor, altere a variável e faça **Redeploy**: o endereço fica gravado na app no momento do build.

### A versão web
- Mapa: Google Maps (com a chave do site) ou, como reserva, OpenStreetMap. Tudo o resto é igual: preços, "Escolher no mapa", cancelamento e avaliações.
- Sem inclinação 3D na web; os carros continuam a deslizar e a rodar.
- O browser pede autorização de localização (só funciona em `https`, que a Vercel já dá).

## 5. Telemóvel (Expo Go) com o servidor do Render

Para o Expo Go usar o servidor na internet em vez do PC, escrever em `app/.env`:
```
EXPO_PUBLIC_SERVER_URL=https://boleia-server.onrender.com
```
e correr `npx expo start -c`. Assim já não é preciso o mesmo Wi-Fi nem a firewall.

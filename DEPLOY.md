# Publicar a Boleia: servidor no Render e app na Vercel

Ordem: **primeiro o servidor** (a app precisa do endereço dele).

## 1. Servidor no Render

1. Entrar em https://render.com com a conta do GitHub.
2. **New → Blueprint** e escolher o repositório `Ivany23/Boleia`. O Render lê o `render.yaml` e cria o serviço `boleia-server`.
3. Preencher as variáveis pedidas (copiar do `server/.env` do PC):
   - `GOOGLE_ROUTES_API_KEY`
   - `GOOGLE_PLACES_API_KEY`
4. **Apply**. Quando terminar, abrir `https://<endereço-do-render>/api/health`. Deve aparecer `{"ok":true,"drivers":0}`.
5. Copiar o endereço (ex.: `https://boleia-server.onrender.com`).

### Base de dados (aprendizagem de preços)
O `render.yaml` cria também a base de dados **boleia-db** (PostgreSQL) e liga-a ao servidor (`DATABASE_URL`).
- Se o serviço já existia, abra o Blueprint no Render e carregue em **Sync** (ou **Manual Sync**) para criar a base de dados.
- Nos registos (Logs) deve aparecer `base de dados ligada (N estatísticas de preço carregadas)`.
- Sem base de dados, o servidor funciona na mesma: a aprendizagem fica só em memória e recomeça a cada deploy.
- **Atenção:** a base de dados gratuita do Render expira 30 dias depois de criada. Antes disso, passe-a para o plano pago mais barato ou crie outra.

Notas:
- No plano gratuito, o servidor adormece após 15 min sem uso. O primeiro acesso demora cerca de 1 minuto a acordar, e a app religa-se sozinha.
- As viagens ficam em memória: um reinício do servidor apaga as viagens em curso.
- **Google Cloud:** se as chaves tiverem restrição por IP, retirar essa restrição ou acrescentar os IPs do Render.

## 2. App na Vercel

1. Entrar em https://vercel.com com a conta do GitHub.
2. **Add New → Project** e importar `Ivany23/Boleia`.
3. Em **Root Directory**, escolher **`app`**. O `app/vercel.json` já define o build.
4. Em **Environment Variables**, acrescentar:
   - `EXPO_PUBLIC_SERVER_URL` = o endereço do Render (ex.: `https://boleia-server.onrender.com`, sem `/` no fim)
   - `EXPO_PUBLIC_GOOGLE_MAPS_KEY` = a chave do Google Maps para o site (ver abaixo). Sem ela, o site usa o OpenStreetMap.
5. **Deploy**.

### Chave do Google Maps para o site (5 minutos)
Esta chave fica visível no site, por isso **tem de ser uma chave nova e limitada**. Nunca use a chave do servidor (`GOOGLE_ROUTES_API_KEY`).
1. Abrir https://console.cloud.google.com/apis/credentials, no mesmo projecto das outras chaves.
2. **Criar credenciais → Chave de API**.
3. Em **Restrições da aplicação**, escolher **Referenciadores HTTP (sites)** e acrescentar:
   - `https://boleia-nine.vercel.app/*`
   - `https://*-ivany23s-projects.vercel.app/*` (pré-visualizações; ajuste ao nome que a Vercel mostrar)
4. Em **Restrições da API**, escolher só **Maps JavaScript API**.
5. Copiar a chave para `EXPO_PUBLIC_GOOGLE_MAPS_KEY` na Vercel e fazer **Redeploy**.

Se a chave falhar, o site passa sozinho para o OpenStreetMap e continua a funcionar.

> Se mudar o endereço do servidor, altere a variável e faça **Redeploy**: o endereço fica gravado na app no momento do build.

### A versão web
- O mapa é o Google Maps (com `EXPO_PUBLIC_GOOGLE_MAPS_KEY`) ou, como reserva, o OpenStreetMap. Tudo o resto é igual: preços, "Escolher no mapa", cancelamento e avaliações.
- Sem inclinação 3D na web; os carros continuam a deslizar e a rodar.
- O browser pede autorização de localização (só funciona em `https`, que a Vercel já dá).

## 3. Telemóvel (Expo Go) com o servidor do Render

Para o Expo Go usar o servidor na internet em vez do PC, escrever em `app/.env`:
```
EXPO_PUBLIC_SERVER_URL=https://boleia-server.onrender.com
```
e correr `npx expo start -c`. Assim já não é preciso o mesmo Wi-Fi nem a firewall.

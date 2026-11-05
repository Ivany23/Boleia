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
5. **Deploy**.

> Se mudar o endereço do servidor, altere a variável e faça **Redeploy**: o endereço fica gravado na app no momento do build.

### A versão web
- O mapa usa OpenStreetMap (Leaflet), porque o mapa nativo só existe no telemóvel. Tudo o resto é igual: preços, chat, cancelamento e avaliações.
- Sem inclinação 3D na web; os carros continuam a deslizar e a rodar.
- O browser pede autorização de localização (só funciona em `https`, que a Vercel já dá).

## 3. Telemóvel (Expo Go) com o servidor do Render

Para o Expo Go usar o servidor na internet em vez do PC, escrever em `app/.env`:
```
EXPO_PUBLIC_SERVER_URL=https://boleia-server.onrender.com
```
e correr `npx expo start -c`. Assim já não é preciso o mesmo Wi-Fi nem a firewall.

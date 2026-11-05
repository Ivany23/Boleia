# Boleia

App de transporte (táxi/boleias) para Maputo e Matola, Moçambique.

- `app/`: app móvel (Expo SDK 58, React Native, TypeScript)
- `server/`: servidor (Node.js, Express + Socket.IO): preços, viagens em tempo real, avaliações

## Correr localmente
1. `server/`: copiar `.env.example` para `.env` e preencher as chaves da Google; depois `npm install` e `npm start`.
2. `app/`: `npm install` e `npx expo start`; abrir no Expo Go.

No Windows, basta dar duplo clique em `iniciar-servidor.bat` e depois em `iniciar-app.bat`.

Mais detalhes em [COMO-USAR.md](COMO-USAR.md) (guia) e [CONTRACT.md](CONTRACT.md) (API e eventos).

## Publicar
Servidor no **Render** (`render.yaml`) e app web na **Vercel** (`app/vercel.json`). Passo a passo em [DEPLOY.md](DEPLOY.md).

## Testes
```bash
cd server && npm test
```

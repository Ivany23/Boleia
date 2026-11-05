# Boleia: como pôr a app a correr

## Uma única vez
1. No telemóvel, instalar a app **Expo Go** (Play Store / App Store).
2. No PC, abrir o **PowerShell como Administrador** e permitir que o telemóvel chegue ao PC:
   ```powershell
   New-NetFirewallRule -DisplayName "Boleia (3000, 8081)" -Direction Inbound -Protocol TCP -LocalPort 3000,8081 -Action Allow -Profile Private
   ```
   A rede Wi-Fi tem de estar como **Privada** no Windows.

## Sempre que quiser usar
**Forma mais fácil:** na pasta `Boleia`, dar duplo clique em `iniciar-servidor.bat` e depois em `iniciar-app.bat` (deixar as duas janelas abertas). Não depende do PowerShell nem da sua política de scripts.

Ou abrir **dois** terminais:

**Terminal 1: servidor**
```bash
cd C:\Users\25884\OneDrive\Desktop\Boleia\server
npm start
```

**Terminal 2: app**
```bash
cd C:\Users\25884\OneDrive\Desktop\Boleia\app
npx expo start
```
Ler o código QR com o **Expo Go** (Android) ou com a **Câmara** (iPhone). O telemóvel tem de estar **no mesmo Wi-Fi** que o PC.

## Testar uma viagem
São precisos 2 telemóveis (ou 2 pessoas):
- Telemóvel A: **Sou motorista** → ficar **Online** (categoria, por exemplo, Económico).
- Telemóvel B: **Sou passageiro** → **Para onde?** → escolher destino → escolher a mesma categoria → **Pedir Boleia**.
- O motorista aceita → Cheguei → Iniciar viagem → Terminar viagem.

## Se algo falhar
| Problema | Solução |
|---|---|
| "Sem ligação ao servidor" | O servidor está ligado? A firewall foi configurada? Mesmo Wi-Fi? |
| Expo Go não abre / fica a carregar | No Windows, a rede Wi-Fi tem de estar como **Privada** (Definições → Rede e Internet → Wi-Fi → propriedades da rede). Cada Wi-Fi/hotspot novo começa como Público |
| O IP do PC mudou | Não é preciso fazer nada: a app usa automaticamente o IP do PC. Basta correr `npx expo start -c` |
| Sem sugestões de destino | Verificar a chave da Places em `server/.env` |
| Sem preço/rota | Verificar a chave da Routes em `server/.env` |

## Testes automáticos
```bash
cd server
npm test                 # testes sem gastar pedidos ao Google
RUN_LIVE=1 npm test      # inclui teste real com o Google (Git Bash)
```

## Preços (MZN), em server/src/pricing.js
O preço é calculado a partir do **custo real** para o motorista: combustível (gasolina da ARENE, 93,69 MT/L desde 07/05/2026), desgaste do carro e tempo parado no trânsito. Soma-se um ganho justo para o motorista e, por cima, a comissão da plataforma (12%). O passageiro paga sempre o preço que viu, durante 5 minutos.

| Horário (Maputo) | Ajuste |
|---|---|
| Noite, 21h–05h (todos os dias) | +25% |
| Ponta da tarde, 16h30–19h30 (seg–sex) | +20% |
| Ponta da manhã, 06h–09h (seg–sex) | +15% |
| Procura alta (mais pedidos que motoristas livres) | até +30% |

Exemplos (tarifa normal / ponta da tarde / noite):

| Viagem | Moto | Económico | Conforto |
|---|---|---|---|
| Curta, 3 km / 8 min | 55 / 65 / 70 | 120 / 140 / 150 | 185 / 220 / 230 |
| Média, 5 km / 12 min | 75 / 90 / 95 | 165 / 195 / 205 | 250 / 300 / 310 |
| Baixa → Matola, 15,6 km / 28 min | 180 / 215 / 220 | 390 / 470 / 485 | 575 / 685 / 715 |

**Quando a ARENE mudar o preço**, basta acrescentar ao `server/.env` (e reiniciar o servidor):
```
FUEL_GASOLINA_MZN=93.69
FUEL_GASOLEO_MZN=116.25
FUEL_FONTE=ARENE, 07/05/2026
PLATFORM_FEE=0.12
```
Todos os preços se ajustam sozinhos. `ROUTES_TRAFFIC=0` desliga o trânsito em tempo real (fica mais barato na Google).

## Durante a viagem
- **Mapa sempre visível:** tocar na pega do painel ("▼ ver mapa") minimiza-o para uma linha.
- **🧭 Modo 3D:** a câmara inclina-se e segue o carro (motorista: tipo GPS, virado para onde vai). **⤢** mostra o percurso todo. Arrastar o mapa sai do modo 3D.
- Os carros deslizam no mapa e rodam na direcção em que andam.
- **Nota para o motorista:** o passageiro pode escrever, antes de pedir, por exemplo "portão azul". O motorista vê-a na oferta.
- **Cancelar:** passageiro e motorista escolhem um motivo, e o outro lado vê quem cancelou e porquê. Se o motorista cancelar, o passageiro tem o botão "Pedir outro motorista".
- **Navegar (motorista):** abre o Google Maps até à recolha ou ao destino.

## Avaliação (opcional)
No fim da viagem, a app sugere avaliar o motorista com 1 a 5 estrelas. É opcional: o passageiro pode tocar em "Agora não". Não há conversa entre passageiro e motorista.

## Ainda não incluído (próximas fases)
- Pagamento M-Pesa / e-Mola integrado (por agora paga-se ao motorista)
- Contas de utilizador e login por SMS; base de dados (hoje tudo fica em memória e perde-se ao reiniciar o servidor)
- Painel de administração e aprovação de motoristas
- Servidor na internet (hoje só funciona na mesma rede Wi-Fi)
- Publicação nas lojas (Play Store / App Store)

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
O preço não é fixo: é calculado em cada pedido, por camadas.

| Camada | O que faz |
|---|---|
| **Custo real** | Combustível (gasolina ARENE, 93,69 MT/L) e desgaste, por km; combustível parado no trânsito, por minuto |
| **Distância e trânsito** | km e minutos reais da Google, com trânsito em tempo real |
| **Ida até à recolha** | Distância real do motorista livre mais próximo (até 5 km pagos) |
| **Garantia do motorista** | Nunca menos do que o custo real + ganho mínimo por hora: Moto 210, Económico 300, Conforto 390 MZN/hora |
| **Horário** | Noite 21h–05h +25%; ponta 16h30–19h30 +20% e 06h–09h +15% (seg–sex), por cima da garantia |
| **Procura na zona** | Maputo/Matola em zonas de ~2 km; até +30% quando faltam carros, a subir e descer devagar |
| **Aprendizagem** | Se os motoristas recusam muito numa zona/horário, sobe (até +20%); se aceitam tudo e os passageiros desistem ao ver o preço, desce (até −10%). Guardada na base de dados |
| **Plataforma** | Comissão de 12% + taxa de serviço de 10 MZN por viagem |

Limites de protecção: o ajuste total fica entre 0,9× e 1,6× e o passageiro paga sempre o preço que viu, durante 5 minutos.

Exemplos com o motorista a 1,5 km (tarifa normal / ponta da tarde / noite):

| Viagem | Moto | Económico | Conforto |
|---|---|---|---|
| Muito curta, 850 m / 4 min | 55 / 65 / 70 | 95 / 115 / 120 | 145 / 175 / 180 |
| Curta, 2 km / 6 min | 70 / 85 / 85 | 120 / 140 / 145 | 180 / 215 / 225 |
| Média, 5 km / 12 min | 115 / 135 / 140 | 195 / 235 / 245 | 270 / 320 / 335 |
| 10 km / 20 min | 170 / 205 / 215 | 310 / 375 / 390 | 410 / 495 / 515 |
| Baixa → Matola, 15,6 km / 28 min | 235 / 280 / 290 | 435 / 520 / 540 | 570 / 680 / 710 |

**Para mudar valores**, basta acrescentar ao `server/.env` (ou às variáveis do Render) e reiniciar:
```
FUEL_GASOLINA_MZN=93.69
FUEL_GASOLEO_MZN=116.25
FUEL_FONTE=ARENE, 07/05/2026
PLATFORM_FEE=0.12
SERVICE_FEE=10
DRIVER_MIN_HOURLY=300
```
Todos os preços se ajustam sozinhos. `ROUTES_TRAFFIC=0` desliga o trânsito em tempo real (fica mais barato na Google).

## Sessão, menu e modo nocturno
- A app lembra-se de quem entrou: ao reabrir ou recarregar a página, vai directamente para o mapa.
- O botão **☰** (canto superior esquerdo) abre o menu: **Modo nocturno** (Automático, que segue o telemóvel, Claro ou Escuro), **trocar entre passageiro e motorista** (os dados já vêm preenchidos) e **Terminar sessão**.

## Escolher um local no mapa
Na pesquisa de destino (ou de recolha), tocar em **🗺️ Escolher no mapa**. Aparece um pino fixo no centro: arraste o mapa ou toque no local, veja a morada e carregue em **Confirmar**.

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

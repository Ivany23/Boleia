# Boleia: segurança do protótipo

Este documento explica uma **vulnerabilidade conhecida e aceite** na versão de demonstração da Boleia, o risco que representa e o que deve ser feito antes de a app ser usada por clientes reais.

## 1. Resumo

| | |
|---|---|
| **O quê** | A chave de acesso à Google (Google Maps Platform) fica visível no site da Boleia |
| **Onde** | Só na versão web (`boleia-nine.vercel.app`). A app de telemóvel não é afectada |
| **Porquê** | Decisão consciente para a demonstração: mostrar o Google Maps no site sem criar uma segunda chave |
| **Risco** | Terceiros podem copiar a chave e usar os serviços Google à custa da Boleia |
| **Gravidade** | **Média** para o protótipo (uso limitado, com tectos de gasto); **alta** se fosse para produção |
| **Correcção** | Criar uma chave própria do site, limitada ao domínio e só ao mapa (cerca de 5 minutos, sem alterar código) |

## 2. Como funciona e onde está a falha

A Boleia usa três serviços Google: **mapa** (Maps JavaScript API), **rotas e trânsito** (Routes API) e **pesquisa de locais** (Places API).

- **Rotas e locais** são pedidos pelo **servidor** da Boleia (Render). A chave fica guardada no servidor e nunca sai de lá. **Esta parte é segura.**
- **O mapa no site** é desenhado pelo **browser** de quem visita. Para isso, o browser tem de enviar uma chave à Google. Na demonstração, essa chave é **a mesma do servidor**.

Tudo o que o browser recebe pode ser visto por quem o usa. Qualquer visitante consegue ver a chave em segundos, sem conhecimentos técnicos especiais:
- carregando em **F12** e abrindo o separador **Rede (Network)**: a chave aparece nos pedidos feitos a `maps.googleapis.com`;
- abrindo o código do site e procurando o texto `AIza` (o início de todas as chaves Google).

Também existem programas automáticos que procuram chaves expostas na internet.

## 3. O que um terceiro poderia fazer

Como a chave exposta é a do servidor, além do mapa dá acesso a **Rotas e Locais**. Com uma cópia da chave, alguém poderia:

1. **Usar os serviços Google nos seus próprios sites ou apps**, com custos cobrados à conta Google da Boleia.
2. **Esgotar a quota diária** (de propósito ou não). A Boleia deixaria de calcular rotas e preços até ao dia seguinte, e a app ficaria parada.

O que **não** está em risco:
- os **dados dos clientes e motoristas** (nomes e números de WhatsApp) estão na base de dados, que tem uma senha própria e nunca é exposta ao site;
- o **servidor** e a **base de dados** não ficam acessíveis através desta chave;
- a **app de telemóvel** não usa esta chave para o mapa.

## 4. Porque é aceitável na demonstração

- O site serve apenas para demonstração, com poucos utilizadores e por pouco tempo.
- Recomendamos activar **tectos de gasto** (ponto 6) durante a demonstração: mesmo que a chave seja copiada, o custo máximo fica limitado.
- A correcção definitiva é simples, não exige mudanças no código e pode ser feita logo a seguir.

## 5. Correcção definitiva (antes de clientes reais)

**Usar duas chaves, como a própria Google recomenda:**

| Chave | Para quê | Restrições |
|---|---|---|
| **Chave do servidor** (a actual) | Rotas e Locais | Só as APIs Routes e Places; de preferência limitada aos IPs do servidor |
| **Chave do site** (nova) | Só o mapa no site | Só a Maps JavaScript API; só o domínio `https://boleia-nine.vercel.app/*` |

Mesmo que alguém copie a chave do site, ela não serve para rotas nem pesquisas e a Google recusa-a noutros sites.

**Passos (cerca de 5 minutos):**
1. Google Cloud Console → **APIs e serviços → Credenciais** → **Criar credenciais → Chave de API**.
2. Na nova chave: **Restrições da aplicação → Websites** → `https://boleia-nine.vercel.app/*`; **Restrições da API** → só **Maps JavaScript API**.
3. No Render (serviço `boleia-server` → **Environment**):
   - acrescentar `GOOGLE_MAPS_WEB_KEY` = a chave nova;
   - acrescentar `MAPS_DEMO_USE_SERVER_KEY` = `0` (deixa de entregar a chave do servidor ao site).
4. **Gerar uma nova chave do servidor** (ou "Regenerar" a actual) e actualizar `GOOGLE_ROUTES_API_KEY` no Render, porque a chave actual já esteve exposta.

## 6. Medidas recomendadas já para a demonstração

No Google Cloud Console:
- **Restringir a chave actual às APIs usadas**: Routes API, Places API (New) e Maps JavaScript API.
- **Quotas diárias** (APIs e serviços → cada API → Quotas): por exemplo, máximo de 2 000 pedidos/dia de Routes e 2 000 de Places.
- **Alerta de orçamento** (Faturação → Orçamentos e alertas): aviso por email a partir de um valor baixo, por exemplo 10 USD.
- Depois da demonstração, **regenerar a chave**.

## 7. Outras limitações conhecidas do protótipo

| Limitação | Impacto | Antes de produção |
|---|---|---|
| O número de WhatsApp não é confirmado (sem código por SMS) | Alguém pode registar-se com um número que não é seu | Confirmação por código (SMS ou WhatsApp) |
| Não há contas com palavra-passe | Qualquer pessoa entra como passageiro ou motorista | Login e aprovação de motoristas com documentos |
| Viagens em curso ficam na memória do servidor | Um reinício do servidor cancela as viagens a decorrer | Guardar o estado das viagens na base de dados |
| Plano gratuito do Render | O servidor adormece após 15 min sem uso (1 min para acordar) | Plano pago |

## 8. Contacto e referências

- Recomendações oficiais da Google sobre chaves: https://developers.google.com/maps/api-security-best-practices
- Configuração da publicação: `DEPLOY.md`

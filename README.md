# Cantinho NZ — Cardápio online de quentinhas

Sistema completo para vender quentinhas online: cardápio com carrinho, pagamento
por Pix/cartão (Mercado Pago) e painel administrativo para o dono do restaurante
gerenciar pratos e acompanhar pedidos.

## O que já vem pronto

- **Monte sua quentinha** (`/monte.html`): o cliente escolhe o tamanho (Pequena,
  Média, Grande) e depois monta o prato escolhendo proteína, acompanhamentos e
  salada. Cada tamanho já inclui um número de itens grátis por grupo (ex: Média
  inclui 1 proteína + 3 acompanhamentos); se o cliente escolher mais do que isso,
  o item extra é cobrado à parte automaticamente — ele não é bloqueado, só passa
  a aparecer com o preço adicional. Adicionais (bacon, ovo, queijo...) sempre
  cobram à parte, do mesmo jeito.
- **Cardápio de bebidas e extras** (`/`) para itens de prateleira simples.
- **Carrinho único ("comanda")** que junta quentinhas montadas e bebidas/extras.
- **Pagamento online** via Mercado Pago Checkout Pro (aceita Pix, cartão de crédito
  e débito automaticamente — não precisa integrar cada método manualmente).
- **Painel admin** (`/admin.html`):
  - Aba **Monte sua Quentinha**: cadastra tamanhos e preços, cria os grupos de
    itens (proteínas, acompanhamentos, salada, adicionais), define quantos itens
    de cada grupo vêm inclusos por tamanho, e o preço de cada item (tanto o preço
    "se passar do limite" quanto o preço dos adicionais).
  - Aba **Cardápio da Semana**: define, para cada dia (Segunda a Domingo), quais
    itens de cada grupo normalmente entram no cardápio — isso já é o padrão que
    se repete toda semana. Quando um dia específico precisa mudar (acabou um
    ingrediente, é feriado, etc.), dá pra cadastrar uma **substituição pontual**
    só para aquela data, sem mexer no padrão da semana. O cliente só vê, no
    "Monte sua Quentinha", os itens que estão realmente disponíveis naquele dia.
  - Aba **Bebidas e extras**: CRUD simples dos itens de prateleira.
  - Aba **Pedidos**: lista de pedidos com atualização de status (em preparo, saiu
    para entrega, entregue...).
- **Aviso automático por Telegram**: quando um pedido é pago, a cozinha recebe
  uma mensagem no Telegram com os itens e os dados do cliente — sem precisar
  ficar checando o painel manualmente. Quando o pedido sai para entrega, o
  entregador recebe outra mensagem só com o que ele precisa (endereço, telefone,
  bairro e observações).
- **Taxa de entrega por bairro**: no checkout, o cliente escolhe o bairro numa
  lista configurada pelo restaurante, e a taxa correspondente é somada ao total
  automaticamente. Bairros fora da área de entrega simplesmente não aparecem na
  lista.
- **Endereço em campos separados**: no checkout, o cliente preenche rua, número
  e um ponto de referência opcional (em vez de um campo de texto único) — fica
  mais fácil de ler tanto pra vocês quanto pro entregador.
- **Pagamento em dinheiro na entrega**: além de pagar online (Pix/Cartão), o
  cliente pode escolher pagar em dinheiro quando o pedido chegar. Se ele
  informar quanto vai pagar (ex: "tenho uma nota de R$50"), o troco é calculado
  automaticamente e já aparece pra cozinha e pro entregador nas notificações.
  Pedidos em dinheiro não passam pelo Mercado Pago — ficam confirmados na hora.
- **Acompanhamento do pedido em tempo real**: depois de fazer o pedido, o
  cliente cai numa página com uma linha do tempo visual (pago → em preparo →
  saiu para entrega → entregue) que **atualiza sozinha** enquanto o pedido está
  em andamento — não precisa ficar recarregando a página. Um link "📦 Meu
  pedido" aparece no cardápio pra ele voltar e conferir o status depois, mesmo
  sem guardar o link original.
- **Atualizar status pelo Telegram**: as mensagens da cozinha e do entregador
  vêm com botões (ex: "🍳 Marcar como Em Preparo", "🛵 Marcar Saiu para
  Entrega", "✅ Marcar como Entregue"). Basta clicar — não precisa abrir o
  painel admin pra avançar o pedido. O status muda no sistema na hora, e o
  painel admin reflete a mudança automaticamente.
- **Taxa de entrega por distância (km)**: além do modo por bairro, dá pra ativar
  o cálculo automático por distância. O cliente digita rua e número, o sistema
  geocodifica o endereço (converte em coordenadas, gratuitamente, via
  OpenStreetMap) e calcula a distância real até o restaurante, cobrando uma
  taxa fixa + um valor por km. Dá pra definir um raio máximo de entrega — fora
  dele, o pedido é bloqueado. Veja a seção 6 para configurar.
- Dados guardados em arquivos JSON simples (`server/data/`) — funciona bem para
  começar; veja a seção "Crescendo" para trocar por um banco de verdade depois.

### Como funciona o preço da quentinha montada

Cada **tamanho** tem um preço-base e um limite de itens grátis por grupo (definido
no painel admin). Por exemplo, no cardápio de exemplo que já vem configurado:

| Tamanho | Preço base | Proteínas inclusas | Acompanhamentos inclusos | Salada inclusa |
|---|---|---|---|---|
| Pequena | R$ 14,90 | 1 | 2 | 1 |
| Média | R$ 18,90 | 1 | 3 | 2 |
| Grande | R$ 22,90 | 2 | 4 | 2 |

Se o cliente escolher, por exemplo, 2 proteínas numa quentinha Média (que só
inclui 1), a segunda proteína entra automaticamente como item extra, cobrando o
preço próprio dela (configurável por item no admin). O mesmo vale para
acompanhamentos e salada além do limite. Itens do grupo "Adicionais" (bacon, ovo,
queijo...) sempre cobram à parte, pois não têm limite grátis.

**Importante:** o preço final de cada quentinha é sempre recalculado no servidor
(`server/monteQuentinha.js`) a partir da configuração atual — o valor que aparece
no navegador do cliente é só uma prévia. Isso impede que alguém manipule o preço
pelo navegador antes de pagar.

## 1. Rodando localmente

Pré-requisito: [Node.js](https://nodejs.org) instalado (versão 18 ou mais recente).

```bash
npm install
cp .env.example .env
```

Abra o arquivo `.env` e preencha:

- `ADMIN_USER` / `ADMIN_PASSWORD`: login que você vai usar em `/admin.html`.
- `JWT_SECRET`: qualquer texto longo e aleatório (só precisa definir uma vez).
- `MP_ACCESS_TOKEN`: sua credencial do Mercado Pago (veja o passo 2 abaixo).
- `PUBLIC_URL`: em desenvolvimento, deixe `http://localhost:3000`.

Depois:

```bash
npm start
```

Acesse `http://localhost:3000` para ver o cardápio e `http://localhost:3000/admin.html`
para o painel administrativo.

## 2. Configurando o pagamento (Mercado Pago)

1. Crie uma conta em [mercadopago.com.br](https://www.mercadopago.com.br) (ou use
   a conta do restaurante já existente).
2. Acesse o [painel de desenvolvedores](https://www.mercadopago.com.br/developers/panel/app)
   e crie uma aplicação.
3. Copie o **Access Token de produção** e cole em `MP_ACCESS_TOKEN` no `.env`.
   Enquanto estiver testando, use o **Access Token de teste** (mesma tela) — assim
   você pode simular pagamentos sem usar dinheiro real.
4. Não é preciso escrever nada a mais: a integração de Pix, cartão de crédito
   e cartão de débito já está pronta em `server/routes/pedidos.js`, usando o
   Checkout Pro do Mercado Pago. Boleto e parcelamento já vêm desativados no
   código (não fazem muito sentido pra um pedido de entrega rápida) — se
   quiser reativar algum dia, é só mexer no bloco `payment_methods` dentro de
   `server/routes/pedidos.js`.

**Para o Pix aparecer no checkout**, sua conta do Mercado Pago precisa ter,
além do Access Token de produção:
   - Conta com os dados **verificados** (verificação de identidade completa,
     separada de só ter o token).
   - Uma **chave Pix cadastrada** na conta (CPF, CNPJ, e-mail, telefone ou
     chave aleatória — qualquer uma já habilita).
   - A opção **"Transferência bancária (Pix)"** ativada nas configurações de
     pagamento da conta.

   Confira tudo isso em: painel do Mercado Pago → Configurações → Pix.

**Importante sobre o webhook:** para o sistema confirmar automaticamente quando
um cliente paga, o Mercado Pago precisa conseguir acessar a rota
`SEU_SITE/api/pedidos/webhook`. Isso só funciona quando o site está publicado
com uma URL pública (não funciona em `localhost`). Depois de publicar (passo 3),
atualize `PUBLIC_URL` no `.env` com a URL final do site.

## 3. Configurando os avisos por Telegram (cozinha e entregador)

1. No Telegram, abra uma conversa com o **@BotFather**, envie `/newbot` e siga
   as instruções (nome e um "username" terminando em `bot`). No final ele te
   dá um **token** — copie e cole em `TELEGRAM_BOT_TOKEN` no `.env`.
2. Agora você precisa do **chat_id** de quem vai receber os avisos:
   - Se for você mesmo (ou um grupo com a cozinha), adicione o bot na conversa
     ou grupo e mande qualquer mensagem lá.
   - Depois acesse, no navegador:
     `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates`
     (troque `<SEU_TOKEN>` pelo token do passo 1). Vai aparecer um JSON com um
     campo `"chat":{"id": ...}` — esse número é o chat_id.
3. Cole esse número em `TELEGRAM_CHAT_ID_COZINHA` no `.env`. Se o entregador for
   receber os avisos numa conversa diferente, repita o processo pra ele e cole
   o resultado em `TELEGRAM_CHAT_ID_ENTREGA` (se deixar em branco, usa o mesmo
   chat da cozinha).
4. Reinicie o servidor depois de editar o `.env`. Se `PUBLIC_URL` já estiver
   configurado (necessário pra publicar o site — veja a seção 4), o servidor
   registra sozinho o webhook do Telegram ao iniciar, sem precisar de nenhum
   passo manual extra.

A cozinha recebe um aviso automaticamente assim que um pedido é confirmado como
pago, com um botão **"🍳 Marcar como Em Preparo"**. Ao clicar, o botão vira
**"🛵 Marcar Saiu para Entrega"** — clicando nele, o entregador recebe uma nova
mensagem (com endereço, telefone e bairro) e um botão **"✅ Marcar como
Entregue"**. Tudo isso atualiza o status no sistema na hora, do mesmo jeito que
mudar pelo painel admin — os dois ficam sempre sincronizados.

**Dica:** se essas variáveis não estiverem configuradas, o sistema simplesmente
não envia nada (e registra no log do servidor o que teria sido enviado) — ou
seja, dá pra usar o resto do sistema normalmente mesmo sem configurar isso.

## 4. Publicando o site

Este é um site Node.js comum, então funciona em qualquer serviço que rode Node,
por exemplo:

- **Render** (render.com) — plano gratuito para começar, bem simples: conecte o
  repositório, defina "Build command" = `npm install`, "Start command" = `npm start`,
  e cole as variáveis do `.env` na aba "Environment".
- **Railway** (railway.app) — processo parecido, também com plano gratuito inicial.

Passos gerais em qualquer um desses serviços:

1. Suba este projeto para o GitHub (ou envie os arquivos direto, se o serviço permitir).
2. Crie um novo serviço "Web Service" apontando para o repositório.
3. Configure as variáveis de ambiente (as mesmas do `.env`) no painel do serviço.
4. Depois que o site estiver no ar, copie a URL gerada (ex: `https://saborroca.onrender.com`)
   e atualize a variável `PUBLIC_URL` com ela — isso é essencial para o pagamento
   e o webhook funcionarem corretamente.
5. Se quiser um domínio próprio (ex: `saborroca.com.br`), a maioria desses serviços
   permite configurar isso nas próprias configurações do projeto.

## 5. Usando o painel administrativo no dia a dia

- Acesse `/admin.html`, entre com o usuário/senha definidos no `.env`.
- Na aba **Cardápio da Semana**:
  - Escolha o dia (ex: Segunda) e marque quais itens de cada grupo normalmente
    entram no cardápio nesse dia. Clique em **Salvar este dia**.
  - Repita para os outros dias da semana — isso forma o padrão que se repete
    toda semana automaticamente.
  - Quando um dia específico for diferente do padrão (ex: hoje faltou frango,
    ou é um feriado com cardápio especial), escolha a data no calendário da
    seção **"Substituição para uma data específica"**, ajuste as marcações e
    clique em **Salvar substituição desta data**. Isso vale só para aquele dia;
    o resto da semana continua seguindo o padrão normal. Se quiser voltar ao
    padrão nessa data, use **Remover substituição**.
- Na aba **Monte sua Quentinha**:
  - Edite nome e preço dos tamanhos, ou crie um novo tamanho.
  - Em cada grupo (Proteínas, Acompanhamentos, Salada, Adicionais), defina quantos
    itens vêm inclusos de graça por tamanho, e o preço de cada item (o preço que
    é cobrado quando o cliente passa do limite incluso, ou sempre no caso dos
    adicionais).
  - Adicione/remova itens e grupos conforme o cardápio do restaurante mudar.
  - Clique em **Salvar alterações** para aplicar — as mudanças valem imediatamente
    para novos pedidos.
- Na aba **Bebidas e extras**: adicione, edite ou desative itens de prateleira
  simples (um item "indisponível" some do cardápio público sem precisar excluir).
- Na aba **Entrega**: escolha o modo de cálculo da taxa (por bairro ou por
  distância) e configure cada um — veja a seção 6 para os detalhes do modo
  por distância.
- Na aba **Pedidos**: veja todos os pedidos com dados do cliente, itens e total.
  Mude o status conforme o andamento (em preparo → saiu para entrega → entregue)
  para manter o controle da cozinha.

## 6. Configurando a taxa de entrega por distância

Se preferir cobrar por km em vez de uma lista fixa de bairros:

1. Acesse `/admin.html` → aba **Entrega** → marque **"Por distância (km)"**.
2. Preencha os campos:
   - **Latitude/Longitude do restaurante**: já vêm com as coordenadas que você
     passou (-5.142849, -42.780193). Só mude se o restaurante mudar de endereço
     — pode pegar novas coordenadas clicando com o botão direito no local exato
     no Google Maps.
   - **Cidade/UF de referência**: preencha com a cidade e estado do restaurante
     (ex: "Teresina, PI, Brasil"). Isso ajuda o sistema a achar o endereço certo
     quando o cliente digita só rua e número.
   - **Taxa fixa base**: um valor cobrado sempre, além do valor por km (pode
     deixar 0 se não quiser taxa fixa).
   - **Preço por km**: quanto cobrar por quilômetro de distância.
   - **Fator de rota**: a distância calculada é "em linha reta", que costuma
     ser menor que a distância real de rua. Um fator de 1.3 (padrão) aumenta a
     distância em 30% pra aproximar melhor da distância real percorrida.
   - **Raio máximo de entrega**: distância além da qual o pedido é recusado
     automaticamente (endereço fora da área de entrega).
3. Clique em **Salvar configuração de entrega**.

No checkout, o cliente só precisa digitar rua e número — o sistema calcula a
distância e mostra a taxa automaticamente, antes mesmo de finalizar o pedido.

**Sobre a precisão:** o cálculo usa geocodificação gratuita (OpenStreetMap/
Nominatim), que é bem confiável pra a maioria dos endereços urbanos, mas pode
falhar ou ficar impreciso em endereços muito novos, rurais, ou mal escritos.
A busca já é restrita a uma área de ~165km ao redor do restaurante (pra evitar
que um nome de rua seja confundido com uma cidade de mesmo nome em outro
estado), e existe uma proteção extra que recusa o cálculo se a distância der
algo implausível. Se mesmo assim um endereço específico não for bem
reconhecido, o cliente recebe um aviso pra conferir a rua e o número — se isso
for um problema recorrente, dá pra trocar por uma API paga como o Google Maps
Geocoding, que tende a ser mais precisa.

## 7. Sobre fotos dos pratos

O campo "imagem" existe no cadastro de produto, mas por padrão fica em branco
(o layout já funciona bem só com texto). Se quiser adicionar fotos: hospede as
imagens em algum serviço (ex: [Cloudinary](https://cloudinary.com), gratuito para
uso pequeno) e cole o link da imagem no campo correspondente — o código do
front-end pode ser ajustado para exibi-las nos cards do cardápio.

## 8. Crescendo (próximos passos sugeridos)

- **Banco de dados de verdade**: os dados hoje ficam em `server/data/*.json`.
  Funciona bem para um restaurante começando, mas se o volume de pedidos crescer
  muito, vale migrar para Postgres ou MySQL (a troca fica isolada em `server/db.js`).
- **Múltiplos administradores**: hoje há um único usuário/senha; para uma equipe
  maior, vale trocar por um cadastro de usuários com permissões.
- **Raio de atendimento por distância**: hoje a taxa de entrega é por bairro
  (lista fixa). Se quiser calcular por distância real do endereço, dá pra
  integrar uma API de geolocalização (ex: Google Maps Distance Matrix).

## Estrutura do projeto

```
server/
  index.js           → servidor Express
  db.js              → leitura/escrita dos dados (JSON)
  routes/
    produtos.js       → cardápio (público + admin)
    pedidos.js        → pedidos + integração Mercado Pago
    admin.js          → login do painel
  middleware/auth.js  → proteção das rotas de admin
  data/                → arquivos de dados (cardápio e pedidos)
public/
  index.html, checkout.html, pedido-confirmado.html, admin.html
  css/, js/            → estilo e comportamento do site
```

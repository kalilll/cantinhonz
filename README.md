# Cantinho NZ — Cardápio online de quentinhas

Sistema completo para vender quentinhas online: cardápio com carrinho, pagamento
por Pix/cartão (Mercado Pago) e painel administrativo para o dono do restaurante
gerenciar pratos e acompanhar pedidos.

## Endereço e frete (CEP, Google Maps e link do entregador)

No checkout, o cliente digita o **CEP** e o sistema preenche automaticamente
Rua, Bairro (via [ViaCEP](https://viacep.com.br), gratuito) — os campos
continuam editáveis caso o CEP traga algo diferente do endereço real. Número e
um **Complemento opcional** (quadra, lote, conjunto, apto, casa...) completam o
endereço; o complemento nunca é usado na geocodificação (só aparece no texto
pro entregador), justamente porque é esse tipo de informação que costuma
confundir serviços de mapas em endereços como "Quadra 73 Lote 08 Casa A".

Toda a geolocalização (geocodificação de endereço e cálculo de distância até o
restaurante, no modo de frete "por km") usa a **Geocoding API do Google Maps
Platform**. Pra ativar:

1. Crie um projeto em [console.cloud.google.com](https://console.cloud.google.com/).
2. Ative a **Geocoding API** (menu *APIs e serviços → Biblioteca*).
3. Gere uma chave em *APIs e serviços → Credenciais → Criar credenciais → Chave
   de API*, e restrinja-a à Geocoding API (e, se possível, por IP do servidor).
4. Cole em `GOOGLE_MAPS_API_KEY` no `.env`.

Isso é necessário apenas se a aba **Entrega** do painel admin estiver
configurada no modo **"Por distância (km)"** — no modo "Por bairro" o sistema
ainda tenta geocodificar o endereço em segundo plano (sem bloquear o pedido)
só para gerar um link de mapa mais preciso pro entregador; sem a chave, o
pedido continua funcionando normalmente, só sem esse link.

Sempre que a geocodificação encontra o endereço, o pedido guarda a latitude e
a longitude retornadas pelo Google, e a mensagem do entregador no Telegram
ganha um botão **"🗺️ Abrir no Google Maps"** que aponta direto pras
coordenadas — em vez de mandar o Google Maps reinterpretar o endereço em
texto (e possivelmente errar o local em endereços com quadra/lote).

### Sugestões de endereço no checkout (Places Autocomplete)

Opcionalmente, o campo **Rua** do checkout pode sugerir endereços reais
conforme o cliente digita (igual à busca do Google Maps), reduzindo erro de
digitação. Pra ativar, é preciso uma **segunda chave**, diferente da
`GOOGLE_MAPS_API_KEY` usada no servidor:

1. Crie outra chave em *Credenciais* no mesmo projeto do Google Cloud.
2. Ative **Maps JavaScript API** e **Places API** pra ela.
3. Restrinja-a por **Referenciadores HTTP (sites)** com o domínio do site —
   nunca por IP (essa chave roda no navegador do cliente, não no servidor).
4. Cole em `GOOGLE_MAPS_BROWSER_KEY` no `.env`.

Sem essa segunda chave, o checkout funciona normalmente, só sem as sugestões
automáticas. As duas chaves são propositalmente separadas: a do servidor fica
secreta e restrita por IP; essa fica exposta no código-fonte da página (é
assim que toda chave de navegador do Google funciona) e sua segurança vem da
restrição por domínio, não do sigilo.

> A Geocoding API e a Places API do Google têm uso pago acima da cota
> gratuita mensal do Google Cloud — bem diferente do Mapbox/Nominatim usados
> antes. Vale acompanhar o consumo em *APIs e serviços → Painel* caso o
> volume de pedidos cresça bastante.

## Bot do cardápio diário no WhatsApp

O bot que manda a foto do cardápio do dia pros clientes no WhatsApp roda
**dentro deste mesmo processo** (`server/whatsapp-bot/`), iniciado junto com
o servidor Express em `server/index.js`. Isso existe pra usar uma única
instância paga no serviço de hospedagem, em vez de uma pro site e outra só
pro bot.

Como funciona (sem mudança nenhuma no comportamento de antes): no horário
configurado, o bot manda uma prévia do cardápio do dia pro número do dono no
WhatsApp; o dono responde com `/c` (ver/editar contatos), `/m` (trocar a
imagem do dia) ou `/s` (confirmar e disparar pra todos os clientes da lista).

**O bot é opcional e nunca derruba o site.** Se `OWNER_NUMBER` não estiver
configurado no `.env`, ele simplesmente não inicia — o resto do site funciona
normalmente. Se a dependência do WhatsApp falhar ao carregar ou a conexão
cair, o erro fica só no log; o Express continua respondendo.

### Variáveis de ambiente do bot

```
OWNER_NUMBER=5586999998888     # número do dono, com código do país e DDD
PREVIEW_CRON=0 9 * * *          # horário da prévia diária (formato cron)
TIMEZONE=America/Fortaleza
DELAY_MIN_SECONDS=3             # intervalo aleatório entre envios pros clientes
DELAY_MAX_SECONDS=8
```

O link de pedido que entra na legenda das mensagens usa a mesma `PUBLIC_URL`
já configurada pro site — não precisa configurar separado.

### ⚠️ Disco persistente é obrigatório em hospedagem paga-por-serviço

A pasta `server/whatsapp-bot/auth_info/` guarda a sessão logada do WhatsApp
(gerada ao escanear o QR code uma vez). A maioria dos serviços tipo
Render/Railway/Fly.io tem **disco efêmero por padrão** — qualquer arquivo
gravado localmente é apagado a cada novo deploy ou restart do serviço. Sem
resolver isso, o bot perderia a sessão e pediria pra escanear o QR code de
novo toda vez que você atualizar o site, o que inviabiliza rodar sem
supervisão constante.

**Antes de colocar em produção:**

1. Configure um **volume/disco persistente** na plataforma escolhida, montado
   no caminho de `server/whatsapp-bot/auth_info/` (Render: *Persistent Disk*,
   nos planos pagos; Railway: *Volumes*; Fly.io: *Volumes*). Isso exige um
   plano pago com disco — os planos gratuitos dessas plataformas geralmente
   não oferecem disco persistente.
2. Faça o **primeiro login localmente** (`npm start` na sua máquina,
   escaneando o QR code que aparece no terminal) — é bem mais confiável do
   que tentar escanear um QR code renderizado no visualizador de logs da
   plataforma, que costuma distorcer o ASCII do QR code.
3. Depois do login local funcionar, copie a pasta `server/whatsapp-bot/auth_info/`
   inteira (menos o `.gitkeep`) pro volume persistente configurado na
   plataforma, e faça o deploy.

Sem disco persistente configurado, o bot ainda funciona — só que vai pedir
login de novo a cada deploy/restart, o que na prática só é viável se você
mesmo reiniciar o serviço raramente e não se importar de reconectar.

### Um número dedicado é recomendado

Esse bot usa uma biblioteca não-oficial do WhatsApp (Baileys, que simula o
WhatsApp Web) — não é o método oficial da Meta. Use, de preferência, um
número dedicado pro bot (não o número pessoal do dono nem o único número de
atendimento do restaurante), pra reduzir o impacto caso o WhatsApp restrinja
a conta. Com poucos contatos e envio de 1x por dia com intervalo entre
mensagens, o risco é baixo, mas não é zero. Se o negócio crescer muito
(centenas/milhares de contatos), vale migrar pra API oficial do WhatsApp
Business (Meta Cloud API).

### Inscrição no checkout do site

No checkout, embaixo do campo de telefone, o cliente pode marcar "Quero
receber o cardápio do dia no WhatsApp". Ao digitar o telefone, o site
verifica em segundo plano (`GET /api/whatsapp-cardapio/verificar`) se esse
número já está na lista — se já estiver, mostra uma confirmação em vez do
checkbox, pra não pedir de novo. Se o cliente marcar e finalizar o pedido, o
número é adicionado à mesma lista usada pelo bot (`server/whatsapp-bot/data/contatos.json`),
de forma tolerante a falhas (nunca impede a criação do pedido).

### Adicionando contatos por compartilhamento

Além do comando `/add 5586999998888 Nome`, dá pra adicionar contato(s)
simplesmente **compartilhando o contato direto do WhatsApp** na conversa com
o bot (um ou vários de uma vez, usando o "compartilhar contato" nativo do
WhatsApp) — sem precisar digitar o número manualmente. O bot lê o vCard
compartilhado, evita duplicados automaticamente e confirma quantos foram
adicionados.

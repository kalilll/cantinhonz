require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const produtosRouter = require("./routes/produtos");
const pedidosRouter = require("./routes/pedidos");
const adminRouter = require("./routes/admin");
const opcoesQuentinhaRouter = require("./routes/opcoesQuentinha");
const disponibilidadeRouter = require("./routes/disponibilidade");
const bairrosEntregaRouter = require("./routes/bairrosEntrega");
const freteRouter = require("./routes/frete");
const telegramWebhookRouter = require("./routes/telegramWebhook");
const whatsappCardapioRouter = require("./routes/whatsappCardapio");
const { configurarWebhookTelegram } = require("./notificacoes");

// Carregado com cuidado: se a dependência do bot (@whiskeysockets/baileys)
// falhar ao carregar por qualquer motivo, o site não pode cair por causa
// disso — só o bot fica desativado.
let iniciarBotWhatsapp = () => {};
try {
  ({ iniciarBotWhatsapp } = require("./whatsapp-bot/bot"));
} catch (erro) {
  console.error("[whatsapp-bot] Não foi possível carregar o módulo do bot (site continua no ar):", erro.message);
}

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/produtos", produtosRouter);
app.use("/api/pedidos", pedidosRouter);
app.use("/api/admin", adminRouter);
app.use("/api/opcoes-quentinha", opcoesQuentinhaRouter);
app.use("/api/disponibilidade", disponibilidadeRouter);
app.use("/api/bairros-entrega", bairrosEntregaRouter);
app.use("/api/frete", freteRouter);
app.use("/api/telegram", telegramWebhookRouter);
app.use("/api/whatsapp-cardapio", whatsappCardapioRouter);

// Arquivos do site (cardápio, checkout, painel admin)
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🍱 Servidor rodando em http://localhost:${PORT}`);
  configurarWebhookTelegram();
  // Roda no mesmo processo do site — assim usa a mesma instância paga no
  // serviço de hospedagem em vez de precisar de uma segunda só pro bot.
  // Nunca derruba o servidor: se a configuração estiver incompleta ou a
  // conexão falhar, só desativa o bot e loga o motivo (ver whatsapp-bot/bot.js).
  iniciarBotWhatsapp();
});

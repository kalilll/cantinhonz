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
const { configurarWebhookTelegram } = require("./notificacoes");

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

// Arquivos do site (cardápio, checkout, painel admin)
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🍱 Servidor rodando em http://localhost:${PORT}`);
  configurarWebhookTelegram();
});

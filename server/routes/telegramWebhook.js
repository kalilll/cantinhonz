const express = require("express");
const { atualizarStatusPedido, ErroStatusPedido } = require("../pedidosService");
const { responderCliqueBotao } = require("../notificacoes");

const router = express.Router();

// Mapeia o texto do botão (callback_data) pro status que ele representa.
const ACAO_PARA_STATUS = {
  preparo: "em_preparo",
  saiu: "saiu_para_entrega",
  entregue: "entregue",
};

// O Telegram chama esta rota sempre que alguém interage com o bot (nesse
// caso, só nos importa quando alguém clica num botão das notificações).
router.post("/webhook", async (req, res) => {
  // Sempre responde 200 rápido — o Telegram para de tentar reenviar depois disso.
  res.sendStatus(200);

  try {
    const callback = req.body?.callback_query;
    if (!callback) return;

    const [acao, pedidoId] = (callback.data || "").split(":");
    const novoStatus = ACAO_PARA_STATUS[acao];

    if (!novoStatus || !pedidoId) {
      await responderCliqueBotao(callback.id, "Ação não reconhecida.");
      return;
    }

    try {
      await atualizarStatusPedido(pedidoId, novoStatus);
      await responderCliqueBotao(callback.id, "Status atualizado ✅");
    } catch (erro) {
      if (erro instanceof ErroStatusPedido) {
        await responderCliqueBotao(callback.id, erro.message);
      } else {
        throw erro;
      }
    }
  } catch (erro) {
    console.error("Erro no webhook do Telegram:", erro);
  }
});

module.exports = router;

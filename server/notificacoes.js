// Envia avisos por Telegram quando um pedido é pago (para a cozinha começar a
// preparar) e quando ele sai para entrega (com os dados do cliente para o
// entregador). Usa a API HTTP do Telegram diretamente, sem depender de
// bibliotecas extras — só precisa de um bot token e o(s) chat_id(s) de destino.
//
// Se as variáveis de ambiente não estiverem configuradas, a função só avisa
// no console e não quebra o resto do sistema (o pedido continua funcionando
// normalmente mesmo sem a notificação configurada).

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID_COZINHA = process.env.TELEGRAM_CHAT_ID_COZINHA;
const CHAT_ID_ENTREGA = process.env.TELEGRAM_CHAT_ID_ENTREGA || CHAT_ID_COZINHA;

function formatarPreco(valor) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function enviarMensagemTelegram(chatId, texto) {
  if (!TOKEN || !chatId) {
    console.log("[Telegram] Notificação não enviada (TELEGRAM_BOT_TOKEN/CHAT_ID não configurados). Mensagem seria:\n" + texto);
    return;
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        parse_mode: "HTML",
      }),
    });
    if (!resp.ok) {
      const erro = await resp.text();
      console.error("[Telegram] Erro ao enviar mensagem:", erro);
    }
  } catch (e) {
    console.error("[Telegram] Falha ao chamar a API do Telegram:", e.message);
  }
}

// Avisa a cozinha que um pedido foi pago e precisa começar a ser preparado.
async function notificarCozinha(pedido) {
  const itens = pedido.itens.map((i) => `• ${i.quantidade}× ${i.nome}`).join("\n");
  const texto =
    `🍱 <b>Novo pedido pago — #${pedido.id.slice(0, 8)}</b>\n\n` +
    `${itens}\n\n` +
    (pedido.cliente.observacoes ? `📝 Obs: ${pedido.cliente.observacoes}\n\n` : "") +
    `💰 Total: ${formatarPreco(pedido.total)}\n` +
    `👤 Cliente: ${pedido.cliente.nome} (${pedido.cliente.telefone})`;

  await enviarMensagemTelegram(CHAT_ID_COZINHA, texto);
}

// Avisa o entregador quando o pedido sai para entrega, com os dados necessários.
async function notificarEntregador(pedido) {
  const texto =
    `🛵 <b>Saiu para entrega — Pedido #${pedido.id.slice(0, 8)}</b>\n\n` +
    `👤 ${pedido.cliente.nome}\n` +
    `📞 ${pedido.cliente.telefone}\n` +
    `📍 ${pedido.cliente.endereco}\n` +
    (pedido.cliente.observacoes ? `📝 Obs: ${pedido.cliente.observacoes}\n` : "") +
    `💰 Total: ${formatarPreco(pedido.total)}` +
    (pedido.bairro ? `\n🏘️ Bairro: ${pedido.bairro.nome} (taxa ${formatarPreco(pedido.bairro.taxa)})` : "");

  await enviarMensagemTelegram(CHAT_ID_ENTREGA, texto);
}

module.exports = { notificarCozinha, notificarEntregador };

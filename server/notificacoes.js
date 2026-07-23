// Envia avisos por Telegram quando um pedido é pago (para a cozinha começar a
// preparar) e quando ele sai para entrega (com os dados do cliente para o
// entregador). Usa a API HTTP do Telegram diretamente, sem depender de
// bibliotecas extras — só precisa de um bot token e o(s) chat_id(s) de destino.
//
// As mensagens da cozinha e do entregador vêm com botões (ex: "Marcar como Em
// Preparo") que, quando clicados, avisam o servidor via webhook e atualizam o
// status do pedido sozinhos — sem precisar abrir o painel administrativo.
//
// Se as variáveis de ambiente não estiverem configuradas, as funções só avisam
// no console e não quebram o resto do sistema (o pedido continua funcionando
// normalmente mesmo sem a notificação configurada).

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID_COZINHA = process.env.TELEGRAM_CHAT_ID_COZINHA;
const CHAT_ID_ENTREGA = process.env.TELEGRAM_CHAT_ID_ENTREGA || CHAT_ID_COZINHA;

function formatarPreco(valor) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function linhaPagamento(pedido) {
  if (pedido.formaPagamento !== "dinheiro") {
    return "💳 Pago online (Pix/Cartão)";
  }
  if (pedido.pagamentoDinheiro?.trocoPara) {
    return (
      `💵 Pagamento em DINHEIRO na entrega\n` +
      `   Cliente vai pagar com: ${formatarPreco(pedido.pagamentoDinheiro.trocoPara)}\n` +
      `   Troco a levar: ${formatarPreco(pedido.pagamentoDinheiro.troco)}`
    );
  }
  return "💵 Pagamento em DINHEIRO na entrega (sem troco, valor exato)";
}

async function chamarApiTelegram(metodo, corpo) {
  if (!TOKEN) {
    console.log(`[Telegram] ${metodo} não enviado (TELEGRAM_BOT_TOKEN não configurado).`, corpo);
    return null;
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = await resp.json();
    if (!dados.ok) {
      console.error(`[Telegram] Erro em ${metodo}:`, dados.description);
      return null;
    }
    return dados.result;
  } catch (e) {
    console.error(`[Telegram] Falha ao chamar ${metodo}:`, e.message);
    return null;
  }
}

// Envia uma mensagem nova, com botões opcionais. Retorna {chatId, messageId}
// pra podermos editar essa mesma mensagem depois (quando o status mudar).
async function enviarMensagemTelegram(chatId, texto, botoes) {
  if (!chatId) return null;

  if (!TOKEN) {
    console.log("[Telegram] Notificação não enviada (TELEGRAM_CHAT_ID não configurado). Mensagem seria:\n" + texto);
    return null;
  }

  const resultado = await chamarApiTelegram("sendMessage", {
    chat_id: chatId,
    text: texto,
    parse_mode: "HTML",
    reply_markup: botoes ? { inline_keyboard: botoes } : undefined,
  });

  return resultado ? { chatId: resultado.chat.id, messageId: resultado.message_id } : null;
}

// Edita uma mensagem já enviada (usado quando o status muda, pra atualizar o
// texto e trocar/remover os botões da mensagem original).
async function editarMensagemTelegram(referencia, texto, botoes) {
  if (!referencia?.chatId || !referencia?.messageId) return;
  await chamarApiTelegram("editMessageText", {
    chat_id: referencia.chatId,
    message_id: referencia.messageId,
    text: texto,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: botoes || [] },
  });
}

// Precisa ser chamado sempre que um botão é clicado, ou o Telegram deixa o
// ícone de "carregando" preso no botão pro usuário.
async function responderCliqueBotao(callbackQueryId, texto) {
  await chamarApiTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: texto,
  });
}

// Registra a URL de webhook no Telegram, pra receber os cliques nos botões.
// Chamado uma vez quando o servidor sobe (se TOKEN e PUBLIC_URL existirem).
async function configurarWebhookTelegram() {
  if (!TOKEN || !process.env.PUBLIC_URL) return;
  const url = `${process.env.PUBLIC_URL}/api/telegram/webhook`;
  const resultado = await chamarApiTelegram("setWebhook", { url });
  if (resultado !== null) {
    console.log(`[Telegram] Webhook configurado: ${url}`);
  }
}

function textoBase(pedido) {
  const itens = pedido.itens.map((i) => `• ${i.quantidade}× ${i.nome}`).join("\n");
  return (
    `${itens}\n\n` +
    (pedido.cliente.observacoes ? `📝 Obs: ${pedido.cliente.observacoes}\n\n` : "") +
    `💰 Total: ${formatarPreco(pedido.total)}\n` +
    `${linhaPagamento(pedido)}\n` +
    `👤 Cliente: ${pedido.cliente.nome} (${pedido.cliente.telefone})`
  );
}

// Avisa a cozinha que um pedido foi pago (ou confirmado, no caso de dinheiro)
// e precisa começar a ser preparado. Retorna a referência da mensagem enviada
// (pra guardar no pedido e poder editar depois).
async function notificarCozinha(pedido) {
  const texto = `🍱 <b>Novo pedido — #${pedido.id.slice(0, 8)}</b>\n\n${textoBase(pedido)}`;
  const botoes = [[{ text: "🍳 Marcar como Em Preparo", callback_data: `preparo:${pedido.id}` }]];
  return enviarMensagemTelegram(CHAT_ID_COZINHA, texto, botoes);
}

// Avisa o entregador quando o pedido sai para entrega, com os dados necessários.
async function notificarEntregador(pedido) {
  const texto =
    `🛵 <b>Saiu para entrega — Pedido #${pedido.id.slice(0, 8)}</b>\n\n` +
    `👤 ${pedido.cliente.nome}\n` +
    `📞 ${pedido.cliente.telefone}\n` +
    `📍 ${pedido.cliente.endereco}\n` +
    (pedido.cliente.observacoes ? `📝 Obs: ${pedido.cliente.observacoes}\n` : "") +
    `💰 Total: ${formatarPreco(pedido.total)}\n` +
    `${linhaPagamento(pedido)}` +
    (pedido.bairro ? `\n🏘️ Bairro: ${pedido.bairro.nome} (taxa ${formatarPreco(pedido.bairro.taxa)})` : "") +
    (pedido.frete ? `\n📏 Distância: ${pedido.frete.distanciaKm} km (taxa ${formatarPreco(pedido.frete.taxa)})` : "");

  const botoes = [[{ text: "✅ Marcar como Entregue", callback_data: `entregue:${pedido.id}` }]];
  return enviarMensagemTelegram(CHAT_ID_ENTREGA, texto, botoes);
}

// Atualiza a mensagem da cozinha depois que o pedido avança de status
// (ex: quando vira "em preparo", troca o botão pelo de "saiu para entrega").
async function atualizarMensagemCozinha(pedido) {
  if (!pedido.telegram?.cozinha) return;
  const texto = `🍱 <b>Pedido #${pedido.id.slice(0, 8)}</b> — <i>${rotuloStatus(pedido.status)}</i>\n\n${textoBase(pedido)}`;

  let botoes = [];
  if (pedido.status === "pago") {
    botoes = [[{ text: "🍳 Marcar como Em Preparo", callback_data: `preparo:${pedido.id}` }]];
  } else if (pedido.status === "em_preparo") {
    botoes = [[{ text: "🛵 Marcar Saiu para Entrega", callback_data: `saiu:${pedido.id}` }]];
  }
  await editarMensagemTelegram(pedido.telegram.cozinha, texto, botoes);
}

// Atualiza a mensagem do entregador (ex: quando ele marca como entregue).
async function atualizarMensagemEntregador(pedido) {
  if (!pedido.telegram?.entrega) return;
  const texto = `🛵 <b>Pedido #${pedido.id.slice(0, 8)}</b> — <i>${rotuloStatus(pedido.status)}</i>`;
  const botoes = pedido.status === "saiu_para_entrega"
    ? [[{ text: "✅ Marcar como Entregue", callback_data: `entregue:${pedido.id}` }]]
    : [];
  await editarMensagemTelegram(pedido.telegram.entrega, texto, botoes);
}

function rotuloStatus(status) {
  const rotulos = {
    pago: "Confirmado",
    em_preparo: "Em preparo",
    saiu_para_entrega: "Saiu para entrega",
    entregue: "✅ Entregue",
  };
  return rotulos[status] || status;
}

module.exports = {
  notificarCozinha,
  notificarEntregador,
  atualizarMensagemCozinha,
  atualizarMensagemEntregador,
  responderCliqueBotao,
  configurarWebhookTelegram,
};

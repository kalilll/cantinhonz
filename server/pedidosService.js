// Ponto único que aplica uma mudança de status de pedido, seja ela feita pelo
// painel administrativo ou por um clique de botão no Telegram. Centralizar
// aqui evita que as duas vias fiquem dessincronizadas (ex: o painel mudar o
// status mas a mensagem do Telegram continuar com o botão antigo).

const db = require("./db");
const {
  notificarEntregador,
  atualizarMensagemCozinha,
  atualizarMensagemEntregador,
} = require("./notificacoes");

class ErroStatusPedido extends Error {}

const STATUS_VALIDOS = [
  "aguardando_pagamento",
  "pago",
  "em_preparo",
  "saiu_para_entrega",
  "entregue",
  "pagamento_recusado",
];

async function atualizarStatusPedido(pedidoId, novoStatus) {
  if (!STATUS_VALIDOS.includes(novoStatus)) {
    throw new ErroStatusPedido("Status inválido.");
  }

  const pedidos = db.getPedidos();
  const idx = pedidos.findIndex((p) => p.id === pedidoId);
  if (idx === -1) {
    throw new ErroStatusPedido("Pedido não encontrado.");
  }

  const statusAnterior = pedidos[idx].status;
  pedidos[idx].status = novoStatus;
  db.salvarPedidos(pedidos);
  const pedido = pedidos[idx];

  // Avisa o entregador só na primeira vez que o pedido vira "saiu para entrega"
  // (envia uma mensagem nova pra ele, com o botão de "Entregue").
  if (novoStatus === "saiu_para_entrega" && statusAnterior !== "saiu_para_entrega") {
    const referencia = await notificarEntregador(pedido);
    if (referencia) {
      pedido.telegram = { ...(pedido.telegram || {}), entrega: referencia };
      db.salvarPedidos(pedidos);
    }
  } else {
    // Mantém a mensagem do entregador em sincronia (ex: quando marcado como entregue).
    await atualizarMensagemEntregador(pedido);
  }

  // Mantém a mensagem da cozinha em sincronia com o status atual.
  await atualizarMensagemCozinha(pedido);

  return pedido;
}

module.exports = { atualizarStatusPedido, ErroStatusPedido };

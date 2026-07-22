const express = require("express");
const { v4: uuid } = require("uuid");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const db = require("../db");
const { exigirAdmin } = require("../middleware/auth");
const { validarECalcularMonte, ErroValidacaoMonte } = require("../monteQuentinha");
const { calcularDisponibilidadeEm } = require("../disponibilidadeHoje");
const { notificarCozinha, notificarEntregador } = require("../notificacoes");

const router = express.Router();

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// Cliente monta o pedido no carrinho e chama esta rota.
// O servidor recalcula o preço a partir do cardápio (nunca confia no preço vindo do front)
// e cria uma "preferência" de pagamento no Mercado Pago (Checkout Pro: aceita Pix e cartão).
router.post("/", async (req, res) => {
  try {
    const { itens, cliente } = req.body;

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "O carrinho está vazio." });
    }
    if (!cliente?.nome || !cliente?.telefone || !cliente?.endereco) {
      return res.status(400).json({ erro: "Nome, telefone e endereço são obrigatórios." });
    }

    const produtos = db.getProdutos();
    const opcoesQuentinha = db.getOpcoesQuentinha();
    const disponibilidadeHoje = calcularDisponibilidadeEm(
      new Date(),
      db.getDisponibilidadeSemanal(),
      db.getSubstituicoes()
    );

    // Taxa de entrega por bairro: o cliente escolhe o bairro no checkout, mas
    // o valor cobrado sempre vem da configuração do servidor, nunca do front-end.
    let bairro = null;
    const bairrosAtivos = db.getBairrosEntrega().filter((b) => b.ativo !== false);
    if (bairrosAtivos.length > 0) {
      bairro = bairrosAtivos.find((b) => b.id === cliente.bairroId);
      if (!bairro) {
        return res.status(400).json({ erro: "Selecione um bairro de entrega válido." });
      }
    }

    const itensPedido = [];
    let total = 0;

    for (const item of itens) {
      const quantidade = Math.max(1, Number(item.quantidade) || 1);

      if (item.tipo === "monte") {
        // Quentinha montada pelo cliente: recalcula preço a partir da configuração atual
        let resultado;
        try {
          resultado = validarECalcularMonte(item, opcoesQuentinha, disponibilidadeHoje);
        } catch (e) {
          if (e instanceof ErroValidacaoMonte) {
            return res.status(400).json({ erro: e.message });
          }
          throw e;
        }
        total += resultado.preco * quantidade;
        itensPedido.push({
          nome: resultado.nome,
          preco: resultado.preco,
          quantidade,
        });
      } else {
        // Item de prateleira (bebidas, extras avulsos do cardápio)
        const produto = produtos.find((p) => p.id === item.id);
        if (!produto || produto.disponivel === false) {
          return res.status(400).json({ erro: `Item indisponível: ${item.id}` });
        }
        total += produto.preco * quantidade;
        itensPedido.push({
          id: produto.id,
          nome: produto.nome,
          preco: produto.preco,
          quantidade,
        });
      }
    }

    if (bairro) {
      total += bairro.taxa;
    }

    const pedidoId = uuid();
    const pedido = {
      id: pedidoId,
      itens: itensPedido,
      bairro: bairro ? { id: bairro.id, nome: bairro.nome, taxa: bairro.taxa } : null,
      total: Number(total.toFixed(2)),
      cliente,
      status: "aguardando_pagamento",
      criadoEm: new Date().toISOString(),
    };

    const pedidos = db.getPedidos();
    pedidos.push(pedido);
    db.salvarPedidos(pedidos);

    // Cria a preferência de pagamento no Mercado Pago (Checkout Pro).
    // O cliente é redirecionado para "init_point" para pagar com Pix ou cartão.
    const itensParaPagamento = itensPedido.map((i) => ({
      title: i.nome,
      quantity: i.quantidade,
      unit_price: i.preco,
      currency_id: "BRL",
    }));
    if (bairro) {
      itensParaPagamento.push({
        title: `Taxa de entrega — ${bairro.nome}`,
        quantity: 1,
        unit_price: bairro.taxa,
        currency_id: "BRL",
      });
    }

    const preference = new Preference(mpClient);
    const resultado = await preference.create({
      body: {
        items: itensParaPagamento,
        external_reference: pedidoId,
        back_urls: {
          success: `${process.env.PUBLIC_URL}/pedido-confirmado.html?id=${pedidoId}`,
          pending: `${process.env.PUBLIC_URL}/pedido-confirmado.html?id=${pedidoId}`,
          failure: `${process.env.PUBLIC_URL}/checkout.html?erro=pagamento`,
        },
        auto_return: "approved",
        notification_url: `${process.env.PUBLIC_URL}/api/pedidos/webhook`,
      },
    });

    pedido.mpPreferenceId = resultado.id;
    db.salvarPedidos(pedidos);

    res.status(201).json({
      pedidoId,
      linkPagamento: resultado.init_point,
    });
  } catch (erro) {
    console.error("Erro ao criar pedido:", erro);
    res.status(500).json({ erro: "Não foi possível criar o pedido. Tente novamente." });
  }
});

// Consulta pública de status (usada na página de confirmação)
router.get("/:id", (req, res) => {
  const pedido = db.getPedidos().find((p) => p.id === req.params.id);
  if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
  res.json(pedido);
});

// Webhook do Mercado Pago: ele chama esta rota quando o pagamento muda de status.
router.post("/webhook", async (req, res) => {
  try {
    const paymentId = req.query["data.id"] || req.body?.data?.id;
    const tipo = req.query.type || req.body?.type;

    if (tipo === "payment" && paymentId) {
      const payment = new Payment(mpClient);
      const info = await payment.get({ id: paymentId });
      const pedidoId = info.external_reference;

      const pedidos = db.getPedidos();
      const idx = pedidos.findIndex((p) => p.id === pedidoId);
      if (idx !== -1) {
        const statusMap = {
          approved: "pago",
          pending: "aguardando_pagamento",
          rejected: "pagamento_recusado",
        };
        const statusAnterior = pedidos[idx].status;
        const novoStatus = statusMap[info.status] || info.status;
        pedidos[idx].status = novoStatus;
        pedidos[idx].mpPaymentId = paymentId;
        db.salvarPedidos(pedidos);

        // Avisa a cozinha só na primeira vez que o pedido vira "pago"
        // (o Mercado Pago pode reenviar a mesma notificação mais de uma vez).
        if (novoStatus === "pago" && statusAnterior !== "pago") {
          notificarCozinha(pedidos[idx]);
        }
      }
    }
    res.sendStatus(200);
  } catch (erro) {
    console.error("Erro no webhook do Mercado Pago:", erro);
    res.sendStatus(200); // sempre 200 para o MP não ficar reenviando indefinidamente
  }
});

// Admin: lista todos os pedidos (mais recentes primeiro)
router.get("/", exigirAdmin, (req, res) => {
  const pedidos = db.getPedidos().slice().reverse();
  res.json(pedidos);
});

// Admin: atualiza status do pedido manualmente (ex: "em preparo", "saiu para entrega", "entregue")
router.put("/:id/status", exigirAdmin, (req, res) => {
  const { status } = req.body;
  const pedidos = db.getPedidos();
  const idx = pedidos.findIndex((p) => p.id === req.params.id);

  if (idx === -1) return res.status(404).json({ erro: "Pedido não encontrado." });

  const statusAnterior = pedidos[idx].status;
  pedidos[idx].status = status;
  db.salvarPedidos(pedidos);

  // Avisa o entregador só na primeira vez que o pedido vira "saiu para entrega".
  if (status === "saiu_para_entrega" && statusAnterior !== "saiu_para_entrega") {
    notificarEntregador(pedidos[idx]);
  }

  res.json(pedidos[idx]);
});

module.exports = router;

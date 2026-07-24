const express = require("express");
const { v4: uuid } = require("uuid");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const db = require("../db");
const { exigirAdmin } = require("../middleware/auth");
const { validarECalcularMonte, ErroValidacaoMonte } = require("../monteQuentinha");
const { calcularDisponibilidadeEm } = require("../disponibilidadeHoje");
const { notificarCozinha } = require("../notificacoes");
const { calcularFretePorEndereco, ErroGeocodificacao } = require("../distancia");
const { atualizarStatusPedido, ErroStatusPedido } = require("../pedidosService");

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
    if (!cliente?.nome || !cliente?.telefone || !cliente?.rua || !cliente?.numero) {
      return res.status(400).json({ erro: "Nome, telefone, rua e número são obrigatórios." });
    }

    const formaPagamento = cliente.formaPagamento === "dinheiro" ? "dinheiro" : "online";

    // Monta o endereço completo a partir dos campos separados (rua, número,
    // ponto de referência opcional) — fica assim mais fácil de ler no painel
    // e nas notificações, sem perder a informação de cada parte.
    const endereco = `${cliente.rua}, ${cliente.numero}` + (cliente.referencia ? ` — ${cliente.referencia}` : "");

    const produtos = db.getProdutos();
    const opcoesQuentinha = db.getOpcoesQuentinha();
    const disponibilidadeHoje = calcularDisponibilidadeEm(
      new Date(),
      db.getDisponibilidadeSemanal(),
      db.getSubstituicoes()
    );

    // Taxa de entrega: pode ser por bairro (lista fixa) ou por distância (km),
    // dependendo do que estiver configurado no admin. O valor cobrado sempre
    // vem calculado aqui no servidor, nunca do front-end.
    const configEntrega = db.getConfigEntrega();
    let bairro = null;
    let frete = null;

    if (configEntrega.modo === "distancia") {
      const { cidadeReferencia } = configEntrega.distancia;
      const enderecoCompleto =
        `${cliente.rua}, ${cliente.numero}` +
        (cliente.bairroTexto ? ` - ${cliente.bairroTexto}` : "") +
        (cidadeReferencia ? `, ${cidadeReferencia}` : "");
      try {
        const resultado = await calcularFretePorEndereco(enderecoCompleto, configEntrega.distancia);
        if (!resultado.dentroDoRaio) {
          return res.status(400).json({
            erro: `Esse endereço está fora da nossa área de entrega (raio de até ${configEntrega.distancia.raioMaximoKm} km).`,
          });
        }
        frete = {
          tipo: "distancia",
          distanciaKm: resultado.distanciaKm,
          taxa: resultado.taxa,
        };
      } catch (e) {
        if (e instanceof ErroGeocodificacao) {
          return res.status(400).json({ erro: e.message });
        }
        throw e;
      }
    } else {
      const bairrosAtivos = db.getBairrosEntrega().filter((b) => b.ativo !== false);
      if (bairrosAtivos.length > 0) {
        bairro = bairrosAtivos.find((b) => b.id === cliente.bairroId);
        if (!bairro) {
          return res.status(400).json({ erro: "Selecione um bairro de entrega válido." });
        }
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
    if (frete) {
      total += frete.taxa;
    }
    total = Number(total.toFixed(2));

    // Pagamento em dinheiro na entrega: calcula o troco a partir do valor que
    // o cliente disse que tem em mãos (nunca confia em um "troco" pronto vindo do front).
    let pagamentoDinheiro = null;
    if (formaPagamento === "dinheiro") {
      if (cliente.trocoPara !== undefined && cliente.trocoPara !== null && cliente.trocoPara !== "") {
        const trocoPara = Number(cliente.trocoPara);
        if (Number.isNaN(trocoPara) || trocoPara < total) {
          return res.status(400).json({ erro: "O valor informado para troco é menor que o total do pedido." });
        }
        pagamentoDinheiro = { trocoPara, troco: Number((trocoPara - total).toFixed(2)) };
      } else {
        pagamentoDinheiro = { trocoPara: null, troco: 0 };
      }
    }

    const pedidoId = uuid();
    const pedido = {
      id: pedidoId,
      itens: itensPedido,
      bairro: bairro ? { id: bairro.id, nome: bairro.nome, taxa: bairro.taxa } : null,
      frete,
      total,
      cliente: {
        nome: cliente.nome,
        telefone: cliente.telefone,
        rua: cliente.rua,
        numero: cliente.numero,
        referencia: cliente.referencia || "",
        endereco,
        observacoes: cliente.observacoes || "",
      },
      formaPagamento,
      pagamentoDinheiro,
      // Pedidos em dinheiro não passam por confirmação de pagamento online:
      // já entram como "pago" (confirmado), liberando direto para a cozinha.
      status: formaPagamento === "dinheiro" ? "pago" : "aguardando_pagamento",
      criadoEm: new Date().toISOString(),
    };

    const pedidos = db.getPedidos();
    pedidos.push(pedido);
    db.salvarPedidos(pedidos);

    // Pedido em dinheiro: não usa o Mercado Pago, já está confirmado.
    // Avisa a cozinha imediatamente, já que não existe um webhook de pagamento pra isso.
    if (formaPagamento === "dinheiro") {
      const referencia = await notificarCozinha(pedido);
      if (referencia) {
        pedido.telegram = { cozinha: referencia };
        db.salvarPedidos(pedidos);
      }
      return res.status(201).json({ pedidoId, linkPagamento: null });
    }

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
    if (frete) {
      itensParaPagamento.push({
        title: `Taxa de entrega — ${frete.distanciaKm} km`,
        quantity: 1,
        unit_price: frete.taxa,
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
        // Sem boleto (não faz sentido pra um pedido de entrega rápida) e sem
        // parcelamento (pedido pequeno, cobrado sempre à vista). Pix, cartão
        // de crédito e cartão de débito continuam disponíveis normalmente.
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }],
          installments: 1,
        },
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
          const referencia = await notificarCozinha(pedidos[idx]);
          if (referencia) {
            pedidos[idx].telegram = { cozinha: referencia };
            db.salvarPedidos(pedidos);
          }
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
router.put("/:id/status", exigirAdmin, async (req, res) => {
  const { status } = req.body;
  try {
    const pedido = await atualizarStatusPedido(req.params.id, status);
    res.json(pedido);
  } catch (erro) {
    if (erro instanceof ErroStatusPedido) {
      return res.status(erro.message === "Pedido não encontrado." ? 404 : 400).json({ erro: erro.message });
    }
    console.error("Erro ao atualizar status do pedido:", erro);
    res.status(500).json({ erro: "Não foi possível atualizar o status." });
  }
});

module.exports = router;

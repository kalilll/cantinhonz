function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Etapas do pedido, em ordem. "aguardando_pagamento" só aparece pra quem pagou
// online; pedidos em dinheiro já começam direto em "pago".
const ETAPAS_ONLINE = [
  { status: "aguardando_pagamento", rotulo: "Aguardando pagamento", icone: "⏳" },
  { status: "pago", rotulo: "Pagamento confirmado", icone: "✓" },
  { status: "em_preparo", rotulo: "Em preparo", icone: "👨‍🍳" },
  { status: "saiu_para_entrega", rotulo: "Saiu para entrega", icone: "🛵" },
  { status: "entregue", rotulo: "Entregue", icone: "🍱" },
];
const ETAPAS_DINHEIRO = ETAPAS_ONLINE.filter((e) => e.status !== "aguardando_pagamento");

const STATUS_EM_ANDAMENTO = ["aguardando_pagamento", "pago", "em_preparo", "saiu_para_entrega"];

const conteudo = document.getElementById("conteudo");
const params = new URLSearchParams(window.location.search);
const pedidoId = params.get("id") || localStorage.getItem("quentinhas_ultimo_pedido");

let timeoutAtualizacao = null;

function montarLinhaDoTempo(pedido) {
  if (pedido.status === "pagamento_recusado") {
    return `<div class="aviso-erro">O pagamento foi recusado. <a href="checkout.html">Tente novamente</a>.</div>`;
  }

  const etapas = pedido.formaPagamento === "dinheiro" ? ETAPAS_DINHEIRO : ETAPAS_ONLINE;
  const indiceAtual = etapas.findIndex((e) => e.status === pedido.status);

  const passos = etapas.map((etapa, idx) => {
    let classe = "pendente";
    let conteudoBolinha = idx + 1;
    if (idx < indiceAtual) {
      classe = "concluida";
      conteudoBolinha = "✓";
    } else if (idx === indiceAtual) {
      classe = "atual";
      conteudoBolinha = etapa.icone;
    }
    return `
      <div class="etapa-tempo ${classe}">
        <div class="linha-conectora"></div>
        <div class="bolinha">${conteudoBolinha}</div>
        <div class="rotulo-etapa">${etapa.rotulo}</div>
      </div>
    `;
  }).join("");

  return `<div class="linha-do-tempo">${passos}</div>`;
}

function mensagemAtual(pedido) {
  const mensagens = {
    aguardando_pagamento: "Aguardando a confirmação do seu pagamento...",
    pago: pedido.formaPagamento === "dinheiro"
      ? "Pedido confirmado! Pague em dinheiro na entrega."
      : "Pagamento confirmado! Seu pedido já está sendo preparado.",
    em_preparo: "Sua quentinha está sendo preparada na cozinha.",
    saiu_para_entrega: "Seu pedido saiu para entrega! Já já chega aí.",
    entregue: "Pedido entregue. Bom apetite! 🍱",
    pagamento_recusado: "O pagamento foi recusado.",
  };
  return mensagens[pedido.status] || pedido.status;
}

function classeAviso(pedido) {
  if (pedido.status === "pagamento_recusado") return "aviso-erro";
  if (pedido.status === "aguardando_pagamento") return "aviso-erro";
  return "aviso-sucesso";
}

async function carregarPedido() {
  if (!pedidoId) {
    conteudo.innerHTML = `<div class="aviso-erro">Nenhum pedido encontrado.</div><a href="index.html">Voltar ao cardápio</a>`;
    return;
  }

  try {
    const resp = await fetch(`/api/pedidos/${pedidoId}`);
    if (!resp.ok) throw new Error();
    const pedido = await resp.json();

    let blocoPagamento = "";
    if (pedido.formaPagamento === "dinheiro") {
      blocoPagamento = pedido.pagamentoDinheiro?.trocoPara
        ? `<p style="font-size:14px; color:#55503f;">💵 Pagamento em dinheiro — levar troco para ${formatarPreco(pedido.pagamentoDinheiro.trocoPara)} (troco: <b>${formatarPreco(pedido.pagamentoDinheiro.troco)}</b>)</p>`
        : `<p style="font-size:14px; color:#55503f;">💵 Pagamento em dinheiro, sem necessidade de troco.</p>`;
    }

    conteudo.innerHTML = `
      <h2 style="font-family:var(--fonte-titulo); margin-top:0;">Pedido #${pedido.id.slice(0, 8)}</h2>
      <div class="${classeAviso(pedido)}">${mensagemAtual(pedido)}</div>
      ${montarLinhaDoTempo(pedido)}
      <p style="font-family:var(--fonte-ticket); font-size:22px; font-weight:700; margin: 16px 0;">
        ${formatarPreco(pedido.total)}
      </p>
      ${blocoPagamento}
      <p style="font-size:14px; color:#55503f;">
        Entrega em: ${pedido.cliente.endereco}${pedido.bairro ? ` — ${pedido.bairro.nome}` : ""}${pedido.frete ? ` — ${pedido.frete.distanciaKm} km` : ""}<br>
        Contato: ${pedido.cliente.telefone}
      </p>
      <p class="aviso-acompanhar">
        Salve esse link ou volte a esta página pra acompanhar seu pedido — a
        página atualiza sozinha enquanto o pedido está em andamento.
      </p>
      <a href="index.html" style="display:inline-block; margin-top: 10px; font-size:14px;">← Voltar ao cardápio</a>
    `;

    localStorage.setItem("quentinhas_ultimo_pedido", pedido.id);

    // Continua verificando automaticamente enquanto o pedido está em
    // andamento, pra a página atualizar sozinha sem precisar recarregar.
    clearTimeout(timeoutAtualizacao);
    if (STATUS_EM_ANDAMENTO.includes(pedido.status)) {
      const intervalo = pedido.status === "aguardando_pagamento" ? 4000 : 10000;
      timeoutAtualizacao = setTimeout(carregarPedido, intervalo);
    }
  } catch {
    conteudo.innerHTML = `<div class="aviso-erro">Não foi possível carregar o status do pedido.</div>`;
  }
}

carregarPedido();

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_TEXTO = {
  aguardando_pagamento: { texto: "Aguardando confirmação do pagamento...", classe: "aviso-erro" },
  pago: { texto: "Pagamento confirmado! Seu pedido já está sendo preparado.", classe: "aviso-sucesso" },
  pagamento_recusado: { texto: "O pagamento foi recusado. Tente novamente pelo cardápio.", classe: "aviso-erro" },
  em_preparo: { texto: "Seu pedido está em preparo na cozinha.", classe: "aviso-sucesso" },
  saiu_para_entrega: { texto: "Seu pedido saiu para entrega!", classe: "aviso-sucesso" },
  entregue: { texto: "Pedido entregue. Bom apetite! 🍱", classe: "aviso-sucesso" },
};

const conteudo = document.getElementById("conteudo");
const params = new URLSearchParams(window.location.search);
const pedidoId = params.get("id") || localStorage.getItem("quentinhas_ultimo_pedido");

async function carregarPedido() {
  if (!pedidoId) {
    conteudo.innerHTML = `<div class="aviso-erro">Nenhum pedido encontrado.</div><a href="index.html">Voltar ao cardápio</a>`;
    return;
  }

  try {
    const resp = await fetch(`/api/pedidos/${pedidoId}`);
    if (!resp.ok) throw new Error();
    const pedido = await resp.json();

    const info = STATUS_TEXTO[pedido.status] || { texto: pedido.status, classe: "aviso-erro" };

    conteudo.innerHTML = `
      <h2 style="font-family:var(--fonte-titulo); margin-top:0;">Pedido #${pedido.id.slice(0, 8)}</h2>
      <div class="${info.classe}">${info.texto}</div>
      <p style="font-family:var(--fonte-ticket); font-size:22px; font-weight:700; margin: 16px 0;">
        ${formatarPreco(pedido.total)}
      </p>
      <p style="font-size:14px; color:#55503f;">
        Entrega em: ${pedido.cliente.endereco}${pedido.bairro ? ` — ${pedido.bairro.nome}` : ""}<br>
        Contato: ${pedido.cliente.telefone}
      </p>
      <a href="index.html" style="display:inline-block; margin-top: 10px; font-size:14px;">← Voltar ao cardápio</a>
    `;

    // Se ainda está aguardando pagamento, verifica de novo em alguns segundos
    // (o Mercado Pago pode levar um instante para confirmar via webhook)
    if (pedido.status === "aguardando_pagamento") {
      setTimeout(carregarPedido, 4000);
    }
  } catch {
    conteudo.innerHTML = `<div class="aviso-erro">Não foi possível carregar o status do pedido.</div>`;
  }
}

carregarPedido();

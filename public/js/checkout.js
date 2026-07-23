// Página de checkout: usa as funções e dados compartilhados de carrinho.js
// (CHAVE_CARRINHO, formatarPreco, lerCarrinho, PRODUTOS_CARRINHO, etc.)

const areaErro = document.getElementById("area-erro");
const listaResumo = document.getElementById("lista-resumo");
const resumoTotal = document.getElementById("resumo-total");
const botaoPagar = document.getElementById("botao-pagar");
const campoBairroWrapper = document.getElementById("campo-bairro");
const campoBairro = document.getElementById("bairro");
const linhaTaxaEntrega = document.getElementById("linha-taxa-entrega");
const valorTaxaEntrega = document.getElementById("valor-taxa-entrega");
const statusFreteDistancia = document.getElementById("status-frete-distancia");
const campoRua = document.getElementById("rua");
const campoNumero = document.getElementById("numero");
const blocoTroco = document.getElementById("bloco-troco");
const campoTrocoPara = document.getElementById("troco-para");
const valorTrocoCalculado = document.getElementById("valor-troco-calculado");

let carrinho = lerCarrinho();
let bairros = [];
let modoEntrega = "bairro";
let freteCalculado = null; // { distanciaKm, taxa, dentroDoRaio } — só usado no modo distância
let totalAtual = 0;
let timeoutCalculoFrete = null;

function nomeEPrecoItem(item) {
  if (item.tipo === "monte") {
    return { nome: item.nome, preco: item.precoUnitario };
  }
  const produto = PRODUTOS_CARRINHO.find((p) => p.id === item.id);
  return produto ? { nome: produto.nome, preco: produto.preco } : null;
}

function bairroSelecionado() {
  return bairros.find((b) => b.id === campoBairro.value);
}

function formaPagamentoSelecionada() {
  return document.querySelector('input[name="forma-pagamento"]:checked')?.value || "online";
}

function renderizarResumo() {
  if (carrinho.length === 0) {
    areaErro.innerHTML = `<div class="aviso-erro">Sua comanda está vazia. <a href="index.html">Volte ao cardápio</a> para montar sua quentinha.</div>`;
    botaoPagar.disabled = true;
    listaResumo.innerHTML = "";
    resumoTotal.textContent = formatarPreco(0);
    return;
  }

  let total = 0;
  listaResumo.innerHTML = carrinho.map((item) => {
    const info = nomeEPrecoItem(item);
    if (!info) return "";
    const subtotal = info.preco * item.quantidade;
    total += subtotal;
    return `<div class="item-carrinho">
      <div class="nome-item">${item.quantidade}× ${info.nome}</div>
      <div class="preco-item">${formatarPreco(subtotal)}</div>
    </div>`;
  }).join("");

  let taxaEntrega = 0;
  if (modoEntrega === "bairro") {
    const bairro = bairroSelecionado();
    if (bairro) taxaEntrega = bairro.taxa;
  } else if (modoEntrega === "distancia" && freteCalculado?.dentroDoRaio) {
    taxaEntrega = freteCalculado.taxa;
  }

  if (taxaEntrega > 0) {
    linhaTaxaEntrega.style.display = "flex";
    valorTaxaEntrega.textContent = formatarPreco(taxaEntrega);
    total += taxaEntrega;
  } else {
    linhaTaxaEntrega.style.display = "none";
  }

  totalAtual = total;
  resumoTotal.textContent = formatarPreco(total);
  atualizarTroco();
}

async function carregarBairros() {
  try {
    const resp = await fetch("/api/bairros-entrega");
    bairros = await resp.json();

    if (bairros.length === 0) {
      campoBairroWrapper.style.display = "none";
      campoBairro.required = false;
      return;
    }

    campoBairro.innerHTML =
      `<option value="">Selecione seu bairro</option>` +
      bairros.map((b) => `<option value="${b.id}">${b.nome} — ${formatarPreco(b.taxa)}</option>`).join("");
  } catch {
    campoBairroWrapper.style.display = "none";
    campoBairro.required = false;
  }
}

campoBairro.addEventListener("change", renderizarResumo);

// ---- Modo de entrega por distância (km) ----
function agendarCalculoFrete() {
  clearTimeout(timeoutCalculoFrete);
  const rua = campoRua.value.trim();
  const bairro = campoBairro.value.trim();
  const numero = campoNumero.value.trim();

  if (rua.length < 3 || !numero) {
    freteCalculado = null;
    statusFreteDistancia.innerHTML = "";
    renderizarResumo();
    return;
  }

  statusFreteDistancia.innerHTML = `<span style="color:#8c8672;">Calculando taxa de entrega...</span>`;
  timeoutCalculoFrete = setTimeout(() => calcularFreteDistancia(rua, bairro, numero), 900);
}
  
async function calcularFreteDistancia(rua, bairro, numero) {
  try {
    const resp = await fetch("/api/frete/calcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endereco: `${rua}, ${bairro}, ${numero}` }),
    });
    const dados = await resp.json();

    if (!resp.ok) {
      freteCalculado = null;
      statusFreteDistancia.innerHTML = `<span style="color:var(--tijolo);">${dados.erro}</span>`;
      renderizarResumo();
      return;
    }

    freteCalculado = dados;
    if (!dados.dentroDoRaio) {
      statusFreteDistancia.innerHTML = `<span style="color:var(--tijolo);">Esse endereço está fora da nossa área de entrega (${dados.distanciaKm} km).</span>`;
    } else {
      statusFreteDistancia.innerHTML = `<span style="color:var(--verde-mata);">📏 ${dados.distanciaKm} km — taxa de entrega: ${formatarPreco(dados.taxa)}</span>`;
    }
    renderizarResumo();
  } catch {
    freteCalculado = null;
    statusFreteDistancia.innerHTML = `<span style="color:var(--tijolo);">Não foi possível calcular a taxa agora.</span>`;
  }
}

campoRua.addEventListener("input", agendarCalculoFrete);
campoNumero.addEventListener("input", agendarCalculoFrete);

// ---- Forma de pagamento (online x dinheiro) ----
function atualizarTroco() {
  const valorInformado = Number(campoTrocoPara.value);
  if (!campoTrocoPara.value || valorInformado <= 0) {
    valorTrocoCalculado.textContent = "";
    return;
  }
  if (valorInformado < totalAtual) {
    valorTrocoCalculado.innerHTML = `<span style="color:var(--tijolo);">O valor informado é menor que o total do pedido.</span>`;
    return;
  }
  const troco = valorInformado - totalAtual;
  valorTrocoCalculado.textContent = `Troco: ${formatarPreco(troco)}`;
}

document.querySelectorAll('input[name="forma-pagamento"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const dinheiro = formaPagamentoSelecionada() === "dinheiro";
    blocoTroco.style.display = dinheiro ? "block" : "none";
    botaoPagar.textContent = dinheiro ? "Confirmar pedido (pagar na entrega)" : "Ir para pagamento (Pix / Cartão)";
  });
});

campoTrocoPara.addEventListener("input", atualizarTroco);

async function carregarResumo() {
  await carregarProdutosParaCarrinho(); // popula PRODUTOS_CARRINHO (bebidas/extras)

  try {
    const resp = await fetch("/api/frete");
    const dados = await resp.json();
    modoEntrega = dados.modo || "bairro";
  } catch {
    modoEntrega = "bairro";
  }

  if (modoEntrega === "distancia") {
    campoBairroWrapper.style.display = "none";
    campoBairro.required = false;
  } else {
    await carregarBairros();
  }

  renderizarResumo();
}

document.getElementById("formulario-checkout").addEventListener("submit", async (e) => {
  e.preventDefault();
  areaErro.innerHTML = "";

  if (modoEntrega === "distancia" && freteCalculado && !freteCalculado.dentroDoRaio) {
    areaErro.innerHTML = `<div class="aviso-erro">Esse endereço está fora da nossa área de entrega.</div>`;
    return;
  }

  const formaPagamento = formaPagamentoSelecionada();
  const textoBotaoOriginal = botaoPagar.textContent;
  botaoPagar.disabled = true;
  botaoPagar.textContent = formaPagamento === "dinheiro" ? "Confirmando pedido..." : "Preparando pagamento...";

  const cliente = {
    nome: document.getElementById("nome").value.trim(),
    telefone: document.getElementById("telefone").value.trim(),
    rua: campoRua.value.trim(),
    numero: campoNumero.value.trim(),
    referencia: document.getElementById("referencia").value.trim(),
    observacoes: document.getElementById("observacoes").value.trim(),
    formaPagamento,
  };
  if (modoEntrega === "bairro" && bairros.length > 0) {
    cliente.bairroId = campoBairro.value;
  }
  if (formaPagamento === "dinheiro" && campoTrocoPara.value) {
    cliente.trocoPara = Number(campoTrocoPara.value);
  }

  try {
    const resp = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: carrinho, cliente }),
    });
    const dados = await resp.json();

    if (!resp.ok) {
      throw new Error(dados.erro || "Não foi possível criar o pedido.");
    }

    localStorage.setItem("quentinhas_ultimo_pedido", dados.pedidoId);
    localStorage.removeItem(CHAVE_CARRINHO);

    if (formaPagamento === "dinheiro") {
      // Pedido em dinheiro não passa pelo Mercado Pago: vai direto pra confirmação.
      window.location.href = `pedido-confirmado.html?id=${dados.pedidoId}`;
    } else {
      window.location.href = dados.linkPagamento;
    }
  } catch (erro) {
    areaErro.innerHTML = `<div class="aviso-erro">${erro.message}</div>`;
    botaoPagar.disabled = false;
    botaoPagar.textContent = textoBotaoOriginal;
  }
});

// Se veio de um pagamento que falhou, avisa o cliente
const params = new URLSearchParams(window.location.search);
if (params.get("erro") === "pagamento") {
  areaErro.innerHTML = `<div class="aviso-erro">O pagamento não foi concluído. Revise os dados e tente novamente.</div>`;
}

carregarResumo();

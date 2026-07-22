// Página de checkout: usa as funções e dados compartilhados de carrinho.js
// (CHAVE_CARRINHO, formatarPreco, lerCarrinho, PRODUTOS_CARRINHO, etc.)

const areaErro = document.getElementById("area-erro");
const listaResumo = document.getElementById("lista-resumo");
const resumoTotal = document.getElementById("resumo-total");
const botaoPagar = document.getElementById("botao-pagar");
const campoBairro = document.getElementById("bairro");
const linhaTaxaEntrega = document.getElementById("linha-taxa-entrega");
const valorTaxaEntrega = document.getElementById("valor-taxa-entrega");

let carrinho = lerCarrinho();
let bairros = [];

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

  const bairro = bairroSelecionado();
  if (bairro) {
    linhaTaxaEntrega.style.display = "flex";
    valorTaxaEntrega.textContent = formatarPreco(bairro.taxa);
    total += bairro.taxa;
  } else {
    linhaTaxaEntrega.style.display = "none";
  }

  resumoTotal.textContent = formatarPreco(total);
}

async function carregarBairros() {
  try {
    const resp = await fetch("/api/bairros-entrega");
    bairros = await resp.json();

    if (bairros.length === 0) {
      // Nenhum bairro cadastrado: não cobra taxa, esconde o campo.
      campoBairro.closest(".campo").style.display = "none";
      campoBairro.required = false;
      return;
    }

    campoBairro.innerHTML =
      `<option value="">Selecione seu bairro</option>` +
      bairros.map((b) => `<option value="${b.id}">${b.nome} — ${formatarPreco(b.taxa)}</option>`).join("");
  } catch {
    campoBairro.closest(".campo").style.display = "none";
    campoBairro.required = false;
  }
}

campoBairro.addEventListener("change", renderizarResumo);

async function carregarResumo() {
  await carregarProdutosParaCarrinho(); // popula PRODUTOS_CARRINHO (bebidas/extras)
  await carregarBairros();
  renderizarResumo();
}

document.getElementById("formulario-checkout").addEventListener("submit", async (e) => {
  e.preventDefault();
  areaErro.innerHTML = "";
  botaoPagar.disabled = true;
  botaoPagar.textContent = "Preparando pagamento...";

  const cliente = {
    nome: document.getElementById("nome").value.trim(),
    telefone: document.getElementById("telefone").value.trim(),
    endereco: document.getElementById("endereco").value.trim(),
    observacoes: document.getElementById("observacoes").value.trim(),
  };
  if (bairros.length > 0) {
    cliente.bairroId = campoBairro.value;
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
    window.location.href = dados.linkPagamento;
  } catch (erro) {
    areaErro.innerHTML = `<div class="aviso-erro">${erro.message}</div>`;
    botaoPagar.disabled = false;
    botaoPagar.textContent = "Ir para pagamento (Pix / Cartão)";
  }
});

// Se veio de um pagamento que falhou, avisa o cliente
const params = new URLSearchParams(window.location.search);
if (params.get("erro") === "pagamento") {
  areaErro.innerHTML = `<div class="aviso-erro">O pagamento não foi concluído. Revise os dados e tente novamente.</div>`;
}

carregarResumo();

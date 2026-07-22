// Lógica do carrinho ("comanda"), compartilhada entre o cardápio de bebidas/extras
// e o construtor de quentinhas. Cada item do carrinho tem um "tipo":
//   - "produto": item de prateleira (bebidas, extras), referencia um id do cardápio
//   - "monte": quentinha montada pelo cliente, já vem com nome e preço calculados
// O preço final sempre é conferido de novo no servidor ao fechar o pedido.

const CHAVE_CARRINHO = "quentinhas_carrinho";

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function gerarChave() {
  return (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`);
}

function lerCarrinho() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CARRINHO)) || [];
  } catch {
    return [];
  }
}

function gravarCarrinho(carrinho) {
  localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho));
  if (typeof renderizarCarrinho === "function") renderizarCarrinho();
}

function adicionarProdutoAoCarrinho(produtoId) {
  const carrinho = lerCarrinho();
  const existente = carrinho.find((i) => i.tipo === "produto" && i.id === produtoId);
  if (existente) {
    existente.quantidade += 1;
  } else {
    carrinho.push({ tipo: "produto", chave: produtoId, id: produtoId, quantidade: 1 });
  }
  gravarCarrinho(carrinho);
  if (typeof abrirCarrinho === "function") abrirCarrinho();
}

function adicionarMonteAoCarrinho({ tamanhoId, selecoes, nome, precoUnitario }) {
  const carrinho = lerCarrinho();
  carrinho.push({
    tipo: "monte",
    chave: gerarChave(),
    tamanhoId,
    selecoes,
    nome,
    precoUnitario,
    quantidade: 1,
  });
  gravarCarrinho(carrinho);
  if (typeof abrirCarrinho === "function") abrirCarrinho();
}

function alterarQuantidadeCarrinho(chave, delta) {
  let carrinho = lerCarrinho();
  const item = carrinho.find((i) => i.chave === chave);
  if (!item) return;
  item.quantidade += delta;
  if (item.quantidade <= 0) {
    carrinho = carrinho.filter((i) => i.chave !== chave);
  }
  gravarCarrinho(carrinho);
}

// Lista de produtos (bebidas/extras) usada para resolver nome/preço dos itens tipo "produto".
// Cada página que inclui este arquivo deve chamar carregarProdutosParaCarrinho() uma vez.
let PRODUTOS_CARRINHO = [];
async function carregarProdutosParaCarrinho() {
  try {
    const resp = await fetch("/api/produtos");
    PRODUTOS_CARRINHO = await resp.json();
  } catch {
    PRODUTOS_CARRINHO = [];
  }
  if (typeof renderizarCarrinho === "function") renderizarCarrinho();
}

function calcularTotalCarrinho() {
  const carrinho = lerCarrinho();
  let total = 0;
  for (const item of carrinho) {
    if (item.tipo === "monte") {
      total += item.precoUnitario * item.quantidade;
    } else {
      const produto = PRODUTOS_CARRINHO.find((p) => p.id === item.id);
      if (produto) total += produto.preco * item.quantidade;
    }
  }
  return total;
}

function renderizarCarrinho() {
  const carrinho = lerCarrinho();
  const listaEl = document.getElementById("lista-itens-carrinho");
  const totalEl = document.getElementById("valor-total");
  const contagemEl = document.getElementById("contagem-carrinho");
  const botaoFinalizarEl = document.getElementById("botao-finalizar");
  if (!listaEl) return; // página sem painel de carrinho

  const totalItens = carrinho.reduce((s, i) => s + i.quantidade, 0);
  if (contagemEl) contagemEl.textContent = totalItens;

  if (carrinho.length === 0) {
    listaEl.innerHTML = `<div class="vazio-carrinho">Sua comanda está vazia.<br>Monte uma quentinha ou escolha uma bebida 🍱</div>`;
    if (totalEl) totalEl.textContent = formatarPreco(0);
    if (botaoFinalizarEl) botaoFinalizarEl.disabled = true;
    return;
  }

  listaEl.innerHTML = carrinho.map((item) => {
    let nome, precoUnitario;
    if (item.tipo === "monte") {
      nome = item.nome;
      precoUnitario = item.precoUnitario;
    } else {
      const produto = PRODUTOS_CARRINHO.find((p) => p.id === item.id);
      if (!produto) return "";
      nome = produto.nome;
      precoUnitario = produto.preco;
    }
    const subtotal = precoUnitario * item.quantidade;
    return `
      <div class="item-carrinho">
        <div>
          <div class="nome-item">${nome}</div>
          <div class="controles-qtd">
            <button onclick="alterarQuantidadeCarrinho('${item.chave}', -1)" aria-label="Diminuir">−</button>
            <span>${item.quantidade}</span>
            <button onclick="alterarQuantidadeCarrinho('${item.chave}', 1)" aria-label="Aumentar">+</button>
          </div>
        </div>
        <div class="preco-item">${formatarPreco(subtotal)}</div>
      </div>
    `;
  }).join("");

  const total = calcularTotalCarrinho();
  if (totalEl) totalEl.textContent = formatarPreco(total);
  if (botaoFinalizarEl) botaoFinalizarEl.disabled = false;
}

function abrirCarrinho() {
  document.getElementById("painel-carrinho")?.classList.add("aberto");
  document.getElementById("fundo-escurecido")?.classList.add("visivel");
}
function fecharCarrinho() {
  document.getElementById("painel-carrinho")?.classList.remove("aberto");
  document.getElementById("fundo-escurecido")?.classList.remove("visivel");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("botao-abrir-carrinho")?.addEventListener("click", abrirCarrinho);
  document.getElementById("botao-fechar-carrinho")?.addEventListener("click", fecharCarrinho);
  document.getElementById("fundo-escurecido")?.addEventListener("click", fecharCarrinho);
  document.getElementById("botao-finalizar")?.addEventListener("click", () => {
    window.location.href = "checkout.html";
  });
  carregarProdutosParaCarrinho();
  renderizarCarrinho();
});

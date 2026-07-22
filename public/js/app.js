// Cardápio de bebidas e extras avulsos (a quentinha em si é montada em monte.html).
// A lógica do carrinho ("comanda") vive em carrinho.js, incluído antes deste arquivo.

let produtosCardapio = [];
let categoriaAtiva = "Todas";

const grade = document.getElementById("grade-cardapio");
const abas = document.getElementById("abas-categorias");

function renderizarAbas() {
  const categorias = ["Todas", ...new Set(produtosCardapio.map((p) => p.categoria))];
  abas.innerHTML = categorias.map((c) => `
    <button class="aba ${c === categoriaAtiva ? "ativa" : ""}" data-categoria="${c}">${c}</button>
  `).join("");

  abas.querySelectorAll(".aba").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriaAtiva = btn.dataset.categoria;
      renderizarAbas();
      renderizarGrade();
    });
  });
}

function renderizarGrade() {
  const lista = categoriaAtiva === "Todas"
    ? produtosCardapio
    : produtosCardapio.filter((p) => p.categoria === categoriaAtiva);

  if (lista.length === 0) {
    grade.innerHTML = `<p style="color:#8c8672">Nenhum item nessa categoria no momento.</p>`;
    return;
  }

  grade.innerHTML = lista.map((p) => `
    <article class="prato">
      <span class="categoria-tag">${p.categoria}</span>
      <h3>${p.nome}</h3>
      <p class="descricao">${p.descricao || ""}</p>
      <div class="rodape-prato">
        <span class="preco">${formatarPreco(p.preco)}</span>
        <button class="botao-adicionar" onclick="adicionarProdutoAoCarrinho('${p.id}')">Adicionar</button>
      </div>
    </article>
  `).join("");
}

async function carregarCardapio() {
  try {
    const resp = await fetch("/api/produtos");
    produtosCardapio = await resp.json();
    renderizarAbas();
    renderizarGrade();
  } catch (e) {
    grade.innerHTML = `<p class="aviso-erro">Não foi possível carregar o cardápio agora. Atualize a página em instantes.</p>`;
  }
}

carregarCardapio();

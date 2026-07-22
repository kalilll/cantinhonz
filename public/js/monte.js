// Construtor de quentinha: cliente escolhe tamanho + itens de cada grupo,
// respeitando os limites de cada grupo (que variam por tamanho) e vendo o
// preço atualizar em tempo real. O preço final é sempre recalculado no
// servidor ao fechar o pedido (ver server/monteQuentinha.js).

let config = { tamanhos: [], grupos: [] };
let tamanhoSelecionado = null;
let selecoes = {}; // { grupoId: [itemId, itemId, ...] }

const elSelecaoTamanho = document.getElementById("selecao-tamanho");
const elGrupos = document.getElementById("grupos-montagem");
const elTotal = document.getElementById("total-monte");
const elBotaoAdicionar = document.getElementById("botao-adicionar-monte");
const elErro = document.getElementById("area-erro");

function limiteDoGrupo(grupo) {
  if (!tamanhoSelecionado) return 0;
  return grupo.limites?.[tamanhoSelecionado] ?? 0;
}

function calcularTotal() {
  const tamanho = config.tamanhos.find((t) => t.id === tamanhoSelecionado);
  if (!tamanho) return 0;
  let total = tamanho.preco;

  for (const grupo of config.grupos) {
    const escolhidos = selecoes[grupo.id] || [];
    if (escolhidos.length === 0) continue;

    if (grupo.tipo === "adicional") {
      for (const itemId of escolhidos) {
        const item = grupo.itens.find((i) => i.id === itemId);
        if (item) total += item.precoExtra || 0;
      }
    } else if (grupo.tipo === "inclusa") {
      // Os primeiros "limite" escolhidos (na ordem em que foram clicados) são
      // grátis; o que passar disso cobra o precoExtra do próprio item.
      const limite = limiteDoGrupo(grupo);
      escolhidos.forEach((itemId, idx) => {
        if (idx < limite) return;
        const item = grupo.itens.find((i) => i.id === itemId);
        if (item) total += item.precoExtra || 0;
      });
    }
  }
  return total;
}

function montarNomeResumo() {
  const tamanho = config.tamanhos.find((t) => t.id === tamanhoSelecionado);
  const partes = [];
  for (const grupo of config.grupos) {
    const escolhidos = selecoes[grupo.id] || [];
    if (escolhidos.length === 0) continue;
    const limite = grupo.tipo === "inclusa" ? limiteDoGrupo(grupo) : null;

    const nomes = escolhidos.map((id, idx) => {
      const item = grupo.itens.find((i) => i.id === id);
      if (!item) return null;
      const passouDoLimite = limite !== null && idx >= limite;
      return passouDoLimite ? `${item.nome} (extra)` : item.nome;
    }).filter(Boolean);

    partes.push(grupo.tipo === "adicional" ? `+ ${nomes.join(", ")}` : nomes.join(", "));
  }
  return `Quentinha ${tamanho?.nome || ""}${partes.length ? " — " + partes.join("; ") : ""}`;
}

function selecionarTamanho(id) {
  tamanhoSelecionado = id;
  renderizarTudo();
}

function alternarItem(grupo, itemId) {
  const escolhidos = selecoes[grupo.id] || [];
  const jaEscolhido = escolhidos.includes(itemId);

  if (jaEscolhido) {
    selecoes[grupo.id] = escolhidos.filter((id) => id !== itemId);
  } else {
    // Não bloqueia mais ao atingir o limite: o item extra só passa a
    // aparecer com o preço adicional (ver renderizarGrupos/calcularTotal).
    selecoes[grupo.id] = [...escolhidos, itemId];
  }
  renderizarTudo();
}

function renderizarSelecaoTamanho() {
  elSelecaoTamanho.innerHTML = config.tamanhos.map((t) => `
    <div class="cartao-tamanho ${t.id === tamanhoSelecionado ? "selecionado" : ""}" data-tamanho="${t.id}">
      <div class="nome-tamanho">${t.nome}</div>
      <div class="preco-tamanho">${formatarPreco(t.preco)}</div>
    </div>
  `).join("");

  elSelecaoTamanho.querySelectorAll(".cartao-tamanho").forEach((el) => {
    el.addEventListener("click", () => selecionarTamanho(el.dataset.tamanho));
  });
}

function renderizarGrupos() {
  if (!tamanhoSelecionado) {
    elGrupos.innerHTML = `<p style="color:#8c8672">Escolha um tamanho para começar a montar sua quentinha.</p>`;
    return;
  }

  elGrupos.innerHTML = config.grupos.map((grupo) => {
    const escolhidos = selecoes[grupo.id] || [];
    const limite = grupo.tipo === "inclusa" ? limiteDoGrupo(grupo) : null;
    const dentroDoLimite = limite !== null && escolhidos.length <= limite;

    return `
      <div class="grupo-montagem">
        <div class="cabecalho-grupo">
          <h3>${grupo.nome}</h3>
          <span class="contador-grupo ${!dentroDoLimite ? "completo" : ""}">
            ${grupo.tipo === "inclusa" ? `${Math.min(escolhidos.length, limite)}/${limite} incluídos${escolhidos.length > limite ? ` + ${escolhidos.length - limite} extra` : ""}` : `${escolhidos.length} escolhido(s)`}
          </span>
        </div>
        <div class="grade-itens-grupo">
          ${grupo.itens.map((item) => {
            const posicao = escolhidos.indexOf(item.id);
            const marcado = posicao !== -1;
            // Um item aparece como "extra" (cobrando) se: é adicional, OU é
            // inclusa mas foi escolhido depois que o limite grátis já foi preenchido.
            const ehExtra = grupo.tipo === "adicional" || (marcado && limite !== null && posicao >= limite);
            return `
              <div class="opcao-item ${marcado ? "marcado" : ""}"
                   data-grupo="${grupo.id}" data-item="${item.id}">
                <span><span class="marca-check">${marcado ? "✓" : ""}</span> ${item.nome}</span>
                ${ehExtra ? `<span class="preco-extra-item">+ ${formatarPreco(item.precoExtra || 0)}</span>` : (grupo.tipo === "inclusa" && marcado ? `<span class="preco-extra-item incluso">incluso</span>` : "")}
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  elGrupos.querySelectorAll(".opcao-item").forEach((el) => {
    el.addEventListener("click", () => {
      const grupo = config.grupos.find((g) => g.id === el.dataset.grupo);
      alternarItem(grupo, el.dataset.item);
    });
  });
}

function renderizarTotal() {
  elTotal.textContent = formatarPreco(calcularTotal());
  elBotaoAdicionar.disabled = !tamanhoSelecionado;
}

function renderizarTudo() {
  renderizarSelecaoTamanho();
  renderizarGrupos();
  renderizarTotal();
}

elBotaoAdicionar.addEventListener("click", () => {
  if (!tamanhoSelecionado) return;

  adicionarMonteAoCarrinho({
    tamanhoId: tamanhoSelecionado,
    selecoes: JSON.parse(JSON.stringify(selecoes)),
    nome: montarNomeResumo(),
    precoUnitario: calcularTotal(),
  });

  // Reseta a montagem para o cliente poder pedir outra quentinha, se quiser
  selecoes = {};
  renderizarTudo();

  elErro.innerHTML = `<div class="aviso-sucesso">Quentinha adicionada à comanda! Pode montar outra ou fechar o pedido.</div>`;
  setTimeout(() => { elErro.innerHTML = ""; }, 3500);
});

async function carregarOpcoes() {
  try {
    const resp = await fetch("/api/opcoes-quentinha");
    config = await resp.json();
    if (config.tamanhos.length > 0) {
      tamanhoSelecionado = config.tamanhos[0].id;
    }
    renderizarTudo();
  } catch (e) {
    elGrupos.innerHTML = `<p class="aviso-erro">Não foi possível carregar as opções agora. Atualize a página em instantes.</p>`;
  }
}

carregarOpcoes();

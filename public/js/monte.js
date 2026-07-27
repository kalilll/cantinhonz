// Construtor de quentinha: cliente escolhe tamanho + itens de cada grupo,
// respeitando os limites de cada grupo (que variam por tamanho) e vendo o
// preço atualizar em tempo real. O preço final é sempre recalculado no
// servidor ao fechar o pedido (ver server/monteQuentinha.js).
//
// Cada grupo pode se comportar de duas formas (configurado no admin):
// - "multipla": clica pra marcar vários itens (padrão). Se o grupo for
//   "contável", cada item ganha um contador +/- pra pedir mais de uma vez.
// - "unica": vira uma escolha em rádio (só 1 item do grupo por vez). Se não
//   for obrigatório, tem uma opção "Nenhum".

let config = { tamanhos: [], grupos: [] };
let tamanhoSelecionado = null;
let selecoes = {}; // { grupoId: [itemId, itemId, ...] } — pode repetir item se "contável"

const elSelecaoTamanho = document.getElementById("selecao-tamanho");
const elGrupos = document.getElementById("grupos-montagem");
const elTotal = document.getElementById("total-monte");
const elBotaoAdicionar = document.getElementById("botao-adicionar-monte");
const elErro = document.getElementById("area-erro");

function limiteDoGrupo(grupo) {
  if (!tamanhoSelecionado) return 0;
  return grupo.limites?.[tamanhoSelecionado] ?? 0;
}

function contarOcorrencias(lista, itemId) {
  return lista.filter((id) => id === itemId).length;
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
      // Os primeiros "limite" escolhidos (na ordem em que foram adicionados) são
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

    // Agrupa por item pra mostrar "2× Arroz branco" em vez de repetir o nome
    const contagem = new Map();
    escolhidos.forEach((id, idx) => {
      const item = grupo.itens.find((i) => i.id === id);
      if (!item) return;
      const extra = limite !== null && idx >= limite;
      const chave = `${item.nome}${extra ? " (extra)" : ""}`;
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    });
    const nomes = [...contagem.entries()].map(([nome, qtd]) => (qtd > 1 ? `${qtd}× ${nome}` : nome));

    partes.push(grupo.tipo === "adicional" ? `+ ${nomes.join(", ")}` : nomes.join(", "));
  }
  return `Quentinha ${tamanho?.nome || ""}${partes.length ? " — " + partes.join("; ") : ""}`;
}

function selecionarTamanho(id) {
  tamanhoSelecionado = id;
  renderizarTudo();
}

// ---- Grupos de múltipla escolha (com ou sem contador) ----
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

function alterarContador(grupo, itemId, delta) {
  const escolhidos = selecoes[grupo.id] || [];
  if (delta > 0) {
    selecoes[grupo.id] = [...escolhidos, itemId];
  } else {
    const posicao = escolhidos.lastIndexOf(itemId);
    if (posicao !== -1) {
      selecoes[grupo.id] = escolhidos.slice(0, posicao).concat(escolhidos.slice(posicao + 1));
    }
  }
  renderizarTudo();
}

// ---- Grupos de escolha única (rádio) ----
function selecionarUnico(grupo, itemId) {
  // itemId === null representa a opção "Nenhum"
  selecoes[grupo.id] = itemId ? [itemId] : [];
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

function renderizarGrupoMultipla(grupo, escolhidos, limite) {
  const dentroDoLimite = limite === null || escolhidos.length <= limite;

  const contador = `
    <span class="contador-grupo ${!dentroDoLimite ? "completo" : ""}">
      ${limite !== null ? `${Math.min(escolhidos.length, limite)}/${limite} incluídos${escolhidos.length > limite ? ` + ${escolhidos.length - limite} extra` : ""}` : `${escolhidos.length} escolhido(s)`}
    </span>
  `;

  const itensHtml = grupo.itens.map((item) => {
    if (grupo.contavel) {
      const qtd = contarOcorrencias(escolhidos, item.id);
      // Um item conta como "extra" se pelo menos uma das unidades escolhidas
      // passou do limite grátis (ou seja, se a posição da última unidade >= limite).
      const ultimaPosicao = escolhidos.lastIndexOf(item.id);
      const algumaUnidadeExtra = qtd > 0 && limite !== null && ultimaPosicao >= limite;
      return `
        <div class="opcao-item ${qtd > 0 ? "marcado" : ""}">
          <span>${item.nome}
            ${algumaUnidadeExtra ? `<span class="preco-extra-item">+ ${formatarPreco(item.precoExtra || 0)} cada extra</span>` : (grupo.tipo === "inclusa" && qtd > 0 ? `<span class="preco-extra-item incluso">incluso</span>` : (grupo.tipo === "adicional" ? `<span class="preco-extra-item">+ ${formatarPreco(item.precoExtra || 0)}</span>` : ""))}
          </span>
          <span class="contador-stepper" data-grupo="${grupo.id}" data-item="${item.id}">
            <button type="button" class="botao-stepper" data-delta="-1" ${qtd === 0 ? "disabled" : ""}>−</button>
            <span class="valor-stepper">${qtd}</span>
            <button type="button" class="botao-stepper" data-delta="1">+</button>
          </span>
        </div>
      `;
    }

    const posicao = escolhidos.indexOf(item.id);
    const marcado = posicao !== -1;
    const ehExtra = grupo.tipo === "adicional" || (marcado && limite !== null && posicao >= limite);
    return `
      <div class="opcao-item ${marcado ? "marcado" : ""}" data-grupo="${grupo.id}" data-item="${item.id}">
        <span><span class="marca-check">${marcado ? "✓" : ""}</span> ${item.nome}</span>
        ${ehExtra ? `<span class="preco-extra-item">+ ${formatarPreco(item.precoExtra || 0)}</span>` : (grupo.tipo === "inclusa" && marcado ? `<span class="preco-extra-item incluso">incluso</span>` : "")}
      </div>
    `;
  }).join("");

  return `
    <div class="grupo-montagem">
      <div class="cabecalho-grupo">
        <h3>${grupo.nome}</h3>
        ${contador}
      </div>
      <div class="grade-itens-grupo">${itensHtml}</div>
    </div>
  `;
}

function renderizarGrupoUnica(grupo, escolhidos, limite) {
  const idEscolhido = escolhidos[0] || null;
  // Com escolha única, o item marcado é sempre grátis se o limite do grupo
  // for pelo menos 1; senão, qualquer escolha já cobra o preço do item.
  const sempreGratis = grupo.tipo === "inclusa" && limite >= 1;

  const opcoes = [];
  if (!grupo.obrigatorio) {
    opcoes.push(`
      <label class="opcao-radio ${!idEscolhido ? "marcado" : ""}">
        <input type="radio" name="radio-${grupo.id}" ${!idEscolhido ? "checked" : ""} data-grupo="${grupo.id}" data-item="">
        <span>Nenhum</span>
      </label>
    `);
  }
  for (const item of grupo.itens) {
    const marcado = idEscolhido === item.id;
    const mostrarPreco = grupo.tipo === "adicional" || !sempreGratis;
    opcoes.push(`
      <label class="opcao-radio ${marcado ? "marcado" : ""}">
        <input type="radio" name="radio-${grupo.id}" ${marcado ? "checked" : ""} data-grupo="${grupo.id}" data-item="${item.id}">
        <span>${item.nome}</span>
        ${mostrarPreco ? `<span class="preco-extra-item">+ ${formatarPreco(item.precoExtra || 0)}</span>` : `<span class="preco-extra-item incluso">incluso</span>`}
      </label>
    `);
  }

  return `
    <div class="grupo-montagem">
      <div class="cabecalho-grupo">
        <h3>${grupo.nome}</h3>
        <span class="contador-grupo">${grupo.obrigatorio ? "obrigatório" : "opcional"}</span>
      </div>
      <div class="grade-radios-grupo">${opcoes.join("")}</div>
    </div>
  `;
}

function renderizarGrupos() {
  if (!tamanhoSelecionado) {
    elGrupos.innerHTML = `<p style="color:#8c8672">Escolha um tamanho para começar a montar sua quentinha.</p>`;
    return;
  }

  elGrupos.innerHTML = config.grupos.map((grupo) => {
    const escolhidos = selecoes[grupo.id] || [];
    const limite = grupo.tipo === "inclusa" ? limiteDoGrupo(grupo) : null;

    return grupo.modoSelecao === "unica"
      ? renderizarGrupoUnica(grupo, escolhidos, limite)
      : renderizarGrupoMultipla(grupo, escolhidos, limite);
  }).join("");

  // Clique nos itens de grupos múltiplos (sem contador)
  elGrupos.querySelectorAll(".opcao-item[data-grupo]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".contador-stepper")) return;
      const grupo = config.grupos.find((g) => g.id === el.dataset.grupo);
      alternarItem(grupo, el.dataset.item);
    });
  });

  // Botões +/- dos grupos contáveis
  elGrupos.querySelectorAll(".contador-stepper").forEach((el) => {
    el.querySelectorAll(".botao-stepper").forEach((btn) => {
      btn.addEventListener("click", () => {
        const grupo = config.grupos.find((g) => g.id === el.dataset.grupo);
        alterarContador(grupo, el.dataset.item, Number(btn.dataset.delta));
      });
    });
  });

  // Rádios dos grupos de escolha única
  elGrupos.querySelectorAll('input[type="radio"][data-grupo]').forEach((el) => {
    el.addEventListener("change", () => {
      const grupo = config.grupos.find((g) => g.id === el.dataset.grupo);
      selecionarUnico(grupo, el.dataset.item || null);
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

  // Confere grupos de escolha única obrigatórios antes de deixar adicionar
  for (const grupo of config.grupos) {
    if (grupo.modoSelecao === "unica" && grupo.obrigatorio && (selecoes[grupo.id] || []).length === 0) {
      elErro.innerHTML = `<div class="aviso-erro">Escolha uma opção em "${grupo.nome}" antes de adicionar.</div>`;
      setTimeout(() => { elErro.innerHTML = ""; }, 3500);
      return;
    }
  }

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

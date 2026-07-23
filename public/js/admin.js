const CHAVE_TOKEN = "quentinhas_admin_token";

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getToken() {
  return localStorage.getItem(CHAVE_TOKEN);
}

async function chamarApi(caminho, opcoes = {}) {
  const resp = await fetch(caminho, {
    ...opcoes,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opcoes.headers || {}),
    },
  });
  if (resp.status === 401) {
    localStorage.removeItem(CHAVE_TOKEN);
    mostrarLogin();
    throw new Error("Sessão expirada.");
  }
  return resp;
}

const telaLogin = document.getElementById("tela-login");
const painelAdmin = document.getElementById("painel-admin");
const botaoSair = document.getElementById("botao-sair");

function mostrarLogin() {
  telaLogin.style.display = "block";
  painelAdmin.style.display = "none";
  botaoSair.style.display = "none";
}
function mostrarPainel() {
  telaLogin.style.display = "none";
  painelAdmin.style.display = "block";
  botaoSair.style.display = "inline-flex";
  carregarPedidos();
  carregarProdutos();
  carregarConfigMonte().then(() => inicializarAbaSemana());
  carregarBairros();
  carregarConfigEntrega();
}

document.getElementById("formulario-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const erroEl = document.getElementById("erro-login");
  erroEl.innerHTML = "";

  const usuario = document.getElementById("usuario").value.trim();
  const senha = document.getElementById("senha").value;

  try {
    const resp = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, senha }),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Erro ao entrar.");

    localStorage.setItem(CHAVE_TOKEN, dados.token);
    mostrarPainel();
  } catch (erro) {
    erroEl.innerHTML = `<div class="aviso-erro">${erro.message}</div>`;
  }
});

botaoSair.addEventListener("click", () => {
  localStorage.removeItem(CHAVE_TOKEN);
  mostrarLogin();
});

// ---- Abas ----
document.querySelectorAll(".abas-admin button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".abas-admin button").forEach((b) => b.classList.remove("ativa"));
    btn.classList.add("ativa");
    const aba = btn.dataset.aba;
    document.getElementById("secao-pedidos").style.display = aba === "pedidos" ? "block" : "none";
    document.getElementById("secao-monte").style.display = aba === "monte" ? "block" : "none";
    document.getElementById("secao-semana").style.display = aba === "semana" ? "block" : "none";
    document.getElementById("secao-entrega").style.display = aba === "entrega" ? "block" : "none";
    document.getElementById("secao-cardapio").style.display = aba === "cardapio" ? "block" : "none";
  });
});

// ---- Pedidos ----
const OPCOES_STATUS = ["aguardando_pagamento", "pago", "em_preparo", "saiu_para_entrega", "entregue", "pagamento_recusado"];

function formatarPagamento(pedido) {
  if (pedido.formaPagamento !== "dinheiro") {
    return "💳 Online";
  }
  if (pedido.pagamentoDinheiro?.trocoPara) {
    return `💵 Dinheiro<br><small>Troco p/ ${formatarPreco(pedido.pagamentoDinheiro.trocoPara)} (troco: ${formatarPreco(pedido.pagamentoDinheiro.troco)})</small>`;
  }
  return "💵 Dinheiro<br><small>sem troco</small>";
}

async function carregarPedidos() {
  const corpo = document.getElementById("corpo-tabela-pedidos");
  try {
    const resp = await chamarApi("/api/pedidos");
    const pedidos = await resp.json();

    if (pedidos.length === 0) {
      corpo.innerHTML = `<tr><td colspan="6">Nenhum pedido ainda.</td></tr>`;
      return;
    }

    corpo.innerHTML = pedidos.map((p) => `
      <tr>
        <td>#${p.id.slice(0, 8)}<br><small>${new Date(p.criadoEm).toLocaleString("pt-BR")}</small></td>
        <td>${p.cliente.nome}<br><small>${p.cliente.telefone}</small><br><small>${p.cliente.endereco}${p.bairro ? ` — ${p.bairro.nome}` : ""}${p.frete ? ` — ${p.frete.distanciaKm} km` : ""}</small></td>
        <td>${p.itens.map((i) => `${i.quantidade}× ${i.nome}`).join("<br>")}</td>
        <td>${formatarPreco(p.total)}</td>
        <td>${formatarPagamento(p)}</td>
        <td>
          <select data-id="${p.id}" class="seletor-status">
            ${OPCOES_STATUS.map((s) => `<option value="${s}" ${s === p.status ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}
          </select>
        </td>
      </tr>
    `).join("");

    corpo.querySelectorAll(".seletor-status").forEach((sel) => {
      sel.addEventListener("change", async () => {
        await chamarApi(`/api/pedidos/${sel.dataset.id}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: sel.value }),
        });
      });
    });
  } catch {
    corpo.innerHTML = `<tr><td colspan="5">Erro ao carregar pedidos.</td></tr>`;
  }
}

document.getElementById("botao-atualizar-pedidos").addEventListener("click", carregarPedidos);

// ---- Cardápio (produtos) ----
async function carregarProdutos() {
  const corpo = document.getElementById("corpo-tabela-produtos");
  try {
    const resp = await chamarApi("/api/produtos/todos");
    const produtos = await resp.json();

    if (produtos.length === 0) {
      corpo.innerHTML = `<tr><td colspan="5">Nenhum item cadastrado.</td></tr>`;
      return;
    }

    corpo.innerHTML = produtos.map((p) => `
      <tr>
        <td>${p.nome}<br><small>${p.descricao || ""}</small></td>
        <td>${p.categoria}</td>
        <td>${formatarPreco(p.preco)}</td>
        <td>${p.disponivel !== false ? "Sim" : "Não"}</td>
        <td>
          <button class="botao-icone" data-editar="${p.id}">Editar</button>
          <button class="botao-icone perigo" data-excluir="${p.id}">Excluir</button>
        </td>
      </tr>
    `).join("");

    corpo.querySelectorAll("[data-editar]").forEach((btn) => {
      btn.addEventListener("click", () => abrirModalProduto(produtos.find((p) => p.id === btn.dataset.editar)));
    });
    corpo.querySelectorAll("[data-excluir]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Excluir este item do cardápio?")) return;
        await chamarApi(`/api/produtos/${btn.dataset.excluir}`, { method: "DELETE" });
        carregarProdutos();
      });
    });
  } catch {
    corpo.innerHTML = `<tr><td colspan="5">Erro ao carregar cardápio.</td></tr>`;
  }
}

const modalProduto = document.getElementById("modal-produto");
const fundoModal = document.getElementById("fundo-modal");

function abrirModalProduto(produto = null) {
  document.getElementById("titulo-modal").textContent = produto ? "Editar item" : "Novo item";
  document.getElementById("produto-id").value = produto?.id || "";
  document.getElementById("produto-nome").value = produto?.nome || "";
  document.getElementById("produto-descricao").value = produto?.descricao || "";
  document.getElementById("produto-preco").value = produto?.preco ?? "";
  document.getElementById("produto-categoria").value = produto?.categoria || "";
  document.getElementById("produto-disponivel").checked = produto?.disponivel !== false;

  modalProduto.style.display = "block";
  fundoModal.classList.add("visivel");
}
function fecharModalProduto() {
  modalProduto.style.display = "none";
  fundoModal.classList.remove("visivel");
}

document.getElementById("botao-novo-produto").addEventListener("click", () => abrirModalProduto());
document.getElementById("botao-cancelar-modal").addEventListener("click", fecharModalProduto);
fundoModal.addEventListener("click", fecharModalProduto);

document.getElementById("formulario-produto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("produto-id").value;
  const corpo = {
    nome: document.getElementById("produto-nome").value.trim(),
    descricao: document.getElementById("produto-descricao").value.trim(),
    preco: Number(document.getElementById("produto-preco").value),
    categoria: document.getElementById("produto-categoria").value.trim(),
    disponivel: document.getElementById("produto-disponivel").checked,
  };

  await chamarApi(id ? `/api/produtos/${id}` : "/api/produtos", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(corpo),
  });

  fecharModalProduto();
  carregarProdutos();
});

// ---- Inicialização ----
if (getToken()) {
  mostrarPainel();
} else {
  mostrarLogin();
}

// ---- Monte sua Quentinha (tamanhos, grupos e itens) ----
let configMonte = { tamanhos: [], grupos: [] };

async function carregarConfigMonte() {
  try {
    const resp = await chamarApi("/api/opcoes-quentinha/admin");
    configMonte = await resp.json();
    renderizarEditorMonte();
  } catch {
    document.getElementById("corpo-tamanhos").innerHTML = `<tr><td colspan="4">Erro ao carregar.</td></tr>`;
  }
}

function renderizarEditorMonte() {
  renderizarTamanhosAdmin();
  renderizarGruposAdmin();
}

function renderizarTamanhosAdmin() {
  const corpo = document.getElementById("corpo-tamanhos");
  corpo.innerHTML = configMonte.tamanhos.map((t, idx) => `
    <tr>
      <td><input type="text" value="${t.nome}" data-tamanho-nome="${idx}" style="width:100%; padding:6px 8px;"></td>
      <td><input type="number" step="0.01" min="0" value="${t.preco}" data-tamanho-preco="${idx}" style="width:100px; padding:6px 8px;"></td>
      <td><input type="checkbox" ${t.ativo !== false ? "checked" : ""} data-tamanho-ativo="${idx}"></td>
      <td><button class="botao-icone perigo" data-tamanho-remover="${idx}">Remover</button></td>
    </tr>
  `).join("") || `<tr><td colspan="4">Nenhum tamanho cadastrado.</td></tr>`;

  corpo.querySelectorAll("[data-tamanho-nome]").forEach((el) => {
    el.addEventListener("input", () => { configMonte.tamanhos[el.dataset.tamanhoNome].nome = el.value; });
  });
  corpo.querySelectorAll("[data-tamanho-preco]").forEach((el) => {
    el.addEventListener("input", () => { configMonte.tamanhos[el.dataset.tamanhoPreco].preco = Number(el.value); });
  });
  corpo.querySelectorAll("[data-tamanho-ativo]").forEach((el) => {
    el.addEventListener("change", () => { configMonte.tamanhos[el.dataset.tamanhoAtivo].ativo = el.checked; });
  });
  corpo.querySelectorAll("[data-tamanho-remover]").forEach((el) => {
    el.addEventListener("click", () => {
      configMonte.tamanhos.splice(Number(el.dataset.tamanhoRemover), 1);
      renderizarEditorMonte();
    });
  });
}

document.getElementById("botao-novo-tamanho").addEventListener("click", () => {
  const id = "t" + Date.now().toString(36);
  configMonte.tamanhos.push({ id, nome: "Novo tamanho", preco: 0, ativo: true });
  renderizarEditorMonte();
});

function renderizarGruposAdmin() {
  const container = document.getElementById("lista-grupos");

  container.innerHTML = configMonte.grupos.map((grupo, gIdx) => `
    <div class="cartao-formulario" style="margin-bottom:18px;">
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; margin-bottom:14px;">
        <div class="campo" style="flex:2; min-width:160px; margin-bottom:0;">
          <label>Nome do grupo</label>
          <input type="text" value="${grupo.nome}" data-grupo-nome="${gIdx}">
        </div>
        <div class="campo" style="flex:1; min-width:140px; margin-bottom:0;">
          <label>Tipo</label>
          <select data-grupo-tipo="${gIdx}">
            <option value="inclusa" ${grupo.tipo === "inclusa" ? "selected" : ""}>Incluso no tamanho</option>
            <option value="adicional" ${grupo.tipo === "adicional" ? "selected" : ""}>Adicional pago</option>
          </select>
        </div>
        <div class="campo" style="margin-bottom:0;">
          <label><input type="checkbox" ${grupo.ativo !== false ? "checked" : ""} data-grupo-ativo="${gIdx}" style="width:auto; margin-right:6px;">Ativo</label>
        </div>
        <button class="botao-icone perigo" data-grupo-remover="${gIdx}">Remover grupo</button>
      </div>

      ${grupo.tipo === "inclusa" ? `
        <p style="font-size:12.5px; color:#7a7460; margin: 0 0 8px;">Quantos itens deste grupo vêm incluídos (grátis), por tamanho. Se o cliente escolher mais do que isso, o item extra cobra o "preço se passar do limite" definido na tabela abaixo:</p>
        <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:16px;">
          ${configMonte.tamanhos.map((t) => `
            <div class="campo" style="margin-bottom:0; width:120px;">
              <label>${t.nome}</label>
              <input type="number" min="0" value="${grupo.limites?.[t.id] ?? 0}" data-grupo-limite="${gIdx}" data-limite-tamanho="${t.id}">
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div class="tabela-scroll">
      <table class="tabela-admin">
        <thead>
          <tr>
            <th>Item</th>
            <th>${grupo.tipo === "adicional" ? "Preço extra (R$)" : "Preço se passar do limite (R$)"}</th>
            <th>Ativo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${grupo.itens.map((item, iIdx) => `
            <tr>
              <td><input type="text" value="${item.nome}" data-item-nome="${gIdx}:${iIdx}" style="width:100%; padding:6px 8px;"></td>
              <td><input type="number" step="0.01" min="0" value="${item.precoExtra || 0}" data-item-preco="${gIdx}:${iIdx}" style="width:100px; padding:6px 8px;"></td>
              <td><input type="checkbox" ${item.ativo !== false ? "checked" : ""} data-item-ativo="${gIdx}:${iIdx}"></td>
              <td><button class="botao-icone perigo" data-item-remover="${gIdx}:${iIdx}">Remover</button></td>
            </tr>
          `).join("") || `<tr><td colspan="4">Nenhum item cadastrado.</td></tr>`}
        </tbody>
      </table>
      </div>
      <button class="botao-icone" style="margin-top:10px;" data-item-novo="${gIdx}">+ Novo item</button>
    </div>
  `).join("");

  // Nome / tipo / ativo do grupo
  container.querySelectorAll("[data-grupo-nome]").forEach((el) => {
    el.addEventListener("input", () => { configMonte.grupos[el.dataset.grupoNome].nome = el.value; });
  });
  container.querySelectorAll("[data-grupo-tipo]").forEach((el) => {
    el.addEventListener("change", () => {
      configMonte.grupos[el.dataset.grupoTipo].tipo = el.value;
      renderizarGruposAdmin();
    });
  });
  container.querySelectorAll("[data-grupo-ativo]").forEach((el) => {
    el.addEventListener("change", () => { configMonte.grupos[el.dataset.grupoAtivo].ativo = el.checked; });
  });
  container.querySelectorAll("[data-grupo-remover]").forEach((el) => {
    el.addEventListener("click", () => {
      configMonte.grupos.splice(Number(el.dataset.grupoRemover), 1);
      renderizarGruposAdmin();
    });
  });

  // Limites por tamanho (grupos "inclusa")
  container.querySelectorAll("[data-grupo-limite]").forEach((el) => {
    el.addEventListener("input", () => {
      const grupo = configMonte.grupos[el.dataset.grupoLimite];
      grupo.limites = grupo.limites || {};
      grupo.limites[el.dataset.limiteTamanho] = Number(el.value);
    });
  });

  // Itens: nome / preço extra / ativo / remover
  container.querySelectorAll("[data-item-nome]").forEach((el) => {
    el.addEventListener("input", () => {
      const [g, i] = el.dataset.itemNome.split(":").map(Number);
      configMonte.grupos[g].itens[i].nome = el.value;
    });
  });
  container.querySelectorAll("[data-item-preco]").forEach((el) => {
    el.addEventListener("input", () => {
      const [g, i] = el.dataset.itemPreco.split(":").map(Number);
      configMonte.grupos[g].itens[i].precoExtra = Number(el.value);
    });
  });
  container.querySelectorAll("[data-item-ativo]").forEach((el) => {
    el.addEventListener("change", () => {
      const [g, i] = el.dataset.itemAtivo.split(":").map(Number);
      configMonte.grupos[g].itens[i].ativo = el.checked;
    });
  });
  container.querySelectorAll("[data-item-remover]").forEach((el) => {
    el.addEventListener("click", () => {
      const [g, i] = el.dataset.itemRemover.split(":").map(Number);
      configMonte.grupos[g].itens.splice(i, 1);
      renderizarGruposAdmin();
    });
  });
  container.querySelectorAll("[data-item-novo]").forEach((el) => {
    el.addEventListener("click", () => {
      const g = Number(el.dataset.itemNovo);
      const id = "i" + Date.now().toString(36);
      configMonte.grupos[g].itens.push({ id, nome: "Novo item", ativo: true, precoExtra: 0 });
      renderizarGruposAdmin();
    });
  });
}

document.getElementById("botao-novo-grupo").addEventListener("click", () => {
  const id = "g" + Date.now().toString(36);
  configMonte.grupos.push({ id, nome: "Novo grupo", tipo: "inclusa", ativo: true, limites: {}, itens: [] });
  renderizarGruposAdmin();
});

document.getElementById("botao-salvar-monte").addEventListener("click", async () => {
  const statusEl = document.getElementById("status-salvar-monte");
  statusEl.innerHTML = "";
  try {
    const resp = await chamarApi("/api/opcoes-quentinha/admin", {
      method: "PUT",
      body: JSON.stringify(configMonte),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Erro ao salvar.");
    statusEl.innerHTML = `<div class="aviso-sucesso">Alterações salvas com sucesso!</div>`;
    setTimeout(() => { statusEl.innerHTML = ""; }, 3000);
  } catch (erro) {
    statusEl.innerHTML = `<div class="aviso-erro">${erro.message}</div>`;
  }
});

// ---- Cardápio da Semana (padrão por dia + substituição pontual por data) ----
const DIAS = [
  { id: "segunda", nome: "Segunda" },
  { id: "terca", nome: "Terça" },
  { id: "quarta", nome: "Quarta" },
  { id: "quinta", nome: "Quinta" },
  { id: "sexta", nome: "Sexta" },
  { id: "sabado", nome: "Sábado" },
  { id: "domingo", nome: "Domingo" },
];

let diaSelecionado = "segunda";
let disponibilidadeSemanal = {};
let substituicoesTodas = {};
let selecoesDiaAtual = {};
let selecoesDataAtual = {};

function nomeDia(id) {
  return DIAS.find((d) => d.id === id)?.nome || id;
}

function formatarDataBR(data) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

async function inicializarAbaSemana() {
  try {
    const resp = await chamarApi("/api/disponibilidade");
    const dados = await resp.json();
    disponibilidadeSemanal = dados.semanal || {};
    substituicoesTodas = dados.substituicoes || {};
  } catch {
    disponibilidadeSemanal = {};
    substituicoesTodas = {};
  }
  renderizarAbasDias();
  selecionarDia(diaSelecionado);
}

function renderizarAbasDias() {
  const el = document.getElementById("abas-dias");
  el.innerHTML = DIAS.map((d) => `
    <button type="button" class="aba-dia ${d.id === diaSelecionado ? "ativa" : ""}" data-dia="${d.id}">${d.nome}</button>
  `).join("");

  el.querySelectorAll("[data-dia]").forEach((btn) => {
    btn.addEventListener("click", () => selecionarDia(btn.dataset.dia));
  });
}

function itensAtivosDoGrupo(grupo) {
  return grupo.itens.filter((i) => i.ativo !== false);
}

function selecionarDia(dia) {
  diaSelecionado = dia;
  renderizarAbasDias();

  selecoesDiaAtual = {};
  for (const grupo of configMonte.grupos) {
    const salvo = disponibilidadeSemanal[dia]?.[grupo.id];
    // Se este dia/grupo nunca foi configurado, começa com tudo marcado
    // (mesmo comportamento de "disponível todo dia" que já existia antes).
    selecoesDiaAtual[grupo.id] = salvo ? [...salvo] : itensAtivosDoGrupo(grupo).map((i) => i.id);
  }
  document.getElementById("status-salvar-dia-semana").innerHTML = "";
  renderizarGruposCheckbox("grupos-dia-semana", selecoesDiaAtual, "dia");
}

function renderizarGruposCheckbox(idContainer, selecoes, prefixo) {
  const el = document.getElementById(idContainer);
  el.innerHTML = configMonte.grupos.map((grupo) => `
    <div class="grupo-semana">
      <h4>${grupo.nome}</h4>
      <div class="grade-checkbox-semana">
        ${itensAtivosDoGrupo(grupo).map((item) => `
          <label class="check-item-semana">
            <input type="checkbox" data-${prefixo}-grupo="${grupo.id}" data-${prefixo}-item="${item.id}"
              ${selecoes[grupo.id]?.includes(item.id) ? "checked" : ""}>
            ${item.nome}
          </label>
        `).join("") || `<span style="font-size:13px; color:#a39c86;">Nenhum item ativo neste grupo.</span>`}
      </div>
    </div>
  `).join("");

  el.querySelectorAll(`[data-${prefixo}-grupo]`).forEach((cb) => {
    cb.addEventListener("change", () => {
      const grupoId = cb.dataset[prefixo + "Grupo"];
      const itemId = cb.dataset[prefixo + "Item"];
      const lista = selecoes[grupoId] || [];
      selecoes[grupoId] = cb.checked
        ? [...new Set([...lista, itemId])]
        : lista.filter((id) => id !== itemId);
    });
  });
}

document.getElementById("botao-salvar-dia-semana").addEventListener("click", async () => {
  const statusEl = document.getElementById("status-salvar-dia-semana");
  statusEl.innerHTML = "";
  try {
    const resp = await chamarApi(`/api/disponibilidade/semanal/${diaSelecionado}`, {
      method: "PUT",
      body: JSON.stringify(selecoesDiaAtual),
    });
    if (!resp.ok) throw new Error("Não foi possível salvar.");
    disponibilidadeSemanal[diaSelecionado] = { ...selecoesDiaAtual };
    statusEl.innerHTML = `<div class="aviso-sucesso">Cardápio de ${nomeDia(diaSelecionado)} salvo!</div>`;
    setTimeout(() => { statusEl.innerHTML = ""; }, 3000);
  } catch (erro) {
    statusEl.innerHTML = `<div class="aviso-erro">${erro.message}</div>`;
  }
});

// ---- Substituição pontual por data ----
document.getElementById("data-substituicao").addEventListener("change", (e) => {
  if (e.target.value) carregarSubstituicaoData(e.target.value);
});

async function carregarSubstituicaoData(data) {
  const avisoEl = document.getElementById("aviso-substituicao");
  const botaoRemover = document.getElementById("botao-remover-substituicao");
  document.getElementById("status-salvar-substituicao").innerHTML = "";

  try {
    const resp = await chamarApi(`/api/disponibilidade/data/${data}`);
    const dados = await resp.json();

    selecoesDataAtual = {};
    for (const grupo of configMonte.grupos) {
      const disponivel = dados.disponibilidade?.[grupo.id];
      selecoesDataAtual[grupo.id] = disponivel ? [...disponivel] : itensAtivosDoGrupo(grupo).map((i) => i.id);
    }

    avisoEl.innerHTML = dados.temSubstituicao
      ? `<div class="aviso-sucesso">Esta data já tem uma substituição salva.</div>`
      : `<div style="font-size:13px; color:#7a7460; margin-bottom:6px;">Nenhuma substituição ainda para esta data — mostrando o padrão normal do dia da semana correspondente.</div>`;
    botaoRemover.style.display = dados.temSubstituicao ? "inline-block" : "none";

    renderizarGruposCheckbox("grupos-data-substituicao", selecoesDataAtual, "data");
  } catch {
    avisoEl.innerHTML = `<div class="aviso-erro">Erro ao carregar essa data.</div>`;
  }
}

document.getElementById("botao-salvar-substituicao").addEventListener("click", async () => {
  const data = document.getElementById("data-substituicao").value;
  const statusEl = document.getElementById("status-salvar-substituicao");
  if (!data) {
    statusEl.innerHTML = `<div class="aviso-erro">Escolha uma data primeiro.</div>`;
    return;
  }
  try {
    const resp = await chamarApi(`/api/disponibilidade/data/${data}`, {
      method: "PUT",
      body: JSON.stringify(selecoesDataAtual),
    });
    if (!resp.ok) throw new Error("Não foi possível salvar.");
    substituicoesTodas[data] = { ...selecoesDataAtual };
    document.getElementById("botao-remover-substituicao").style.display = "inline-block";
    statusEl.innerHTML = `<div class="aviso-sucesso">Substituição de ${formatarDataBR(data)} salva!</div>`;
    setTimeout(() => { statusEl.innerHTML = ""; }, 3000);
  } catch (erro) {
    statusEl.innerHTML = `<div class="aviso-erro">${erro.message}</div>`;
  }
});

document.getElementById("botao-remover-substituicao").addEventListener("click", async () => {
  const data = document.getElementById("data-substituicao").value;
  if (!data || !confirm("Remover a substituição desta data e voltar ao padrão da semana?")) return;

  const statusEl = document.getElementById("status-salvar-substituicao");
  try {
    await chamarApi(`/api/disponibilidade/data/${data}`, { method: "DELETE" });
    delete substituicoesTodas[data];
    statusEl.innerHTML = `<div class="aviso-sucesso">Substituição removida.</div>`;
    setTimeout(() => { statusEl.innerHTML = ""; }, 3000);
    carregarSubstituicaoData(data);
  } catch {
    statusEl.innerHTML = `<div class="aviso-erro">Erro ao remover.</div>`;
  }
});

// ---- Entrega (bairros e taxa) ----
let bairros = [];

async function carregarBairros() {
  const corpo = document.getElementById("corpo-bairros");
  try {
    const resp = await chamarApi("/api/bairros-entrega/admin");
    bairros = await resp.json();
    renderizarBairros();
  } catch {
    corpo.innerHTML = `<tr><td colspan="4">Erro ao carregar bairros.</td></tr>`;
  }
}

function renderizarBairros() {
  const corpo = document.getElementById("corpo-bairros");
  corpo.innerHTML = bairros.map((b, idx) => `
    <tr>
      <td><input type="text" value="${b.nome}" data-bairro-nome="${idx}" style="width:100%; padding:6px 8px;"></td>
      <td><input type="number" step="0.01" min="0" value="${b.taxa}" data-bairro-taxa="${idx}" style="width:100px; padding:6px 8px;"></td>
      <td><input type="checkbox" ${b.ativo !== false ? "checked" : ""} data-bairro-ativo="${idx}"></td>
      <td><button class="botao-icone perigo" data-bairro-remover="${idx}">Remover</button></td>
    </tr>
  `).join("") || `<tr><td colspan="4">Nenhum bairro cadastrado — o checkout não vai cobrar taxa de entrega.</td></tr>`;

  corpo.querySelectorAll("[data-bairro-nome]").forEach((el) => {
    el.addEventListener("input", () => { bairros[el.dataset.bairroNome].nome = el.value; });
  });
  corpo.querySelectorAll("[data-bairro-taxa]").forEach((el) => {
    el.addEventListener("input", () => { bairros[el.dataset.bairroTaxa].taxa = Number(el.value); });
  });
  corpo.querySelectorAll("[data-bairro-ativo]").forEach((el) => {
    el.addEventListener("change", () => { bairros[el.dataset.bairroAtivo].ativo = el.checked; });
  });
  corpo.querySelectorAll("[data-bairro-remover]").forEach((el) => {
    el.addEventListener("click", () => {
      bairros.splice(Number(el.dataset.bairroRemover), 1);
      renderizarBairros();
    });
  });
}

document.getElementById("botao-novo-bairro").addEventListener("click", () => {
  const id = "b" + Date.now().toString(36);
  bairros.push({ id, nome: "Novo bairro", taxa: 0, ativo: true });
  renderizarBairros();
});

document.getElementById("botao-salvar-bairros").addEventListener("click", async () => {
  const statusEl = document.getElementById("status-salvar-bairros");
  statusEl.innerHTML = "";
  try {
    const resp = await chamarApi("/api/bairros-entrega/admin", {
      method: "PUT",
      body: JSON.stringify(bairros),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Erro ao salvar.");
    statusEl.innerHTML = `<div class="aviso-sucesso">Bairros salvos com sucesso!</div>`;
    setTimeout(() => { statusEl.innerHTML = ""; }, 3000);
  } catch (erro) {
    statusEl.innerHTML = `<div class="aviso-erro">${erro.message}</div>`;
  }
});

// ---- Configuração do modo de entrega (bairro x distância) ----
const secaoBairros = document.getElementById("secao-bairros");
const configDistanciaEl = document.getElementById("config-distancia");

function mostrarCamposModoEntrega(modo) {
  configDistanciaEl.style.display = modo === "distancia" ? "block" : "none";
  secaoBairros.style.display = modo === "distancia" ? "none" : "block";
}

document.querySelectorAll('input[name="modo-entrega"]').forEach((radio) => {
  radio.addEventListener("change", () => mostrarCamposModoEntrega(radio.value));
});

async function carregarConfigEntrega() {
  try {
    const resp = await chamarApi("/api/frete/admin");
    const config = await resp.json();

    document.querySelector(`input[name="modo-entrega"][value="${config.modo}"]`).checked = true;
    mostrarCamposModoEntrega(config.modo);

    const d = config.distancia || {};
    document.getElementById("dist-lat").value = d.coordenadasRestaurante?.lat ?? "";
    document.getElementById("dist-lng").value = d.coordenadasRestaurante?.lng ?? "";
    document.getElementById("dist-cidade").value = d.cidadeReferencia || "";
    document.getElementById("dist-taxa-base").value = d.taxaBase ?? 0;
    document.getElementById("dist-preco-km").value = d.precoPorKm ?? 0;
    document.getElementById("dist-fator-rota").value = d.fatorRota ?? 1.3;
    document.getElementById("dist-raio-max").value = d.raioMaximoKm ?? "";
  } catch {
    // Se não conseguir carregar, deixa os campos como estão (padrão: modo bairro)
  }
}

document.getElementById("botao-salvar-modo-entrega").addEventListener("click", async () => {
  const statusEl = document.getElementById("status-salvar-modo-entrega");
  statusEl.innerHTML = "";

  const modo = document.querySelector('input[name="modo-entrega"]:checked')?.value || "bairro";
  const config = {
    modo,
    distancia: {
      coordenadasRestaurante: {
        lat: Number(document.getElementById("dist-lat").value),
        lng: Number(document.getElementById("dist-lng").value),
      },
      cidadeReferencia: document.getElementById("dist-cidade").value.trim(),
      taxaBase: Number(document.getElementById("dist-taxa-base").value) || 0,
      precoPorKm: Number(document.getElementById("dist-preco-km").value) || 0,
      fatorRota: Number(document.getElementById("dist-fator-rota").value) || 1,
      raioMaximoKm: Number(document.getElementById("dist-raio-max").value) || null,
    },
  };

  try {
    const resp = await chamarApi("/api/frete/admin", {
      method: "PUT",
      body: JSON.stringify(config),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Erro ao salvar.");
    statusEl.innerHTML = `<div class="aviso-sucesso">Configuração de entrega salva!</div>`;
    setTimeout(() => { statusEl.innerHTML = ""; }, 3000);
  } catch (erro) {
    statusEl.innerHTML = `<div class="aviso-erro">${erro.message}</div>`;
  }
});

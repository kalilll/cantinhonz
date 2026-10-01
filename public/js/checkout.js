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
const campoBairro2 = document.getElementById("bairro2");
const campoBairroTextoWrapper = document.getElementById("campo-bairro-texto");
const campoCep = document.getElementById("cep");
const statusCep = document.getElementById("status-cep");
const campoComplemento = document.getElementById("complemento");
const campoTelefone = document.getElementById("telefone");
const statusWhatsappCardapio = document.getElementById("status-whatsapp-cardapio");
const blocoTroco = document.getElementById("bloco-troco");
const campoTrocoPara = document.getElementById("troco-para");
const valorTrocoCalculado = document.getElementById("valor-troco-calculado");

let carrinho = lerCarrinho();
let bairros = [];
let modoEntrega = "bairro";
let freteCalculado = null; // { distanciaKm, taxa, dentroDoRaio } — só usado no modo distância
let totalAtual = 0;
let timeoutCalculoFrete = null;
let timeoutBuscaCep = null;
let timeoutVerificarWhatsapp = null;
// true quando o telefone digitado já está na lista do cardápio por
// WhatsApp — nesse caso não faz sentido mostrar o checkbox de novo.
let jaInscritoWhatsapp = false;
// Cidade/UF confirmados (via ViaCEP ou via seleção no Places Autocomplete)
// para o endereço atual — null se ainda não confirmados, ou se o cliente
// editou o CEP depois de uma busca anterior. Usado para deixar a
// geocodificação mais precisa; nunca é obrigatório.
let dadosLocalizacao = null;

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

// ---- Busca de endereço por CEP (ViaCEP) ----
function formatarCep(valor) {
  const digitos = valor.replace(/\D/g, "").slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

async function buscarEnderecoPorCep(cep) {
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados = await resp.json();

    if (!resp.ok || dados.erro) {
      statusCep.innerHTML = `<span style="color:var(--tijolo);">CEP não encontrado — preencha o endereço manualmente.</span>`;
      return;
    }

    // Rua e bairro continuam editáveis mesmo depois de preenchidos pelo
    // ViaCEP — o cliente pode corrigir caso o CEP traga algo levemente
    // diferente do endereço real (comum em CEPs de condomínios/conjuntos).
    if (dados.logradouro) campoRua.value = dados.logradouro;
    const bairroRetornado = dados.bairro || "";

    if (modoEntrega === "distancia") {
      if (bairroRetornado) campoBairro2.value = bairroRetornado;
    } else if (bairroRetornado) {
      // No modo "por bairro" a entrega usa uma lista fixa configurada pelo
      // restaurante — só selecionamos automaticamente se algum item da lista
      // corresponder ao bairro retornado; senão o cliente escolhe manualmente.
      const opcaoCorrespondente = Array.from(campoBairro.options).find((o) =>
        o.textContent.toLowerCase().startsWith(bairroRetornado.toLowerCase())
      );
      if (opcaoCorrespondente) campoBairro.value = opcaoCorrespondente.value;
    }

    dadosLocalizacao = { cidade: dados.localidade || "", uf: dados.uf || "" };
    statusCep.innerHTML = `<span style="color:var(--verde-mata);">Endereço encontrado — confira e ajuste se precisar.</span>`;
    agendarCalculoFrete();
    renderizarResumo();
  } catch {
    statusCep.innerHTML = `<span style="color:var(--tijolo);">Não foi possível buscar o CEP agora — preencha manualmente.</span>`;
  }
}

campoCep.addEventListener("input", () => {
  campoCep.value = formatarCep(campoCep.value);
  clearTimeout(timeoutBuscaCep);
  // Qualquer edição no CEP invalida os dados de cidade/UF da busca anterior —
  // evita associar um CEP novo à cidade de um CEP diferente já digitado antes.
  dadosLocalizacao = null;

  const digitos = campoCep.value.replace(/\D/g, "");
  if (digitos.length !== 8) {
    statusCep.innerHTML = "";
    return;
  }
  statusCep.innerHTML = `<span style="color:#8c8672;">Buscando endereço...</span>`;
  timeoutBuscaCep = setTimeout(() => buscarEnderecoPorCep(digitos), 500);
});

// ---- Inscrição no cardápio diário do WhatsApp ----
// Verifica se o número já está na lista assim que o cliente termina de
// digitar o telefone — evita mostrar o checkbox pra quem já recebe as
// mensagens (e evita uma segunda tentativa de inscrição inútil).
function renderizarCheckboxWhatsapp() {
  if (jaInscritoWhatsapp) {
    statusWhatsappCardapio.innerHTML = `<span style="color:var(--verde-mata);">✅ Você já recebe o cardápio diário no WhatsApp.</span>`;
    return;
  }
  statusWhatsappCardapio.innerHTML = `
    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
      <input type="checkbox" id="quero-cardapio-whatsapp" style="width:auto;">
      Quero receber o cardápio do dia no WhatsApp
    </label>
  `;
}

async function verificarInscricaoWhatsapp(telefone) {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return;
  try {
    const resp = await fetch(`/api/whatsapp-cardapio/verificar?numero=${encodeURIComponent(digitos)}`);
    const dados = await resp.json();
    jaInscritoWhatsapp = !!dados.inscrito;
  } catch {
    jaInscritoWhatsapp = false; // sem resposta do servidor, assume que não está inscrito
  }
  renderizarCheckboxWhatsapp();
}

campoTelefone.addEventListener("input", () => {
  clearTimeout(timeoutVerificarWhatsapp);
  jaInscritoWhatsapp = false;
  timeoutVerificarWhatsapp = setTimeout(() => verificarInscricaoWhatsapp(campoTelefone.value), 600);
});

// ---- Sugestões de endereço enquanto digita (Google Places Autocomplete) ----
// Opcional: só é ativado se o servidor tiver uma chave de navegador
// configurada (GOOGLE_MAPS_BROWSER_KEY). Sem ela, o campo Rua continua um
// texto comum — o cliente digita manualmente, com a ajuda do CEP acima.
function carregarPlacesAutocomplete(chave, coordenadasRestaurante) {
  if (!chave || window.google?.maps?.places) return;

  window.iniciarAutocompleteEndereco = () => {
    const autocomplete = new google.maps.places.Autocomplete(campoRua, {
      componentRestrictions: { country: "br" },
      fields: ["address_components"],
      types: ["address"],
    });

    if (coordenadasRestaurante) {
      const { lat, lng } = coordenadasRestaurante;
      const margem = 1.5; // mesma margem usada na geocodificação server-side
      autocomplete.setBounds(
        new google.maps.LatLngBounds(
          { lat: lat - margem, lng: lng - margem },
          { lat: lat + margem, lng: lng + margem }
        )
      );
    }

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const componentes = place?.address_components || [];
      const pegar = (tipo, curto) =>
        componentes.find((c) => c.types.includes(tipo))?.[curto ? "short_name" : "long_name"] || "";

      const rua = pegar("route");
      const numero = pegar("street_number");
      const bairroEncontrado = pegar("sublocality_level_1") || pegar("sublocality") || pegar("neighborhood");
      const cidade = pegar("administrative_area_level_2") || pegar("locality");
      const uf = pegar("administrative_area_level_1", true);
      const cep = pegar("postal_code");

      // Rua e bairro continuam editáveis — o cliente pode ajustar depois de
      // escolher a sugestão, igual já acontece com o preenchimento por CEP.
      if (rua) campoRua.value = rua;
      if (numero) campoNumero.value = numero;
      if (cep) campoCep.value = formatarCep(cep);

      if (modoEntrega === "distancia") {
        if (bairroEncontrado) campoBairro2.value = bairroEncontrado;
      } else if (bairroEncontrado) {
        const opcaoCorrespondente = Array.from(campoBairro.options).find((o) =>
          o.textContent.toLowerCase().startsWith(bairroEncontrado.toLowerCase())
        );
        if (opcaoCorrespondente) campoBairro.value = opcaoCorrespondente.value;
      }

      if (cidade || uf) dadosLocalizacao = { cidade, uf };
      agendarCalculoFrete();
      renderizarResumo();
    });
  };

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(chave)}&libraries=places&language=pt-BR&region=BR&loading=async&callback=iniciarAutocompleteEndereco`;
  script.async = true;
  document.head.appendChild(script);
}

// ---- Modo de entrega por distância (km) ----
function agendarCalculoFrete() {
  clearTimeout(timeoutCalculoFrete);
  const rua = campoRua.value.trim();
  const bairro2 = campoBairro2.value.trim();
  const numero = campoNumero.value.trim();

  if (rua.length < 3 || !numero) {
    freteCalculado = null;
    statusFreteDistancia.innerHTML = "";
    renderizarResumo();
    return;
  }

  statusFreteDistancia.innerHTML = `<span style="color:#8c8672;">Calculando taxa de entrega...</span>`;
  timeoutCalculoFrete = setTimeout(() => calcularFreteDistancia(rua, numero, bairro2), 900);
}
  
async function calcularFreteDistancia(rua, numero, bairro2) {
  try {
    const resp = await fetch("/api/frete/calcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rua,
        numero,
        bairro: bairro2,
        cidade: dadosLocalizacao?.cidade,
        uf: dadosLocalizacao?.uf,
      }),
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
campoBairro2.addEventListener("input", agendarCalculoFrete);

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
    carregarPlacesAutocomplete(dados.googleMapsBrowserKey, dados.coordenadasRestaurante);
  } catch {
    modoEntrega = "bairro";
  }

  if (modoEntrega === "distancia") {
    campoBairroWrapper.style.display = "none";
    campoBairro.required = false;

    campoBairroTextoWrapper.style.display = "block";
    campoBairro2.required = true;
  } else {
    campoBairroTextoWrapper.style.display = "none";
    campoBairro2.required = false;

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
    cep: campoCep.value.trim(),
    rua: campoRua.value.trim(),
    numero: campoNumero.value.trim(),
    complemento: campoComplemento.value.trim(),
    referencia: document.getElementById("referencia").value.trim(),
    observacoes: document.getElementById("observacoes").value.trim(),
    formaPagamento,
    // O checkbox é recriado dinamicamente (ver renderizarCheckboxWhatsapp),
    // por isso é buscado aqui em vez de usar uma referência guardada no topo.
    receberCardapioWhatsapp: document.getElementById("quero-cardapio-whatsapp")?.checked || false,
  };
  if (dadosLocalizacao) {
    cliente.cidade = dadosLocalizacao.cidade;
    cliente.uf = dadosLocalizacao.uf;
  }
  if (modoEntrega === "bairro" && bairros.length > 0) {
    cliente.bairroId = campoBairro.value;
  }
  if (modoEntrega === "distancia") {
    cliente.bairroTexto = campoBairro2.value.trim();
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

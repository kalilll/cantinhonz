// Camada bem simples de "banco de dados" usando arquivos JSON.
// Para um volume maior de pedidos, troque isto por um banco de verdade
// (Postgres, MySQL, SQLite etc.) mantendo a mesma interface (getProdutos, salvarPedido...).

const fs = require("fs");
const path = require("path");

const PRODUTOS_PATH = path.join(__dirname, "data", "produtos.json");
const PEDIDOS_PATH = path.join(__dirname, "data", "pedidos.json");
const OPCOES_QUENTINHA_PATH = path.join(__dirname, "data", "opcoes-quentinha.json");
const DISPONIBILIDADE_SEMANAL_PATH = path.join(__dirname, "data", "disponibilidade-semanal.json");
const SUBSTITUICOES_PATH = path.join(__dirname, "data", "substituicoes-data.json");
const BAIRROS_ENTREGA_PATH = path.join(__dirname, "data", "bairros-entrega.json");

function lerJSON(caminho) {
  const conteudo = fs.readFileSync(caminho, "utf-8");
  return JSON.parse(conteudo || "[]");
}

function escreverJSON(caminho, dados) {
  fs.writeFileSync(caminho, JSON.stringify(dados, null, 2), "utf-8");
}

// ---- Produtos ----
function getProdutos() {
  return lerJSON(PRODUTOS_PATH);
}

function salvarProdutos(produtos) {
  escreverJSON(PRODUTOS_PATH, produtos);
}

// ---- Pedidos ----
function getPedidos() {
  return lerJSON(PEDIDOS_PATH);
}

function salvarPedidos(pedidos) {
  escreverJSON(PEDIDOS_PATH, pedidos);
}

// ---- Opções do "monte sua quentinha" ----
function getOpcoesQuentinha() {
  return lerJSON(OPCOES_QUENTINHA_PATH);
}

function salvarOpcoesQuentinha(opcoes) {
  escreverJSON(OPCOES_QUENTINHA_PATH, opcoes);
}

// ---- Disponibilidade por dia da semana ----
// Formato: { "segunda": { "proteinas": ["id1","id2"], "acompanhamentos": [...] }, ... }
function getDisponibilidadeSemanal() {
  try {
    return JSON.parse(fs.readFileSync(DISPONIBILIDADE_SEMANAL_PATH, "utf-8") || "{}");
  } catch {
    return {};
  }
}

function salvarDisponibilidadeSemanal(dados) {
  escreverJSON(DISPONIBILIDADE_SEMANAL_PATH, dados);
}

// ---- Substituições pontuais para uma data específica (YYYY-MM-DD) ----
// Formato: { "2026-07-22": { "proteinas": ["id1"], "acompanhamentos": [...] } }
function getSubstituicoes() {
  try {
    return JSON.parse(fs.readFileSync(SUBSTITUICOES_PATH, "utf-8") || "{}");
  } catch {
    return {};
  }
}

function salvarSubstituicoes(dados) {
  escreverJSON(SUBSTITUICOES_PATH, dados);
}

// ---- Bairros de entrega (taxa por bairro) ----
function getBairrosEntrega() {
  return lerJSON(BAIRROS_ENTREGA_PATH);
}

function salvarBairrosEntrega(bairros) {
  escreverJSON(BAIRROS_ENTREGA_PATH, bairros);
}

module.exports = {
  getProdutos,
  salvarProdutos,
  getPedidos,
  salvarPedidos,
  getOpcoesQuentinha,
  salvarOpcoesQuentinha,
  getDisponibilidadeSemanal,
  salvarDisponibilidadeSemanal,
  getSubstituicoes,
  salvarSubstituicoes,
  getBairrosEntrega,
  salvarBairrosEntrega,
};

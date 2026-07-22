const express = require("express");
const db = require("../db");
const { exigirAdmin } = require("../middleware/auth");
const { DIAS_SEMANA, calcularDisponibilidadeEm } = require("../disponibilidadeHoje");

const router = express.Router();

// Todas as rotas aqui são de uso exclusivo do painel administrativo.
router.use(exigirAdmin);

// Retorna o padrão semanal completo (os 7 dias) e todas as substituições pontuais salvas.
router.get("/", (req, res) => {
  res.json({
    semanal: db.getDisponibilidadeSemanal(),
    substituicoes: db.getSubstituicoes(),
  });
});

// Salva o padrão de um dia da semana específico (ex: "toda segunda tem isso").
// Body: { grupoId: ["itemId1", "itemId2", ...], ... }
router.put("/semanal/:dia", (req, res) => {
  const { dia } = req.params;
  if (!DIAS_SEMANA.includes(dia)) {
    return res.status(400).json({ erro: "Dia da semana inválido." });
  }

  const semanal = db.getDisponibilidadeSemanal();
  semanal[dia] = req.body || {};
  db.salvarDisponibilidadeSemanal(semanal);
  res.json({ ok: true });
});

// Retorna a disponibilidade efetiva de uma data específica (já considerando
// uma eventual substituição salva, ou o padrão semanal como ponto de partida
// para o admin editar).
router.get("/data/:data", (req, res) => {
  const { data } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ erro: "Data inválida, use o formato AAAA-MM-DD." });
  }

  const semanal = db.getDisponibilidadeSemanal();
  const substituicoes = db.getSubstituicoes();
  const [ano, mes, dia] = data.split("-").map(Number);
  const dataObj = new Date(ano, mes - 1, dia);

  res.json({
    disponibilidade: calcularDisponibilidadeEm(dataObj, semanal, substituicoes) || {},
    temSubstituicao: Boolean(substituicoes[data]),
  });
});

// Cria ou atualiza a substituição pontual de uma data específica.
// Body: { grupoId: ["itemId1", ...], ... } — lista completa e final para essa data.
router.put("/data/:data", (req, res) => {
  const { data } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return res.status(400).json({ erro: "Data inválida, use o formato AAAA-MM-DD." });
  }

  const substituicoes = db.getSubstituicoes();
  substituicoes[data] = req.body || {};
  db.salvarSubstituicoes(substituicoes);
  res.json({ ok: true });
});

// Remove a substituição de uma data, voltando a valer o padrão semanal normal.
router.delete("/data/:data", (req, res) => {
  const { data } = req.params;
  const substituicoes = db.getSubstituicoes();
  delete substituicoes[data];
  db.salvarSubstituicoes(substituicoes);
  res.json({ ok: true });
});

module.exports = router;

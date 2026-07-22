const express = require("express");
const db = require("../db");
const { exigirAdmin } = require("../middleware/auth");
const { calcularDisponibilidadeEm } = require("../disponibilidadeHoje");

const router = express.Router();

// Público: retorna só tamanhos/grupos/itens ativos E disponíveis hoje
// (considerando o cardápio da semana e uma eventual substituição pontual
// cadastrada para o dia de hoje), para montar o formulário do cliente.
router.get("/", (req, res) => {
  const config = db.getOpcoesQuentinha();
  const disponibilidadeSemanal = db.getDisponibilidadeSemanal();
  const substituicoes = db.getSubstituicoes();
  const disponibilidadeHoje = calcularDisponibilidadeEm(new Date(), disponibilidadeSemanal, substituicoes);

  const publico = {
    tamanhos: config.tamanhos.filter((t) => t.ativo !== false),
    grupos: config.grupos
      .filter((g) => g.ativo !== false)
      .map((g) => {
        const idsPermitidosHoje = disponibilidadeHoje?.[g.id];
        return {
          ...g,
          itens: g.itens.filter((i) => {
            if (i.ativo === false) return false;
            // Se não há um cardápio do dia configurado para este grupo,
            // mantém o comportamento antigo: mostra tudo que estiver ativo.
            if (!idsPermitidosHoje) return true;
            return idsPermitidosHoje.includes(i.id);
          }),
        };
      }),
  };
  res.json(publico);
});

// Admin: retorna tudo, incluindo itens desativados (para poder reativar)
router.get("/admin", exigirAdmin, (req, res) => {
  res.json(db.getOpcoesQuentinha());
});

// Admin: substitui toda a configuração (tamanhos + grupos + itens)
router.put("/admin", exigirAdmin, (req, res) => {
  const { tamanhos, grupos } = req.body;

  if (!Array.isArray(tamanhos) || !Array.isArray(grupos)) {
    return res.status(400).json({ erro: "Configuração inválida." });
  }

  for (const t of tamanhos) {
    if (!t.id || !t.nome || t.preco === undefined || Number(t.preco) < 0) {
      return res.status(400).json({ erro: "Todo tamanho precisa de nome e preço válido." });
    }
  }
  for (const g of grupos) {
    if (!g.id || !g.nome || !["inclusa", "adicional"].includes(g.tipo)) {
      return res.status(400).json({ erro: "Todo grupo precisa de nome e tipo válido." });
    }
    for (const i of g.itens || []) {
      if (!i.id || !i.nome) {
        return res.status(400).json({ erro: `Item inválido no grupo "${g.nome}".` });
      }
    }
  }

  db.salvarOpcoesQuentinha({ tamanhos, grupos });
  res.json({ ok: true });
});

module.exports = router;

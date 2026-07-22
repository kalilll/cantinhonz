const express = require("express");
const db = require("../db");
const { exigirAdmin } = require("../middleware/auth");

const router = express.Router();

// Público: lista os bairros atendidos e a taxa de cada um, pro cliente escolher no checkout.
router.get("/", (req, res) => {
  const bairros = db.getBairrosEntrega().filter((b) => b.ativo !== false);
  res.json(bairros);
});

// Admin: lista tudo, incluindo bairros desativados.
router.get("/admin", exigirAdmin, (req, res) => {
  res.json(db.getBairrosEntrega());
});

// Admin: substitui a lista inteira de bairros (mesmo padrão usado no "Monte sua Quentinha").
router.put("/admin", exigirAdmin, (req, res) => {
  const bairros = req.body;

  if (!Array.isArray(bairros)) {
    return res.status(400).json({ erro: "Lista de bairros inválida." });
  }
  for (const b of bairros) {
    if (!b.id || !b.nome || b.taxa === undefined || Number(b.taxa) < 0) {
      return res.status(400).json({ erro: "Todo bairro precisa de nome e taxa válida." });
    }
  }

  db.salvarBairrosEntrega(bairros);
  res.json({ ok: true });
});

module.exports = router;

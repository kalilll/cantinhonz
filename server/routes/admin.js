const express = require("express");
const jwt = require("jsonwebtoken");
const { exigirAdmin } = require("../middleware/auth");
const { notificarNovoPedido } = require("../notificacoes");
const router = express.Router();

// Login simples com usuário/senha definidos no .env.
// Suficiente para um único administrador (o dono do restaurante).
router.post("/login", (req, res) => {
  const { usuario, senha } = req.body;

  if (usuario !== process.env.ADMIN_USER || senha !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ erro: "Usuário ou senha inválidos." });
  }

  const token = jwt.sign({ usuario }, process.env.JWT_SECRET, { expiresIn: "12h" });
  res.json({ token });
});

module.exports = router;

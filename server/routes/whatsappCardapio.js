const express = require("express");
const { jaEstaNaLista } = require("../whatsapp-bot/contatos");

const router = express.Router();

// Público: diz se um número de telefone já está na lista de envio diário do
// cardápio pelo WhatsApp. Usado no checkout pra decidir se mostra o checkbox
// de inscrição ou um aviso de que o cliente já recebe as mensagens.
router.get("/verificar", (req, res) => {
  const numero = String(req.query.numero || "");
  res.json({ inscrito: jaEstaNaLista(numero) });
});

module.exports = router;

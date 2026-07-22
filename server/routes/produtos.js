const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { exigirAdmin } = require("../middleware/auth");

const router = express.Router();

// Público: lista o cardápio (só itens disponíveis)
router.get("/", (req, res) => {
  const produtos = db.getProdutos().filter((p) => p.disponivel !== false);
  res.json(produtos);
});

// Admin: lista tudo, incluindo itens indisponíveis
router.get("/todos", exigirAdmin, (req, res) => {
  res.json(db.getProdutos());
});

// Admin: cria produto
router.post("/", exigirAdmin, (req, res) => {
  const { nome, descricao, preco, categoria, imagem, disponivel } = req.body;

  if (!nome || preco === undefined || preco === null || Number(preco) < 0) {
    return res.status(400).json({ erro: "Nome e preço válido são obrigatórios." });
  }

  const produtos = db.getProdutos();
  const novo = {
    id: uuid(),
    nome,
    descricao: descricao || "",
    preco: Number(preco),
    categoria: categoria || "Outros",
    imagem: imagem || "",
    disponivel: disponivel !== false,
  };
  produtos.push(novo);
  db.salvarProdutos(produtos);
  res.status(201).json(novo);
});

// Admin: edita produto
router.put("/:id", exigirAdmin, (req, res) => {
  const produtos = db.getProdutos();
  const idx = produtos.findIndex((p) => p.id === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ erro: "Produto não encontrado." });
  }

  const { nome, descricao, preco, categoria, imagem, disponivel } = req.body;
  produtos[idx] = {
    ...produtos[idx],
    nome: nome ?? produtos[idx].nome,
    descricao: descricao ?? produtos[idx].descricao,
    preco: preco !== undefined ? Number(preco) : produtos[idx].preco,
    categoria: categoria ?? produtos[idx].categoria,
    imagem: imagem ?? produtos[idx].imagem,
    disponivel: disponivel !== undefined ? disponivel : produtos[idx].disponivel,
  };

  db.salvarProdutos(produtos);
  res.json(produtos[idx]);
});

// Admin: remove produto
router.delete("/:id", exigirAdmin, (req, res) => {
  const produtos = db.getProdutos();
  const restantes = produtos.filter((p) => p.id !== req.params.id);

  if (restantes.length === produtos.length) {
    return res.status(404).json({ erro: "Produto não encontrado." });
  }

  db.salvarProdutos(restantes);
  res.json({ ok: true });
});

module.exports = router;

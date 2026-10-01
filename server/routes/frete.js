const express = require("express");
const db = require("../db");
const { exigirAdmin } = require("../middleware/auth");
const { calcularFretePorEndereco, montarQueryEndereco, ErroGeocodificacao } = require("../distancia");

const router = express.Router();

// Público: diz qual modo de entrega está ativo, pro checkout saber o que
// mostrar — e também expõe dados públicos usados no preenchimento do
// endereço: a chave do Google Maps restrita ao navegador (pro Places
// Autocomplete) e a localização do restaurante (pra enviesar as sugestões
// pra perto dali). Nenhum dos dois é sensível: a chave só funciona a partir
// do domínio do site (restrição por referrer) e a localização do restaurante
// já é pública por natureza do negócio.
router.get("/", (req, res) => {
  const config = db.getConfigEntrega();
  res.json({
    modo: config.modo,
    googleMapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null,
    coordenadasRestaurante: config.distancia?.coordenadasRestaurante || null,
  });
});

// Público: calcula a taxa de entrega por distância a partir de um endereço em texto.
// Usado tanto pra mostrar uma prévia no checkout quanto (de novo, server-side)
// na hora de criar o pedido de verdade — nunca confiando num valor vindo do front.
router.post("/calcular", async (req, res) => {
  const config = db.getConfigEntrega();
  if (config.modo !== "distancia") {
    return res.status(400).json({ erro: "O cálculo por distância não está ativado." });
  }

  const { rua, numero, bairro, cidade, uf } = req.body;
  if (!rua || !numero || String(rua).trim().length < 3) {
    return res.status(400).json({ erro: "Endereço incompleto." });
  }

  try {
    const { cidadeReferencia } = config.distancia;
    // Se o CEP informado pelo cliente já trouxe cidade/UF (via ViaCEP), usamos
    // esses dados — são mais precisos que a cidade de referência genérica do
    // restaurante. Sem CEP confirmado, caímos de volta na cidade configurada.
    const enderecoTexto = cidade
      ? montarQueryEndereco({ rua, numero, bairro, cidade, uf })
      : montarQueryEndereco({ rua, numero, bairro }) + (cidadeReferencia ? `, ${cidadeReferencia}` : "");
    const resultado = await calcularFretePorEndereco(enderecoTexto, config.distancia);
    res.json(resultado);
  } catch (e) {
    if (e instanceof ErroGeocodificacao) {
      return res.status(400).json({ erro: e.message });
    }
    console.error("Erro ao calcular frete por distância:", e);
    res.status(500).json({ erro: "Não foi possível calcular a taxa de entrega agora." });
  }
});

// Admin: lê a configuração completa (bairro ou distância).
router.get("/admin", exigirAdmin, (req, res) => {
  res.json(db.getConfigEntrega());
});

// Admin: salva a configuração completa.
router.put("/admin", exigirAdmin, (req, res) => {
  const config = req.body;

  if (!["bairro", "distancia"].includes(config.modo)) {
    return res.status(400).json({ erro: "Modo de entrega inválido." });
  }
  if (config.modo === "distancia") {
    const d = config.distancia || {};
    if (
      !d.coordenadasRestaurante ||
      typeof d.coordenadasRestaurante.lat !== "number" ||
      typeof d.coordenadasRestaurante.lng !== "number" ||
      typeof d.precoPorKm !== "number" ||
      d.precoPorKm < 0
    ) {
      return res.status(400).json({ erro: "Configuração de distância incompleta ou inválida." });
    }
  }

  db.salvarConfigEntrega(config);
  res.json({ ok: true });
});

module.exports = router;

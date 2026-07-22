const jwt = require("jsonwebtoken");

function exigirAdmin(req, res, next) {
  const cabecalho = req.headers.authorization || "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: "Faça login para continuar." });
  }

  try {
    const dados = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = dados;
    next();
  } catch (e) {
    return res.status(401).json({ erro: "Sessão expirada, faça login novamente." });
  }
}

module.exports = { exigirAdmin };

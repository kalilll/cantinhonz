const fs = require('fs');
const path = require('path');

const CONTATOS_PATH = path.join(__dirname, 'data', 'contatos.json');

function carregarContatos() {
  const raw = fs.readFileSync(CONTATOS_PATH, 'utf-8');
  return JSON.parse(raw);
}

function salvarContatos(contatos) {
  fs.writeFileSync(CONTATOS_PATH, JSON.stringify(contatos, null, 2), 'utf-8');
}

// Deixa o número só com dígitos e garante o código do país (55) na frente.
// Sem isso, um número digitado no checkout como "(83) 90000-0000" (sem o 55)
// nunca bateria com o mesmo número já salvo como "5583900000000" — usado
// tanto pelo comando /add quanto pela inscrição feita no checkout do site.
function normalizarNumeroWhatsapp(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  if (!digitos) return '';
  // DDD (2 dígitos) + número (8 ou 9 dígitos), sem o código do país.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

function jaEstaNaLista(numero) {
  const numeroLimpo = normalizarNumeroWhatsapp(numero);
  if (!numeroLimpo) return false;
  const contatos = carregarContatos();
  return contatos.some((c) => c.numero === numeroLimpo);
}

function adicionarContato(numero, nome) {
  const contatos = carregarContatos();
  const numeroLimpo = normalizarNumeroWhatsapp(numero);
  if (!numeroLimpo) {
    return { ok: false, motivo: 'Número inválido.' };
  }
  if (contatos.some((c) => c.numero === numeroLimpo)) {
    return { ok: false, motivo: 'Esse número já está na lista.' };
  }
  contatos.push({ numero: numeroLimpo, nome: nome || numeroLimpo });
  salvarContatos(contatos);
  return { ok: true, contatos };
}

function removerContato(numero) {
  const contatos = carregarContatos();
  const numeroLimpo = normalizarNumeroWhatsapp(numero);
  const novaLista = contatos.filter((c) => c.numero !== numeroLimpo);
  if (novaLista.length === contatos.length) {
    return { ok: false, motivo: 'Não encontrei esse número na lista.' };
  }
  salvarContatos(novaLista);
  return { ok: true, contatos: novaLista };
}

function listarContatosTexto() {
  const contatos = carregarContatos();
  if (contatos.length === 0) return 'A lista de contatos está vazia.';
  return contatos
    .map((c, i) => `${i + 1}. ${c.nome} - ${c.numero}`)
    .join('\n');
}

module.exports = {
  carregarContatos,
  salvarContatos,
  normalizarNumeroWhatsapp,
  jaEstaNaLista,
  adicionarContato,
  removerContato,
  listarContatosTexto,
};

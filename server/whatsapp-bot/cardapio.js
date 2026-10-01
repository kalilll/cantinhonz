// Cardapio da semana. "imagem" e o caminho do arquivo dentro da pasta /images.
// "link" e o link de pedido que entra na legenda da mensagem.
// Troque as imagens a vontade - o texto da legenda e montado automaticamente.
//
// O link de pedido usa a mesma PUBLIC_URL do site (já configurada no .env
// principal do projeto) — assim não tem link separado pra lembrar de manter
// atualizado. Só cai no link genérico abaixo se PUBLIC_URL não estiver
// configurada por algum motivo.

const path = require('path');

const IMAGES_DIR = path.join(__dirname, 'images');

const LINK_PEDIDO = process.env.PUBLIC_URL || 'https://cantinhonz.onrender.com/';

const CARDAPIO_SEMANA = {
  // 0 = domingo (sem cardapio, restaurante fechado), 1 = segunda, ... 6 = sabado
  1: { imagem: path.join(IMAGES_DIR, 'segunda.jpeg'), legenda: 'Cardápio de segunda-feira' },
  2: { imagem: path.join(IMAGES_DIR, 'terca.jpeg'), legenda: 'Cardápio de terça-feira' },
  3: { imagem: path.join(IMAGES_DIR, 'quarta.jpeg'), legenda: 'Cardápio de quarta-feira' },
  4: { imagem: path.join(IMAGES_DIR, 'quinta.jpeg'), legenda: 'Cardápio de quinta-feira' },
  5: { imagem: path.join(IMAGES_DIR, 'sexta.jpeg'), legenda: 'Cardápio de sexta-feira' },
  6: { imagem: path.join(IMAGES_DIR, 'sabado.jpeg'), legenda: 'Cardápio de sábado' },
};

function legendaCompleta(legendaBase) {
  return `${legendaBase}\n\nPeça já: ${LINK_PEDIDO}`;
}

function getCardapioDoDia(date = new Date()) {
  const diaSemana = date.getDay();
  const item = CARDAPIO_SEMANA[diaSemana];
  if (!item) return null; // sem cardápio pra esse dia (ex: domingo)
  return {
    imagem: item.imagem,
    legenda: legendaCompleta(item.legenda),
  };
}

module.exports = { getCardapioDoDia, CARDAPIO_SEMANA, LINK_PEDIDO };

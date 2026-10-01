// Geocodifica um endereço (transforma texto em coordenadas) usando a
// Geocoding API do Google Maps Platform, e calcula a distância até o
// restaurante usando a fórmula de Haversine (distância em linha reta).
//
// Como é distância em linha reta e não a rota real de carro/moto, aplicamos um
// "fator de rota" configurável (ex: 1.3) pra aproximar melhor a distância real
// que o entregador vai percorrer nas ruas.
//
// Exige uma chave de API do Google Cloud com a "Geocoding API" ativada, em
// GOOGLE_MAPS_API_KEY. Veja o .env.example para instruções.

const RAIO_TERRA_KM = 6371;
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";

function paraRadianos(graus) {
  return (graus * Math.PI) / 180;
}

// Distância em linha reta entre duas coordenadas, em km.
function distanciaEmLinhaReta(lat1, lng1, lat2, lng2) {
  const dLat = paraRadianos(lat2 - lat1);
  const dLng = paraRadianos(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(paraRadianos(lat1)) * Math.cos(paraRadianos(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RAIO_TERRA_KM * c;
}

class ErroGeocodificacao extends Error {}

// Monta o texto de busca usado na geocodificação a partir dos campos separados
// do endereço (rua, número, bairro, cidade, UF).
//
// Importante: o COMPLEMENTO (quadra, lote, conjunto, apto, casa...) nunca deve
// entrar nessa busca — é justamente esse tipo de informação (ex: "Quadra 73
// Lote 08") que confunde os serviços de geocodificação, fazendo o pedido cair
// no lugar errado. O complemento fica só no texto exibido pro entregador,
// nunca na query de geocodificação.
function montarQueryEndereco({ rua, numero, bairro, cidade, uf }) {
  const partes = [[rua, numero].filter(Boolean).join(", "), bairro, cidade, uf, "Brasil"].filter(
    (parte) => parte && String(parte).trim().length > 0
  );
  return partes.join(", ");
}

// Transforma um endereço em texto em {lat, lng} usando a Geocoding API do Google.
//
// Importante: passamos "bounds" com uma caixa ao redor do restaurante pra
// influenciar o Google a priorizar resultados da região (o Google trata isso
// como preferência, não como um filtro rígido — diferente de um bbox estrito).
// Por isso a checagem de distância "de sanidade" logo abaixo, em
// calcularFretePorEndereco, continua sendo a proteção real contra um endereço
// mal escrito ou ambíguo (ex: "R. Macedônia" sendo confundido com uma cidade
// de mesmo nome a milhares de km) ser "encontrado" longe da área de entrega.
async function geocodificarEndereco(enderecoTexto, coordenadasRestaurante) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new ErroGeocodificacao(
      "Geocodificação não configurada no servidor (GOOGLE_MAPS_API_KEY ausente). Contate o restaurante."
    );
  }

  const params = new URLSearchParams({
    address: enderecoTexto,
    key: apiKey,
    region: "br",
    components: "country:BR",
    language: "pt-BR",
  });

  if (coordenadasRestaurante) {
    const { lat, lng } = coordenadasRestaurante;
    // Caixa de ~1.5 grau (~165km) ao redor do restaurante — generosa o
    // suficiente pra qualquer raio de entrega realista.
    const margem = 1.5;
    params.set("bounds", `${lat - margem},${lng - margem}|${lat + margem},${lng + margem}`);
  }

  const url = `${GOOGLE_GEOCODING_URL}?${params.toString()}`;

  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new ErroGeocodificacao("Não foi possível verificar o endereço agora. Tente novamente em instantes.");
  }

  if (!resp.ok) {
    throw new ErroGeocodificacao("Não foi possível verificar o endereço agora. Tente novamente em instantes.");
  }

  const dados = await resp.json();

  if (dados.status === "ZERO_RESULTS") {
    throw new ErroGeocodificacao(
      "Não conseguimos localizar esse endereço dentro da nossa área de entrega. Confira se a rua, o número e o bairro estão certos."
    );
  }
  if (dados.status !== "OK") {
    // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST etc. — problema de
    // configuração/cota, não do endereço do cliente. Logamos o motivo real
    // pro admin investigar, mas mostramos uma mensagem genérica pro cliente.
    console.error("Erro na Geocoding API do Google:", dados.status, dados.error_message || "");
    throw new ErroGeocodificacao("Não foi possível verificar o endereço agora. Tente novamente em instantes.");
  }

  const resultado = dados.results[0];
  const { lat, lng } = resultado.geometry.location;
  return { lat, lng, enderecoEncontrado: resultado.formatted_address };
}

// Calcula a taxa de entrega por distância a partir do endereço do cliente.
// `origemEndereco` pode ser um texto pronto ou um objeto
// { rua, numero, bairro, cidade, uf } — nesse caso a query é montada aqui.
async function calcularFretePorEndereco(origemEndereco, configDistancia) {
  const { coordenadasRestaurante, taxaBase, precoPorKm, fatorRota, raioMaximoKm } = configDistancia;

  const enderecoTexto =
    typeof origemEndereco === "string" ? origemEndereco : montarQueryEndereco(origemEndereco);

  const geo = await geocodificarEndereco(enderecoTexto, coordenadasRestaurante);
  const distanciaReta = distanciaEmLinhaReta(
    coordenadasRestaurante.lat,
    coordenadasRestaurante.lng,
    geo.lat,
    geo.lng
  );
  const distanciaKm = Number((distanciaReta * (fatorRota || 1)).toFixed(2));

  // Proteção extra: mesmo com a busca influenciada pra região certa, se por
  // algum motivo a distância calculada for implausível pra uma entrega (ex:
  // erro de geocodificação), trata como endereço não encontrado em vez de
  // cobrar (ou recusar) um valor sem sentido.
  const LIMITE_SANIDADE_KM = 150;
  if (distanciaKm > LIMITE_SANIDADE_KM) {
    throw new ErroGeocodificacao(
      "Não conseguimos confirmar esse endereço direito. Revise a rua e o número, ou entre em contato com o restaurante."
    );
  }

  const dentroDoRaio = !raioMaximoKm || distanciaKm <= raioMaximoKm;
  const taxa = dentroDoRaio ? Number((taxaBase + distanciaKm * precoPorKm).toFixed(2)) : null;

  return {
    distanciaKm,
    taxa,
    dentroDoRaio,
    lat: geo.lat,
    lng: geo.lng,
    enderecoEncontrado: geo.enderecoEncontrado,
  };
}

// Gera um link do Google Maps a partir de COORDENADAS (lat/lng), em vez de
// texto de endereço. Isso evita que o Google Maps precise reinterpretar um
// endereço com quadra/lote/conjunto por conta própria — o pino aponta direto
// pro ponto que a Geocoding API já resolveu, reduzindo a ambiguidade que o
// entregador enfrentava com links baseados só em texto.
function gerarLinkGoogleMaps(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

module.exports = {
  distanciaEmLinhaReta,
  geocodificarEndereco,
  calcularFretePorEndereco,
  montarQueryEndereco,
  gerarLinkGoogleMaps,
  ErroGeocodificacao,
};

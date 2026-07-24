// Geocodifica um endereço (transforma texto em coordenadas) usando o Nominatim,
// o serviço gratuito de geocodificação do OpenStreetMap, e calcula a distância
// até o restaurante usando a fórmula de Haversine (distância em linha reta).
//
// Como é distância em linha reta e não a rota real de carro/moto, aplicamos um
// "fator de rota" configurável (ex: 1.3) pra aproximar melhor a distância real
// que o entregador vai percorrer nas ruas.

const RAIO_TERRA_KM = 6371;

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

// Transforma um endereço em texto em {lat, lng} usando o Nominatim (OpenStreetMap).
// Uso gratuito, mas com limite de ~1 requisição por segundo e exige um
// User-Agent identificando a aplicação — ambos respeitados aqui.
//
// Importante: restringimos a busca a uma área ao redor do restaurante
// (parâmetros viewbox + bounded=1). Sem isso, um endereço mal escrito ou
// ambíguo (ex: "R. Macedônia" sendo confundido com a cidade de Macedônia-SP,
// a milhares de km de distância) pode ser "encontrado" em qualquer lugar do
// Brasil, gerando distâncias absurdas.
async function geocodificarEndereco(enderecoTexto, coordenadasRestaurante) {
  const params = new URLSearchParams({
    format: "json",
    limit: "1",
    countrycodes: "br",
    q: enderecoTexto,
  });

  if (coordenadasRestaurante) {
    // Caixa de ~1.5 grau (~165km) ao redor do restaurante — generosa o
    // suficiente pra qualquer raio de entrega realista, mas pequena o
    // bastante pra descartar resultados em outros estados/países.
    const { lat, lng } = coordenadasRestaurante;
    const margem = 1.5;
    params.set("viewbox", `${lng - margem},${lat + margem},${lng + margem},${lat - margem}`);
    params.set("bounded", "1");
  }

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  let resp;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": "CantinhoNZ-Quentinhas/1.0 (sistema de pedidos online)" },
    });
  } catch (e) {
    throw new ErroGeocodificacao("Não foi possível verificar o endereço agora. Tente novamente em instantes.");
  }

  if (!resp.ok) {
    throw new ErroGeocodificacao("Não foi possível verificar o endereço agora. Tente novamente em instantes.");
  }

  const resultados = await resp.json();
  if (!resultados || resultados.length === 0) {
    throw new ErroGeocodificacao(
      "Não conseguimos localizar esse endereço dentro da nossa área de entrega. Confira se a rua e o número estão certos."
    );
  }

  return {
    lat: Number(resultados[0].lat),
    lng: Number(resultados[0].lon),
    enderecoEncontrado: resultados[0].display_name,
  };
}

// Calcula a taxa de entrega por distância a partir de um endereço em texto.
async function calcularFretePorEndereco(enderecoTexto, configDistancia) {
  const { coordenadasRestaurante, taxaBase, precoPorKm, fatorRota, raioMaximoKm } = configDistancia;

  const geo = await geocodificarEndereco(enderecoTexto, coordenadasRestaurante);
  const distanciaReta = distanciaEmLinhaReta(
    coordenadasRestaurante.lat,
    coordenadasRestaurante.lng,
    geo.lat,
    geo.lng
  );
  const distanciaKm = Number((distanciaReta * (fatorRota || 1)).toFixed(2));

  // Proteção extra: mesmo com a busca restrita, se por algum motivo a
  // distância calculada for implausível pra uma entrega (ex: erro de
  // geocodificação), trata como endereço não encontrado em vez de cobrar
  // (ou recusar) um valor sem sentido.
  const LIMITE_SANIDADE_KM = 150;
  if (distanciaKm > LIMITE_SANIDADE_KM) {
    throw new ErroGeocodificacao(
      "Não conseguimos confirmar esse endereço direito. Revise a rua e o número, ou entre em contato com o restaurante."
    );
  }

  const dentroDoRaio = !raioMaximoKm || distanciaKm <= raioMaximoKm;
  const taxa = dentroDoRaio ? Number((taxaBase + distanciaKm * precoPorKm).toFixed(2)) : null;

  return { distanciaKm, taxa, dentroDoRaio, enderecoEncontrado: geo.enderecoEncontrado };
}

module.exports = { distanciaEmLinhaReta, geocodificarEndereco, calcularFretePorEndereco, ErroGeocodificacao };

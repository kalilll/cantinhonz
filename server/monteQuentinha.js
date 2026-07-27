// Valida uma quentinha montada pelo cliente contra a configuração atual
// (server/data/opcoes-quentinha.json) e calcula o preço correto.
// Nunca confie em preços vindos do front-end: este módulo é a única fonte da verdade.
//
// Regra de negócio: cada tamanho inclui um número de itens "grátis" por grupo
// (ex: Média inclui 1 proteína e 3 acompanhamentos). O cliente pode escolher
// mais itens do que isso — eles não são bloqueados, só passam a cobrar o
// "precoExtra" próprio do item. Itens de grupos "adicional"
// sempre cobram seu precoExtra, pois não têm itens grátis inclusos.

function validarECalcularMonte(escolha, config, disponibilidadeHoje) {
  const { tamanhoId, selecoes } = escolha;

  const tamanho = config.tamanhos.find((t) => t.id === tamanhoId && t.ativo !== false);
  if (!tamanho) {
    throw new Erro("Tamanho de quentinha inválido ou indisponível.");
  }

  let total = tamanho.preco;
  const resumoPartes = [];
  const ingredientes = [];

  for (const grupo of config.grupos) {
    if (grupo.ativo === false) continue;

    const idsSelecionados = (selecoes && selecoes[grupo.id]) || [];
    const itensValidos = grupo.itens.filter((i) => i.ativo !== false);
    const idsPermitidosHoje = disponibilidadeHoje?.[grupo.id];

    const itensEscolhidos = idsSelecionados.map((id) => {
      const item = itensValidos.find((i) => i.id === id);
      if (!item) throw new Erro(`Item inválido em "${grupo.nome}".`);
      // Se há um cardápio configurado para hoje e o item não está nele,
      // barra o pedido (evita escolher algo que só existe no cardápio de outro dia).
      if (idsPermitidosHoje && !idsPermitidosHoje.includes(id)) {
        throw new Erro(`"${item.nome}" não está disponível no cardápio de hoje.`);
      }
      return item;
    });

    if (grupo.modoSelecao === "unica") {
      if (itensEscolhidos.length > 1) {
        throw new Erro(`Escolha só um item em "${grupo.nome}".`);
      }
      if (grupo.obrigatorio && itensEscolhidos.length === 0) {
        throw new Erro(`Escolha uma opção em "${grupo.nome}".`);
      }
    }

    if (itensEscolhidos.length === 0) continue;

    if (grupo.tipo === "inclusa") {
      const limite = grupo.limites?.[tamanhoId] ?? 0;
      const nomes = [];

      itensEscolhidos.forEach((item, idx) => {
        if (idx < limite) {
          nomes.push(item.nome);
          ingredientes.push(item.nome);
        } else {
          total += item.precoExtra || 0;
          nomes.push(`${item.nome} (extra)`);
          ingredientes.push(`${item.nome} (extra)`);
        }
      });

      resumoPartes.push(nomes.join(", "));
    } else if (grupo.tipo === "adicional") {
      for (const item of itensEscolhidos) {
        total += item.precoExtra || 0;
        ingredientes.push(`${item.nome} (adicional)`);
      }
      resumoPartes.push(`+ ${itensEscolhidos.map((i) => i.nome).join(", ")}`);
    }
  }

  const nomeBase = `Quentinha ${tamanho.nome}`;
  const nome = `${nomeBase}${resumoPartes.length ? " — " + resumoPartes.join("; ") : ""}`;

  return {
    nome,
    nomeBase,
    preco: Number(total.toFixed(2)),
    ingredientes,
  };
}

class Erro extends Error {}

module.exports = { validarECalcularMonte, ErroValidacaoMonte: Erro };

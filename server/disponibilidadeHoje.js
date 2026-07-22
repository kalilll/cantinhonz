// Calcula quais itens de cada grupo estão disponíveis numa determinada data,
// combinando o padrão da semana (ex: "toda segunda tem bife e frango") com uma
// substituição pontual cadastrada para aquele dia específico (ex: "dia 22/07,
// trocar o frango por linguiça"), caso exista uma.

const DIAS_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

// Formata uma data no fuso local como "YYYY-MM-DD" (evita problemas de fuso
// horário que o toISOString() teria ao converter para UTC).
function formatarDataLocal(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function nomeDiaSemana(data) {
  return DIAS_SEMANA[data.getDay()];
}

// Retorna { grupoId: [itemIds disponíveis] } para uma data específica.
// Se não houver disponibilidade semanal configurada para um grupo, retorna
// undefined para esse grupo, o que os chamadores devem tratar como
// "sem restrição, mostrar tudo que estiver ativo" (comportamento anterior à
// existência do cardápio por dia, para não quebrar quem ainda não configurou).
function calcularDisponibilidadeEm(data, disponibilidadeSemanal, substituicoes) {
  const chaveData = formatarDataLocal(data);
  const dia = nomeDiaSemana(data);

  const substituicaoDoDia = substituicoes[chaveData];
  const padraoDoDia = disponibilidadeSemanal[dia];

  if (substituicaoDoDia) {
    // A substituição de uma data específica sempre tem prioridade e já vem
    // como a lista completa e final para aquele grupo naquele dia.
    return { ...(padraoDoDia || {}), ...substituicaoDoDia };
  }

  return padraoDoDia;
}

module.exports = { DIAS_SEMANA, formatarDataLocal, nomeDiaSemana, calcularDisponibilidadeEm };

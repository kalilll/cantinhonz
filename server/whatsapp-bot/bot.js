// Bot do cardápio diário no WhatsApp — roda dentro do mesmo processo do site
// (chamado a partir de server/index.js), pra usar uma única instância paga
// no serviço de hospedagem em vez de duas.
//
// Importante: iniciarBotWhatsapp() NUNCA derruba o processo (nada de
// process.exit aqui) — se a configuração do bot estiver incompleta ou algo
// falhar, ele só loga o erro e o site continua rodando normalmente.
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');

const { getCardapioDoDia } = require('./cardapio');
const {
  listarContatosTexto,
  adicionarContato,
  removerContato,
  carregarContatos,
  normalizarNumeroWhatsapp,
} = require('./contatos');

const OWNER_NUMBER = process.env.OWNER_NUMBER;
const PREVIEW_CRON = process.env.PREVIEW_CRON || '0 9 * * *';
const TIMEZONE = process.env.TIMEZONE || 'America/Fortaleza';
const DELAY_MIN = parseInt(process.env.DELAY_MIN_SECONDS || '3', 10) * 1000;
const DELAY_MAX = parseInt(process.env.DELAY_MAX_SECONDS || '8', 10) * 1000;

const ownerJid = OWNER_NUMBER ? `${OWNER_NUMBER}@s.whatsapp.net` : null;

// Estado do dia: qual imagem/legenda vai ser enviada e se ja foi confirmada
let estadoDoDia = {
  imagem: null,
  legenda: null,
  confirmado: false,
};

function iniciarNovoDia() {
  const cardapio = getCardapioDoDia();
  if (!cardapio) {
    estadoDoDia = { imagem: null, legenda: null, confirmado: false };
    return;
  }
  estadoDoDia = {
    imagem: cardapio.imagem,
    legenda: cardapio.legenda,
    confirmado: false,
  };
}

function esperarAleatorio() {
  const ms = Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verificarNumeroDono(sock) {
  try {
    const resultado = await sock.onWhatsApp(OWNER_NUMBER);
    if (!resultado || resultado.length === 0 || !resultado[0].exists) {
      console.error(
        `⚠️ ATENÇÃO: o número "${OWNER_NUMBER}" configurado em OWNER_NUMBER NÃO foi encontrado no WhatsApp.\n` +
        `Verifique se está no formato correto: código do país + DDD + número, só dígitos (ex: 5586999998888).\n` +
        `As mensagens não vão chegar até isso ser corrigido.`
      );
      return;
    }
    console.log(`[whatsapp-bot] Número do dono confirmado no WhatsApp: ${resultado[0].jid}`);
  } catch (erro) {
    console.error('[whatsapp-bot] Não consegui verificar o número do dono:', erro.message);
  }
}

// Ponto de entrada — chamado uma vez a partir de server/index.js.
function iniciarBotWhatsapp() {
  if (!OWNER_NUMBER) {
    console.log(
      '[whatsapp-bot] OWNER_NUMBER não configurado no .env — bot do cardápio via WhatsApp desativado ' +
      '(o site continua funcionando normalmente).'
    );
    return;
  }

  conectar().catch((erro) => {
    console.error('[whatsapp-bot] Falha ao iniciar o bot do WhatsApp (site continua no ar):', erro);
  });
}

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, 'auth_info')
  );

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('[whatsapp-bot] Escaneie o QR code abaixo no WhatsApp do número que vai enviar as mensagens:');
      require('qrcode-terminal').generate(qr, { small: true });
    }
    if (connection === 'close') {
      const motivo = lastDisconnect?.error?.output?.statusCode;
      const deveReconectar = motivo !== DisconnectReason.loggedOut;
      console.log('[whatsapp-bot] Conexão encerrada.', motivo, 'Reconectando:', deveReconectar);
      if (deveReconectar) {
        conectar().catch((erro) => console.error('[whatsapp-bot] Falha ao reconectar:', erro));
      }
    } else if (connection === 'open') {
      console.log('[whatsapp-bot] Conectado ao WhatsApp com sucesso.');
      verificarNumeroDono(sock);
    }
  });

  console.log(`[whatsapp-bot] Prévia agendada: "${PREVIEW_CRON}" no fuso ${TIMEZONE}`);

  // Agenda a mensagem de previa/aprovacao pro dono
  cron.schedule(
    PREVIEW_CRON,
    () => {
      console.log(`[whatsapp-bot] [${new Date().toLocaleString('pt-BR')}] Disparando prévia agendada...`);
      iniciarNovoDia();
      if (!estadoDoDia.imagem) {
        console.log('[whatsapp-bot] Sem cardápio pra hoje (domingo) - nenhuma prévia enviada.');
        return;
      }
      enviarPreviaParaDono(sock).catch((erro) => {
        console.error('[whatsapp-bot] Erro ao enviar a prévia pro dono:', erro);
      });
    },
    { timezone: TIMEZONE }
  );

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;
    if (msg.key.remoteJid !== ownerJid) return; // só aceita comando do dono

    const ehContatoCompartilhado = !!(msg.message.contactMessage || msg.message.contactsArrayMessage);
    const texto =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';
    // Só processa se começar com "/" (ou for um contato compartilhado, que
    // normalmente não vem com legenda nenhuma) - isso evita que o bot tente
    // reprocessar as próprias mensagens de resposta (relevante principalmente
    // quando o número do bot e o número do dono são o mesmo, testando localmente)
    if (!ehContatoCompartilhado && !texto.trim().startsWith('/')) return;

    await tratarMensagemDono(sock, msg);
  });
}

async function enviarPreviaParaDono(sock) {
  console.log(`[whatsapp-bot] Preparando prévia para enviar a: ${ownerJid}`);

  let imagemBuffer;
  try {
    imagemBuffer = fs.readFileSync(estadoDoDia.imagem);
  } catch (erro) {
    console.error('[whatsapp-bot] Falha ao ler a imagem do dia:', erro.message);
    await sock.sendMessage(ownerJid, {
      text:
        `⚠️ Não encontrei a imagem do cardápio de hoje em:\n${estadoDoDia.imagem}\n\n` +
        `Verifique se o arquivo existe com esse nome exato na pasta images/, e depois reinicie o bot.`,
    });
    return;
  }

  const texto =
    `📋 Cardápio de hoje pronto para revisão.\n\n` +
    `Comandos disponíveis:\n` +
    `/c - ver e editar a lista de contatos\n` +
    `/s - confirmar e enviar para os clientes agora\n` +
    `/m - substituir a imagem de hoje (envie a foto nova com a legenda /m)\n\n` +
    `Dica: pra adicionar contato novo, é só compartilhar o(s) contato(s) direto do WhatsApp aqui nessa conversa (não precisa digitar o número).`;

  await sock.sendMessage(ownerJid, {
    image: imagemBuffer,
    caption: `${estadoDoDia.legenda}\n\n(prévia - ainda não foi enviado pros clientes)`,
  });
  console.log('[whatsapp-bot] Imagem da prévia enviada com sucesso.');
  await sock.sendMessage(ownerJid, { text: texto });
}

// Extrai nome e número de um vCard (formato usado pelo WhatsApp ao
// compartilhar um contato). Prioriza o parâmetro "waid" da linha TEL quando
// existe — é o número já formatado pro WhatsApp, mais confiável do que tentar
// reconstruir a partir do número visível (que pode ter máscara, +, espaços etc).
function parseVCard(vcard) {
  const linhas = String(vcard || '').split(/\r?\n/);
  const linhaFN = linhas.find((l) => l.startsWith('FN:'));
  const nome = linhaFN ? linhaFN.slice(3).trim() : '';

  const linhaTel = linhas.find((l) => l.startsWith('TEL'));
  let numero = '';
  if (linhaTel) {
    const waidMatch = linhaTel.match(/waid=(\d+)/);
    numero = waidMatch ? waidMatch[1] : (linhaTel.split(':').pop() || '');
  }

  return { nome, numero: normalizarNumeroWhatsapp(numero) };
}

async function tratarContatosCompartilhados(sock, msg) {
  const vcards = [];
  if (msg.message.contactMessage?.vcard) {
    vcards.push(msg.message.contactMessage.vcard);
  }
  if (msg.message.contactsArrayMessage?.contacts) {
    for (const contato of msg.message.contactsArrayMessage.contacts) {
      if (contato.vcard) vcards.push(contato.vcard);
    }
  }

  if (vcards.length === 0) {
    await sock.sendMessage(ownerJid, {
      text: 'Não consegui ler esse contato. Tente compartilhar de novo, ou use /add 5586999998888 Nome.',
    });
    return;
  }

  let adicionados = 0;
  let duplicados = 0;
  let invalidos = 0;

  for (const vcard of vcards) {
    const { nome, numero } = parseVCard(vcard);
    if (!numero) {
      invalidos += 1;
      continue;
    }
    const resultado = adicionarContato(numero, nome);
    if (resultado.ok) adicionados += 1;
    else duplicados += 1;
  }

  const partes = [];
  if (adicionados > 0) partes.push(`${adicionados} contato(s) adicionado(s)`);
  if (duplicados > 0) partes.push(`${duplicados} já estavam na lista`);
  if (invalidos > 0) partes.push(`${invalidos} sem número válido`);

  await sock.sendMessage(ownerJid, {
    text: `📇 ${partes.join(', ')}.\n\nUse /c pra ver a lista completa.`,
  });
}

async function tratarMensagemDono(sock, msg) {
  // Contato(s) compartilhado(s) direto do WhatsApp — não tem texto de
  // comando, então é tratado antes de tentar interpretar como "/algo".
  if (msg.message.contactMessage || msg.message.contactsArrayMessage) {
    await tratarContatosCompartilhados(sock, msg);
    return;
  }

  const texto =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    '';
  const comando = texto.trim().split(' ')[0].toLowerCase();

  if (comando === '/c') {
    const lista = listarContatosTexto();
    await sock.sendMessage(ownerJid, {
      text:
        `Lista de contatos atual:\n\n${lista}\n\n` +
        `Para adicionar: /add 5586999998888 Nome do cliente (ou compartilhe o contato direto do WhatsApp, um ou vários de uma vez)\n` +
        `Para remover: /remove 5586999998888`,
    });
    return;
  }

  if (comando === '/add') {
    const partes = texto.trim().split(' ');
    const numero = partes[1];
    const nome = partes.slice(2).join(' ');
    if (!numero) {
      await sock.sendMessage(ownerJid, { text: 'Uso: /add 5586999998888 Nome do cliente' });
      return;
    }
    const resultado = adicionarContato(numero, nome);
    await sock.sendMessage(ownerJid, {
      text: resultado.ok
        ? `Contato adicionado. A lista agora tem ${resultado.contatos.length} contatos.`
        : resultado.motivo,
    });
    return;
  }

  if (comando === '/remove') {
    const partes = texto.trim().split(' ');
    const numero = partes[1];
    if (!numero) {
      await sock.sendMessage(ownerJid, { text: 'Uso: /remove 5586999998888' });
      return;
    }
    const resultado = removerContato(numero);
    await sock.sendMessage(ownerJid, {
      text: resultado.ok
        ? `Contato removido. A lista agora tem ${resultado.contatos.length} contatos.`
        : resultado.motivo,
    });
    return;
  }

  if (comando === '/m') {
    if (!msg.message.imageMessage) {
      await sock.sendMessage(ownerJid, {
        text: 'Pra trocar a imagem, envie a foto nova com a legenda /m junto.',
      });
      return;
    }
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const novoCaminho = path.join(__dirname, 'images', 'override-hoje.jpg');
    fs.writeFileSync(novoCaminho, buffer);
    estadoDoDia.imagem = novoCaminho;
    estadoDoDia.confirmado = false;
    await sock.sendMessage(ownerJid, {
      text: 'Imagem de hoje atualizada. Envie /s quando estiver tudo certo para disparar.',
    });
    return;
  }

  if (comando === '/s') {
    if (estadoDoDia.confirmado) {
      await sock.sendMessage(ownerJid, { text: 'Já foi enviado hoje.' });
      return;
    }
    estadoDoDia.confirmado = true;
    await sock.sendMessage(ownerJid, { text: 'Confirmado! Iniciando o envio para os clientes...' });
    await enviarParaClientes(sock);
    return;
  }

  await sock.sendMessage(ownerJid, {
    text: 'Comando não reconhecido. Use /c, /s ou /m.',
  });
}

async function enviarParaClientes(sock) {
  let imagemBuffer;
  try {
    imagemBuffer = fs.readFileSync(estadoDoDia.imagem);
  } catch (erro) {
    console.error('[whatsapp-bot] Falha ao ler a imagem do dia:', erro.message);
    await sock.sendMessage(ownerJid, {
      text: `⚠️ Não consegui ler a imagem do cardápio (${estadoDoDia.imagem}). Envio cancelado.`,
    });
    return;
  }

  const contatos = carregarContatos();
  let enviados = 0;
  let falhas = 0;

  for (const contato of contatos) {
    const jid = `${contato.numero}@s.whatsapp.net`;
    try {
      await sock.sendMessage(jid, {
        image: imagemBuffer,
        caption: estadoDoDia.legenda,
      });
      enviados += 1;
    } catch (erro) {
      console.error(`[whatsapp-bot] Falha ao enviar para ${contato.numero}:`, erro.message);
      falhas += 1;
    }
    await esperarAleatorio();
  }

  await sock.sendMessage(ownerJid, {
    text: `Envio concluído: ${enviados} enviados, ${falhas} falharam.`,
  });
}

module.exports = { iniciarBotWhatsapp };

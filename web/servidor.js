'use strict';

/**
 * Visualizador web (recurso extra, opcional).
 *
 * Pagina somente-leitura para acompanhar na tela o que esta gravado no
 * MongoDB. Usa apenas o modulo nativo "http" - nenhuma dependencia nova - e
 * expoe quatro rotas GET que chamam as mesmas classes usadas pelo menu.
 *
 * Nenhuma rota escreve no banco: a interface serve para ver os dados, e todas
 * as operacoes de escrita continuam no menu do terminal (npm start).
 *
 * Execucao: npm run web
 */

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const Aplicacao = require('../src/Aplicacao');
const ChatService = require('../src/services/ChatService');
const { Usuario, Mensagem } = require('../src/models');
const Terminal = require('../src/views/Terminal');
const logger = require('../src/utils/Logger');
const { ErroAplicacao, ErroValidacao, ErroNaoEncontrado, ErroConexao } = require('../src/errors');

const PORTA = Number(process.env.PORTA) || 3000;
const PUBLICO = path.join(__dirname, 'publico');

/** Tipos de conteudo dos arquivos entregues. */
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

/** Rotas da API - todas somente leitura. */
const ROTAS = [
  {
    caminho: /^\/api\/usuarios$/,
    acao: async () => (await Usuario.listar({}, { ordenar: { nome: 1 } })).map((u) => u.paraJSON())
  },
  {
    caminho: /^\/api\/usuarios\/([^/]+)\/painel$/,
    acao: async ([id]) => {
      const painel = await ChatService.painelDoUsuario(id);

      return { ...painel, usuario: painel.usuario.paraJSON() };
    }
  },
  {
    caminho: /^\/api\/conversas\/([^/]+)\/mensagens$/,
    acao: async ([id]) => Mensagem.historicoDetalhado(id, { limite: 100 })
  },
  {
    caminho: /^\/api\/estatisticas$/,
    acao: async () => ChatService.estatisticasGerais()
  }
];

/**
 * Converte uma excecao da aplicacao no codigo HTTP correspondente.
 *
 * @param {Error} erro Excecao capturada.
 * @returns {number}
 */
function statusDoErro(erro) {
  if (erro instanceof ErroValidacao) return 400;
  if (erro instanceof ErroNaoEncontrado) return 404;
  if (erro instanceof ErroConexao) return 503;

  return erro instanceof ErroAplicacao ? 409 : 500;
}

/**
 * Responde em JSON.
 *
 * @param {http.ServerResponse} resposta
 * @param {number} status Codigo HTTP.
 * @param {*} dados Conteudo.
 * @returns {void}
 */
function responderJson(resposta, status, dados) {
  resposta.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  resposta.end(JSON.stringify(dados));
}

/**
 * Entrega um arquivo da pasta publica.
 *
 * @param {http.ServerResponse} resposta
 * @param {string} caminho Caminho pedido na URL.
 * @returns {Promise<void>}
 */
async function entregarArquivo(resposta, caminho) {
  const relativo = caminho === '/' ? 'index.html' : decodeURIComponent(caminho).replace(/^\/+/, '');
  const completo = path.resolve(PUBLICO, relativo);

  // Impede o acesso a arquivos fora da pasta publica.
  if (!completo.startsWith(PUBLICO)) {
    responderJson(resposta, 403, { erro: 'Acesso negado' });
    return;
  }

  try {
    const conteudo = await fs.readFile(completo);

    resposta.writeHead(200, { 'Content-Type': `${TIPOS[path.extname(completo)] ?? 'text/plain'}; charset=utf-8` });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404);
    resposta.end('Arquivo nao encontrado');
  }
}

/**
 * Trata uma requisicao: API ou arquivo estatico.
 *
 * @param {http.IncomingMessage} requisicao
 * @param {http.ServerResponse} resposta
 * @returns {Promise<void>}
 */
async function tratar(requisicao, resposta) {
  const { pathname } = new URL(requisicao.url, `http://localhost:${PORTA}`);

  if (!pathname.startsWith('/api/')) {
    await entregarArquivo(resposta, pathname);
    return;
  }

  if (requisicao.method !== 'GET') {
    responderJson(resposta, 405, { erro: 'Esta interface e somente leitura' });
    return;
  }

  for (const rota of ROTAS) {
    const partes = pathname.match(rota.caminho);
    if (!partes) continue;

    try {
      responderJson(resposta, 200, await rota.acao(partes.slice(1)));
    } catch (erro) {
      // Excecoes previstas ja foram registradas pelas classes de dominio.
      if (!(erro instanceof ErroAplicacao)) logger.erro(erro, { operacao: `ServidorWeb(${pathname})` });

      responderJson(resposta, statusDoErro(erro), { erro: erro.message, tipo: erro.name });
    }

    return;
  }

  responderJson(resposta, 404, { erro: `Rota nao encontrada: ${pathname}` });
}

Aplicacao.executar('visualizador-web', () =>
  new Promise((resolver, rejeitar) => {
    const servidor = http.createServer((requisicao, resposta) => {
      tratar(requisicao, resposta).catch((erro) => {
        logger.erro(erro, { operacao: 'ServidorWeb.tratar' });
        responderJson(resposta, 500, { erro: 'Erro interno no servidor' });
      });
    });

    servidor.on('error', rejeitar);

    servidor.listen(PORTA, () => {
      Terminal.titulo('zapchat - visualizador web (somente leitura)');
      Terminal.sucesso(`No ar em http://localhost:${PORTA}`);
      Terminal.info('As operacoes de escrita ficam no menu do terminal (npm start).');
      Terminal.info('Pressione Ctrl+C para encerrar.');
    });

    process.on('SIGINT', () => servidor.close(() => resolver()));
  })
);

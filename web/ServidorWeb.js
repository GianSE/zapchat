'use strict';

/**
 * Servidor HTTP da interface web (recurso extra do projeto).
 *
 * Utiliza apenas o modulo nativo "http" do Node.js - nenhum framework e
 * nenhuma dependencia adicional. O servidor tem duas responsabilidades:
 *
 *   1. entregar os arquivos estaticos da pasta "web/publico" (HTML, CSS e JS);
 *   2. expor as operacoes da aplicacao como uma API JSON, chamando as mesmas
 *      classes de entidade e o mesmo ChatService usados pelo menu do terminal.
 *
 * Nenhuma regra de negocio fica aqui: esta classe apenas traduz requisicoes
 * HTTP em chamadas as classes de dominio e converte as excecoes da aplicacao
 * nos codigos de status correspondentes.
 */

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const rotas = require('./rotas');
const Terminal = require('../src/cli/Terminal');
const logger = require('../src/utils/Logger');
const {
  ErroAplicacao,
  ErroValidacao,
  ErroNaoEncontrado,
  ErroRegraNegocio,
  ErroBanco,
  ErroConexao
} = require('../src/errors');

/** Tipos de conteudo dos arquivos estaticos entregues pelo servidor. */
const TIPOS_DE_ARQUIVO = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
});

/** Tamanho maximo aceito no corpo de uma requisicao (64 KB). */
const LIMITE_CORPO = 64 * 1024;

class ServidorWeb {
  /** @type {http.Server|null} */
  #servidor = null;

  /**
   * @param {object} [opcoes]
   * @param {number} [opcoes.porta] Porta de escuta.
   * @param {string} [opcoes.diretorioPublico] Pasta com os arquivos estaticos.
   */
  constructor({ porta = Number(process.env.PORTA) || 3000, diretorioPublico = path.join(__dirname, 'publico') } = {}) {
    this.porta = porta;
    this.diretorioPublico = diretorioPublico;
  }

  // ---------------------------------------------------------------------------
  // Ciclo de vida
  // ---------------------------------------------------------------------------

  /**
   * Sobe o servidor e mantem a aplicacao em execucao ate que ele seja encerrado
   * (Ctrl+C no terminal).
   *
   * @returns {Promise<void>} Resolve quando o servidor e encerrado.
   */
  iniciar() {
    return new Promise((resolver, rejeitar) => {
      this.#servidor = http.createServer((requisicao, resposta) => {
        this.#tratarRequisicao(requisicao, resposta).catch((erro) => {
          // Rede de seguranca: nenhuma falha deve derrubar o servidor.
          logger.erro(erro, { operacao: 'ServidorWeb.tratarRequisicao' });
          this.#responderJson(resposta, 500, { erro: 'Erro interno no servidor' });
        });
      });

      this.#servidor.on('error', (erro) => {
        logger.erro(erro, { operacao: 'ServidorWeb.iniciar' });
        rejeitar(erro);
      });

      this.#servidor.listen(this.porta, () => {
        Terminal.titulo('zapchat - interface web');
        Terminal.sucesso(`Servidor no ar em http://localhost:${this.porta}`);
        Terminal.info('Abra esse endereco no navegador. Pressione Ctrl+C para encerrar.');

        logger.info(`Servidor web iniciado na porta ${this.porta}`, { operacao: 'ServidorWeb.iniciar' });
      });

      // Ctrl+C encerra o servidor e libera a conexao com o MongoDB.
      process.on('SIGINT', () => {
        Terminal.info('\nEncerrando o servidor...');

        this.#servidor.close(() => resolver());
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Tratamento das requisicoes
  // ---------------------------------------------------------------------------

  /**
   * Direciona a requisicao para a API ou para os arquivos estaticos.
   *
   * @param {http.IncomingMessage} requisicao
   * @param {http.ServerResponse} resposta
   * @returns {Promise<void>}
   */
  async #tratarRequisicao(requisicao, resposta) {
    const endereco = new URL(requisicao.url, `http://localhost:${this.porta}`);

    if (endereco.pathname.startsWith('/api/')) {
      await this.#tratarApi(requisicao, resposta, endereco);
      return;
    }

    await this.#entregarArquivo(resposta, endereco.pathname);
  }

  /**
   * Localiza a rota da API, executa a acao e responde em JSON.
   *
   * @param {http.IncomingMessage} requisicao
   * @param {http.ServerResponse} resposta
   * @param {URL} endereco
   * @returns {Promise<void>}
   */
  async #tratarApi(requisicao, resposta, endereco) {
    const rota = this.#localizarRota(requisicao.method, endereco.pathname);

    if (!rota) {
      this.#responderJson(resposta, 404, { erro: `Rota nao encontrada: ${requisicao.method} ${endereco.pathname}` });
      return;
    }

    try {
      const corpo = await this.#lerCorpo(requisicao);

      const resultado = await rota.acao({
        parametros: rota.parametros,
        consulta: Object.fromEntries(endereco.searchParams),
        corpo
      });

      this.#responderJson(resposta, rota.status ?? 200, resultado ?? {});
    } catch (erro) {
      this.#responderErro(resposta, erro, `${requisicao.method} ${endereco.pathname}`);
    }
  }

  /**
   * Procura a rota correspondente ao metodo e ao caminho informados.
   *
   * @param {string} metodo Metodo HTTP.
   * @param {string} caminho Caminho da requisicao.
   * @returns {{acao: Function, status?: number, parametros: object}|null}
   */
  #localizarRota(metodo, caminho) {
    const partes = caminho.split('/').filter(Boolean);

    for (const rota of rotas) {
      if (rota.metodo !== metodo) continue;

      const molde = rota.caminho.split('/').filter(Boolean);
      if (molde.length !== partes.length) continue;

      const parametros = {};
      let combina = true;

      for (let i = 0; i < molde.length; i += 1) {
        if (molde[i].startsWith(':')) {
          parametros[molde[i].slice(1)] = decodeURIComponent(partes[i]);
        } else if (molde[i] !== partes[i]) {
          combina = false;
          break;
        }
      }

      if (combina) return { acao: rota.acao, status: rota.status, parametros };
    }

    return null;
  }

  /**
   * Le e converte o corpo JSON da requisicao.
   *
   * @param {http.IncomingMessage} requisicao
   * @returns {Promise<object>} Corpo convertido (objeto vazio quando ausente).
   * @throws {ErroValidacao} Quando o JSON e invalido ou excede o limite.
   */
  async #lerCorpo(requisicao) {
    if (requisicao.method === 'GET' || requisicao.method === 'DELETE') return {};

    const partes = [];
    let tamanho = 0;

    for await (const parte of requisicao) {
      tamanho += parte.length;

      if (tamanho > LIMITE_CORPO) {
        throw new ErroValidacao('Corpo da requisicao excede o limite permitido', ['Limite de 64 KB por requisicao'], {
          operacao: 'ServidorWeb.lerCorpo'
        });
      }

      partes.push(parte);
    }

    const texto = Buffer.concat(partes).toString('utf8').trim();
    if (texto === '') return {};

    try {
      return JSON.parse(texto);
    } catch (erro) {
      throw new ErroValidacao('Corpo da requisicao nao e um JSON valido', [erro.message], {
        operacao: 'ServidorWeb.lerCorpo',
        causa: erro
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Arquivos estaticos
  // ---------------------------------------------------------------------------

  /**
   * Entrega um arquivo da pasta publica.
   *
   * @param {http.ServerResponse} resposta
   * @param {string} caminhoUrl Caminho solicitado.
   * @returns {Promise<void>}
   */
  async #entregarArquivo(resposta, caminhoUrl) {
    const relativo = caminhoUrl === '/' ? 'index.html' : decodeURIComponent(caminhoUrl).replace(/^\/+/, '');
    const completo = path.resolve(this.diretorioPublico, relativo);

    // Impede o acesso a arquivos fora da pasta publica.
    if (!completo.startsWith(path.resolve(this.diretorioPublico))) {
      this.#responderJson(resposta, 403, { erro: 'Acesso negado' });
      return;
    }

    try {
      const conteudo = await fs.readFile(completo);
      const tipo = TIPOS_DE_ARQUIVO[path.extname(completo).toLowerCase()] ?? 'application/octet-stream';

      resposta.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
      resposta.end(conteudo);
    } catch {
      resposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      resposta.end('Arquivo nao encontrado');
    }
  }

  // ---------------------------------------------------------------------------
  // Respostas
  // ---------------------------------------------------------------------------

  /**
   * Responde em JSON.
   *
   * @param {http.ServerResponse} resposta
   * @param {number} status Codigo HTTP.
   * @param {*} dados Conteudo da resposta.
   * @returns {void}
   */
  #responderJson(resposta, status, dados) {
    const corpo = JSON.stringify(dados);

    resposta.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(corpo),
      'Cache-Control': 'no-store'
    });

    resposta.end(corpo);
  }

  /**
   * Converte uma excecao da aplicacao no codigo HTTP correspondente.
   *
   * A hierarquia de erros criada no projeto permite fazer essa traducao em um
   * unico lugar.
   *
   * @param {Error} erro Excecao capturada.
   * @returns {number} Codigo HTTP.
   */
  #statusDoErro(erro) {
    if (erro instanceof ErroValidacao) return 400;
    if (erro instanceof ErroNaoEncontrado) return 404;
    if (erro instanceof ErroRegraNegocio) return 409;
    if (erro instanceof ErroBanco) return 409;
    if (erro instanceof ErroConexao) return 503;

    return 500;
  }

  /**
   * Responde uma excecao, registrando no log as falhas inesperadas.
   *
   * @param {http.ServerResponse} resposta
   * @param {Error} erro Excecao capturada.
   * @param {string} operacao Requisicao em execucao.
   * @returns {void}
   */
  #responderErro(resposta, erro, operacao) {
    const status = this.#statusDoErro(erro);

    // Excecoes previstas ja foram registradas pelas classes de dominio.
    if (!(erro instanceof ErroAplicacao)) {
      logger.erro(erro, { operacao: `ServidorWeb(${operacao})` });
    }

    this.#responderJson(resposta, status, {
      erro: erro.message,
      tipo: erro.name,
      operacao: erro.operacao ?? operacao,
      detalhes: Array.isArray(erro.erros) ? erro.erros : []
    });
  }
}

module.exports = ServidorWeb;

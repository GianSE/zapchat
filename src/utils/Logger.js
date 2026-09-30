'use strict';

/**
 * Registro de logs da aplicacao.
 *
 * Grava as ocorrencias em arquivos dentro da pasta "logs" do projeto:
 *   - errors.log : somente falhas e excecoes capturadas;
 *   - app.log    : historico completo (informacoes, avisos e erros).
 *
 * Utiliza apenas o modulo nativo "fs", sem bibliotecas externas.
 */

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config/config');

/** Niveis de log aceitos, em ordem crescente de severidade. */
const NIVEIS = Object.freeze({ DEBUG: 10, INFO: 20, AVISO: 30, ERRO: 40 });

/** Separador entre registros no arquivo de log. */
const SEPARADOR = '-'.repeat(70);

class Logger {
  /**
   * @param {object} [opcoes]
   * @param {string} [opcoes.diretorio] Pasta onde os arquivos serao gravados.
   * @param {string} [opcoes.nivelMinimo] Nivel minimo registrado (DEBUG..ERRO).
   * @param {boolean} [opcoes.exibirNoConsole] Exibe tambem no terminal.
   */
  constructor({
    diretorio = config.log.diretorio,
    nivelMinimo = config.log.nivelMinimo,
    exibirNoConsole = true
  } = {}) {
    this.diretorio = diretorio;
    this.nivelMinimo = NIVEIS[nivelMinimo] ?? NIVEIS.INFO;
    this.exibirNoConsole = exibirNoConsole;

    this.arquivoErros = path.join(diretorio, config.log.arquivoErros);
    this.arquivoApp = path.join(diretorio, config.log.arquivoApp);

    this.#garantirDiretorio();
  }

  /**
   * Cria a pasta de logs caso ela ainda nao exista.
   * @returns {void}
   */
  #garantirDiretorio() {
    try {
      fs.mkdirSync(this.diretorio, { recursive: true });
    } catch (erro) {
      // Se nem o diretorio de log pode ser criado, resta avisar no console.
      console.error(`[logger] Falha ao criar a pasta de logs: ${erro.message}`);
    }
  }

  /**
   * Formata a data e hora no padrao dd/mm/aaaa hh:mm:ss.
   *
   * @param {Date} [data] Data a ser formatada.
   * @returns {string}
   */
  static formatarDataHora(data = new Date()) {
    const doisDigitos = (valor) => String(valor).padStart(2, '0');

    const dia = doisDigitos(data.getDate());
    const mes = doisDigitos(data.getMonth() + 1);
    const ano = data.getFullYear();
    const hora = doisDigitos(data.getHours());
    const minuto = doisDigitos(data.getMinutes());
    const segundo = doisDigitos(data.getSeconds());

    return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
  }

  /**
   * Acrescenta um bloco de texto ao arquivo informado.
   *
   * @param {string} arquivo Caminho completo do arquivo.
   * @param {string} conteudo Texto a ser gravado.
   * @returns {void}
   */
  #gravar(arquivo, conteudo) {
    try {
      fs.appendFileSync(arquivo, conteudo, { encoding: 'utf8' });
    } catch (erro) {
      console.error(`[logger] Falha ao gravar o log em ${arquivo}: ${erro.message}`);
    }
  }

  /**
   * Monta o bloco de texto de um registro de log.
   *
   * @param {object} registro
   * @param {string} registro.nivel Nivel do registro (INFO, AVISO, ERRO...).
   * @param {string} registro.mensagem Mensagem principal.
   * @param {string} [registro.tipo] Tipo do erro (nome da classe).
   * @param {string} [registro.operacao] Operacao em execucao.
   * @param {object} [registro.detalhes] Dados complementares.
   * @param {string} [registro.causa] Erro original.
   * @param {string} [registro.stack] Stack trace.
   * @returns {string}
   */
  static formatarRegistro({ nivel, mensagem, tipo, operacao, detalhes, causa, stack }) {
    const linhas = [`[${Logger.formatarDataHora()}]`, `NIVEL: ${nivel}`];

    if (tipo) linhas.push(`TIPO: ${tipo}`);
    if (operacao) linhas.push(`OPERACAO: ${operacao}`);

    linhas.push(`MENSAGEM: ${mensagem}`);

    if (detalhes && Object.keys(detalhes).length > 0) {
      linhas.push(`DETALHES: ${JSON.stringify(detalhes)}`);
    }

    if (causa) linhas.push(`CAUSA: ${causa}`);
    if (stack) linhas.push(`STACK: ${stack}`);

    return `${linhas.join('\n')}\n${SEPARADOR}\n`;
  }

  /**
   * Registra uma ocorrencia nos arquivos de log.
   *
   * @param {string} nivel Nivel do registro.
   * @param {string} mensagem Mensagem principal.
   * @param {object} [dados] Campos adicionais (tipo, operacao, detalhes...).
   * @returns {void}
   */
  registrar(nivel, mensagem, dados = {}) {
    const severidade = NIVEIS[nivel] ?? NIVEIS.INFO;
    if (severidade < this.nivelMinimo) return;

    const bloco = Logger.formatarRegistro({ nivel, mensagem, ...dados });

    this.#gravar(this.arquivoApp, bloco);
    if (severidade >= NIVEIS.ERRO) this.#gravar(this.arquivoErros, bloco);

    if (this.exibirNoConsole && severidade >= NIVEIS.AVISO) {
      const prefixo = severidade >= NIVEIS.ERRO ? 'ERRO' : 'AVISO';
      console.error(`[${prefixo}] ${mensagem}`);
    }
  }

  /**
   * Registra uma mensagem de depuracao.
   * @param {string} mensagem
   * @param {object} [dados]
   * @returns {void}
   */
  debug(mensagem, dados = {}) {
    this.registrar('DEBUG', mensagem, dados);
  }

  /**
   * Registra uma informacao de execucao (ex.: operacao concluida).
   * @param {string} mensagem
   * @param {object} [dados]
   * @returns {void}
   */
  info(mensagem, dados = {}) {
    this.registrar('INFO', mensagem, dados);
  }

  /**
   * Registra um aviso (situacao contornada pela aplicacao).
   * @param {string} mensagem
   * @param {object} [dados]
   * @returns {void}
   */
  aviso(mensagem, dados = {}) {
    this.registrar('AVISO', mensagem, dados);
  }

  /**
   * Registra uma excecao capturada no arquivo de erros.
   *
   * @param {Error} erro Excecao capturada.
   * @param {object} [contexto]
   * @param {string} [contexto.operacao] Operacao em execucao.
   * @param {object} [contexto.detalhes] Dados adicionais.
   * @returns {void}
   */
  erro(erro, { operacao = null, detalhes = null } = {}) {
    const dadosErro = typeof erro?.paraObjeto === 'function' ? erro.paraObjeto() : {};

    this.registrar('ERRO', erro?.message ?? String(erro), {
      tipo: erro?.name ?? 'Error',
      operacao: operacao ?? dadosErro.operacao ?? null,
      detalhes: detalhes ?? dadosErro.detalhes ?? null,
      causa: dadosErro.causa ?? (erro?.cause ? String(erro.cause) : null),
      stack: erro?.stack ? erro.stack.split('\n').slice(0, 4).join(' | ') : null
    });
  }

  /**
   * Caminhos dos arquivos de log em uso.
   * @returns {{erros: string, app: string}}
   */
  get arquivos() {
    return { erros: this.arquivoErros, app: this.arquivoApp };
  }
}

/** Instancia unica compartilhada por toda a aplicacao. */
const logger = new Logger();

module.exports = logger;
module.exports.Logger = Logger;
module.exports.NIVEIS = NIVEIS;

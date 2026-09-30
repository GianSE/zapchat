'use strict';

/**
 * Camada de conexao com o MongoDB.
 *
 * Implementa o padrao Singleton: existe uma unica instancia de MongoClient
 * compartilhada por toda a aplicacao, evitando abrir uma conexao por operacao.
 * A comunicacao e feita exclusivamente pelo MongoDB Driver para Node.js.
 */

const { MongoClient } = require('mongodb');
const config = require('../config/config');
const logger = require('../utils/Logger');
const { ErroConexao } = require('../errors');

class Database {
  /** @type {Database|null} Instancia unica da classe. */
  static #instancia = null;

  /** @type {import('mongodb').MongoClient|null} */
  #cliente = null;

  /** @type {import('mongodb').Db|null} */
  #db = null;

  #conectado = false;

  /**
   * @param {object} [opcoes]
   * @param {string} [opcoes.uri] String de conexao do MongoDB.
   * @param {string} [opcoes.banco] Nome do banco de dados.
   * @param {number} [opcoes.timeoutMs] Tempo maximo de selecao do servidor.
   */
  constructor({ uri = config.mongo.uri, banco = config.mongo.banco, timeoutMs = config.mongo.timeoutMs } = {}) {
    this.uri = uri;
    this.nomeBanco = banco;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Retorna a instancia unica de Database (Singleton).
   * @returns {Database}
   */
  static obterInstancia() {
    if (Database.#instancia === null) Database.#instancia = new Database();
    return Database.#instancia;
  }

  /**
   * Indica se a conexao esta ativa.
   * @returns {boolean}
   */
  get conectado() {
    return this.#conectado;
  }

  /**
   * Abre a conexao com o MongoDB. Chamadas repetidas reaproveitam a conexao.
   *
   * @returns {Promise<import('mongodb').Db>} Banco de dados conectado.
   * @throws {ErroConexao} Quando nao for possivel conectar ao servidor.
   */
  async conectar() {
    if (this.#conectado && this.#db) return this.#db;

    const operacao = 'Database.conectar';

    try {
      this.#cliente = new MongoClient(this.uri, {
        serverSelectionTimeoutMS: this.timeoutMs,
        connectTimeoutMS: this.timeoutMs
      });

      await this.#cliente.connect();

      // Confirma que o servidor respondeu antes de considerar a conexao valida.
      await this.#cliente.db(this.nomeBanco).command({ ping: 1 });

      this.#db = this.#cliente.db(this.nomeBanco);
      this.#conectado = true;

      logger.info(`Conexao estabelecida com o MongoDB (banco "${this.nomeBanco}")`, { operacao });

      return this.#db;
    } catch (erro) {
      this.#conectado = false;
      this.#db = null;

      // Libera o cliente parcialmente inicializado, ignorando falhas no fechamento.
      try {
        await this.#cliente?.close();
      } catch {
        /* conexao ja indisponivel */
      }
      this.#cliente = null;

      const erroConexao = new ErroConexao(
        `Nao foi possivel conectar ao MongoDB em "${this.uri}". Verifique se o servidor esta em execucao.`,
        { operacao, detalhes: { uri: this.uri, banco: this.nomeBanco }, causa: erro }
      );

      logger.erro(erroConexao);
      throw erroConexao;
    }
  }

  /**
   * Retorna o banco conectado.
   *
   * @returns {import('mongodb').Db}
   * @throws {ErroConexao} Quando a conexao ainda nao foi estabelecida.
   */
  obterBanco() {
    if (!this.#conectado || !this.#db) {
      const erro = new ErroConexao(
        'Banco de dados indisponivel: chame Database.conectar() antes de executar operacoes.',
        { operacao: 'Database.obterBanco' }
      );

      logger.erro(erro);
      throw erro;
    }

    return this.#db;
  }

  /**
   * Retorna uma colecao do banco conectado.
   *
   * @param {string} nome Nome da colecao.
   * @returns {import('mongodb').Collection}
   * @throws {ErroConexao} Quando a conexao ainda nao foi estabelecida.
   */
  obterColecao(nome) {
    return this.obterBanco().collection(nome);
  }

  /**
   * Encerra a conexao com o MongoDB.
   * @returns {Promise<void>}
   */
  async desconectar() {
    if (!this.#cliente) return;

    try {
      await this.#cliente.close();
      logger.info('Conexao com o MongoDB encerrada', { operacao: 'Database.desconectar' });
    } catch (erro) {
      logger.erro(erro, { operacao: 'Database.desconectar' });
    } finally {
      this.#cliente = null;
      this.#db = null;
      this.#conectado = false;
    }
  }

  /**
   * Lista os nomes das colecoes existentes no banco.
   * @returns {Promise<string[]>}
   */
  async listarColecoes() {
    const colecoes = await this.obterBanco().listCollections().toArray();
    return colecoes.map((colecao) => colecao.name);
  }

  /**
   * Retorna estatisticas simples de cada colecao (quantidade de documentos).
   * @returns {Promise<Array<{colecao: string, documentos: number}>>}
   */
  async estatisticas() {
    const nomes = await this.listarColecoes();

    return Promise.all(
      nomes.map(async (nome) => ({
        colecao: nome,
        documentos: await this.obterColecao(nome).countDocuments()
      }))
    );
  }
}

module.exports = Database;

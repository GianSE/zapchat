'use strict';

const ErroAplicacao = require('./ErroAplicacao');

/**
 * Erro lancado ao tentar consultar, atualizar ou excluir um documento
 * inexistente no MongoDB.
 *
 * @extends ErroAplicacao
 */
class ErroNaoEncontrado extends ErroAplicacao {
  /**
   * @param {string} entidade Nome da entidade pesquisada (ex.: "Mensagem").
   * @param {*} identificador Valor utilizado na busca (normalmente o _id).
   * @param {object} [opcoes] Opcoes herdadas de ErroAplicacao.
   */
  constructor(entidade, identificador, opcoes = {}) {
    super(`${entidade} nao encontrado(a) para o identificador "${identificador}"`, {
      ...opcoes,
      detalhes: { ...(opcoes.detalhes || {}), entidade, identificador: String(identificador) }
    });

    this.entidade = entidade;
    this.identificador = identificador;
  }
}

module.exports = ErroNaoEncontrado;

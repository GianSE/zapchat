'use strict';

/**
 * Erro base da aplicacao.
 *
 * Todas as excecoes previstas pelo sistema herdam desta classe, o que permite
 * diferenciar falhas conhecidas (tratadas) de falhas inesperadas do Node.js ou
 * das bibliotecas utilizadas.
 *
 * @extends Error
 */
class ErroAplicacao extends Error {
  /**
   * @param {string} mensagem Descricao do problema ocorrido.
   * @param {object} [opcoes] Informacoes complementares.
   * @param {string} [opcoes.operacao] Operacao em execucao quando o erro ocorreu.
   * @param {object} [opcoes.detalhes] Dados adicionais uteis para o log.
   * @param {Error}  [opcoes.causa] Erro original que originou esta excecao.
   */
  constructor(mensagem, { operacao = 'Operacao nao informada', detalhes = null, causa = null } = {}) {
    super(mensagem);

    this.name = this.constructor.name;
    this.operacao = operacao;
    this.detalhes = detalhes;
    this.causa = causa;
    this.ocorridoEm = new Date();

    // Mantem o stack trace apontando para o local real da falha.
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Indica que a excecao e prevista pela aplicacao e pode ser exibida ao usuario.
   * @returns {boolean}
   */
  get esperado() {
    return true;
  }

  /**
   * Representacao serializavel do erro, utilizada pelo Logger.
   * @returns {object}
   */
  paraObjeto() {
    return {
      tipo: this.name,
      mensagem: this.message,
      operacao: this.operacao,
      detalhes: this.detalhes,
      causa: this.causa ? `${this.causa.name}: ${this.causa.message}` : null,
      ocorridoEm: this.ocorridoEm.toISOString()
    };
  }
}

module.exports = ErroAplicacao;

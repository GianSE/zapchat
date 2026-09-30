'use strict';

const ErroAplicacao = require('./ErroAplicacao');

/**
 * Erro lancado quando os dados informados nao atendem as regras da entidade:
 * campos obrigatorios ausentes, formatos invalidos ou valores fora do dominio.
 *
 * @extends ErroAplicacao
 */
class ErroValidacao extends ErroAplicacao {
  /**
   * @param {string} mensagem Resumo da falha de validacao.
   * @param {string[]} [erros] Lista com a descricao de cada campo invalido.
   * @param {object} [opcoes] Opcoes herdadas de ErroAplicacao.
   */
  constructor(mensagem, erros = [], opcoes = {}) {
    super(mensagem, { ...opcoes, detalhes: { ...(opcoes.detalhes || {}), erros } });
    this.erros = erros;
  }

  /**
   * Cria um erro de validacao a partir da lista de campos obrigatorios ausentes.
   *
   * @param {string[]} campos Nomes dos campos obrigatorios nao informados.
   * @param {string} entidade Nome da entidade validada (ex.: "Usuario").
   * @param {string} operacao Operacao em execucao.
   * @returns {ErroValidacao}
   */
  static camposObrigatorios(campos, entidade, operacao) {
    const erros = campos.map((campo) => `Campo "${campo}" obrigatorio`);
    const lista = campos.map((campo) => `"${campo}"`).join(', ');

    return new ErroValidacao(
      `Campos obrigatorios nao informados em ${entidade}: ${lista}`,
      erros,
      { operacao, detalhes: { entidade, camposAusentes: campos } }
    );
  }

  /**
   * Mensagem com todos os problemas encontrados, uma por linha.
   * @returns {string}
   */
  get descricaoCompleta() {
    if (this.erros.length === 0) return this.message;
    return `${this.message}\n  - ${this.erros.join('\n  - ')}`;
  }
}

module.exports = ErroValidacao;

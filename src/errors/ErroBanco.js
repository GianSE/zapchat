'use strict';

const ErroAplicacao = require('./ErroAplicacao');

/**
 * Erro lancado quando o MongoDB Driver falha durante uma operacao de escrita ou
 * leitura (indice unico violado, documento invalido, falha de rede etc.).
 *
 * @extends ErroAplicacao
 */
class ErroBanco extends ErroAplicacao {
  /**
   * Converte um erro do MongoDB Driver em um ErroBanco com mensagem amigavel.
   *
   * @param {Error} erro Erro original lancado pelo driver.
   * @param {string} operacao Operacao em execucao (ex.: "Usuario.inserir").
   * @param {object} [detalhes] Dados adicionais para o log.
   * @returns {ErroBanco}
   */
  static deErroDriver(erro, operacao, detalhes = null) {
    // 11000 = chave duplicada (violacao de indice unico).
    if (erro && erro.code === 11000) {
      const campos = Object.keys(erro.keyPattern || {}).join(', ') || 'campo unico';

      return new ErroBanco(`Ja existe um registro com o mesmo valor em: ${campos}`, {
        operacao,
        detalhes: { ...(detalhes || {}), codigo: erro.code, chave: erro.keyValue || null },
        causa: erro
      });
    }

    return new ErroBanco(`Falha ao executar a operacao no MongoDB: ${erro.message}`, {
      operacao,
      detalhes: { ...(detalhes || {}), codigo: erro.code ?? null },
      causa: erro
    });
  }
}

module.exports = ErroBanco;

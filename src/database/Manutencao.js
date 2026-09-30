'use strict';

/**
 * Rotinas de manutencao do banco de dados.
 *
 * Reune as operacoes de preparacao e limpeza utilizadas pelos scripts do
 * projeto (setup, seed e reset), mantendo essas responsabilidades separadas das
 * classes de entidade.
 */

const Database = require('./Database');
const { ENTIDADES } = require('../models');
const logger = require('../utils/Logger');

class Manutencao {
  /**
   * Cria os indices declarados por todas as entidades.
   *
   * @returns {Promise<Array<{colecao: string, indices: string[]}>>}
   */
  static async criarIndices() {
    const resultado = [];

    for (const Entidade of ENTIDADES) {
      await Entidade.criarIndices();

      resultado.push({
        colecao: Entidade.colecao,
        indices: Entidade.indices.map((indice) => indice.name)
      });
    }

    return resultado;
  }

  /**
   * Lista os indices existentes em cada colecao das entidades.
   *
   * @returns {Promise<Array<{colecao: string, indice: string, chaves: string}>>}
   */
  static async listarIndices() {
    const banco = Database.obterInstancia();
    const linhas = [];

    for (const Entidade of ENTIDADES) {
      const indices = await banco.obterColecao(Entidade.colecao).indexes();

      for (const indice of indices) {
        linhas.push({
          colecao: Entidade.colecao,
          indice: indice.name,
          chaves: Object.entries(indice.key)
            .map(([campo, direcao]) => `${campo}:${direcao}`)
            .join(', '),
          unico: Boolean(indice.unique)
        });
      }
    }

    return linhas;
  }

  /**
   * Remove todos os documentos das colecoes do projeto, preservando os indices.
   *
   * @returns {Promise<Array<{colecao: string, removidos: number}>>}
   */
  static async limparColecoes() {
    const resultado = [];

    for (const Entidade of ENTIDADES) {
      const removidos = await Entidade.excluirMuitos({}, `Manutencao.limparColecoes(${Entidade.colecao})`);
      resultado.push({ colecao: Entidade.colecao, removidos });
    }

    logger.info('Colecoes do projeto esvaziadas', { operacao: 'Manutencao.limparColecoes' });

    return resultado;
  }

  /**
   * Quantidade de documentos existente em cada colecao.
   *
   * @returns {Promise<Array<{colecao: string, documentos: number}>>}
   */
  static async contarDocumentos() {
    const linhas = [];

    for (const Entidade of ENTIDADES) {
      linhas.push({ colecao: Entidade.colecao, documentos: await Entidade.contar() });
    }

    return linhas;
  }
}

module.exports = Manutencao;

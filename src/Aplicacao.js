'use strict';

/**
 * Ciclo de vida da aplicacao.
 *
 * Padroniza a execucao das rotinas do projeto (menu interativo, scripts de
 * carga, demonstracao...): abre a conexao com o MongoDB, executa a rotina,
 * garante o fechamento da conexao e trata qualquer excecao que chegue ate aqui,
 * registrando-a no arquivo de log em vez de encerrar o processo abruptamente.
 */

const Database = require('./database/Database');
const Terminal = require('./views/Terminal');
const logger = require('./utils/Logger');
const config = require('./config/config');
const { ErroAplicacao, ErroConexao } = require('./errors');

class Aplicacao {
  /**
   * Registra os tratadores globais de excecoes nao capturadas, garantindo que
   * nenhum erro fique sem registro em log.
   *
   * @returns {void}
   */
  static registrarTratadoresGlobais() {
    process.on('unhandledRejection', (motivo) => {
      const erro = motivo instanceof Error ? motivo : new Error(String(motivo));

      logger.erro(erro, { operacao: 'process.unhandledRejection' });
      Terminal.falha(`Falha nao tratada: ${erro.message}`);
    });

    process.on('uncaughtException', (erro) => {
      logger.erro(erro, { operacao: 'process.uncaughtException' });
      Terminal.falha(`Erro inesperado: ${erro.message}`);
      process.exitCode = 1;
    });
  }

  /**
   * Executa uma rotina com conexao ao MongoDB e tratamento de excecoes.
   *
   * @param {string} nome Nome da rotina (usado nas mensagens e no log).
   * @param {(banco: import('mongodb').Db) => Promise<void>} rotina Rotina executada.
   * @returns {Promise<void>}
   */
  static async executar(nome, rotina) {
    this.registrarTratadoresGlobais();

    const banco = Database.obterInstancia();

    try {
      logger.info(`Iniciando rotina "${nome}"`, { operacao: 'Aplicacao.executar' });

      await banco.conectar();
      await rotina(banco.obterBanco());

      logger.info(`Rotina "${nome}" finalizada com sucesso`, { operacao: 'Aplicacao.executar' });
    } catch (erro) {
      process.exitCode = 1;

      if (erro instanceof ErroConexao) {
        Terminal.falha(erro.message);
        Terminal.info('   Verifique se o MongoDB esta em execucao e confira a variavel MONGODB_URI.');
        Terminal.info(`   URI configurada: ${config.mongo.uri}`);
      } else if (erro instanceof ErroAplicacao) {
        // Excecoes previstas ja foram registradas no arquivo de log.
        Terminal.exibirErro(erro);
      } else {
        // Excecoes inesperadas sao registradas aqui.
        logger.erro(erro, { operacao: `Aplicacao.executar(${nome})` });
        Terminal.falha(`Erro inesperado em "${nome}": ${erro.message}`);
      }

      Terminal.info(`\n📄 Detalhes registrados em: ${logger.arquivos.erros}`);
    } finally {
      await banco.desconectar();
    }
  }
}

module.exports = Aplicacao;

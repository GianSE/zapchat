'use strict';

/**
 * Camada VIEW (MVC) - apresentacao no terminal.
 *
 * Concentra a formatacao das mensagens exibidas ao usuario, mantendo as demais
 * classes livres de codigo de interface. Nao acessa o banco de dados nem conhece
 * as entidades: apenas recebe dados prontos e os exibe.
 */

/** Largura padrao das linhas divisorias. */
const LARGURA = 72;

class Terminal {
  /**
   * Exibe um titulo destacado.
   *
   * @param {string} texto Texto do titulo.
   * @returns {void}
   */
  static titulo(texto) {
    console.log(`\n${'='.repeat(LARGURA)}`);
    console.log(`  ${texto.toUpperCase()}`);
    console.log('='.repeat(LARGURA));
  }

  /**
   * Exibe um subtitulo de secao.
   *
   * @param {string} texto Texto do subtitulo.
   * @returns {void}
   */
  static secao(texto) {
    console.log(`\n${'-'.repeat(LARGURA)}`);
    console.log(`  ${texto}`);
    console.log('-'.repeat(LARGURA));
  }

  /**
   * Exibe uma linha divisoria simples.
   * @returns {void}
   */
  static linha() {
    console.log('-'.repeat(LARGURA));
  }

  /**
   * Exibe uma mensagem comum.
   *
   * @param {string} [texto] Texto exibido.
   * @returns {void}
   */
  static info(texto = '') {
    console.log(texto);
  }

  /**
   * Exibe um item de lista.
   *
   * @param {string} texto Texto do item.
   * @param {number} [nivel] Nivel de indentacao.
   * @returns {void}
   */
  static item(texto, nivel = 1) {
    console.log(`${'  '.repeat(nivel)}- ${texto}`);
  }

  /**
   * Exibe uma mensagem de sucesso.
   *
   * @param {string} texto Texto exibido.
   * @returns {void}
   */
  static sucesso(texto) {
    console.log(`✅ ${texto}`);
  }

  /**
   * Exibe uma mensagem de atencao.
   *
   * @param {string} texto Texto exibido.
   * @returns {void}
   */
  static atencao(texto) {
    console.log(`⚠️  ${texto}`);
  }

  /**
   * Exibe uma mensagem de falha.
   *
   * @param {string} texto Texto exibido.
   * @returns {void}
   */
  static falha(texto) {
    console.log(`❌ ${texto}`);
  }

  /**
   * Exibe uma excecao de forma amigavel, incluindo a lista de campos invalidos
   * quando existir.
   *
   * @param {Error} erro Excecao capturada.
   * @returns {void}
   */
  static exibirErro(erro) {
    console.log(`\n❌ ${erro.name}: ${erro.message}`);

    if (Array.isArray(erro.erros) && erro.erros.length > 0) {
      for (const problema of erro.erros) console.log(`     • ${problema}`);
    }

    if (erro.operacao) console.log(`     (operacao: ${erro.operacao})`);
  }

  /**
   * Exibe uma lista de objetos em formato de tabela.
   *
   * @param {object[]} linhas Dados exibidos.
   * @param {string} [vazio] Mensagem exibida quando a lista esta vazia.
   * @returns {void}
   */
  static tabela(linhas, vazio = 'Nenhum registro encontrado.') {
    if (!Array.isArray(linhas) || linhas.length === 0) {
      console.log(`   (${vazio})`);
      return;
    }

    console.table(linhas);
  }

  /**
   * Formata uma data e hora no padrao brasileiro.
   *
   * @param {Date|null} data Data a ser formatada.
   * @returns {string}
   */
  static dataHora(data) {
    if (!data) return '-';

    const valor = data instanceof Date ? data : new Date(data);

    return valor.toLocaleString('pt-BR');
  }
}

module.exports = Terminal;

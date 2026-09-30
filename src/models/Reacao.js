'use strict';

/**
 * Entidade Reacao - colecao "reacoes".
 *
 * Registra as reacoes (emojis) que os participantes adicionam as mensagens.
 * Cada usuario pode registrar um mesmo emoji uma unica vez por mensagem, regra
 * garantida por um indice unico composto no MongoDB.
 *
 * Campos obrigatorios: mensagemId, usuarioId, emoji.
 */

const Modelo = require('./Modelo');
const Usuario = require('./Usuario');
const Conversa = require('./Conversa');
const Mensagem = require('./Mensagem');
const Validador = require('../utils/Validador');
const logger = require('../utils/Logger');
const { ErroRegraNegocio } = require('../errors');

/** Emojis aceitos como reacao. */
const EMOJIS_VALIDOS = Object.freeze(['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏']);

class Reacao extends Modelo {
  static get colecao() {
    return 'reacoes';
  }

  static get camposObrigatorios() {
    return ['mensagemId', 'usuarioId', 'emoji'];
  }

  static get camposAtualizaveis() {
    return ['emoji'];
  }

  static get indices() {
    return [
      { key: { mensagemId: 1, usuarioId: 1, emoji: 1 }, name: 'idx_reacao_unica', unique: true },
      { key: { mensagemId: 1 }, name: 'idx_reacoes_mensagem' },
      { key: { emoji: 1 }, name: 'idx_emoji' }
    ];
  }

  /** Emojis aceitos como reacao. @returns {string[]} */
  static get emojisValidos() {
    return [...EMOJIS_VALIDOS];
  }

  /**
   * @param {object} dados
   * @param {string} dados.mensagemId Mensagem que recebeu a reacao (obrigatorio).
   * @param {string} dados.usuarioId Autor da reacao (obrigatorio).
   * @param {string} dados.emoji Emoji da reacao (obrigatorio).
   */
  constructor(dados = {}) {
    super(dados);

    const operacao = 'Reacao.construtor';

    this.mensagemId = dados.mensagemId
      ? Validador.converterObjectId(dados.mensagemId, 'mensagemId', operacao)
      : null;

    this.usuarioId = dados.usuarioId
      ? Validador.converterObjectId(dados.usuarioId, 'usuarioId', operacao)
      : null;

    this.emoji = dados.emoji ?? null;
  }

  paraDocumento() {
    return { mensagemId: this.mensagemId, usuarioId: this.usuarioId, emoji: this.emoji };
  }

  /**
   * Regras de validacao da entidade Reacao.
   *
   * @param {object} dados Campos presentes.
   * @param {string} operacao Operacao em execucao.
   * @returns {void}
   * @throws {import('../errors').ErroValidacao}
   */
  static validarCampos(dados, operacao) {
    const erros = [];

    Validador.objectId(erros, dados.mensagemId, 'mensagemId');
    Validador.objectId(erros, dados.usuarioId, 'usuarioId');
    Validador.enumerado(erros, dados.emoji, EMOJIS_VALIDOS, 'emoji');

    Validador.lancarSeHouverErros(erros, Reacao.entidade, operacao);
  }

  // ---------------------------------------------------------------------------
  // Operacoes da entidade
  // ---------------------------------------------------------------------------

  /**
   * Adiciona ou remove uma reacao (comportamento de alternancia).
   *
   * Se o usuario ainda nao reagiu com aquele emoji, a reacao e criada; caso
   * contrario, ela e removida - da mesma forma que nos aplicativos de mensagens.
   *
   * @param {string} mensagemId Mensagem que recebe a reacao.
   * @param {string} usuarioId Autor da reacao.
   * @param {string} emoji Emoji escolhido.
   * @returns {Promise<{acao: 'adicionada'|'removida', reacao: Reacao|null}>}
   * @throws {ErroRegraNegocio} Quando o usuario nao participa da conversa ou a
   *         mensagem foi excluida.
   */
  static async alternar(mensagemId, usuarioId, emoji) {
    const operacao = 'Reacao.alternar';

    const reacao = new Reacao({ mensagemId, usuarioId, emoji });
    Reacao.validarComLog(() => reacao.validar(operacao));

    const mensagem = await Mensagem.obterPorId(reacao.mensagemId);
    await Usuario.obterPorId(reacao.usuarioId);

    // Somente participantes da conversa podem reagir as mensagens.
    await Conversa.garantirParticipante(mensagem.conversaId, reacao.usuarioId, operacao);

    if (mensagem.excluida) {
      const erro = new ErroRegraNegocio('Nao e possivel reagir a uma mensagem excluida', {
        operacao,
        detalhes: { mensagemId: mensagem.id }
      });

      logger.erro(erro);
      throw erro;
    }

    const existente = await this.buscarUm({
      mensagemId: reacao.mensagemId,
      usuarioId: reacao.usuarioId,
      emoji: reacao.emoji
    });

    if (existente) {
      await this.excluirPorId(existente.id);
      logger.info(`Reacao ${emoji} removida da mensagem ${mensagem.id}`, { operacao });

      return { acao: 'removida', reacao: null };
    }

    return { acao: 'adicionada', reacao: await reacao.salvar() };
  }

  /**
   * Lista as reacoes de uma mensagem com o nome de quem reagiu.
   *
   * @param {string} mensagemId Identificador da mensagem.
   * @returns {Promise<Array<{emoji: string, usuario: string, criadoEm: Date}>>}
   */
  static async listarPorMensagem(mensagemId) {
    const operacao = 'Reacao.listarPorMensagem';
    const mensagem = this.validarComLog(() => this.converterId(mensagemId, operacao, 'mensagemId'));

    return this.agregar(
      [
        { $match: { mensagemId: mensagem } },
        {
          $lookup: {
            from: Usuario.colecao,
            localField: 'usuarioId',
            foreignField: '_id',
            as: 'usuario'
          }
        },
        { $unwind: { path: '$usuario', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            emoji: 1,
            criadoEm: 1,
            usuario: { $ifNull: ['$usuario.nome', 'Usuario removido'] }
          }
        },
        { $sort: { criadoEm: 1 } }
      ],
      operacao
    );
  }

  /**
   * Resumo das reacoes de uma mensagem, agrupadas por emoji.
   *
   * @param {string} mensagemId Identificador da mensagem.
   * @returns {Promise<Array<{emoji: string, total: number}>>}
   */
  static async resumoPorMensagem(mensagemId) {
    const operacao = 'Reacao.resumoPorMensagem';
    const mensagem = this.validarComLog(() => this.converterId(mensagemId, operacao, 'mensagemId'));

    return this.agregar(
      [
        { $match: { mensagemId: mensagem } },
        { $group: { _id: '$emoji', total: { $sum: 1 } } },
        { $project: { _id: 0, emoji: '$_id', total: 1 } },
        { $sort: { total: -1, emoji: 1 } }
      ],
      operacao
    );
  }

  /**
   * Ranking dos emojis mais utilizados na aplicacao.
   *
   * @param {number} [limite] Quantidade de posicoes.
   * @returns {Promise<Array<{emoji: string, total: number}>>}
   */
  static async maisUsados(limite = 5) {
    return this.agregar(
      [
        { $group: { _id: '$emoji', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: limite },
        { $project: { _id: 0, emoji: '$_id', total: 1 } }
      ],
      'Reacao.maisUsados'
    );
  }

  /**
   * Remove todas as reacoes de uma mensagem. Utilizado quando a mensagem e
   * excluida definitivamente.
   *
   * @param {string} mensagemId Identificador da mensagem.
   * @returns {Promise<number>} Quantidade de reacoes removidas.
   */
  static async removerDaMensagem(mensagemId) {
    const operacao = 'Reacao.removerDaMensagem';
    const mensagem = this.validarComLog(() => this.converterId(mensagemId, operacao, 'mensagemId'));

    return this.excluirMuitos({ mensagemId: mensagem }, operacao);
  }

  /**
   * Resumo da reacao para exibicao no terminal.
   * @returns {string}
   */
  paraTexto() {
    return `${this.emoji} (mensagem ${this.mensagemId})`;
  }
}

module.exports = Reacao;
module.exports.EMOJIS_VALIDOS = EMOJIS_VALIDOS;

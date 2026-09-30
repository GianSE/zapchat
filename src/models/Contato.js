'use strict';

/**
 * Entidade Contato - colecao "contatos".
 *
 * Representa a agenda de cada usuario: o vinculo entre o dono da agenda
 * (usuarioId) e outro usuario cadastrado (contatoId). Permite apelidar,
 * favoritar e bloquear contatos, assim como em um aplicativo de mensagens real.
 *
 * Campos obrigatorios: usuarioId, contatoId.
 */

const Modelo = require('./Modelo');
const Usuario = require('./Usuario');
const Validador = require('../utils/Validador');
const logger = require('../utils/Logger');
const { ErroRegraNegocio, ErroNaoEncontrado } = require('../errors');

class Contato extends Modelo {
  static get colecao() {
    return 'contatos';
  }

  static get camposObrigatorios() {
    return ['usuarioId', 'contatoId'];
  }

  static get camposAtualizaveis() {
    return ['apelido', 'favorito', 'bloqueado'];
  }

  static get indices() {
    return [
      { key: { usuarioId: 1, contatoId: 1 }, name: 'idx_agenda_unica', unique: true },
      { key: { usuarioId: 1, favorito: -1 }, name: 'idx_favoritos' }
    ];
  }

  /**
   * @param {object} dados
   * @param {string} dados.usuarioId Dono da agenda (obrigatorio).
   * @param {string} dados.contatoId Usuario adicionado a agenda (obrigatorio).
   * @param {string} [dados.apelido] Nome com que o contato aparece na agenda.
   * @param {boolean} [dados.favorito] Marca o contato como favorito.
   * @param {boolean} [dados.bloqueado] Impede o recebimento de mensagens.
   */
  constructor(dados = {}) {
    super(dados);

    const operacao = 'Contato.construtor';

    this.usuarioId = dados.usuarioId ? Validador.converterObjectId(dados.usuarioId, 'usuarioId', operacao) : null;
    this.contatoId = dados.contatoId ? Validador.converterObjectId(dados.contatoId, 'contatoId', operacao) : null;
    this.apelido = dados.apelido?.trim() ?? null;
    this.favorito = dados.favorito ?? false;
    this.bloqueado = dados.bloqueado ?? false;
  }

  paraDocumento() {
    return {
      usuarioId: this.usuarioId,
      contatoId: this.contatoId,
      apelido: this.apelido,
      favorito: this.favorito,
      bloqueado: this.bloqueado
    };
  }

  /**
   * Regras de validacao da entidade Contato.
   *
   * @param {object} dados Campos presentes.
   * @param {string} operacao Operacao em execucao.
   * @returns {void}
   * @throws {import('../errors').ErroValidacao}
   */
  static validarCampos(dados, operacao) {
    const erros = [];

    Validador.objectId(erros, dados.usuarioId, 'usuarioId');
    Validador.objectId(erros, dados.contatoId, 'contatoId');
    Validador.texto(erros, dados.apelido, 'apelido', { min: 2, max: 40 });

    if (dados.favorito !== undefined && typeof dados.favorito !== 'boolean') {
      erros.push('Campo "favorito" deve ser verdadeiro ou falso');
    }

    if (dados.bloqueado !== undefined && typeof dados.bloqueado !== 'boolean') {
      erros.push('Campo "bloqueado" deve ser verdadeiro ou falso');
    }

    if (dados.usuarioId && dados.contatoId && String(dados.usuarioId) === String(dados.contatoId)) {
      erros.push('Campo "contatoId" nao pode ser igual ao proprio usuario');
    }

    Validador.lancarSeHouverErros(erros, Contato.entidade, operacao);
  }

  // ---------------------------------------------------------------------------
  // Operacoes da entidade
  // ---------------------------------------------------------------------------

  /**
   * Adiciona um usuario a agenda de outro, conferindo se ambos existem e se o
   * contato ainda nao foi adicionado.
   *
   * @param {string} usuarioId Dono da agenda.
   * @param {string} contatoId Usuario a ser adicionado.
   * @param {object} [dados] Dados opcionais (apelido, favorito).
   * @returns {Promise<Contato>}
   * @throws {ErroRegraNegocio} Quando o contato ja existe na agenda.
   * @throws {import('../errors').ErroNaoEncontrado} Quando um dos usuarios nao existe.
   */
  static async adicionar(usuarioId, contatoId, dados = {}) {
    const operacao = 'Contato.adicionar';

    const contato = new Contato({ ...dados, usuarioId, contatoId });
    Contato.validarComLog(() => contato.validar(operacao));

    // Integridade referencial: os dois usuarios precisam existir.
    await Usuario.obterPorId(contato.usuarioId);
    await Usuario.obterPorId(contato.contatoId);

    const existente = await this.buscarUm({ usuarioId: contato.usuarioId, contatoId: contato.contatoId });

    if (existente) {
      const erro = new ErroRegraNegocio('Este usuario ja esta na sua lista de contatos', {
        operacao,
        detalhes: { usuarioId: String(usuarioId), contatoId: String(contatoId) }
      });

      logger.erro(erro);
      throw erro;
    }

    return contato.salvar();
  }

  /**
   * Lista a agenda de um usuario, trazendo os dados de cada contato por meio de
   * um $lookup na colecao "usuarios".
   *
   * @param {string} usuarioId Dono da agenda.
   * @param {object} [opcoes]
   * @param {boolean} [opcoes.somenteFavoritos] Retorna apenas os favoritos.
   * @param {boolean} [opcoes.incluirBloqueados] Inclui os contatos bloqueados.
   * @returns {Promise<object[]>} Agenda com os dados do usuario de cada contato.
   */
  static async listarAgenda(usuarioId, { somenteFavoritos = false, incluirBloqueados = false } = {}) {
    const operacao = 'Contato.listarAgenda';
    const dono = this.validarComLog(() => this.converterId(usuarioId, operacao, 'usuarioId'));

    const filtro = { usuarioId: dono };
    if (somenteFavoritos) filtro.favorito = true;
    if (!incluirBloqueados) filtro.bloqueado = false;

    return this.agregar(
      [
        { $match: filtro },
        {
          $lookup: {
            from: Usuario.colecao,
            localField: 'contatoId',
            foreignField: '_id',
            as: 'usuario'
          }
        },
        { $unwind: '$usuario' },
        {
          $project: {
            _id: 1,
            apelido: 1,
            favorito: 1,
            bloqueado: 1,
            criadoEm: 1,
            contatoId: 1,
            nome: '$usuario.nome',
            email: '$usuario.email',
            avatar: '$usuario.avatar',
            status: '$usuario.status',
            recado: '$usuario.recado',
            exibicao: { $ifNull: ['$apelido', '$usuario.nome'] }
          }
        },
        { $sort: { favorito: -1, exibicao: 1 } }
      ],
      operacao
    );
  }

  /**
   * Inverte a marcacao de favorito de um contato.
   *
   * @param {string} id Identificador do contato.
   * @returns {Promise<Contato>}
   */
  static async alternarFavorito(id) {
    const contato = await this.obterPorId(id);

    return this.atualizarPorId(contato.id, { favorito: !contato.favorito });
  }

  /**
   * Bloqueia ou desbloqueia um contato.
   *
   * @param {string} id Identificador do contato.
   * @param {boolean} [bloqueado] true para bloquear, false para desbloquear.
   * @returns {Promise<Contato>}
   */
  static async definirBloqueio(id, bloqueado = true) {
    return this.atualizarPorId(id, { bloqueado: Boolean(bloqueado) });
  }

  /**
   * Verifica se o dono da agenda bloqueou o outro usuario.
   *
   * @param {string} usuarioId Dono da agenda.
   * @param {string} contatoId Usuario consultado.
   * @returns {Promise<boolean>}
   */
  static async estaBloqueado(usuarioId, contatoId) {
    const operacao = 'Contato.estaBloqueado';

    const { dono, outro } = this.validarComLog(() => ({
      dono: this.converterId(usuarioId, operacao, 'usuarioId'),
      outro: this.converterId(contatoId, operacao, 'contatoId')
    }));

    const total = await this.contar({ usuarioId: dono, contatoId: outro, bloqueado: true });

    return total > 0;
  }

  /**
   * Remove um usuario da agenda de outro.
   *
   * @param {string} usuarioId Dono da agenda.
   * @param {string} contatoId Usuario removido.
   * @returns {Promise<boolean>}
   * @throws {import('../errors').ErroNaoEncontrado} Quando o vinculo nao existe.
   */
  static async remover(usuarioId, contatoId) {
    const operacao = 'Contato.remover';

    const { dono, outro } = this.validarComLog(() => ({
      dono: this.converterId(usuarioId, operacao, 'usuarioId'),
      outro: this.converterId(contatoId, operacao, 'contatoId')
    }));

    const contato = await this.buscarUm({ usuarioId: dono, contatoId: outro });

    if (!contato) {
      const erro = new ErroNaoEncontrado(Contato.entidade, `${usuarioId} -> ${contatoId}`, { operacao });

      logger.erro(erro);
      throw erro;
    }

    return this.excluirPorId(contato.id);
  }

  /**
   * Resumo do contato para exibicao no terminal.
   * @returns {string}
   */
  paraTexto() {
    const marcas = [this.favorito ? '⭐' : null, this.bloqueado ? '🚫' : null].filter(Boolean).join(' ');
    return `${this.apelido ?? '(sem apelido)'} ${marcas}`.trim();
  }
}

module.exports = Contato;

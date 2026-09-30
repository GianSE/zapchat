'use strict';

/**
 * Entidade Conversa - colecao "conversas".
 *
 * Uma conversa pode ser privada (exatamente dois participantes) ou em grupo
 * (dois ou mais participantes, com nome e administradores). Guarda tambem um
 * resumo da ultima mensagem, usado para montar a lista de conversas sem
 * precisar consultar a colecao de mensagens.
 *
 * Campos obrigatorios: tipo, participantes, criadoPor.
 */

const Modelo = require('./Modelo');
const Usuario = require('./Usuario');
const Validador = require('../utils/Validador');
const logger = require('../utils/Logger');
const { ErroRegraNegocio, ErroValidacao } = require('../errors');

/** Tipos de conversa aceitos. */
const TIPOS_VALIDOS = Object.freeze(['privada', 'grupo']);

class Conversa extends Modelo {
  static get colecao() {
    return 'conversas';
  }

  static get camposObrigatorios() {
    return ['tipo', 'participantes', 'criadoPor'];
  }

  static get camposAtualizaveis() {
    return ['nome', 'descricao', 'icone'];
  }

  static get indices() {
    return [
      { key: { participantes: 1, 'ultimaMensagem.enviadaEm': -1 }, name: 'idx_participantes_recentes' },
      { key: { tipo: 1 }, name: 'idx_tipo' },
      { key: { criadoPor: 1 }, name: 'idx_criador' }
    ];
  }

  /** Tipos de conversa aceitos. @returns {string[]} */
  static get tiposValidos() {
    return [...TIPOS_VALIDOS];
  }

  /**
   * @param {object} dados
   * @param {string} [dados.tipo] "privada" ou "grupo" (obrigatorio).
   * @param {string[]} dados.participantes Ids dos participantes (obrigatorio).
   * @param {string} dados.criadoPor Id de quem criou a conversa (obrigatorio).
   * @param {string} [dados.nome] Nome do grupo (obrigatorio quando tipo = grupo).
   * @param {string} [dados.descricao] Descricao do grupo.
   * @param {string} [dados.icone] Emoji que representa a conversa.
   * @param {string[]} [dados.administradores] Ids dos administradores do grupo.
   * @param {object} [dados.ultimaMensagem] Resumo da ultima mensagem enviada.
   * @param {number} [dados.totalMensagens] Quantidade de mensagens enviadas.
   */
  constructor(dados = {}) {
    super(dados);

    const operacao = 'Conversa.construtor';
    const paraId = (valor, campo) => Validador.converterObjectId(valor, campo, operacao);

    this.tipo = dados.tipo ?? 'privada';
    this.nome = dados.nome?.trim() ?? null;
    this.descricao = dados.descricao?.trim() ?? null;
    this.icone = dados.icone ?? (this.tipo === 'grupo' ? '👥' : '💬');

    this.participantes = Array.isArray(dados.participantes)
      ? dados.participantes.map((valor) => paraId(valor, 'participantes'))
      : [];

    this.administradores = Array.isArray(dados.administradores)
      ? dados.administradores.map((valor) => paraId(valor, 'administradores'))
      : [];

    this.criadoPor = dados.criadoPor ? paraId(dados.criadoPor, 'criadoPor') : null;
    this.ultimaMensagem = dados.ultimaMensagem ?? null;
    this.totalMensagens = dados.totalMensagens ?? 0;
  }

  /**
   * Quantidade de participantes da conversa.
   * @returns {number}
   */
  get quantidadeParticipantes() {
    return this.participantes.length;
  }

  /**
   * Indica se a conversa e um grupo.
   * @returns {boolean}
   */
  get ehGrupo() {
    return this.tipo === 'grupo';
  }

  paraDocumento() {
    return {
      tipo: this.tipo,
      nome: this.nome,
      descricao: this.descricao,
      icone: this.icone,
      participantes: this.participantes,
      administradores: this.administradores,
      criadoPor: this.criadoPor,
      ultimaMensagem: this.ultimaMensagem,
      totalMensagens: this.totalMensagens
    };
  }

  /**
   * Regras de validacao da entidade Conversa.
   *
   * @param {object} dados Campos presentes.
   * @param {string} operacao Operacao em execucao.
   * @returns {void}
   * @throws {ErroValidacao}
   */
  static validarCampos(dados, operacao) {
    const erros = [];

    Validador.enumerado(erros, dados.tipo, TIPOS_VALIDOS, 'tipo');
    Validador.texto(erros, dados.nome, 'nome', { min: 3, max: 60 });
    Validador.texto(erros, dados.descricao, 'descricao', { min: 3, max: 200 });
    Validador.objectId(erros, dados.criadoPor, 'criadoPor');
    Validador.listaDeObjectId(erros, dados.participantes, 'participantes', { min: 2 });
    Validador.listaDeObjectId(erros, dados.administradores, 'administradores', { min: 0 });

    if (Array.isArray(dados.participantes)) {
      const identificadores = dados.participantes.map(String);
      const unicos = new Set(identificadores);

      if (unicos.size !== identificadores.length) {
        erros.push('Campo "participantes" nao pode conter o mesmo usuario mais de uma vez');
      }

      if (dados.tipo === 'privada' && identificadores.length !== 2) {
        erros.push('Uma conversa privada deve ter exatamente 2 participantes');
      }

      if (dados.criadoPor && !unicos.has(String(dados.criadoPor)) && unicos.size > 0) {
        erros.push('Campo "criadoPor" deve estar entre os participantes da conversa');
      }

      if (Array.isArray(dados.administradores)) {
        const fora = dados.administradores.map(String).filter((id) => !unicos.has(id));

        if (fora.length > 0) {
          erros.push('Campo "administradores" so aceita usuarios que participam da conversa');
        }
      }
    }

    if (dados.tipo === 'grupo' && !Validador.informado(dados.nome)) {
      erros.push('Campo "nome" obrigatorio para conversas do tipo grupo');
    }

    Validador.lancarSeHouverErros(erros, Conversa.entidade, operacao);
  }

  // ---------------------------------------------------------------------------
  // Criacao de conversas
  // ---------------------------------------------------------------------------

  /**
   * Confere se todos os usuarios informados existem.
   *
   * @param {Array<string|import('mongodb').ObjectId>} ids Identificadores.
   * @returns {Promise<void>}
   * @throws {import('../errors').ErroNaoEncontrado} Quando algum usuario nao existe.
   */
  static async garantirUsuariosExistentes(ids) {
    for (const id of ids) await Usuario.obterPorId(id);
  }

  /**
   * Cria uma conversa privada entre dois usuarios. Caso a conversa ja exista,
   * ela e retornada em vez de duplicada.
   *
   * @param {string} usuarioA Primeiro participante (criador).
   * @param {string} usuarioB Segundo participante.
   * @returns {Promise<Conversa>}
   */
  static async abrirPrivada(usuarioA, usuarioB) {
    const operacao = 'Conversa.abrirPrivada';

    const conversa = new Conversa({
      tipo: 'privada',
      participantes: [usuarioA, usuarioB],
      criadoPor: usuarioA
    });

    Conversa.validarComLog(() => conversa.validar(operacao));
    await this.garantirUsuariosExistentes(conversa.participantes);

    const existente = await this.buscarPrivadaEntre(usuarioA, usuarioB);

    if (existente) {
      logger.info(`Conversa privada ja existente reaproveitada (_id: ${existente.id})`, { operacao });
      return existente;
    }

    return conversa.salvar();
  }

  /**
   * Cria uma conversa em grupo.
   *
   * @param {object} dados
   * @param {string} dados.nome Nome do grupo (obrigatorio).
   * @param {string} dados.criadoPor Criador do grupo (obrigatorio).
   * @param {string[]} dados.participantes Participantes, incluindo o criador.
   * @param {string} [dados.descricao] Descricao do grupo.
   * @param {string} [dados.icone] Emoji do grupo.
   * @returns {Promise<Conversa>}
   */
  static async criarGrupo({ nome, criadoPor, participantes = [], descricao = null, icone = '👥' }) {
    const operacao = 'Conversa.criarGrupo';

    // O criador sempre participa e e administrador do grupo.
    const lista = [...new Set([String(criadoPor), ...participantes.map(String)].filter(Boolean))];

    const grupo = new Conversa({
      tipo: 'grupo',
      nome,
      descricao,
      icone,
      criadoPor,
      participantes: lista,
      administradores: [criadoPor]
    });

    Conversa.validarComLog(() => grupo.validar(operacao));
    await this.garantirUsuariosExistentes(grupo.participantes);

    return grupo.salvar();
  }

  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------

  /**
   * Busca a conversa privada existente entre dois usuarios.
   *
   * @param {string} usuarioA Primeiro participante.
   * @param {string} usuarioB Segundo participante.
   * @returns {Promise<Conversa|null>}
   */
  static async buscarPrivadaEntre(usuarioA, usuarioB) {
    const operacao = 'Conversa.buscarPrivadaEntre';

    const { primeiro, segundo } = this.validarComLog(() => ({
      primeiro: this.converterId(usuarioA, operacao, 'usuarioA'),
      segundo: this.converterId(usuarioB, operacao, 'usuarioB')
    }));

    return this.buscarUm({
      tipo: 'privada',
      participantes: { $all: [primeiro, segundo], $size: 2 }
    });
  }

  /**
   * Lista as conversas de um usuario, das mais recentes para as mais antigas.
   *
   * @param {string} usuarioId Participante das conversas.
   * @param {object} [opcoes]
   * @param {number} [opcoes.limite] Quantidade maxima de conversas.
   * @returns {Promise<Conversa[]>}
   */
  static async listarDoUsuario(usuarioId, { limite = 0 } = {}) {
    const operacao = 'Conversa.listarDoUsuario';
    const participante = this.validarComLog(() => this.converterId(usuarioId, operacao, 'usuarioId'));

    return this.listar(
      { participantes: participante },
      { ordenar: { 'ultimaMensagem.enviadaEm': -1, criadoEm: -1 }, limite }
    );
  }

  /**
   * Lista as conversas de um usuario no formato exibido na tela inicial de um
   * aplicativo de mensagens: nome da conversa, participantes e ultima mensagem.
   * Utiliza $lookup para trazer os dados dos participantes.
   *
   * @param {string} usuarioId Participante das conversas.
   * @returns {Promise<object[]>}
   */
  static async listarPainelDoUsuario(usuarioId) {
    const operacao = 'Conversa.listarPainelDoUsuario';
    const participante = this.validarComLog(() => this.converterId(usuarioId, operacao, 'usuarioId'));

    return this.agregar(
      [
        { $match: { participantes: participante } },
        {
          $lookup: {
            from: Usuario.colecao,
            localField: 'participantes',
            foreignField: '_id',
            as: 'pessoas'
          }
        },
        {
          $addFields: {
            // Em conversas privadas, o titulo e o nome do outro participante.
            outros: {
              $filter: {
                input: '$pessoas',
                as: 'pessoa',
                cond: { $ne: ['$$pessoa._id', participante] }
              }
            }
          }
        },
        {
          $project: {
            tipo: 1,
            icone: 1,
            totalMensagens: 1,
            ultimaMensagem: 1,
            criadoEm: 1,
            titulo: {
              $cond: [
                { $eq: ['$tipo', 'grupo'] },
                '$nome',
                { $ifNull: [{ $first: '$outros.nome' }, 'Conversa sem participantes'] }
              ]
            },
            participantes: {
              $map: { input: '$pessoas', as: 'pessoa', in: { nome: '$$pessoa.nome', status: '$$pessoa.status' } }
            }
          }
        },
        { $sort: { 'ultimaMensagem.enviadaEm': -1, criadoEm: -1 } }
      ],
      operacao
    );
  }

  /**
   * Verifica se um usuario participa de uma conversa.
   *
   * @param {string} conversaId Identificador da conversa.
   * @param {string} usuarioId Identificador do usuario.
   * @returns {Promise<boolean>}
   */
  static async ehParticipante(conversaId, usuarioId) {
    const operacao = 'Conversa.ehParticipante';

    const { conversa, participante } = this.validarComLog(() => ({
      conversa: this.converterId(conversaId, operacao, 'conversaId'),
      participante: this.converterId(usuarioId, operacao, 'usuarioId')
    }));

    const total = await this.contar({ _id: conversa, participantes: participante });

    return total > 0;
  }

  /**
   * Garante que o usuario participa da conversa, lancando excecao caso nao
   * participe. Utilizado antes de enviar ou ler mensagens.
   *
   * @param {string} conversaId Identificador da conversa.
   * @param {string} usuarioId Identificador do usuario.
   * @param {string} [operacao] Operacao em execucao.
   * @returns {Promise<Conversa>} A conversa correspondente.
   * @throws {ErroRegraNegocio} Quando o usuario nao participa da conversa.
   */
  static async garantirParticipante(conversaId, usuarioId, operacao = 'Conversa.garantirParticipante') {
    const conversa = await this.obterPorId(conversaId);
    const participante = this.validarComLog(() => this.converterId(usuarioId, operacao, 'usuarioId'));

    if (!conversa.participantes.some((id) => id.equals(participante))) {
      const erro = new ErroRegraNegocio('O usuario nao participa desta conversa', {
        operacao,
        detalhes: { conversaId: conversa.id, usuarioId: String(usuarioId) }
      });

      logger.erro(erro);
      throw erro;
    }

    return conversa;
  }

  // ---------------------------------------------------------------------------
  // Participantes e administradores
  // ---------------------------------------------------------------------------

  /**
   * Adiciona um participante a um grupo.
   *
   * @param {string} conversaId Identificador do grupo.
   * @param {string} usuarioId Usuario a ser adicionado.
   * @returns {Promise<Conversa>}
   * @throws {ErroRegraNegocio} Quando a conversa e privada ou o usuario ja participa.
   */
  static async adicionarParticipante(conversaId, usuarioId) {
    const operacao = 'Conversa.adicionarParticipante';

    const conversa = await this.obterPorId(conversaId);
    const novo = this.validarComLog(() => this.converterId(usuarioId, operacao, 'usuarioId'));

    if (!conversa.ehGrupo) {
      const erro = new ErroRegraNegocio('Nao e possivel adicionar participantes em uma conversa privada', {
        operacao,
        detalhes: { conversaId: conversa.id, tipo: conversa.tipo }
      });

      logger.erro(erro);
      throw erro;
    }

    if (conversa.participantes.some((id) => id.equals(novo))) {
      const erro = new ErroRegraNegocio('Este usuario ja participa do grupo', {
        operacao,
        detalhes: { conversaId: conversa.id, usuarioId: String(usuarioId) }
      });

      logger.erro(erro);
      throw erro;
    }

    await Usuario.obterPorId(novo);

    return this.aplicarOperadores(conversa.id, { $addToSet: { participantes: novo } }, operacao);
  }

  /**
   * Remove um participante de um grupo (tambem da lista de administradores).
   *
   * @param {string} conversaId Identificador do grupo.
   * @param {string} usuarioId Usuario a ser removido.
   * @returns {Promise<Conversa>}
   * @throws {ErroRegraNegocio} Quando a conversa e privada, o usuario nao
   *         participa, ou o grupo ficaria com menos de 2 participantes.
   */
  static async removerParticipante(conversaId, usuarioId) {
    const operacao = 'Conversa.removerParticipante';

    const conversa = await this.obterPorId(conversaId);
    const alvo = this.validarComLog(() => this.converterId(usuarioId, operacao, 'usuarioId'));

    if (!conversa.ehGrupo) {
      const erro = new ErroRegraNegocio('Nao e possivel remover participantes de uma conversa privada', {
        operacao,
        detalhes: { conversaId: conversa.id, tipo: conversa.tipo }
      });

      logger.erro(erro);
      throw erro;
    }

    if (!conversa.participantes.some((id) => id.equals(alvo))) {
      const erro = new ErroRegraNegocio('Este usuario nao participa do grupo', {
        operacao,
        detalhes: { conversaId: conversa.id, usuarioId: String(usuarioId) }
      });

      logger.erro(erro);
      throw erro;
    }

    if (conversa.quantidadeParticipantes <= 2) {
      const erro = new ErroRegraNegocio('Um grupo deve manter no minimo 2 participantes', {
        operacao,
        detalhes: { conversaId: conversa.id, participantes: conversa.quantidadeParticipantes }
      });

      logger.erro(erro);
      throw erro;
    }

    return this.aplicarOperadores(
      conversa.id,
      { $pull: { participantes: alvo, administradores: alvo } },
      operacao
    );
  }

  /**
   * Promove um participante do grupo a administrador.
   *
   * @param {string} conversaId Identificador do grupo.
   * @param {string} usuarioId Participante promovido.
   * @returns {Promise<Conversa>}
   * @throws {ErroRegraNegocio} Quando o usuario nao participa do grupo.
   */
  static async promoverAdministrador(conversaId, usuarioId) {
    const operacao = 'Conversa.promoverAdministrador';

    const conversa = await this.garantirParticipante(conversaId, usuarioId, operacao);
    const promovido = this.converterId(usuarioId, operacao, 'usuarioId');

    if (!conversa.ehGrupo) {
      const erro = new ErroRegraNegocio('Somente grupos possuem administradores', {
        operacao,
        detalhes: { conversaId: conversa.id, tipo: conversa.tipo }
      });

      logger.erro(erro);
      throw erro;
    }

    return this.aplicarOperadores(conversa.id, { $addToSet: { administradores: promovido } }, operacao);
  }

  /**
   * Renomeia um grupo.
   *
   * @param {string} conversaId Identificador do grupo.
   * @param {string} nome Novo nome.
   * @returns {Promise<Conversa>}
   * @throws {ErroValidacao} Quando a conversa nao e um grupo.
   */
  static async renomearGrupo(conversaId, nome) {
    const operacao = 'Conversa.renomearGrupo';
    const conversa = await this.obterPorId(conversaId);

    if (!conversa.ehGrupo) {
      const erro = new ErroValidacao(
        'Somente conversas do tipo grupo possuem nome',
        ['Campo "nome" nao se aplica a conversas privadas'],
        { operacao, detalhes: { conversaId: conversa.id } }
      );

      logger.erro(erro);
      throw erro;
    }

    return this.atualizarPorId(conversa.id, { nome });
  }

  // ---------------------------------------------------------------------------
  // Resumo da ultima mensagem
  // ---------------------------------------------------------------------------

  /**
   * Atualiza o resumo da ultima mensagem e incrementa o total de mensagens.
   *
   * @param {string} conversaId Identificador da conversa.
   * @param {object} resumo
   * @param {string} resumo.texto Previa do conteudo.
   * @param {import('mongodb').ObjectId|string} resumo.autorId Autor da mensagem.
   * @param {string} resumo.autorNome Nome do autor.
   * @param {Date} resumo.enviadaEm Data de envio.
   * @returns {Promise<Conversa>}
   */
  static async registrarUltimaMensagem(conversaId, { texto, autorId, autorNome, enviadaEm }) {
    const operacao = 'Conversa.registrarUltimaMensagem';

    return this.aplicarOperadores(
      conversaId,
      {
        $set: {
          ultimaMensagem: {
            texto: String(texto).slice(0, 80),
            autorId: this.converterId(autorId, operacao, 'autorId'),
            autorNome,
            enviadaEm: enviadaEm ?? new Date()
          }
        },
        $inc: { totalMensagens: 1 }
      },
      operacao
    );
  }

  /**
   * Recalcula o total de mensagens e o resumo da ultima mensagem a partir da
   * colecao de mensagens. Util depois de exclusoes.
   *
   * @param {string} conversaId Identificador da conversa.
   * @param {object|null} ultima Resumo da ultima mensagem (ou null).
   * @param {number} total Quantidade de mensagens existentes.
   * @returns {Promise<Conversa>}
   */
  static async sincronizarResumo(conversaId, ultima, total) {
    return this.aplicarOperadores(
      conversaId,
      { $set: { ultimaMensagem: ultima, totalMensagens: total } },
      'Conversa.sincronizarResumo'
    );
  }

  /**
   * Resumo da conversa para exibicao no terminal.
   * @returns {string}
   */
  paraTexto() {
    const titulo = this.ehGrupo ? this.nome : 'Conversa privada';
    const previa = this.ultimaMensagem ? ` | ultima: "${this.ultimaMensagem.texto}"` : '';

    return `${this.icone} ${titulo} (${this.quantidadeParticipantes} participantes, ${this.totalMensagens} mensagens)${previa}`;
  }
}

module.exports = Conversa;
module.exports.TIPOS_VALIDOS = TIPOS_VALIDOS;

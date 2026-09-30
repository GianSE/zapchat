'use strict';

/**
 * Entidade Mensagem - colecao "mensagens".
 *
 * Representa cada mensagem enviada em uma conversa. Guarda o autor, o conteudo,
 * o tipo (texto, imagem, arquivo...), a lista de quem ja leu, a mensagem
 * respondida e o controle de edicao e exclusao.
 *
 * A exclusao de mensagens e feita em duas formas, como nos aplicativos reais:
 *   - excluirParaTodos: marca a mensagem como excluida e preserva o historico;
 *   - excluirPorId (herdado): remove o documento definitivamente do MongoDB.
 *
 * Campos obrigatorios: conversaId, autorId, conteudo, tipo.
 */

const Modelo = require('./Modelo');
const Usuario = require('./Usuario');
const Conversa = require('./Conversa');
const Validador = require('../utils/Validador');
const logger = require('../utils/Logger');
const { ErroRegraNegocio, ErroValidacao } = require('../errors');

/** Tipos de mensagem aceitos. */
const TIPOS_VALIDOS = Object.freeze(['texto', 'imagem', 'arquivo', 'audio', 'video', 'sistema']);

/** Tipos que exigem o envio de um anexo. */
const TIPOS_COM_ANEXO = Object.freeze(['imagem', 'arquivo', 'audio', 'video']);

/** Texto exibido no lugar do conteudo de uma mensagem excluida. */
const TEXTO_EXCLUIDA = 'Esta mensagem foi apagada';

class Mensagem extends Modelo {
  static get colecao() {
    return 'mensagens';
  }

  static get camposObrigatorios() {
    return ['conversaId', 'autorId', 'conteudo', 'tipo'];
  }

  static get camposAtualizaveis() {
    return ['conteudo', 'fixada'];
  }

  static get indices() {
    return [
      { key: { conversaId: 1, criadoEm: -1 }, name: 'idx_historico_conversa' },
      { key: { autorId: 1, criadoEm: -1 }, name: 'idx_mensagens_autor' },
      { key: { 'lidaPor.usuarioId': 1 }, name: 'idx_leitura' },
      { key: { respostaA: 1 }, name: 'idx_respostas' },
      {
        key: { conteudo: 'text' },
        name: 'idx_busca_conteudo',
        default_language: 'portuguese'
      }
    ];
  }

  /** Tipos de mensagem aceitos. @returns {string[]} */
  static get tiposValidos() {
    return [...TIPOS_VALIDOS];
  }

  /**
   * @param {object} dados
   * @param {string} dados.conversaId Conversa de destino (obrigatorio).
   * @param {string} dados.autorId Autor da mensagem (obrigatorio).
   * @param {string} dados.conteudo Texto ou legenda da mensagem (obrigatorio).
   * @param {string} [dados.tipo] texto, imagem, arquivo, audio, video ou sistema.
   * @param {object} [dados.anexo] Anexo { nome, url, tamanhoKb }.
   * @param {string} [dados.respostaA] Id da mensagem respondida.
   * @param {Array<object>} [dados.lidaPor] Lista de leituras.
   * @param {boolean} [dados.editada] Indica se a mensagem foi editada.
   * @param {boolean} [dados.excluida] Indica exclusao para todos.
   * @param {boolean} [dados.fixada] Indica mensagem fixada na conversa.
   */
  constructor(dados = {}) {
    super(dados);

    const operacao = 'Mensagem.construtor';
    const paraId = (valor, campo) => Validador.converterObjectId(valor, campo, operacao);

    this.conversaId = dados.conversaId ? paraId(dados.conversaId, 'conversaId') : null;
    this.autorId = dados.autorId ? paraId(dados.autorId, 'autorId') : null;
    this.conteudo = typeof dados.conteudo === 'string' ? dados.conteudo.trim() : dados.conteudo ?? null;
    this.tipo = dados.tipo ?? 'texto';
    this.anexo = dados.anexo ?? null;
    this.respostaA = dados.respostaA ? paraId(dados.respostaA, 'respostaA') : null;

    this.lidaPor = Array.isArray(dados.lidaPor)
      ? dados.lidaPor.map((leitura) => ({
          usuarioId: paraId(leitura.usuarioId, 'lidaPor.usuarioId'),
          lidaEm: leitura.lidaEm ?? new Date()
        }))
      : [];

    this.editada = dados.editada ?? false;
    this.editadaEm = dados.editadaEm ?? null;
    this.excluida = dados.excluida ?? false;
    this.excluidaEm = dados.excluidaEm ?? null;
    this.fixada = dados.fixada ?? false;
  }

  /**
   * Data de envio da mensagem (o campo criadoEm da colecao).
   * @returns {Date|null}
   */
  get enviadaEm() {
    return this.criadoEm;
  }

  /**
   * Previa do conteudo, respeitando a exclusao para todos.
   * @returns {string}
   */
  get previa() {
    if (this.excluida) return TEXTO_EXCLUIDA;

    const texto = String(this.conteudo ?? '');

    return texto.length > 60 ? `${texto.slice(0, 57)}...` : texto;
  }

  /**
   * Indica se a mensagem possui anexo.
   * @returns {boolean}
   */
  get possuiAnexo() {
    return TIPOS_COM_ANEXO.includes(this.tipo);
  }

  /**
   * Quantidade de usuarios que ja leram a mensagem.
   * @returns {number}
   */
  get totalLeituras() {
    return this.lidaPor.length;
  }

  /**
   * Indica se um usuario especifico ja leu a mensagem.
   *
   * @param {string} usuarioId Identificador do usuario.
   * @returns {boolean}
   */
  foiLidaPor(usuarioId) {
    return this.lidaPor.some((leitura) => String(leitura.usuarioId) === String(usuarioId));
  }

  paraDocumento() {
    return {
      conversaId: this.conversaId,
      autorId: this.autorId,
      conteudo: this.conteudo,
      tipo: this.tipo,
      anexo: this.anexo,
      respostaA: this.respostaA,
      lidaPor: this.lidaPor,
      editada: this.editada,
      editadaEm: this.editadaEm,
      excluida: this.excluida,
      excluidaEm: this.excluidaEm,
      fixada: this.fixada
    };
  }

  /**
   * Regras de validacao da entidade Mensagem.
   *
   * @param {object} dados Campos presentes.
   * @param {string} operacao Operacao em execucao.
   * @returns {void}
   * @throws {ErroValidacao}
   */
  static validarCampos(dados, operacao) {
    const erros = [];

    Validador.objectId(erros, dados.conversaId, 'conversaId');
    Validador.objectId(erros, dados.autorId, 'autorId');
    Validador.objectId(erros, dados.respostaA, 'respostaA');
    Validador.enumerado(erros, dados.tipo, TIPOS_VALIDOS, 'tipo');
    Validador.texto(erros, dados.conteudo, 'conteudo', { min: 1, max: 4096 });

    if (dados.fixada !== undefined && typeof dados.fixada !== 'boolean') {
      erros.push('Campo "fixada" deve ser verdadeiro ou falso');
    }

    // Mensagens de midia precisam informar o anexo correspondente.
    if (TIPOS_COM_ANEXO.includes(dados.tipo)) {
      if (!dados.anexo || typeof dados.anexo !== 'object') {
        erros.push(`Campo "anexo" obrigatorio para mensagens do tipo ${dados.tipo}`);
      } else {
        Validador.texto(erros, dados.anexo.nome, 'anexo.nome', { min: 1, max: 120 });
        Validador.texto(erros, dados.anexo.url, 'anexo.url', { min: 3, max: 500 });

        if (!Validador.informado(dados.anexo.nome)) erros.push('Campo "anexo.nome" obrigatorio');
        if (!Validador.informado(dados.anexo.url)) erros.push('Campo "anexo.url" obrigatorio');

        if (dados.anexo.tamanhoKb !== undefined && dados.anexo.tamanhoKb !== null) {
          const tamanho = Number(dados.anexo.tamanhoKb);

          if (!Number.isFinite(tamanho) || tamanho <= 0) {
            erros.push('Campo "anexo.tamanhoKb" deve ser um numero maior que zero');
          }
        }
      }
    } else if (dados.anexo) {
      erros.push(`Mensagens do tipo "${dados.tipo}" nao aceitam anexo`);
    }

    Validador.lancarSeHouverErros(erros, Mensagem.entidade, operacao);
  }

  // ---------------------------------------------------------------------------
  // Envio
  // ---------------------------------------------------------------------------

  /**
   * Envia uma mensagem para uma conversa.
   *
   * Antes de gravar, confere que a conversa existe, que o autor participa dela
   * e, quando informada, que a mensagem respondida pertence a mesma conversa.
   *
   * @param {object} dados Dados da mensagem.
   * @returns {Promise<Mensagem>}
   * @throws {ErroValidacao|ErroRegraNegocio|import('../errors').ErroNaoEncontrado}
   */
  static async enviar(dados) {
    const operacao = 'Mensagem.enviar';

    const mensagem = new Mensagem(dados);
    Mensagem.validarComLog(() => mensagem.validar(operacao));

    // O autor precisa existir e participar da conversa.
    await Usuario.obterPorId(mensagem.autorId);
    await Conversa.garantirParticipante(mensagem.conversaId, mensagem.autorId, operacao);

    if (mensagem.respostaA) {
      const respondida = await this.obterPorId(mensagem.respostaA);

      if (!respondida.conversaId.equals(mensagem.conversaId)) {
        const erro = new ErroRegraNegocio('A mensagem respondida pertence a outra conversa', {
          operacao,
          detalhes: { respostaA: respondida.id, conversaId: mensagem.conversaId.toString() }
        });

        logger.erro(erro);
        throw erro;
      }
    }

    // O autor ja leu a propria mensagem.
    mensagem.lidaPor = [{ usuarioId: mensagem.autorId, lidaEm: new Date() }];

    return mensagem.salvar();
  }

  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------

  /**
   * Lista o historico de mensagens de uma conversa.
   *
   * @param {string} conversaId Identificador da conversa.
   * @param {object} [opcoes]
   * @param {number} [opcoes.limite] Quantidade maxima de mensagens.
   * @param {number} [opcoes.pular] Mensagens ignoradas (paginacao).
   * @param {boolean} [opcoes.incluirExcluidas] Inclui mensagens apagadas.
   * @param {'asc'|'desc'} [opcoes.ordem] Ordem pela data de envio.
   * @returns {Promise<Mensagem[]>}
   */
  static async listarHistorico(
    conversaId,
    { limite = 50, pular = 0, incluirExcluidas = false, ordem = 'asc' } = {}
  ) {
    const operacao = 'Mensagem.listarHistorico';
    const conversa = this.validarComLog(() => this.converterId(conversaId, operacao, 'conversaId'));

    const filtro = { conversaId: conversa };
    if (!incluirExcluidas) filtro.excluida = false;

    return this.listar(filtro, { ordenar: { criadoEm: ordem === 'asc' ? 1 : -1 }, limite, pular });
  }

  /**
   * Historico da conversa com os dados do autor, as reacoes recebidas e a
   * previa da mensagem respondida. Demonstra o uso de $lookup entre as tres
   * colecoes principais do projeto.
   *
   * @param {string} conversaId Identificador da conversa.
   * @param {object} [opcoes]
   * @param {number} [opcoes.limite] Quantidade maxima de mensagens.
   * @returns {Promise<object[]>}
   */
  static async historicoDetalhado(conversaId, { limite = 50 } = {}) {
    const operacao = 'Mensagem.historicoDetalhado';
    const conversa = this.validarComLog(() => this.converterId(conversaId, operacao, 'conversaId'));

    return this.agregar(
      [
        { $match: { conversaId: conversa } },
        { $sort: { criadoEm: 1 } },
        { $limit: limite },
        {
          $lookup: {
            from: Usuario.colecao,
            localField: 'autorId',
            foreignField: '_id',
            as: 'autor'
          }
        },
        { $unwind: { path: '$autor', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'reacoes',
            localField: '_id',
            foreignField: 'mensagemId',
            as: 'reacoes'
          }
        },
        {
          $lookup: {
            from: Mensagem.colecao,
            localField: 'respostaA',
            foreignField: '_id',
            as: 'mensagemRespondida'
          }
        },
        {
          $project: {
            conteudo: { $cond: ['$excluida', TEXTO_EXCLUIDA, '$conteudo'] },
            autorId: 1,
            tipo: 1,
            anexo: 1,
            editada: 1,
            excluida: 1,
            fixada: 1,
            enviadaEm: '$criadoEm',
            autorNome: { $ifNull: ['$autor.nome', 'Usuario removido'] },
            autorAvatar: { $ifNull: ['$autor.avatar', '❔'] },
            totalLeituras: { $size: { $ifNull: ['$lidaPor', []] } },
            reacoes: {
              $map: { input: '$reacoes', as: 'reacao', in: '$$reacao.emoji' }
            },
            respondendo: { $first: '$mensagemRespondida.conteudo' }
          }
        }
      ],
      operacao
    );
  }

  /**
   * Pesquisa mensagens pelo conteudo.
   *
   * Utiliza o indice de texto (`$text`) criado na colecao. Caso o indice ainda
   * nao exista, a consulta e refeita com expressao regular, garantindo que a
   * funcionalidade continue disponivel.
   *
   * @param {string} termo Texto pesquisado.
   * @param {object} [opcoes]
   * @param {string} [opcoes.conversaId] Restringe a pesquisa a uma conversa.
   * @param {string} [opcoes.autorId] Restringe a pesquisa a um autor.
   * @param {number} [opcoes.limite] Quantidade maxima de resultados.
   * @returns {Promise<Mensagem[]>}
   * @throws {ErroValidacao} Quando o termo nao e informado.
   */
  static async pesquisar(termo, { conversaId = null, autorId = null, limite = 20 } = {}) {
    const operacao = 'Mensagem.pesquisar';

    this.validarComLog(() => {
      if (!Validador.informado(termo)) {
        throw ErroValidacao.camposObrigatorios(['termo'], Mensagem.entidade, operacao);
      }
    });

    const filtroBase = { excluida: false };
    if (conversaId) filtroBase.conversaId = this.converterId(conversaId, operacao, 'conversaId');
    if (autorId) filtroBase.autorId = this.converterId(autorId, operacao, 'autorId');

    try {
      return await this.listar({ ...filtroBase, $text: { $search: String(termo) } }, { limite });
    } catch (erro) {
      // Codigo 27 = IndexNotFound: o indice de texto ainda nao foi criado.
      const semIndice = erro?.causa?.code === 27 || erro?.detalhes?.codigo === 27;
      if (!semIndice) throw erro;

      logger.aviso('Indice de texto ausente em "mensagens": pesquisa refeita com expressao regular', {
        operacao,
        detalhes: { sugestao: 'Execute "npm run setup" para criar os indices' }
      });

      const texto = String(termo).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      return this.listar({ ...filtroBase, conteudo: new RegExp(texto, 'i') }, { limite });
    }
  }

  /**
   * Retorna a ultima mensagem enviada em uma conversa.
   *
   * @param {string} conversaId Identificador da conversa.
   * @returns {Promise<Mensagem|null>}
   */
  static async ultimaDaConversa(conversaId) {
    const operacao = 'Mensagem.ultimaDaConversa';
    const conversa = this.validarComLog(() => this.converterId(conversaId, operacao, 'conversaId'));

    return this.buscarUm({ conversaId: conversa, excluida: false }, { sort: { criadoEm: -1 } });
  }

  /**
   * Conta as mensagens nao lidas por um usuario.
   *
   * @param {string} usuarioId Identificador do usuario.
   * @param {string} [conversaId] Restringe a contagem a uma conversa.
   * @returns {Promise<number>}
   */
  static async contarNaoLidas(usuarioId, conversaId = null) {
    const operacao = 'Mensagem.contarNaoLidas';
    const usuario = this.validarComLog(() => this.converterId(usuarioId, operacao, 'usuarioId'));

    const filtro = {
      autorId: { $ne: usuario },
      excluida: false,
      'lidaPor.usuarioId': { $ne: usuario }
    };

    if (conversaId) filtro.conversaId = this.converterId(conversaId, operacao, 'conversaId');

    return this.contar(filtro);
  }

  /**
   * Resumo das mensagens nao lidas agrupadas por conversa.
   *
   * @param {string} usuarioId Identificador do usuario.
   * @returns {Promise<Array<{conversaId: object, naoLidas: number, ultimaEm: Date}>>}
   */
  static async resumoNaoLidas(usuarioId) {
    const operacao = 'Mensagem.resumoNaoLidas';
    const usuario = this.validarComLog(() => this.converterId(usuarioId, operacao, 'usuarioId'));

    return this.agregar(
      [
        {
          $match: {
            autorId: { $ne: usuario },
            excluida: false,
            'lidaPor.usuarioId': { $ne: usuario }
          }
        },
        { $group: { _id: '$conversaId', naoLidas: { $sum: 1 }, ultimaEm: { $max: '$criadoEm' } } },
        {
          $lookup: {
            from: Conversa.colecao,
            localField: '_id',
            foreignField: '_id',
            as: 'conversa'
          }
        },
        { $unwind: '$conversa' },
        // Mostra apenas as conversas das quais o usuario participa.
        { $match: { 'conversa.participantes': usuario } },
        {
          $project: {
            _id: 0,
            conversaId: '$_id',
            naoLidas: 1,
            ultimaEm: 1,
            tipo: '$conversa.tipo',
            nome: '$conversa.nome',
            icone: '$conversa.icone'
          }
        },
        { $sort: { naoLidas: -1, ultimaEm: -1 } }
      ],
      operacao
    );
  }

  /**
   * Estatisticas de participacao em uma conversa (mensagens por autor).
   *
   * @param {string} conversaId Identificador da conversa.
   * @returns {Promise<Array<{autor: string, mensagens: number, ultimaEm: Date}>>}
   */
  static async estatisticasPorAutor(conversaId) {
    const operacao = 'Mensagem.estatisticasPorAutor';
    const conversa = this.validarComLog(() => this.converterId(conversaId, operacao, 'conversaId'));

    return this.agregar(
      [
        { $match: { conversaId: conversa, excluida: false } },
        { $group: { _id: '$autorId', mensagens: { $sum: 1 }, ultimaEm: { $max: '$criadoEm' } } },
        {
          $lookup: {
            from: Usuario.colecao,
            localField: '_id',
            foreignField: '_id',
            as: 'usuario'
          }
        },
        { $unwind: { path: '$usuario', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            autor: { $ifNull: ['$usuario.nome', 'Usuario removido'] },
            mensagens: 1,
            ultimaEm: 1
          }
        },
        { $sort: { mensagens: -1 } }
      ],
      operacao
    );
  }

  /**
   * Ranking dos usuarios que mais enviaram mensagens no sistema.
   *
   * @param {number} [limite] Quantidade de posicoes do ranking.
   * @returns {Promise<Array<{posicao: number, autor: string, mensagens: number}>>}
   */
  static async rankingRemetentes(limite = 5) {
    const resultado = await this.agregar(
      [
        { $match: { excluida: false, tipo: { $ne: 'sistema' } } },
        { $group: { _id: '$autorId', mensagens: { $sum: 1 } } },
        { $sort: { mensagens: -1 } },
        { $limit: limite },
        {
          $lookup: {
            from: Usuario.colecao,
            localField: '_id',
            foreignField: '_id',
            as: 'usuario'
          }
        },
        { $unwind: { path: '$usuario', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            autor: { $ifNull: ['$usuario.nome', 'Usuario removido'] },
            mensagens: 1
          }
        }
      ],
      'Mensagem.rankingRemetentes'
    );

    return resultado.map((linha, indice) => ({ posicao: indice + 1, ...linha }));
  }

  // ---------------------------------------------------------------------------
  // Leitura, edicao e exclusao
  // ---------------------------------------------------------------------------

  /**
   * Marca uma mensagem como lida por um usuario.
   *
   * @param {string} mensagemId Identificador da mensagem.
   * @param {string} usuarioId Identificador do leitor.
   * @returns {Promise<Mensagem>}
   * @throws {ErroRegraNegocio} Quando o leitor nao participa da conversa.
   */
  static async marcarComoLida(mensagemId, usuarioId) {
    const operacao = 'Mensagem.marcarComoLida';

    const mensagem = await this.obterPorId(mensagemId);
    await Conversa.garantirParticipante(mensagem.conversaId, usuarioId, operacao);

    const leitor = this.converterId(usuarioId, operacao, 'usuarioId');

    if (mensagem.foiLidaPor(leitor)) return mensagem;

    return this.aplicarOperadores(
      mensagem.id,
      { $addToSet: { lidaPor: { usuarioId: leitor, lidaEm: new Date() } } },
      operacao
    );
  }

  /**
   * Marca como lidas todas as mensagens pendentes de uma conversa.
   *
   * @param {string} conversaId Identificador da conversa.
   * @param {string} usuarioId Identificador do leitor.
   * @returns {Promise<number>} Quantidade de mensagens marcadas.
   * @throws {ErroRegraNegocio} Quando o leitor nao participa da conversa.
   */
  static async marcarConversaComoLida(conversaId, usuarioId) {
    const operacao = 'Mensagem.marcarConversaComoLida';

    const conversa = await Conversa.garantirParticipante(conversaId, usuarioId, operacao);
    const leitor = this.converterId(usuarioId, operacao, 'usuarioId');

    const total = await this.atualizarMuitos(
      {
        conversaId: conversa._id,
        autorId: { $ne: leitor },
        'lidaPor.usuarioId': { $ne: leitor }
      },
      { $addToSet: { lidaPor: { usuarioId: leitor, lidaEm: new Date() } } },
      operacao
    );

    logger.info(`${total} mensagem(ns) marcada(s) como lida(s) na conversa ${conversa.id}`, { operacao });

    return total;
  }

  /**
   * Edita o conteudo de uma mensagem. Somente o autor pode editar, e mensagens
   * excluidas ou de sistema nao podem ser alteradas.
   *
   * @param {string} mensagemId Identificador da mensagem.
   * @param {string} autorId Identificador de quem esta editando.
   * @param {string} novoConteudo Novo texto da mensagem.
   * @returns {Promise<Mensagem>}
   * @throws {ErroRegraNegocio} Quando o usuario nao e o autor ou a mensagem nao pode ser editada.
   */
  static async editar(mensagemId, autorId, novoConteudo) {
    const operacao = 'Mensagem.editar';

    const mensagem = await this.obterPorId(mensagemId);
    const autor = this.validarComLog(() => this.converterId(autorId, operacao, 'autorId'));

    if (!mensagem.autorId.equals(autor)) {
      const erro = new ErroRegraNegocio('Somente o autor pode editar a mensagem', {
        operacao,
        detalhes: { mensagemId: mensagem.id, autorId: String(autorId) }
      });

      logger.erro(erro);
      throw erro;
    }

    if (mensagem.excluida) {
      const erro = new ErroRegraNegocio('Nao e possivel editar uma mensagem excluida', {
        operacao,
        detalhes: { mensagemId: mensagem.id }
      });

      logger.erro(erro);
      throw erro;
    }

    if (mensagem.tipo === 'sistema') {
      const erro = new ErroRegraNegocio('Mensagens do sistema nao podem ser editadas', {
        operacao,
        detalhes: { mensagemId: mensagem.id }
      });

      logger.erro(erro);
      throw erro;
    }

    const conteudo = typeof novoConteudo === 'string' ? novoConteudo.trim() : novoConteudo;

    this.validarComLog(() => {
      Validador.exigirCampos({ conteudo }, ['conteudo'], Mensagem.entidade, operacao);
      Mensagem.validarCampos({ conteudo, tipo: mensagem.tipo, anexo: mensagem.anexo }, operacao);
    });

    return this.aplicarOperadores(
      mensagem.id,
      { $set: { conteudo, editada: true, editadaEm: new Date() } },
      operacao
    );
  }

  /**
   * Exclui a mensagem para todos os participantes (exclusao logica): o conteudo
   * deixa de ser exibido, mas o documento permanece no historico.
   *
   * @param {string} mensagemId Identificador da mensagem.
   * @param {string} autorId Identificador de quem esta excluindo.
   * @returns {Promise<Mensagem>}
   * @throws {ErroRegraNegocio} Quando o usuario nao e o autor ou a mensagem ja foi excluida.
   */
  static async excluirParaTodos(mensagemId, autorId) {
    const operacao = 'Mensagem.excluirParaTodos';

    const mensagem = await this.obterPorId(mensagemId);
    const autor = this.validarComLog(() => this.converterId(autorId, operacao, 'autorId'));

    if (!mensagem.autorId.equals(autor)) {
      const erro = new ErroRegraNegocio('Somente o autor pode apagar a mensagem para todos', {
        operacao,
        detalhes: { mensagemId: mensagem.id, autorId: String(autorId) }
      });

      logger.erro(erro);
      throw erro;
    }

    if (mensagem.excluida) {
      const erro = new ErroRegraNegocio('Esta mensagem ja foi apagada', {
        operacao,
        detalhes: { mensagemId: mensagem.id }
      });

      logger.erro(erro);
      throw erro;
    }

    return this.aplicarOperadores(
      mensagem.id,
      { $set: { excluida: true, excluidaEm: new Date(), conteudo: TEXTO_EXCLUIDA, anexo: null } },
      operacao
    );
  }

  /**
   * Fixa ou desafixa uma mensagem na conversa.
   *
   * @param {string} mensagemId Identificador da mensagem.
   * @returns {Promise<Mensagem>}
   */
  static async alternarFixada(mensagemId) {
    const mensagem = await this.obterPorId(mensagemId);

    return this.atualizarPorId(mensagem.id, { fixada: !mensagem.fixada });
  }

  /**
   * Resumo da mensagem para exibicao no terminal.
   *
   * @param {string} [autorNome] Nome do autor, quando conhecido.
   * @returns {string}
   */
  paraTexto(autorNome = null) {
    const hora = this.enviadaEm ? this.enviadaEm.toLocaleTimeString('pt-BR') : '--:--';
    const marcas = [this.editada ? '(editada)' : null, this.fixada ? '📌' : null].filter(Boolean).join(' ');
    const anexo = this.possuiAnexo && this.anexo ? ` [${this.tipo}: ${this.anexo.nome}]` : '';

    return `[${hora}] ${autorNome ?? this.autorId}: ${this.previa}${anexo} ${marcas}`.trim();
  }
}

module.exports = Mensagem;
module.exports.TIPOS_VALIDOS = TIPOS_VALIDOS;
module.exports.TEXTO_EXCLUIDA = TEXTO_EXCLUIDA;

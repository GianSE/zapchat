'use strict';

/**
 * Camada MODEL (MVC) - classe base (abstrata) de todas as entidades.
 *
 * Concentra o comportamento comum a qualquer colecao do MongoDB:
 *   - operacoes CRUD genericas (inserir, consultar, atualizar, excluir);
 *   - validacao dos dados antes de acessar o banco;
 *   - conversao entre documento do MongoDB e objeto JavaScript;
 *   - tratamento das excecoes do driver e registro em arquivo de log.
 *
 * As subclasses (Usuario, Contato, Conversa, Mensagem, Reacao) informam sua
 * colecao, seus campos obrigatorios e suas regras proprias de validacao,
 * herdando todo o restante. Assim, o codigo de acesso a dados fica escrito
 * uma unica vez.
 */

const { ObjectId } = require('mongodb');
const Database = require('../database/Database');
const Validador = require('../utils/Validador');
const logger = require('../utils/Logger');
const { ErroAplicacao, ErroValidacao, ErroNaoEncontrado, ErroBanco } = require('../errors');

class Modelo {
  // ---------------------------------------------------------------------------
  // Metadados que cada subclasse deve declarar
  // ---------------------------------------------------------------------------

  /**
   * Nome da colecao no MongoDB.
   * @returns {string}
   * @throws {Error} Quando a subclasse nao sobrescreve o metodo.
   */
  static get colecao() {
    throw new Error(`A classe ${this.name} deve sobrescrever o getter estatico "colecao"`);
  }

  /**
   * Nome da entidade, utilizado nas mensagens de erro e de log.
   * @returns {string}
   */
  static get entidade() {
    return this.name;
  }

  /**
   * Campos que precisam obrigatoriamente ser informados na insercao.
   * @returns {string[]}
   */
  static get camposObrigatorios() {
    return [];
  }

  /**
   * Campos que podem ser alterados em uma atualizacao.
   * @returns {string[]}
   */
  static get camposAtualizaveis() {
    return [];
  }

  /**
   * Indices criados na colecao. Formato aceito por createIndexes().
   * @returns {Array<{key: object, name: string, unique?: boolean}>}
   */
  static get indices() {
    return [];
  }

  // ---------------------------------------------------------------------------
  // Construcao e conversao
  // ---------------------------------------------------------------------------

  /**
   * @param {object} [dados] Dados da entidade ou documento vindo do MongoDB.
   */
  constructor(dados = {}) {
    if (new.target === Modelo) {
      throw new Error('Modelo e uma classe abstrata e nao pode ser instanciada diretamente');
    }

    this._id = dados._id ?? null;
    this.criadoEm = dados.criadoEm ?? null;
    this.atualizadoEm = dados.atualizadoEm ?? null;
  }

  /**
   * Identificador do documento em formato texto.
   * @returns {string|null}
   */
  get id() {
    return this._id ? String(this._id) : null;
  }

  /**
   * Indica se a entidade ja foi gravada no MongoDB.
   * @returns {boolean}
   */
  get persistido() {
    return this._id !== null;
  }

  /**
   * Converte a entidade no documento que sera gravado no MongoDB.
   * Deve ser sobrescrito por cada subclasse.
   *
   * @returns {object}
   * @throws {Error} Quando a subclasse nao sobrescreve o metodo.
   */
  paraDocumento() {
    throw new Error(`A classe ${this.constructor.name} deve sobrescrever o metodo "paraDocumento"`);
  }

  /**
   * Dados considerados na validacao. Por padrao sao os mesmos do documento;
   * entidades que transformam valores antes de gravar (como Usuario, que
   * converte a senha em hash) podem sobrescrever este metodo.
   *
   * @returns {object}
   */
  paraValidacao() {
    return this.paraDocumento();
  }

  /**
   * Representacao da entidade para exibicao (esconde dados sensiveis).
   * @returns {object}
   */
  paraJSON() {
    return { _id: this.id, ...this.paraDocumento(), criadoEm: this.criadoEm, atualizadoEm: this.atualizadoEm };
  }

  /**
   * Copia para esta instancia os dados de outra instancia da mesma entidade.
   * E sobrescrito pelas subclasses que possuem atributos privados, garantindo
   * que eles tambem sejam atualizados.
   *
   * @param {Modelo} outra Instancia com os dados mais recentes.
   * @returns {this}
   */
  copiarDe(outra) {
    Object.assign(this, outra);
    return this;
  }

  /**
   * Cria uma instancia da entidade a partir de um documento do MongoDB.
   *
   * @param {object|null} documento Documento retornado pelo driver.
   * @returns {Modelo|null} Instancia da subclasse ou null.
   */
  static instanciar(documento) {
    return documento ? new this(documento) : null;
  }

  /**
   * Converte uma lista de documentos em instancias da entidade.
   *
   * @param {object[]} documentos Documentos retornados pelo driver.
   * @returns {Modelo[]}
   */
  static instanciarLista(documentos = []) {
    return documentos.map((documento) => this.instanciar(documento));
  }

  // ---------------------------------------------------------------------------
  // Validacao
  // ---------------------------------------------------------------------------

  /**
   * Validacao especifica de cada entidade. As subclasses sobrescrevem este
   * metodo para verificar formatos e dominios de valores. Recebe apenas os
   * campos presentes, o que permite reaproveita-lo em atualizacoes parciais.
   *
   * @param {object} _dados Campos a validar.
   * @param {string} _operacao Operacao em execucao.
   * @returns {void}
   */
  static validarCampos(_dados, _operacao) {
    /* implementado pelas subclasses */
  }

  /**
   * Valida a entidade completa: primeiro os campos obrigatorios, depois as
   * regras especificas da subclasse.
   *
   * @param {string} [operacao] Operacao em execucao.
   * @returns {this} A propria entidade, permitindo encadeamento.
   * @throws {ErroValidacao} Quando algum dado estiver ausente ou invalido.
   */
  validar(operacao = `${this.constructor.entidade}.validar`) {
    const dados = this.paraValidacao();
    const Classe = this.constructor;

    Validador.exigirCampos(dados, Classe.camposObrigatorios, Classe.entidade, operacao);
    Classe.validarCampos(dados, operacao);

    return this;
  }

  /**
   * Monta e valida o objeto de atualizacao, mantendo somente os campos
   * declarados em "camposAtualizaveis".
   *
   * @param {object} dados Campos informados pelo usuario.
   * @param {string} operacao Operacao em execucao.
   * @returns {object} Documento pronto para o operador $set.
   * @throws {ErroValidacao} Quando nenhum campo valido for informado ou
   *                         quando algum valor for invalido.
   */
  static prepararAtualizacao(dados, operacao) {
    const permitidos = this.camposAtualizaveis;

    const entradas = Object.entries(dados || {}).filter(
      ([campo, valor]) => permitidos.includes(campo) && valor !== undefined
    );

    if (entradas.length === 0) {
      throw new ErroValidacao(
        `Nenhum campo valido informado para atualizar ${this.entidade}`,
        [`Informe ao menos um dos campos: ${permitidos.join(', ')}`],
        { operacao, detalhes: { camposAceitos: permitidos, camposRecebidos: Object.keys(dados || {}) } }
      );
    }

    const alteracoes = Object.fromEntries(entradas);

    // Campos obrigatorios nao podem ser apagados em uma atualizacao.
    const esvaziados = Object.keys(alteracoes).filter(
      (campo) => this.camposObrigatorios.includes(campo) && !Validador.informado(alteracoes[campo])
    );

    if (esvaziados.length > 0) {
      throw ErroValidacao.camposObrigatorios(esvaziados, this.entidade, operacao);
    }

    this.validarCampos(alteracoes, operacao);

    return this.transformarAtualizacao(alteracoes);
  }

  /**
   * Permite converter valores antes da gravacao (ex.: senha em hash).
   *
   * @param {object} alteracoes Campos validados.
   * @returns {object} Campos prontos para gravacao.
   */
  static transformarAtualizacao(alteracoes) {
    return alteracoes;
  }

  // ---------------------------------------------------------------------------
  // Acesso ao MongoDB
  // ---------------------------------------------------------------------------

  /**
   * Executa uma validacao garantindo que a falha seja registrada no arquivo de
   * log antes de ser propagada. Usado pelas operacoes de escrita, para que todo
   * ErroValidacao apareca em "logs/errors.log".
   *
   * @param {() => *} acao Funcao que executa a validacao.
   * @returns {*} Retorno da funcao informada.
   * @throws {ErroAplicacao} O mesmo erro recebido, apos o registro em log.
   */
  static validarComLog(acao) {
    try {
      return acao();
    } catch (erro) {
      if (erro instanceof ErroAplicacao) logger.erro(erro);
      throw erro;
    }
  }

  /**
   * Retorna a colecao do MongoDB correspondente a entidade.
   * @returns {import('mongodb').Collection}
   * @throws {ErroConexao} Quando o banco nao esta conectado.
   */
  static obterColecao() {
    return Database.obterInstancia().obterColecao(this.colecao);
  }

  /**
   * Executa uma operacao no MongoDB convertendo qualquer falha do driver em
   * ErroBanco e registrando a ocorrencia no arquivo de log.
   *
   * @param {string} operacao Nome da operacao (ex.: "Usuario.inserir").
   * @param {(colecao: import('mongodb').Collection) => Promise<*>} acao Acao a executar.
   * @param {object} [detalhes] Dados adicionais para o log.
   * @returns {Promise<*>} Resultado da acao.
   * @throws {ErroAplicacao} Erro tratado e ja registrado em log.
   */
  static async executar(operacao, acao, detalhes = null) {
    try {
      return await acao(this.obterColecao());
    } catch (erro) {
      // Erros previstos (validacao, conexao, regra de negocio) ja foram
      // registrados na origem: apenas sao repassados.
      if (erro instanceof ErroAplicacao) throw erro;

      const erroBanco = ErroBanco.deErroDriver(erro, operacao, { entidade: this.entidade, ...(detalhes || {}) });
      logger.erro(erroBanco);
      throw erroBanco;
    }
  }

  /**
   * Converte um identificador em ObjectId, validando o formato.
   *
   * @param {string|ObjectId} id Identificador informado.
   * @param {string} operacao Operacao em execucao.
   * @param {string} [campo] Nome do campo.
   * @returns {ObjectId}
   * @throws {ErroValidacao} Quando o identificador e invalido.
   */
  static converterId(id, operacao, campo = '_id') {
    return Validador.converterObjectId(id, campo, operacao);
  }

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------

  /**
   * Grava a entidade no MongoDB. Valida os dados antes da insercao e preenche
   * o _id gerado pelo banco.
   *
   * @returns {Promise<this>}
   * @throws {ErroValidacao|ErroBanco|ErroConexao}
   */
  async salvar() {
    const Classe = this.constructor;
    const operacao = `${Classe.entidade}.salvar`;

    Classe.validarComLog(() => this.validar(operacao));

    const agora = new Date();
    const documento = { ...this.paraDocumento(), criadoEm: this.criadoEm ?? agora, atualizadoEm: agora };

    const resultado = await Classe.executar(operacao, (colecao) => colecao.insertOne(documento));

    this._id = resultado.insertedId;
    this.criadoEm = documento.criadoEm;
    this.atualizadoEm = documento.atualizadoEm;

    logger.info(`${Classe.entidade} inserido(a) com sucesso (_id: ${this.id})`, { operacao });

    return this;
  }

  /**
   * Cria e grava uma entidade em uma unica chamada.
   *
   * @param {object} dados Dados da entidade.
   * @returns {Promise<Modelo>} Entidade persistida.
   * @throws {ErroValidacao|ErroBanco|ErroConexao}
   */
  static async inserir(dados) {
    return new this(dados).salvar();
  }

  /**
   * Insere varios documentos de uma vez, validando cada um deles antes.
   *
   * @param {object[]} listaDeDados Lista com os dados de cada entidade.
   * @returns {Promise<Modelo[]>} Entidades persistidas.
   * @throws {ErroValidacao|ErroBanco|ErroConexao}
   */
  static async inserirMuitos(listaDeDados = []) {
    const operacao = `${this.entidade}.inserirMuitos`;

    if (!Array.isArray(listaDeDados) || listaDeDados.length === 0) {
      const erro = new ErroValidacao(
        `Nenhum dado informado para inserir em ${this.entidade}`,
        ['A lista de dados nao pode estar vazia'],
        { operacao }
      );

      logger.erro(erro);
      throw erro;
    }

    const entidades = this.validarComLog(() => listaDeDados.map((dados) => new this(dados).validar(operacao)));

    const agora = new Date();

    const documentos = entidades.map((entidade) => ({
      ...entidade.paraDocumento(),
      criadoEm: agora,
      atualizadoEm: agora
    }));

    const resultado = await this.executar(operacao, (colecao) => colecao.insertMany(documentos));

    entidades.forEach((entidade, indice) => {
      entidade._id = resultado.insertedIds[indice];
      entidade.criadoEm = agora;
      entidade.atualizadoEm = agora;
    });

    logger.info(`${resultado.insertedCount} documento(s) inserido(s) em ${this.colecao}`, { operacao });

    return entidades;
  }

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  /**
   * Busca um documento pelo _id.
   *
   * @param {string|ObjectId} id Identificador do documento.
   * @returns {Promise<Modelo|null>} Entidade encontrada ou null.
   * @throws {ErroValidacao|ErroBanco|ErroConexao}
   */
  static async buscarPorId(id) {
    const operacao = `${this.entidade}.buscarPorId`;
    const identificador = this.validarComLog(() => this.converterId(id, operacao));

    const documento = await this.executar(
      operacao,
      (colecao) => colecao.findOne({ _id: identificador }),
      { id: String(id) }
    );

    return this.instanciar(documento);
  }

  /**
   * Busca um documento pelo _id exigindo que ele exista.
   *
   * @param {string|ObjectId} id Identificador do documento.
   * @returns {Promise<Modelo>} Entidade encontrada.
   * @throws {ErroNaoEncontrado} Quando o documento nao existe.
   */
  static async obterPorId(id) {
    const operacao = `${this.entidade}.obterPorId`;
    const entidade = await this.buscarPorId(id);

    if (!entidade) {
      const erro = new ErroNaoEncontrado(this.entidade, id, { operacao });
      logger.erro(erro);
      throw erro;
    }

    return entidade;
  }

  /**
   * Busca o primeiro documento que atende ao filtro.
   *
   * @param {object} [filtro] Filtro do MongoDB.
   * @param {object} [opcoes] Opcoes do findOne (ex.: sort, projection).
   * @returns {Promise<Modelo|null>}
   */
  static async buscarUm(filtro = {}, opcoes = {}) {
    const operacao = `${this.entidade}.buscarUm`;

    const documento = await this.executar(
      operacao,
      (colecao) => colecao.findOne(filtro, opcoes),
      { filtro: Object.keys(filtro) }
    );

    return this.instanciar(documento);
  }

  /**
   * Lista documentos da colecao.
   *
   * @param {object} [filtro] Filtro do MongoDB.
   * @param {object} [opcoes]
   * @param {object} [opcoes.ordenar] Criterio de ordenacao (sort).
   * @param {number} [opcoes.limite] Quantidade maxima de documentos.
   * @param {number} [opcoes.pular] Quantidade de documentos ignorados (paginacao).
   * @param {object} [opcoes.projecao] Campos retornados (projection).
   * @returns {Promise<Modelo[]>}
   */
  static async listar(filtro = {}, { ordenar = { criadoEm: -1 }, limite = 0, pular = 0, projecao = null } = {}) {
    const operacao = `${this.entidade}.listar`;

    const documentos = await this.executar(operacao, (colecao) => {
      let cursor = colecao.find(filtro);

      if (projecao) cursor = cursor.project(projecao);
      if (ordenar) cursor = cursor.sort(ordenar);
      if (pular > 0) cursor = cursor.skip(pular);
      if (limite > 0) cursor = cursor.limit(limite);

      return cursor.toArray();
    });

    return this.instanciarLista(documentos);
  }

  /**
   * Conta os documentos que atendem ao filtro.
   *
   * @param {object} [filtro] Filtro do MongoDB.
   * @returns {Promise<number>}
   */
  static async contar(filtro = {}) {
    return this.executar(`${this.entidade}.contar`, (colecao) => colecao.countDocuments(filtro));
  }

  /**
   * Verifica se existe documento com o _id informado.
   *
   * @param {string|ObjectId} id Identificador do documento.
   * @returns {Promise<boolean>}
   */
  static async existePorId(id) {
    const operacao = `${this.entidade}.existePorId`;
    const identificador = this.validarComLog(() => this.converterId(id, operacao));
    const total = await this.executar(operacao, (colecao) => colecao.countDocuments({ _id: identificador }, { limit: 1 }));

    return total > 0;
  }

  /**
   * Executa um pipeline de agregacao na colecao da entidade.
   *
   * @param {object[]} pipeline Etapas da agregacao.
   * @param {string} [operacao] Nome da operacao para o log.
   * @returns {Promise<object[]>} Documentos resultantes.
   */
  static async agregar(pipeline, operacao = `${this.entidade}.agregar`) {
    return this.executar(operacao, (colecao) => colecao.aggregate(pipeline).toArray(), {
      etapas: pipeline.length
    });
  }

  /**
   * Recarrega os dados da entidade a partir do MongoDB.
   *
   * @returns {Promise<this>}
   * @throws {ErroNaoEncontrado} Quando o documento nao existe mais.
   */
  async recarregar() {
    const atualizada = await this.constructor.obterPorId(this._id);

    return this.copiarDe(atualizada);
  }

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------

  /**
   * Atualiza um documento pelo _id.
   *
   * @param {string|ObjectId} id Identificador do documento.
   * @param {object} dados Campos a alterar (somente "camposAtualizaveis").
   * @returns {Promise<Modelo>} Entidade com os dados atualizados.
   * @throws {ErroValidacao|ErroNaoEncontrado|ErroBanco|ErroConexao}
   */
  static async atualizarPorId(id, dados) {
    const operacao = `${this.entidade}.atualizarPorId`;

    const { identificador, alteracoes } = this.validarComLog(() => ({
      identificador: this.converterId(id, operacao),
      alteracoes: this.prepararAtualizacao(dados, operacao)
    }));

    const documento = await this.executar(
      operacao,
      (colecao) =>
        colecao.findOneAndUpdate(
          { _id: identificador },
          { $set: { ...alteracoes, atualizadoEm: new Date() } },
          { returnDocument: 'after' }
        ),
      { id: String(id), campos: Object.keys(alteracoes) }
    );

    if (!documento) {
      const erro = new ErroNaoEncontrado(this.entidade, id, {
        operacao,
        detalhes: { motivo: 'Nao e possivel atualizar um registro inexistente' }
      });

      logger.erro(erro);
      throw erro;
    }

    logger.info(`${this.entidade} atualizado(a) (_id: ${id}) | campos: ${Object.keys(alteracoes).join(', ')}`, {
      operacao
    });

    return this.instanciar(documento);
  }

  /**
   * Aplica um operador de atualizacao do MongoDB ($set, $push, $inc...) em um
   * documento, exigindo que ele exista.
   *
   * @param {string|ObjectId} id Identificador do documento.
   * @param {object} operadores Objeto de atualizacao do MongoDB.
   * @param {string} [operacao] Nome da operacao para o log.
   * @returns {Promise<Modelo>} Entidade atualizada.
   * @throws {ErroNaoEncontrado} Quando o documento nao existe.
   */
  static async aplicarOperadores(id, operadores, operacao = `${this.entidade}.aplicarOperadores`) {
    const identificador = this.validarComLog(() => this.converterId(id, operacao));

    const atualizacao = { ...operadores };
    atualizacao.$set = { ...(atualizacao.$set || {}), atualizadoEm: new Date() };

    const documento = await this.executar(
      operacao,
      (colecao) => colecao.findOneAndUpdate({ _id: identificador }, atualizacao, { returnDocument: 'after' }),
      { id: String(id), operadores: Object.keys(operadores) }
    );

    if (!documento) {
      const erro = new ErroNaoEncontrado(this.entidade, id, { operacao });
      logger.erro(erro);
      throw erro;
    }

    return this.instanciar(documento);
  }

  /**
   * Atualiza a propria entidade (metodo de instancia).
   *
   * @param {object} dados Campos a alterar.
   * @returns {Promise<this>}
   * @throws {ErroValidacao|ErroNaoEncontrado}
   */
  async atualizar(dados) {
    const atualizada = await this.constructor.atualizarPorId(this._id, dados);

    return this.copiarDe(atualizada);
  }

  /**
   * Atualiza todos os documentos que atendem ao filtro.
   *
   * @param {object} filtro Filtro do MongoDB.
   * @param {object} operadores Objeto de atualizacao do MongoDB.
   * @param {string} [operacao] Nome da operacao para o log.
   * @returns {Promise<number>} Quantidade de documentos alterados.
   */
  static async atualizarMuitos(filtro, operadores, operacao = `${this.entidade}.atualizarMuitos`) {
    const resultado = await this.executar(operacao, (colecao) => colecao.updateMany(filtro, operadores));
    return resultado.modifiedCount;
  }

  // ---------------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------------

  /**
   * Exclui um documento pelo _id.
   *
   * @param {string|ObjectId} id Identificador do documento.
   * @returns {Promise<boolean>} true quando a exclusao ocorreu.
   * @throws {ErroNaoEncontrado} Quando o documento nao existe.
   */
  static async excluirPorId(id) {
    const operacao = `${this.entidade}.excluirPorId`;
    const identificador = this.validarComLog(() => this.converterId(id, operacao));

    const resultado = await this.executar(
      operacao,
      (colecao) => colecao.deleteOne({ _id: identificador }),
      { id: String(id) }
    );

    if (resultado.deletedCount === 0) {
      const erro = new ErroNaoEncontrado(this.entidade, id, {
        operacao,
        detalhes: { motivo: 'Nao e possivel excluir um registro inexistente' }
      });

      logger.erro(erro);
      throw erro;
    }

    logger.info(`${this.entidade} excluido(a) (_id: ${id})`, { operacao });

    return true;
  }

  /**
   * Exclui todos os documentos que atendem ao filtro.
   *
   * @param {object} filtro Filtro do MongoDB.
   * @param {string} [operacao] Nome da operacao para o log.
   * @returns {Promise<number>} Quantidade de documentos excluidos.
   */
  static async excluirMuitos(filtro, operacao = `${this.entidade}.excluirMuitos`) {
    const resultado = await this.executar(operacao, (colecao) => colecao.deleteMany(filtro));

    if (resultado.deletedCount > 0) {
      logger.info(`${resultado.deletedCount} documento(s) excluido(s) de ${this.colecao}`, { operacao });
    }

    return resultado.deletedCount;
  }

  /**
   * Exclui a propria entidade (metodo de instancia).
   *
   * @returns {Promise<boolean>}
   * @throws {ErroNaoEncontrado}
   */
  async excluir() {
    const excluido = await this.constructor.excluirPorId(this._id);
    this._id = null;

    return excluido;
  }

  // ---------------------------------------------------------------------------
  // Indices
  // ---------------------------------------------------------------------------

  /**
   * Cria na colecao os indices declarados pela entidade.
   *
   * @returns {Promise<string[]>} Nomes dos indices criados.
   */
  static async criarIndices() {
    const operacao = `${this.entidade}.criarIndices`;

    if (this.indices.length === 0) return [];

    const criados = await this.executar(operacao, (colecao) => colecao.createIndexes(this.indices));
    logger.info(`Indices criados em ${this.colecao}: ${this.indices.map((i) => i.name).join(', ')}`, { operacao });

    return criados;
  }
}

module.exports = Modelo;

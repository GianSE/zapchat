'use strict';

/**
 * Entidade Usuario - colecao "usuarios".
 *
 * Representa uma pessoa cadastrada no ZapChat. A senha nunca e armazenada em
 * texto puro: o atributo e privado (#senhaHash) e so pode ser lido por meio do
 * getter, exemplificando o encapsulamento em JavaScript.
 *
 * Campos obrigatorios: nome, email, senha.
 */

const Modelo = require('./Modelo');
const Validador = require('../utils/Validador');
const Seguranca = require('../utils/Seguranca');
const logger = require('../utils/Logger');
const { ErroValidacao, ErroRegraNegocio } = require('../errors');

/** Situacoes de presenca aceitas para o usuario. */
const STATUS_VALIDOS = Object.freeze(['online', 'ausente', 'ocupado', 'offline']);

class Usuario extends Modelo {
  /** @type {string|null} Hash da senha (atributo privado). */
  #senhaHash = null;

  /** @type {string|null} Senha em texto puro, usada somente na validacao. */
  #senhaInformada = null;

  static get colecao() {
    return 'usuarios';
  }

  static get camposObrigatorios() {
    return ['nome', 'email', 'senha'];
  }

  static get camposAtualizaveis() {
    return ['nome', 'apelido', 'telefone', 'avatar', 'recado', 'status', 'senha'];
  }

  static get indices() {
    return [
      { key: { email: 1 }, name: 'idx_email_unico', unique: true },
      { key: { apelido: 1 }, name: 'idx_apelido_unico', unique: true, sparse: true },
      { key: { nome: 1 }, name: 'idx_nome' },
      { key: { status: 1, ultimoAcesso: -1 }, name: 'idx_status_ultimo_acesso' }
    ];
  }

  /** Lista de status de presenca aceitos. @returns {string[]} */
  static get statusValidos() {
    return [...STATUS_VALIDOS];
  }

  /**
   * @param {object} dados
   * @param {string} dados.nome Nome completo (obrigatorio).
   * @param {string} dados.email E-mail unico (obrigatorio).
   * @param {string} [dados.senha] Senha em texto puro (obrigatoria no cadastro).
   * @param {string} [dados.senhaHash] Hash ja calculado (usado ao ler do banco).
   * @param {string} [dados.apelido] Apelido unico exibido nas conversas.
   * @param {string} [dados.telefone] Telefone no formato (99) 99999-9999.
   * @param {string} [dados.avatar] Emoji ou URL da foto de perfil.
   * @param {string} [dados.recado] Recado exibido no perfil.
   * @param {string} [dados.status] Presenca: online, ausente, ocupado ou offline.
   * @param {Date}   [dados.ultimoAcesso] Data do ultimo acesso.
   */
  constructor(dados = {}) {
    super(dados);

    this.nome = dados.nome?.trim() ?? null;
    this.email = dados.email?.trim().toLowerCase() ?? null;
    this.apelido = dados.apelido?.trim() ?? null;
    this.telefone = dados.telefone?.trim() ?? null;
    this.avatar = dados.avatar ?? '👤';
    this.recado = dados.recado ?? 'Disponivel';
    this.status = dados.status ?? 'offline';
    this.ultimoAcesso = dados.ultimoAcesso ?? null;

    // A senha pode chegar em texto puro (cadastro) ou como hash (leitura do banco).
    if (dados.senha !== undefined && dados.senha !== null) {
      this.#senhaInformada = String(dados.senha);
      this.#senhaHash = Seguranca.gerarHashSenha(String(dados.senha));
    } else if (dados.senhaHash) {
      this.#senhaHash = dados.senhaHash;
    }
  }

  /**
   * Hash da senha armazenado no banco.
   * @returns {string|null}
   */
  get senhaHash() {
    return this.#senhaHash;
  }

  /**
   * Nome exibido nas conversas: usa o apelido quando existir.
   * @returns {string}
   */
  get nomeExibicao() {
    return this.apelido || this.nome || 'Usuario sem nome';
  }

  /**
   * Indica se o usuario esta disponivel para receber mensagens.
   * @returns {boolean}
   */
  get disponivel() {
    return this.status === 'online' || this.status === 'ausente';
  }

  paraDocumento() {
    return {
      nome: this.nome,
      email: this.email,
      senhaHash: this.#senhaHash,
      apelido: this.apelido,
      telefone: this.telefone,
      avatar: this.avatar,
      recado: this.recado,
      status: this.status,
      ultimoAcesso: this.ultimoAcesso
    };
  }

  /** Inclui a senha em texto puro para que ela possa ser validada. */
  paraValidacao() {
    return { ...this.paraDocumento(), senha: this.#senhaInformada };
  }

  /** Remove o hash da senha da representacao exibida ao usuario. */
  paraJSON() {
    const { senhaHash, ...dados } = super.paraJSON();
    return { ...dados, nomeExibicao: this.nomeExibicao };
  }

  /** Copia tambem o atributo privado com o hash da senha. */
  copiarDe(outra) {
    super.copiarDe(outra);
    this.#senhaHash = outra.senhaHash;

    return this;
  }

  /**
   * Regras de validacao da entidade Usuario.
   *
   * @param {object} dados Campos presentes.
   * @param {string} operacao Operacao em execucao.
   * @returns {void}
   * @throws {ErroValidacao}
   */
  static validarCampos(dados, operacao) {
    const erros = [];

    Validador.texto(erros, dados.nome, 'nome', { min: 3, max: 80 });
    Validador.email(erros, dados.email, 'email');
    Validador.senha(erros, dados.senha, 'senha');
    Validador.texto(erros, dados.apelido, 'apelido', { min: 2, max: 30 });
    Validador.telefone(erros, dados.telefone, 'telefone');
    Validador.texto(erros, dados.recado, 'recado', { min: 1, max: 140 });
    Validador.enumerado(erros, dados.status, STATUS_VALIDOS, 'status');

    Validador.lancarSeHouverErros(erros, Usuario.entidade, operacao);
  }

  /** Converte a senha informada na atualizacao em hash antes de gravar. */
  static transformarAtualizacao(alteracoes) {
    if (alteracoes.senha === undefined) return alteracoes;

    const { senha, ...demais } = alteracoes;

    return { ...demais, senhaHash: Seguranca.gerarHashSenha(String(senha)) };
  }

  // ---------------------------------------------------------------------------
  // Consultas especificas da entidade
  // ---------------------------------------------------------------------------

  /**
   * Busca um usuario pelo e-mail.
   *
   * @param {string} email E-mail procurado.
   * @returns {Promise<Usuario|null>}
   */
  static async buscarPorEmail(email) {
    const operacao = 'Usuario.buscarPorEmail';

    if (!Validador.informado(email)) {
      throw ErroValidacao.camposObrigatorios(['email'], Usuario.entidade, operacao);
    }

    return this.buscarUm({ email: String(email).trim().toLowerCase() });
  }

  /**
   * Busca usuarios por parte do nome, apelido ou e-mail.
   *
   * @param {string} termo Texto pesquisado.
   * @param {number} [limite] Quantidade maxima de resultados.
   * @returns {Promise<Usuario[]>}
   */
  static async pesquisar(termo, limite = 20) {
    const operacao = 'Usuario.pesquisar';

    if (!Validador.informado(termo)) {
      throw ErroValidacao.camposObrigatorios(['termo'], Usuario.entidade, operacao);
    }

    // Escapa os caracteres especiais para que o termo seja tratado como texto.
    const texto = String(termo).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expressao = new RegExp(texto, 'i');

    return this.listar(
      { $or: [{ nome: expressao }, { apelido: expressao }, { email: expressao }] },
      { ordenar: { nome: 1 }, limite }
    );
  }

  /**
   * Lista os usuarios que estao online ou ausentes.
   * @returns {Promise<Usuario[]>}
   */
  static async listarDisponiveis() {
    return this.listar({ status: { $in: ['online', 'ausente'] } }, { ordenar: { status: 1, nome: 1 } });
  }

  /**
   * Autentica um usuario pelo e-mail e senha.
   *
   * @param {string} email E-mail informado.
   * @param {string} senha Senha em texto puro.
   * @returns {Promise<Usuario>} Usuario autenticado, com status "online".
   * @throws {ErroValidacao} Quando e-mail ou senha nao foram informados.
   * @throws {ErroRegraNegocio} Quando as credenciais estao incorretas.
   */
  static async autenticar(email, senha) {
    const operacao = 'Usuario.autenticar';

    Validador.exigirCampos({ email, senha }, ['email', 'senha'], Usuario.entidade, operacao);

    const usuario = await this.buscarPorEmail(email);

    // A mesma mensagem e usada para e-mail inexistente e senha incorreta,
    // evitando revelar quais e-mails estao cadastrados.
    if (!usuario || !Seguranca.verificarSenha(senha, usuario.senhaHash)) {
      const erro = new ErroRegraNegocio('E-mail ou senha incorretos', {
        operacao,
        detalhes: { email: String(email).trim().toLowerCase() }
      });

      logger.erro(erro);
      throw erro;
    }

    return this.registrarAcesso(usuario.id);
  }

  /**
   * Marca o usuario como online e registra a data do acesso.
   *
   * @param {string} id Identificador do usuario.
   * @returns {Promise<Usuario>}
   */
  static async registrarAcesso(id) {
    return this.aplicarOperadores(
      id,
      { $set: { status: 'online', ultimoAcesso: new Date() } },
      'Usuario.registrarAcesso'
    );
  }

  /**
   * Altera a situacao de presenca do usuario.
   *
   * @param {string} id Identificador do usuario.
   * @param {string} status Novo status (online, ausente, ocupado, offline).
   * @returns {Promise<Usuario>}
   * @throws {ErroValidacao} Quando o status nao e permitido.
   */
  static async alterarStatus(id, status) {
    const operacao = 'Usuario.alterarStatus';
    const erros = [];

    Validador.exigirCampos({ status }, ['status'], Usuario.entidade, operacao);
    Validador.enumerado(erros, status, STATUS_VALIDOS, 'status');
    Validador.lancarSeHouverErros(erros, Usuario.entidade, operacao);

    return this.aplicarOperadores(id, { $set: { status } }, operacao);
  }

  /**
   * Altera a senha do usuario, conferindo a senha atual.
   *
   * @param {string} id Identificador do usuario.
   * @param {string} senhaAtual Senha atual, para confirmacao.
   * @param {string} novaSenha Nova senha desejada.
   * @returns {Promise<Usuario>}
   * @throws {ErroValidacao} Quando a nova senha e invalida.
   * @throws {ErroRegraNegocio} Quando a senha atual nao confere.
   */
  static async alterarSenha(id, senhaAtual, novaSenha) {
    const operacao = 'Usuario.alterarSenha';

    Validador.exigirCampos(
      { senhaAtual, novaSenha },
      ['senhaAtual', 'novaSenha'],
      Usuario.entidade,
      operacao
    );

    const usuario = await this.obterPorId(id);

    if (!Seguranca.verificarSenha(senhaAtual, usuario.senhaHash)) {
      const erro = new ErroRegraNegocio('A senha atual informada esta incorreta', {
        operacao,
        detalhes: { usuarioId: usuario.id }
      });

      logger.erro(erro);
      throw erro;
    }

    if (Seguranca.verificarSenha(novaSenha, usuario.senhaHash)) {
      const erro = new ErroRegraNegocio('A nova senha deve ser diferente da senha atual', {
        operacao,
        detalhes: { usuarioId: usuario.id }
      });

      logger.erro(erro);
      throw erro;
    }

    return this.atualizarPorId(id, { senha: novaSenha });
  }

  /**
   * Resumo do usuario para exibicao no terminal.
   * @returns {string}
   */
  paraTexto() {
    return `${this.avatar} ${this.nomeExibicao} <${this.email}> [${this.status}]`;
  }
}

module.exports = Usuario;
module.exports.STATUS_VALIDOS = STATUS_VALIDOS;

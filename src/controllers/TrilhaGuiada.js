'use strict';

/**
 * Camada CONTROLLER (MVC) - trilha guiada de demonstracao.
 *
 * Percorre automaticamente tudo o que a aplicacao faz, em blocos curtos e com
 * pausas, para que seja possivel conferir o projeto inteiro em poucos minutos
 * sem precisar navegar pelo menu opcao por opcao.
 *
 * A trilha cria os proprios dados (usuarios, conversa, grupo, mensagens e
 * reacoes), demonstra as operacoes sobre eles e, no final, remove tudo o que
 * criou - o banco fica exatamente como estava antes.
 */

const { Usuario, Contato, Conversa, Mensagem, Reacao } = require('../models');
const ChatService = require('../services/ChatService');
const Manutencao = require('../database/Manutencao');
const Terminal = require('../views/Terminal');
const logger = require('../utils/Logger');
const { ErroAplicacao } = require('../errors');

/** E-mails usados pelos usuarios temporarios da trilha. */
const EMAIL_ANA = 'trilha.ana@zapchat.dev';
const EMAIL_BRUNO = 'trilha.bruno@zapchat.dev';

class TrilhaGuiada {
  /** @type {() => Promise<*>} Funcao que aguarda o ENTER entre os blocos. */
  #pausar;

  /** @type {{usuarios: string[], conversas: string[]}} Criados, para a limpeza final. */
  #criados = { usuarios: [], conversas: [] };

  /** @type {number} Quantidade de excecoes demonstradas. */
  #errosDemonstrados = 0;

  /**
   * @param {object} opcoes
   * @param {() => Promise<*>} opcoes.pausar Aguarda a confirmacao do usuario.
   */
  constructor({ pausar }) {
    this.#pausar = pausar;
  }

  /**
   * Executa a trilha completa.
   *
   * @returns {Promise<void>}
   */
  async executar() {
    Terminal.titulo('trilha guiada - demonstracao completa');
    Terminal.info('Esta trilha percorre as 5 colecoes e as 4 operacoes do CRUD, mostra a validacao');
    Terminal.info('dos campos, o tratamento das excecoes e o registro em log.');
    Terminal.info('');
    Terminal.info('Os dados criados aqui sao temporarios: ao final, tudo e removido e o banco volta');
    Terminal.info('ao estado anterior. Pressione ENTER para avancar entre os blocos.');

    await this.#pausar();

    try {
      const contexto = await this.#blocoCriar();

      await this.#blocoConsultar(contexto);
      await this.#blocoAtualizar(contexto);
      await this.#blocoExcluir(contexto);
      await this.#blocoValidacaoEErros(contexto);
      await this.#blocoLogs();
    } finally {
      await this.#limpar();
    }

    this.#resumoFinal();
  }

  // ---------------------------------------------------------------------------
  // 1. Create
  // ---------------------------------------------------------------------------

  /**
   * Cria os dados temporarios usados pela trilha.
   *
   * @returns {Promise<object>} Identificadores criados.
   */
  async #blocoCriar() {
    Terminal.titulo('1 de 6 - create (insercao nas 5 colecoes)');

    // Remove sobras de uma execucao anterior interrompida.
    await this.#removerUsuarioSeExistir(EMAIL_ANA);
    await this.#removerUsuarioSeExistir(EMAIL_BRUNO);

    const ana = await ChatService.cadastrarUsuario({
      nome: 'Ana da Trilha',
      email: EMAIL_ANA,
      senha: 'trilha123',
      apelido: 'trilha-ana',
      avatar: '👩‍💻',
      telefone: '(11) 90000-0001'
    });

    const bruno = await ChatService.cadastrarUsuario({
      nome: 'Bruno da Trilha',
      email: EMAIL_BRUNO,
      senha: 'trilha123',
      apelido: 'trilha-bruno',
      avatar: '🧑‍🎓'
    });

    this.#criados.usuarios.push(ana.id, bruno.id);

    Terminal.secao('usuarios (colecao "usuarios")');
    Terminal.item(ana.paraTexto());
    Terminal.item(bruno.paraTexto());
    Terminal.item(`a senha e gravada como hash: ${ana.senhaHash.slice(0, 28)}...`);

    const contato = await ChatService.adicionarContato(ana.id, bruno.id, {
      apelido: 'Bruno do trabalho',
      favorito: true
    });

    Terminal.secao('contato (colecao "contatos")');
    Terminal.item(`Ana adicionou Bruno a agenda | favorito: ${contato.favorito}`);

    const privada = await ChatService.abrirConversaPrivada(ana.id, bruno.id);
    const { conversa: grupo } = await ChatService.criarGrupo({
      nome: 'Grupo da trilha',
      descricao: 'Grupo criado para a demonstracao',
      icone: '🧪',
      criadoPor: ana.id,
      participantes: [bruno.id]
    });

    this.#criados.conversas.push(privada.id, grupo.id);

    Terminal.secao('conversas (colecao "conversas")');
    Terminal.item(privada.paraTexto());
    Terminal.item(grupo.paraTexto());

    const { mensagem: pergunta } = await ChatService.enviarMensagem({
      conversaId: privada.id,
      autorId: ana.id,
      conteudo: 'Bruno, voce terminou a parte do MongoDB?'
    });

    const { mensagem: resposta } = await ChatService.enviarMensagem({
      conversaId: privada.id,
      autorId: bruno.id,
      conteudo: 'Terminei! Faltam so os indices.',
      respostaA: pergunta.id
    });

    const { mensagem: comAnexo } = await ChatService.enviarMensagem({
      conversaId: privada.id,
      autorId: bruno.id,
      conteudo: 'Segue o diagrama',
      tipo: 'imagem',
      anexo: { nome: 'diagrama.png', url: 'https://cdn.zapchat.dev/diagrama.png', tamanhoKb: 320 }
    });

    Terminal.secao('mensagens (colecao "mensagens")');
    Terminal.item(pergunta.paraTexto('Ana'));
    Terminal.item(`${resposta.paraTexto('Bruno')}  <- respondendo a mensagem anterior`);
    Terminal.item(comAnexo.paraTexto('Bruno'));

    const { acao } = await ChatService.reagir(resposta.id, ana.id, '👍');

    Terminal.secao('reacao (colecao "reacoes")');
    Terminal.item(`Ana reagiu 👍 na resposta de Bruno -> ${acao}`);

    Terminal.info('');
    Terminal.sucesso('Insercao concluida nas 5 colecoes.');

    await this.#pausar();

    return { ana, bruno, privada, grupo, pergunta, resposta, comAnexo };
  }

  // ---------------------------------------------------------------------------
  // 2. Read
  // ---------------------------------------------------------------------------

  /**
   * Demonstra as consultas, incluindo agregacoes e busca por texto.
   *
   * @param {object} contexto Dados criados no bloco anterior.
   * @returns {Promise<void>}
   */
  async #blocoConsultar({ ana, privada, grupo }) {
    Terminal.titulo('2 de 6 - read (consultas e agregacoes)');

    Terminal.secao('painel do usuario (conversas + nao lidas + agenda)');
    const painel = await ChatService.painelDoUsuario(ana.id);

    Terminal.item(`${painel.usuario.paraTexto()} | nao lidas: ${painel.totalNaoLidas}`);
    Terminal.tabela(
      painel.conversas.map((conversa) => ({
        titulo: conversa.titulo,
        tipo: conversa.tipo,
        mensagens: conversa.totalMensagens,
        ultima: conversa.ultimaMensagem?.texto ?? '-'
      }))
    );

    Terminal.secao('historico detalhado (junta mensagens + usuarios + reacoes com $lookup)');
    const { mensagens, marcadasComoLidas } = await ChatService.abrirConversa(privada.id, ana.id);

    Terminal.tabela(
      mensagens.map((mensagem) => ({
        autor: mensagem.autorNome,
        conteudo: mensagem.conteudo,
        tipo: mensagem.tipo,
        respondendo: mensagem.respondendo ?? '-',
        reacoes: mensagem.reacoes.join(' ') || '-',
        leituras: mensagem.totalLeituras
      }))
    );

    Terminal.item(`${marcadasComoLidas} mensagem(ns) marcada(s) como lida(s) ao abrir a conversa`);

    Terminal.secao('busca por conteudo (indice de texto do MongoDB)');
    const achadas = await Mensagem.pesquisar('indices', { conversaId: privada.id });

    for (const mensagem of achadas) Terminal.item(mensagem.previa);
    if (achadas.length === 0) Terminal.item('(nenhuma mensagem encontrada)');

    Terminal.secao('estatisticas por autor na conversa');
    Terminal.tabela(await Mensagem.estatisticasPorAutor(privada.id));

    Terminal.secao('quantidade de documentos por colecao');
    Terminal.tabela(await Manutencao.contarDocumentos());

    Terminal.info('');
    Terminal.sucesso(`Consultas concluidas (grupo "${grupo.nome}" tambem foi criado e esta na lista).`);

    await this.#pausar();
  }

  // ---------------------------------------------------------------------------
  // 3. Update
  // ---------------------------------------------------------------------------

  /**
   * Demonstra as atualizacoes.
   *
   * @param {object} contexto Dados criados no primeiro bloco.
   * @returns {Promise<void>}
   */
  async #blocoAtualizar({ ana, grupo, pergunta }) {
    Terminal.titulo('3 de 6 - update (atualizacao)');

    const perfil = await Usuario.atualizarPorId(ana.id, { recado: 'Em demonstracao', status: 'ocupado' });
    Terminal.item(`perfil: ${perfil.paraTexto()} | recado: "${perfil.recado}"`);

    const editada = await Mensagem.editar(pergunta.id, ana.id, 'Bruno, terminou a parte do MongoDB e os indices?');
    Terminal.item(`mensagem editada: "${editada.conteudo}"`);
    Terminal.item(`marcada como editada: ${editada.editada}`);

    const renomeado = await Conversa.renomearGrupo(grupo.id, 'Grupo da trilha (renomeado)');
    Terminal.item(`grupo renomeado: ${renomeado.nome}`);

    const fixada = await Mensagem.alternarFixada(pergunta.id);
    Terminal.item(`mensagem fixada: ${fixada.fixada}`);

    Terminal.info('');
    Terminal.sucesso('Atualizacoes concluidas.');

    await this.#pausar();
  }

  // ---------------------------------------------------------------------------
  // 4. Delete
  // ---------------------------------------------------------------------------

  /**
   * Demonstra as duas formas de exclusao de mensagem.
   *
   * @param {object} contexto Dados criados no primeiro bloco.
   * @returns {Promise<void>}
   */
  async #blocoExcluir({ bruno, privada, resposta, comAnexo }) {
    Terminal.titulo('4 de 6 - delete (exclusao logica e definitiva)');

    Terminal.secao('exclusao logica: "apagar para todos"');
    const apagada = await Mensagem.excluirParaTodos(comAnexo.id, bruno.id);

    Terminal.item(`conteudo agora: "${apagada.previa}"`);
    Terminal.item(`documento ainda existe no banco: ${(await Mensagem.buscarPorId(apagada.id)) !== null}`);

    Terminal.secao('exclusao definitiva: remove o documento e as reacoes vinculadas');
    const reacoesAntes = await Reacao.contar({ mensagemId: resposta._id });
    const resultado = await ChatService.excluirMensagemDefinitivamente(resposta.id, bruno.id);

    Terminal.item(`reacoes na mensagem antes: ${reacoesAntes}`);
    Terminal.item(`reacoes removidas em cascata: ${resultado.reacoesRemovidas}`);
    Terminal.item(`mensagem no banco depois: ${await Mensagem.buscarPorId(resposta.id)}`);

    const conversa = await Conversa.obterPorId(privada.id);
    Terminal.item(`resumo da conversa recalculado -> ${conversa.paraTexto()}`);

    Terminal.info('');
    Terminal.sucesso('Exclusoes concluidas.');

    await this.#pausar();
  }

  // ---------------------------------------------------------------------------
  // 5. Validacao e excecoes
  // ---------------------------------------------------------------------------

  /**
   * Provoca falhas de proposito para mostrar a validacao e o tratamento de erros.
   *
   * @param {object} contexto Dados criados no primeiro bloco.
   * @returns {Promise<void>}
   */
  async #blocoValidacaoEErros({ ana, bruno, grupo, pergunta }) {
    Terminal.titulo('5 de 6 - validacao e tratamento de excecoes');
    Terminal.info('Cada linha abaixo e um erro provocado de proposito, capturado e registrado em log.');
    Terminal.info('');

    const idInexistente = '000000000000000000000000';

    await this.#demonstrarFalha('campos obrigatorios ausentes', () => Usuario.inserir({ apelido: 'fantasma' }));

    await this.#demonstrarFalha('dados invalidos (e-mail e senha)', () =>
      Usuario.inserir({ nome: 'Teste Invalido', email: 'sem-arroba', senha: '123' })
    );

    await this.#demonstrarFalha('identificador fora do padrao do MongoDB', () => Usuario.buscarPorId('abc'));

    await this.#demonstrarFalha('registro inexistente', () => Usuario.obterPorId(idInexistente));

    await this.#demonstrarFalha('e-mail duplicado (indice unico)', () =>
      Usuario.inserir({ nome: 'Ana Clone', email: EMAIL_ANA, senha: 'trilha123' })
    );

    await this.#demonstrarFalha('mensagem de imagem sem anexo', () =>
      ChatService.enviarMensagem({ conversaId: grupo.id, autorId: ana.id, conteudo: 'foto', tipo: 'imagem' })
    );

    await this.#demonstrarFalha('editar mensagem de outro autor', () =>
      Mensagem.editar(pergunta.id, bruno.id, 'tentando editar')
    );

    await this.#demonstrarFalha('contato repetido na agenda', () => ChatService.adicionarContato(ana.id, bruno.id));

    Terminal.info('');
    Terminal.sucesso(`${this.#errosDemonstrados} excecoes capturadas - a aplicacao nao foi encerrada.`);

    await this.#pausar();
  }

  /**
   * Executa uma acao que deve falhar e exibe a excecao capturada.
   *
   * @param {string} descricao Cenario demonstrado.
   * @param {() => Promise<*>} acao Acao que deve lancar excecao.
   * @returns {Promise<void>}
   */
  async #demonstrarFalha(descricao, acao) {
    try {
      await acao();
      Terminal.atencao(`${descricao} -> nenhuma excecao foi lancada`);
    } catch (erro) {
      this.#errosDemonstrados += 1;

      const detalhe = Array.isArray(erro.erros) && erro.erros.length > 0 ? ` | ${erro.erros[0]}` : '';
      const tipo = erro instanceof ErroAplicacao ? erro.name : `${erro.name} (inesperado)`;

      Terminal.item(`${descricao}`);
      Terminal.info(`      ${tipo}: ${erro.message}${detalhe}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Logs
  // ---------------------------------------------------------------------------

  /**
   * Mostra onde os erros ficaram registrados.
   * @returns {Promise<void>}
   */
  async #blocoLogs() {
    Terminal.titulo('6 de 6 - registro em arquivo de log');

    const fs = require('node:fs');

    Terminal.item(`arquivo de erros: ${logger.arquivos.erros}`);
    Terminal.item(`arquivo geral:    ${logger.arquivos.app}`);

    try {
      const conteudo = fs.readFileSync(logger.arquivos.erros, 'utf8');
      const registros = conteudo.split('-'.repeat(70)).filter((bloco) => bloco.trim() !== '');

      Terminal.item(`registros de erro no arquivo: ${registros.length}`);

      Terminal.secao('ultimo registro gravado');
      Terminal.info(registros[registros.length - 1].trim());
    } catch {
      Terminal.atencao('O arquivo de log ainda nao foi criado.');
    }

    await this.#pausar();
  }

  // ---------------------------------------------------------------------------
  // Limpeza e resumo
  // ---------------------------------------------------------------------------

  /**
   * Remove tudo o que a trilha criou.
   * @returns {Promise<void>}
   */
  async #limpar() {
    Terminal.titulo('limpeza');

    // As conversas sao removidas primeiro: a exclusao de usuario preserva o
    // historico dos grupos de proposito, entao o grupo da trilha ficaria para
    // tras se dependessemos so dela.
    const [dono] = this.#criados.usuarios;

    for (const id of this.#criados.conversas) {
      try {
        const resumo = await ChatService.excluirConversa(id, dono);

        Terminal.item(
          `conversa removida: ${resumo.mensagensRemovidas} mensagem(ns) e ${resumo.reacoesRemovidas} reacao(oes)`
        );
      } catch (erro) {
        Terminal.atencao(`nao foi possivel remover a conversa ${id}: ${erro.message}`);
      }
    }

    this.#criados.conversas = [];

    for (const id of this.#criados.usuarios) {
      try {
        const resumo = await ChatService.excluirUsuario(id);

        Terminal.item(
          `${resumo.usuario}: ${resumo.conversasRemovidas} conversa(s), ${resumo.mensagensRemovidas} mensagem(ns), ` +
            `${resumo.reacoesRemovidas} reacao(oes) e ${resumo.contatosRemovidos} contato(s) removidos`
        );
      } catch (erro) {
        Terminal.atencao(`nao foi possivel remover o usuario ${id}: ${erro.message}`);
      }
    }

    this.#criados.usuarios = [];

    Terminal.tabela(await Manutencao.contarDocumentos());
    Terminal.sucesso('Dados da trilha removidos: o banco voltou ao estado anterior.');
  }

  /**
   * Exibe o resumo do que foi demonstrado e onde está no código.
   * @returns {void}
   */
  #resumoFinal() {
    Terminal.titulo('resumo da trilha');

    Terminal.tabela([
      { demonstrado: 'Insercao nas 5 colecoes', onde: 'Modelo.salvar / Mensagem.enviar / Conversa.criarGrupo' },
      { demonstrado: 'Consultas e agregacoes ($lookup)', onde: 'Mensagem.historicoDetalhado / Contato.listarAgenda' },
      { demonstrado: 'Busca por texto', onde: 'Mensagem.pesquisar (indice de texto)' },
      { demonstrado: 'Atualizacoes', onde: 'Modelo.atualizarPorId / Mensagem.editar' },
      { demonstrado: 'Exclusao logica e definitiva', onde: 'Mensagem.excluirParaTodos / ChatService' },
      { demonstrado: 'Validacao dos campos', onde: 'Modelo.validar + utils/Validador' },
      { demonstrado: 'Tratamento de excecoes', onde: 'src/errors + Modelo.executar' },
      { demonstrado: 'Registro em log', onde: 'utils/Logger -> logs/errors.log' }
    ]);

    Terminal.info('Para ver o mesmo percurso sem o menu, execute: npm run demo');
  }

  /**
   * Remove um usuario pelo e-mail, se ele existir (sobras de execucao anterior).
   *
   * @param {string} email E-mail procurado.
   * @returns {Promise<void>}
   */
  async #removerUsuarioSeExistir(email) {
    const usuario = await Usuario.buscarPorEmail(email);

    if (usuario) await ChatService.excluirUsuario(usuario.id);
  }
}

module.exports = TrilhaGuiada;

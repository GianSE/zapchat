'use strict';

/**
 * Menu interativo do ZapChat, executado no terminal.
 *
 * Esta classe cuida apenas da interacao com o usuario: le as opcoes digitadas,
 * chama as classes de entidade ou o ChatService e apresenta o resultado. Toda
 * regra de negocio permanece nas classes de dominio.
 *
 * Cada acao e executada dentro de um tratamento de excecoes: se algo falhar, a
 * mensagem e exibida, o erro fica registrado no arquivo de log e o menu
 * continua disponivel, sem encerrar a aplicacao.
 */

const readline = require('node:readline/promises');
const { stdin: entrada, stdout: saida } = require('node:process');

const { Usuario, Contato, Conversa, Mensagem, Reacao } = require('../models');
const ChatService = require('../services/ChatService');
const Manutencao = require('../database/Manutencao');
const Terminal = require('./Terminal');
const logger = require('../utils/Logger');
const { ErroAplicacao } = require('../errors');

class Menu {
  /** @type {Usuario|null} Usuario autenticado na sessao atual. */
  #usuario = null;

  /** @type {readline.Interface} */
  #leitor;

  #encerrar = false;

  constructor() {
    this.#leitor = readline.createInterface({ input: entrada, output: saida });

    // Ctrl+C encerra o menu de forma organizada, em vez de derrubar o processo.
    this.#leitor.on('SIGINT', () => this.#leitor.close());
    this.#leitor.on('close', () => {
      this.#encerrar = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Leitura de dados no terminal
  // ---------------------------------------------------------------------------

  /**
   * Faz uma pergunta ao usuario.
   *
   * @param {string} texto Pergunta exibida.
   * @returns {Promise<string>} Resposta digitada, sem espacos nas pontas.
   */
  async perguntar(texto) {
    if (this.#encerrar) return '';

    // O AbortController evita que a aplicacao fique parada esperando por uma
    // resposta caso a entrada seja encerrada (Ctrl+C, Ctrl+D ou fim de arquivo).
    const controlador = new AbortController();
    const abortar = () => controlador.abort();

    this.#leitor.once('close', abortar);

    try {
      const resposta = await this.#leitor.question(`${texto} `, { signal: controlador.signal });
      return resposta.trim();
    } catch {
      this.#encerrar = true;
      return '';
    } finally {
      this.#leitor.off('close', abortar);
    }
  }

  /**
   * Faz uma pergunta cuja resposta pode ficar vazia (mantem o valor atual).
   *
   * @param {string} texto Pergunta exibida.
   * @param {string|null} [atual] Valor atual, exibido como referencia.
   * @returns {Promise<string|undefined>} Resposta ou undefined quando vazia.
   */
  async perguntarOpcional(texto, atual = null) {
    const complemento = atual ? ` [${atual}]` : ' (deixe vazio para ignorar)';
    const resposta = await this.perguntar(`${texto}${complemento}:`);

    return resposta === '' ? undefined : resposta;
  }

  /**
   * Pede uma confirmacao do tipo sim/nao.
   *
   * @param {string} texto Pergunta exibida.
   * @returns {Promise<boolean>}
   */
  async confirmar(texto) {
    const resposta = await this.perguntar(`${texto} (s/N):`);
    return resposta.toLowerCase() === 's';
  }

  /**
   * Exibe uma lista numerada e devolve o item escolhido.
   *
   * @template T
   * @param {string} titulo Titulo da lista.
   * @param {T[]} itens Itens disponiveis.
   * @param {(item: T) => string} formatar Funcao que descreve cada item.
   * @returns {Promise<T|null>} Item escolhido ou null.
   */
  async escolherDaLista(titulo, itens, formatar) {
    if (itens.length === 0) {
      Terminal.atencao('Nenhum registro disponivel para esta operacao.');
      return null;
    }

    Terminal.secao(titulo);
    itens.forEach((item, indice) => Terminal.info(`  ${indice + 1}. ${formatar(item)}`));

    const escolha = Number.parseInt(await this.perguntar('\nNumero (0 para cancelar):'), 10);

    if (!Number.isInteger(escolha) || escolha < 1 || escolha > itens.length) {
      Terminal.atencao('Opcao cancelada ou invalida.');
      return null;
    }

    return itens[escolha - 1];
  }

  /**
   * Escolhe um usuario cadastrado.
   *
   * @param {object} [opcoes]
   * @param {boolean} [opcoes.excluirLogado] Remove o usuario logado da lista.
   * @returns {Promise<Usuario|null>}
   */
  async escolherUsuario({ excluirLogado = false } = {}) {
    const usuarios = await Usuario.listar({}, { ordenar: { nome: 1 } });

    const disponiveis = excluirLogado && this.#usuario
      ? usuarios.filter((usuario) => usuario.id !== this.#usuario.id)
      : usuarios;

    return this.escolherDaLista('Usuarios cadastrados', disponiveis, (usuario) => usuario.paraTexto());
  }

  /**
   * Escolhe uma conversa do usuario logado.
   * @returns {Promise<Conversa|null>}
   */
  async escolherConversa() {
    const conversas = await Conversa.listarDoUsuario(this.#usuario.id);

    return this.escolherDaLista('Suas conversas', conversas, (conversa) => conversa.paraTexto());
  }

  /**
   * Escolhe uma mensagem de uma conversa.
   *
   * @param {string} conversaId Identificador da conversa.
   * @param {object} [opcoes]
   * @param {boolean} [opcoes.somenteMinhas] Lista apenas as mensagens do usuario logado.
   * @returns {Promise<Mensagem|null>}
   */
  async escolherMensagem(conversaId, { somenteMinhas = false } = {}) {
    const mensagens = await Mensagem.listarHistorico(conversaId, { limite: 30, ordem: 'desc' });

    const disponiveis = somenteMinhas
      ? mensagens.filter((mensagem) => String(mensagem.autorId) === this.#usuario.id)
      : mensagens;

    const autores = new Map((await Usuario.listar()).map((usuario) => [usuario.id, usuario.nome]));

    return this.escolherDaLista('Mensagens da conversa', disponiveis, (mensagem) =>
      mensagem.paraTexto(autores.get(String(mensagem.autorId)) ?? 'Usuario removido')
    );
  }

  // ---------------------------------------------------------------------------
  // Execucao com tratamento de excecoes
  // ---------------------------------------------------------------------------

  /**
   * Executa uma acao do menu capturando qualquer excecao.
   *
   * @param {string} nome Nome da acao (usado no log).
   * @param {() => Promise<void>} acao Acao executada.
   * @returns {Promise<void>}
   */
  async executar(nome, acao) {
    try {
      await acao();
    } catch (erro) {
      if (erro instanceof ErroAplicacao) {
        // Excecoes previstas ja foram registradas no arquivo de log.
        Terminal.exibirErro(erro);
      } else {
        logger.erro(erro, { operacao: `Menu.${nome}` });
        Terminal.falha(`Erro inesperado: ${erro.message}`);
      }
    }
  }

  /**
   * Garante que existe um usuario autenticado na sessao.
   *
   * @returns {boolean}
   */
  exigirLogin() {
    if (this.#usuario) return true;

    Terminal.atencao('Entre com um usuario antes de usar esta opcao (opcao 1).');

    return false;
  }

  // ---------------------------------------------------------------------------
  // 1. Sessao e usuarios
  // ---------------------------------------------------------------------------

  /**
   * Autentica um usuario informando e-mail e senha.
   * @returns {Promise<void>}
   */
  async entrar() {
    Terminal.secao('Entrar no ZapChat');
    Terminal.info('(nos dados de exemplo a senha de todos os usuarios e "senha123")');

    const email = await this.perguntar('E-mail:');
    const senha = await this.perguntar('Senha:');

    this.#usuario = await Usuario.autenticar(email, senha);

    Terminal.sucesso(`Bem-vindo(a), ${this.#usuario.nomeExibicao}!`);

    const painel = await ChatService.painelDoUsuario(this.#usuario.id);
    Terminal.info(`Voce tem ${painel.totalNaoLidas} mensagem(ns) nao lida(s).`);
  }

  /**
   * Encerra a sessao do usuario logado.
   * @returns {Promise<void>}
   */
  async sair() {
    if (!this.#usuario) return;

    await Usuario.alterarStatus(this.#usuario.id, 'offline');
    Terminal.sucesso(`Ate logo, ${this.#usuario.nomeExibicao}!`);

    this.#usuario = null;
  }

  /**
   * Cadastra um novo usuario.
   * @returns {Promise<void>}
   */
  async cadastrarUsuario() {
    Terminal.secao('Cadastro de usuario');

    const dados = {
      nome: await this.perguntar('Nome completo:'),
      email: await this.perguntar('E-mail:'),
      senha: await this.perguntar('Senha (minimo 6 caracteres, com letras e numeros):'),
      apelido: await this.perguntarOpcional('Apelido'),
      telefone: await this.perguntarOpcional('Telefone (99) 99999-9999'),
      avatar: await this.perguntarOpcional('Emoji do perfil'),
      recado: await this.perguntarOpcional('Recado')
    };

    const usuario = await ChatService.cadastrarUsuario(dados);

    Terminal.sucesso(`Usuario cadastrado: ${usuario.paraTexto()} (_id: ${usuario.id})`);
  }

  /**
   * Lista e pesquisa usuarios cadastrados.
   * @returns {Promise<void>}
   */
  async listarUsuarios() {
    const termo = await this.perguntarOpcional('Pesquisar por nome, apelido ou e-mail');

    const usuarios = termo ? await Usuario.pesquisar(termo) : await Usuario.listar({}, { ordenar: { nome: 1 } });

    Terminal.secao(`Usuarios encontrados: ${usuarios.length}`);
    Terminal.tabela(
      usuarios.map((usuario) => ({
        nome: usuario.nome,
        apelido: usuario.apelido,
        email: usuario.email,
        status: usuario.status,
        recado: usuario.recado
      }))
    );
  }

  /**
   * Exibe e atualiza o perfil do usuario logado.
   * @returns {Promise<void>}
   */
  async meuPerfil() {
    if (!this.exigirLogin()) return;

    const usuario = await Usuario.obterPorId(this.#usuario.id);

    Terminal.secao('Meu perfil');
    Terminal.tabela([usuario.paraJSON()]);

    Terminal.info('\n  1. Atualizar dados    2. Alterar status    3. Alterar senha    0. Voltar');

    const opcao = await this.perguntar('Opcao:');

    if (opcao === '1') {
      const alteracoes = {
        nome: await this.perguntarOpcional('Nome', usuario.nome),
        apelido: await this.perguntarOpcional('Apelido', usuario.apelido),
        telefone: await this.perguntarOpcional('Telefone', usuario.telefone),
        avatar: await this.perguntarOpcional('Emoji do perfil', usuario.avatar),
        recado: await this.perguntarOpcional('Recado', usuario.recado)
      };

      this.#usuario = await Usuario.atualizarPorId(usuario.id, alteracoes);
      Terminal.sucesso('Perfil atualizado.');
    } else if (opcao === '2') {
      const status = await this.escolherDaLista('Status disponiveis', Usuario.statusValidos, (item) => item);

      if (status) {
        this.#usuario = await Usuario.alterarStatus(usuario.id, status);
        Terminal.sucesso(`Status alterado para "${status}".`);
      }
    } else if (opcao === '3') {
      const atual = await this.perguntar('Senha atual:');
      const nova = await this.perguntar('Nova senha:');

      await Usuario.alterarSenha(usuario.id, atual, nova);
      Terminal.sucesso('Senha alterada.');
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Agenda de contatos
  // ---------------------------------------------------------------------------

  /**
   * Menu da agenda de contatos.
   * @returns {Promise<void>}
   */
  async agenda() {
    if (!this.exigirLogin()) return;

    Terminal.secao('Minha agenda');
    Terminal.tabela(
      (await Contato.listarAgenda(this.#usuario.id, { incluirBloqueados: true })).map((contato) => ({
        exibicao: contato.exibicao,
        email: contato.email,
        status: contato.status,
        favorito: contato.favorito,
        bloqueado: contato.bloqueado
      }))
    );

    Terminal.info('\n  1. Adicionar contato    2. Favoritar/desfavoritar    3. Bloquear/desbloquear    4. Remover    0. Voltar');

    const opcao = await this.perguntar('Opcao:');

    if (opcao === '1') {
      const usuario = await this.escolherUsuario({ excluirLogado: true });
      if (!usuario) return;

      const apelido = await this.perguntarOpcional('Apelido para este contato');
      const favorito = await this.confirmar('Marcar como favorito?');

      const contato = await ChatService.adicionarContato(this.#usuario.id, usuario.id, { apelido, favorito });
      Terminal.sucesso(`Contato adicionado (_id: ${contato.id}).`);

      return;
    }

    if (opcao === '0' || opcao === '') return;

    const contatos = await Contato.listar({ usuarioId: this.#usuario._id });

    const pessoas = new Map(
      (await Usuario.listar({ _id: { $in: contatos.map((contato) => contato.contatoId) } })).map((usuario) => [
        usuario.id,
        usuario.nome
      ])
    );

    const descrever = (contato) =>
      `${pessoas.get(String(contato.contatoId)) ?? 'Usuario removido'} ${contato.paraTexto()}`.trim();

    const escolhido = await this.escolherDaLista('Contatos da agenda', contatos, descrever);
    if (!escolhido) return;

    const nome = pessoas.get(String(escolhido.contatoId)) ?? 'contato';

    if (opcao === '2') {
      const atualizado = await Contato.alternarFavorito(escolhido.id);
      Terminal.sucesso(`${nome}: favorito = ${atualizado.favorito}`);
    } else if (opcao === '3') {
      const atualizado = await Contato.definirBloqueio(escolhido.id, !escolhido.bloqueado);
      Terminal.sucesso(`${nome}: bloqueado = ${atualizado.bloqueado}`);
    } else if (opcao === '4') {
      if (await this.confirmar(`Remover ${nome} da agenda?`)) {
        await Contato.remover(this.#usuario.id, escolhido.contatoId);
        Terminal.sucesso('Contato removido.');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Conversas e mensagens
  // ---------------------------------------------------------------------------

  /**
   * Lista as conversas do usuario logado com as mensagens nao lidas.
   * @returns {Promise<void>}
   */
  async minhasConversas() {
    if (!this.exigirLogin()) return;

    const painel = await ChatService.painelDoUsuario(this.#usuario.id);
    const naoLidasPorConversa = new Map(painel.naoLidas.map((item) => [String(item.conversaId), item.naoLidas]));

    Terminal.secao(`Conversas de ${painel.usuario.nomeExibicao} (${painel.totalNaoLidas} nao lidas)`);

    Terminal.tabela(
      painel.conversas.map((conversa) => ({
        titulo: conversa.titulo,
        tipo: conversa.tipo,
        mensagens: conversa.totalMensagens,
        naoLidas: naoLidasPorConversa.get(String(conversa._id)) ?? 0,
        ultima: conversa.ultimaMensagem?.texto ?? '(sem mensagens)',
        quando: Terminal.dataHora(conversa.ultimaMensagem?.enviadaEm)
      }))
    );
  }

  /**
   * Abre uma conversa: exibe o historico e marca as mensagens como lidas.
   * @returns {Promise<void>}
   */
  async abrirConversa() {
    if (!this.exigirLogin()) return;

    const conversa = await this.escolherConversa();
    if (!conversa) return;

    const resultado = await ChatService.abrirConversa(conversa.id, this.#usuario.id);

    Terminal.secao(conversa.paraTexto());

    if (resultado.mensagens.length === 0) {
      Terminal.info('   (conversa sem mensagens)');
    }

    for (const mensagem of resultado.mensagens) {
      const marcas = [
        mensagem.editada ? '(editada)' : null,
        mensagem.fixada ? '📌' : null,
        mensagem.reacoes.length > 0 ? mensagem.reacoes.join('') : null
      ]
        .filter(Boolean)
        .join(' ');

      const anexo = mensagem.anexo ? ` [${mensagem.tipo}: ${mensagem.anexo.nome}]` : '';
      const respondendo = mensagem.respondendo ? `\n        ↳ em resposta a: "${mensagem.respondendo}"` : '';

      Terminal.info(
        `  ${Terminal.dataHora(mensagem.enviadaEm)} ${mensagem.autorAvatar} ${mensagem.autorNome}:` +
          `${respondendo}\n        ${mensagem.conteudo}${anexo} ${marcas}`.trimEnd()
      );
    }

    if (resultado.marcadasComoLidas > 0) {
      Terminal.sucesso(`${resultado.marcadasComoLidas} mensagem(ns) marcada(s) como lida(s).`);
    }
  }

  /**
   * Envia uma mensagem para uma conversa existente ou para um contato.
   * @returns {Promise<void>}
   */
  async enviarMensagem() {
    if (!this.exigirLogin()) return;

    Terminal.info('\n  1. Enviar para uma conversa existente    2. Enviar para um usuario (abre conversa privada)');
    const opcao = await this.perguntar('Opcao:');

    let conversaId = null;

    if (opcao === '2') {
      const destinatario = await this.escolherUsuario({ excluirLogado: true });
      if (!destinatario) return;

      const conversa = await ChatService.abrirConversaPrivada(this.#usuario.id, destinatario.id);
      conversaId = conversa.id;
    } else {
      const conversa = await this.escolherConversa();
      if (!conversa) return;

      conversaId = conversa.id;
    }

    const tipo = (await this.perguntarOpcional(`Tipo (${Mensagem.tiposValidos.join('/')})`, 'texto')) ?? 'texto';
    const conteudo = await this.perguntar('Mensagem:');

    const dados = { conversaId, autorId: this.#usuario.id, conteudo, tipo };

    if (['imagem', 'arquivo', 'audio', 'video'].includes(tipo)) {
      dados.anexo = {
        nome: await this.perguntar('Nome do arquivo:'),
        url: await this.perguntar('URL do arquivo:'),
        tamanhoKb: Number(await this.perguntar('Tamanho em KB:')) || 1
      };
    }

    if (await this.confirmar('Responder a alguma mensagem da conversa?')) {
      const respondida = await this.escolherMensagem(conversaId);
      if (respondida) dados.respostaA = respondida.id;
    }

    const { mensagem } = await ChatService.enviarMensagem(dados);

    Terminal.sucesso(`Mensagem enviada (_id: ${mensagem.id}).`);
  }

  /**
   * Menu de acoes sobre uma mensagem: editar, reagir, fixar e excluir.
   * @returns {Promise<void>}
   */
  async gerenciarMensagens() {
    if (!this.exigirLogin()) return;

    const conversa = await this.escolherConversa();
    if (!conversa) return;

    Terminal.info(
      '\n  1. Editar mensagem    2. Reagir    3. Fixar/desafixar    ' +
        '4. Apagar para todos    5. Excluir definitivamente    0. Voltar'
    );

    const opcao = await this.perguntar('Opcao:');
    if (opcao === '0' || opcao === '') return;

    const somenteMinhas = ['1', '4', '5'].includes(opcao);
    const mensagem = await this.escolherMensagem(conversa.id, { somenteMinhas });
    if (!mensagem) return;

    if (opcao === '1') {
      const conteudo = await this.perguntar('Novo conteudo:');
      const editada = await Mensagem.editar(mensagem.id, this.#usuario.id, conteudo);

      Terminal.sucesso(`Mensagem editada: "${editada.conteudo}"`);
    } else if (opcao === '2') {
      const emoji = await this.escolherDaLista('Emojis disponiveis', Reacao.emojisValidos, (item) => item);
      if (!emoji) return;

      const { acao, resumo } = await ChatService.reagir(mensagem.id, this.#usuario.id, emoji);
      Terminal.sucesso(`Reacao ${acao}. Resumo: ${resumo.map((r) => `${r.emoji} ${r.total}`).join('  ') || '(nenhuma)'}`);
    } else if (opcao === '3') {
      const atualizada = await Mensagem.alternarFixada(mensagem.id);
      Terminal.sucesso(`Mensagem ${atualizada.fixada ? 'fixada' : 'desafixada'}.`);
    } else if (opcao === '4') {
      const apagada = await Mensagem.excluirParaTodos(mensagem.id, this.#usuario.id);
      Terminal.sucesso(`Mensagem apagada para todos: "${apagada.previa}"`);
    } else if (opcao === '5') {
      if (await this.confirmar('Excluir definitivamente esta mensagem do banco?')) {
        const resultado = await ChatService.excluirMensagemDefinitivamente(mensagem.id, this.#usuario.id);
        Terminal.sucesso(`Mensagem excluida (${resultado.reacoesRemovidas} reacao(oes) removida(s)).`);
      }
    }
  }

  /**
   * Menu de grupos: criar, renomear, adicionar, remover, promover e excluir.
   * @returns {Promise<void>}
   */
  async gerenciarGrupos() {
    if (!this.exigirLogin()) return;

    Terminal.info(
      '\n  1. Criar grupo    2. Adicionar participante    3. Remover participante    ' +
        '4. Promover administrador    5. Renomear    6. Excluir conversa    0. Voltar'
    );

    const opcao = await this.perguntar('Opcao:');
    if (opcao === '0' || opcao === '') return;

    if (opcao === '1') {
      const nome = await this.perguntar('Nome do grupo:');
      const descricao = await this.perguntarOpcional('Descricao');
      const icone = await this.perguntarOpcional('Emoji do grupo', '👥');

      const participantes = [];
      let continuar = true;

      while (continuar) {
        const usuario = await this.escolherUsuario({ excluirLogado: true });
        if (usuario && !participantes.includes(usuario.id)) participantes.push(usuario.id);

        continuar = await this.confirmar('Adicionar outro participante?');
      }

      const { conversa } = await ChatService.criarGrupo({
        nome,
        descricao,
        icone,
        criadoPor: this.#usuario.id,
        participantes
      });

      Terminal.sucesso(`Grupo criado: ${conversa.paraTexto()}`);

      return;
    }

    const conversa = await this.escolherConversa();
    if (!conversa) return;

    if (opcao === '2') {
      const usuario = await this.escolherUsuario({ excluirLogado: true });
      if (!usuario) return;

      const { conversa: atualizada } = await ChatService.adicionarAoGrupo(conversa.id, this.#usuario.id, usuario.id);
      Terminal.sucesso(`Participante adicionado: ${atualizada.paraTexto()}`);
    } else if (opcao === '3') {
      const participantes = await Usuario.listar({ _id: { $in: conversa.participantes } });
      const usuario = await this.escolherDaLista('Participantes', participantes, (item) => item.paraTexto());
      if (!usuario) return;

      const atualizada = await Conversa.removerParticipante(conversa.id, usuario.id);
      Terminal.sucesso(`Participante removido. Restam ${atualizada.quantidadeParticipantes}.`);
    } else if (opcao === '4') {
      const participantes = await Usuario.listar({ _id: { $in: conversa.participantes } });
      const usuario = await this.escolherDaLista('Participantes', participantes, (item) => item.paraTexto());
      if (!usuario) return;

      const atualizada = await Conversa.promoverAdministrador(conversa.id, usuario.id);
      Terminal.sucesso(`Administradores: ${atualizada.administradores.length}`);
    } else if (opcao === '5') {
      const nome = await this.perguntar('Novo nome do grupo:');
      const atualizada = await Conversa.renomearGrupo(conversa.id, nome);

      Terminal.sucesso(`Grupo renomeado: ${atualizada.paraTexto()}`);
    } else if (opcao === '6') {
      if (await this.confirmar('Excluir a conversa e todas as suas mensagens?')) {
        const resultado = await ChatService.excluirConversa(conversa.id, this.#usuario.id);

        Terminal.sucesso(
          `Conversa excluida: ${resultado.mensagensRemovidas} mensagem(ns) e ` +
            `${resultado.reacoesRemovidas} reacao(oes) removida(s).`
        );
      }
    }
  }

  /**
   * Pesquisa mensagens pelo conteudo.
   * @returns {Promise<void>}
   */
  async pesquisarMensagens() {
    const termo = await this.perguntar('Texto pesquisado:');
    const mensagens = await Mensagem.pesquisar(termo, { limite: 20 });

    Terminal.secao(`Mensagens encontradas: ${mensagens.length}`);

    if (mensagens.length === 0) return;

    const autores = new Map((await Usuario.listar()).map((usuario) => [usuario.id, usuario.nome]));

    for (const mensagem of mensagens) {
      Terminal.item(mensagem.paraTexto(autores.get(String(mensagem.autorId)) ?? 'Usuario removido'));
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Estatisticas e manutencao
  // ---------------------------------------------------------------------------

  /**
   * Exibe estatisticas gerais da aplicacao.
   * @returns {Promise<void>}
   */
  async estatisticas() {
    const dados = await ChatService.estatisticasGerais();

    Terminal.secao('Documentos por colecao');
    Terminal.tabela(dados.colecoes);

    Terminal.secao('Resumo');
    Terminal.item(`Usuarios cadastrados: ${dados.totalUsuarios}`);
    Terminal.item(`Conversas: ${dados.totalConversas} (grupos: ${dados.totalGrupos})`);
    Terminal.item(`Mensagens: ${dados.totalMensagens} (apagadas para todos: ${dados.mensagensExcluidas})`);

    Terminal.secao('Ranking de remetentes');
    Terminal.tabela(dados.ranking);

    Terminal.secao('Emojis mais usados');
    Terminal.tabela(dados.emojis);
  }

  /**
   * Menu de manutencao do banco de dados.
   * @returns {Promise<void>}
   */
  async manutencao() {
    Terminal.info('\n  1. Criar indices    2. Contar documentos    3. Listar indices    4. Limpar o banco    0. Voltar');

    const opcao = await this.perguntar('Opcao:');

    if (opcao === '1') {
      const criados = await Manutencao.criarIndices();
      for (const { colecao, indices } of criados) Terminal.item(`${colecao}: ${indices.join(', ')}`);

      Terminal.sucesso('Indices criados.');
    } else if (opcao === '2') {
      Terminal.tabela(await Manutencao.contarDocumentos());
    } else if (opcao === '3') {
      Terminal.tabela(await Manutencao.listarIndices());
    } else if (opcao === '4') {
      if (await this.confirmar('Remover TODOS os documentos do banco?')) {
        Terminal.tabela(await Manutencao.limparColecoes());
        this.#usuario = null;

        Terminal.sucesso('Banco limpo. Use "npm run seed" para recarregar os dados de exemplo.');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Loop principal
  // ---------------------------------------------------------------------------

  /**
   * Opcoes do menu principal.
   * @returns {Array<{chave: string, titulo: string, acao: () => Promise<void>}>}
   */
  get opcoes() {
    return [
      { chave: '1', titulo: 'Entrar (autenticar usuario)', acao: () => this.entrar() },
      { chave: '2', titulo: 'Cadastrar usuario', acao: () => this.cadastrarUsuario() },
      { chave: '3', titulo: 'Listar / pesquisar usuarios', acao: () => this.listarUsuarios() },
      { chave: '4', titulo: 'Meu perfil', acao: () => this.meuPerfil() },
      { chave: '5', titulo: 'Minha agenda de contatos', acao: () => this.agenda() },
      { chave: '6', titulo: 'Minhas conversas', acao: () => this.minhasConversas() },
      { chave: '7', titulo: 'Abrir conversa (historico)', acao: () => this.abrirConversa() },
      { chave: '8', titulo: 'Enviar mensagem', acao: () => this.enviarMensagem() },
      { chave: '9', titulo: 'Gerenciar mensagens (editar, reagir, apagar)', acao: () => this.gerenciarMensagens() },
      { chave: '10', titulo: 'Gerenciar grupos e conversas', acao: () => this.gerenciarGrupos() },
      { chave: '11', titulo: 'Pesquisar mensagens', acao: () => this.pesquisarMensagens() },
      { chave: '12', titulo: 'Estatisticas', acao: () => this.estatisticas() },
      { chave: '13', titulo: 'Manutencao do banco de dados', acao: () => this.manutencao() },
      { chave: '14', titulo: 'Encerrar sessao do usuario', acao: () => this.sair() }
    ];
  }

  /**
   * Exibe o menu principal.
   * @returns {void}
   */
  exibirMenu() {
    const sessao = this.#usuario
      ? `${this.#usuario.avatar} ${this.#usuario.nomeExibicao} (${this.#usuario.status})`
      : 'nenhum usuario autenticado';

    Terminal.titulo('zapchat - menu principal');
    Terminal.info(`Sessao: ${sessao}`);
    Terminal.linha();

    for (const { chave, titulo } of this.opcoes) {
      Terminal.info(`  ${chave.padStart(2, ' ')}. ${titulo}`);
    }

    Terminal.info('   0. Sair da aplicacao');
    Terminal.linha();
  }

  /**
   * Executa o laco do menu ate que o usuario escolha sair.
   * @returns {Promise<void>}
   */
  async iniciar() {
    Terminal.titulo('bem-vindo ao zapchat');
    Terminal.info('Aplicacao de mensagens instantaneas com Node.js e MongoDB.');
    Terminal.info('Dica: execute "npm run seed" para carregar dados de exemplo.');

    while (!this.#encerrar) {
      this.exibirMenu();

      const escolha = await this.perguntar('Escolha uma opcao:');

      if (this.#encerrar) continue;

      if (escolha === '0') {
        this.#encerrar = true;
        continue;
      }

      const opcao = this.opcoes.find((item) => item.chave === escolha);

      if (!opcao) {
        Terminal.atencao('Opcao invalida. Digite o numero de uma das opcoes listadas.');
        continue;
      }

      await this.executar(opcao.titulo, opcao.acao);

      if (this.#encerrar) continue;

      await this.perguntar('\nPressione ENTER para voltar ao menu...');
    }

    await this.sair();
    this.#leitor.close();

    Terminal.info('\nAplicacao encerrada.');
  }
}

module.exports = Menu;

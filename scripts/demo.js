'use strict';

/**
 * Demonstracao completa da aplicacao.
 *
 * Percorre, em sequencia, todos os recursos exigidos pelo projeto:
 *   1. preparacao do banco e criacao dos indices;
 *   2. insercao (Create) nas cinco colecoes;
 *   3. consultas (Read), incluindo agregacoes e busca por texto;
 *   4. atualizacoes (Update);
 *   5. exclusoes (Delete), logicas e definitivas, com dependencias;
 *   6. validacao de campos obrigatorios e de dados invalidos;
 *   7. tratamento de excecoes, com registro em arquivo de log.
 *
 * Execucao: npm run demo
 */

const fs = require('node:fs');

const Aplicacao = require('../src/Aplicacao');
const Database = require('../src/database/Database');
const Manutencao = require('../src/database/Manutencao');
const ChatService = require('../src/services/ChatService');
const { Usuario, Contato, Conversa, Mensagem, Reacao } = require('../src/models');
const Terminal = require('../src/cli/Terminal');
const logger = require('../src/utils/Logger');
const { ErroAplicacao } = require('../src/errors');

/** Contador das falhas demonstradas. */
let falhasDemonstradas = 0;

/**
 * Executa uma acao que deve falhar, exibindo a excecao capturada.
 *
 * @param {string} descricao Cenario demonstrado.
 * @param {() => Promise<*>} acao Acao que deve lancar excecao.
 * @returns {Promise<void>}
 */
async function demonstrarFalha(descricao, acao) {
  try {
    await acao();
    Terminal.atencao(`${descricao} -> nenhuma excecao foi lancada (verificar regra)`);
  } catch (erro) {
    falhasDemonstradas += 1;

    const detalhe = Array.isArray(erro.erros) && erro.erros.length > 0 ? ` | ${erro.erros.join(' / ')}` : '';

    Terminal.info(`  ${String(falhasDemonstradas).padStart(2, '0')}. ${descricao}`);
    Terminal.info(`      ${erro.name}: ${erro.message}${detalhe}`);

    if (!(erro instanceof ErroAplicacao)) {
      Terminal.atencao('      (excecao inesperada: deveria herdar de ErroAplicacao)');
    }
  }
}

// Durante a demonstracao o proprio script exibe as excecoes de forma organizada,
// por isso o espelhamento automatico no console e desligado. O registro em
// arquivo (logs/errors.log) continua sendo feito normalmente.
logger.exibirNoConsole = false;

Aplicacao.executar('demo', async () => {
  // ===========================================================================
  Terminal.titulo('1. preparacao do banco de dados');
  // ===========================================================================

  await Manutencao.limparColecoes();
  const indices = await Manutencao.criarIndices();

  Terminal.sucesso('Colecoes limpas e indices criados:');
  for (const { colecao, indices: nomes } of indices) Terminal.item(`${colecao}: ${nomes.join(', ')}`);

  // ===========================================================================
  Terminal.titulo('2. create - insercao de documentos');
  // ===========================================================================

  Terminal.secao('2.1 Usuarios');

  const ana = await ChatService.cadastrarUsuario({
    nome: 'Ana Souza',
    email: 'ana@zapchat.dev',
    senha: 'senha123',
    apelido: 'aninha',
    telefone: '(11) 99999-1111',
    avatar: '👩‍💻',
    recado: 'Estudando Node.js'
  });

  const bruno = await ChatService.cadastrarUsuario({
    nome: 'Bruno Lima',
    email: 'bruno@zapchat.dev',
    senha: 'senha123',
    apelido: 'bruninho',
    avatar: '🧑‍🎓'
  });

  const carla = await ChatService.cadastrarUsuario({
    nome: 'Carla Dias',
    email: 'carla@zapchat.dev',
    senha: 'senha123',
    apelido: 'carlinha',
    avatar: '👩‍🏫'
  });

  // Insercao em lote, com validacao individual de cada documento.
  const [diego, eva] = await Usuario.inserirMuitos([
    { nome: 'Diego Alves', email: 'diego@zapchat.dev', senha: 'senha123', apelido: 'diegol', avatar: '🧑‍🚀' },
    { nome: 'Eva Martins', email: 'eva@zapchat.dev', senha: 'senha123', apelido: 'evinha', avatar: '👩‍🎨' }
  ]);

  for (const usuario of [ana, bruno, carla, diego, eva]) Terminal.item(usuario.paraTexto());
  Terminal.sucesso('A senha nunca e gravada em texto puro:');
  Terminal.item(`hash de Ana: ${ana.senhaHash.slice(0, 32)}...`);

  Terminal.secao('2.2 Contatos (agenda)');

  await ChatService.adicionarContato(ana.id, bruno.id, { apelido: 'Bruno do trabalho', favorito: true });
  await ChatService.adicionarContato(ana.id, carla.id);
  await ChatService.adicionarContato(bruno.id, ana.id);
  const contatoBloqueado = await ChatService.adicionarContato(eva.id, diego.id, {
    apelido: 'Diego (nao responder)',
    bloqueado: true
  });

  Terminal.tabela(await Contato.listarAgenda(ana.id));

  Terminal.secao('2.3 Conversas');

  const privada = await ChatService.abrirConversaPrivada(ana.id, bruno.id);
  Terminal.item(`privada: ${privada.paraTexto()}`);

  const { conversa: grupo } = await ChatService.criarGrupo({
    nome: 'Trabalho de Web Back-End',
    descricao: 'Grupo para combinar a entrega do projeto 1',
    icone: '📚',
    criadoPor: ana.id,
    participantes: [bruno.id, carla.id]
  });

  Terminal.item(`grupo:   ${grupo.paraTexto()}`);

  Terminal.secao('2.4 Mensagens');

  const { mensagem: pergunta } = await ChatService.enviarMensagem({
    conversaId: privada.id,
    autorId: ana.id,
    conteudo: 'Bruno, voce terminou a parte do MongoDB do projeto?'
  });

  const { mensagem: respostaBruno } = await ChatService.enviarMensagem({
    conversaId: privada.id,
    autorId: bruno.id,
    conteudo: 'Terminei sim! Faltam so os indices e a validacao dos campos.',
    respostaA: pergunta.id
  });

  const { mensagem: comAnexo } = await ChatService.enviarMensagem({
    conversaId: privada.id,
    autorId: bruno.id,
    conteudo: 'Segue o diagrama das colecoes',
    tipo: 'imagem',
    anexo: { nome: 'diagrama-colecoes.png', url: 'https://cdn.zapchat.dev/diagrama.png', tamanhoKb: 320 }
  });

  const { mensagem: doGrupo } = await ChatService.enviarMensagem({
    conversaId: grupo.id,
    autorId: ana.id,
    conteudo: 'Combinado: eu faco as classes, Bruno o banco e Carla o README.'
  });

  await ChatService.enviarMensagem({
    conversaId: grupo.id,
    autorId: carla.id,
    conteudo: 'Fechado! Comeco o README hoje e mando o rascunho amanha.'
  });

  // Mensagem enviada com a conversa aberta automaticamente (envio direto).
  await ChatService.enviarMensagemDireta(carla.id, ana.id, 'Ana, a entrega e na sexta, lembra?');

  Terminal.sucesso(`${await Mensagem.contar()} mensagens gravadas (incluindo as de sistema dos grupos)`);

  Terminal.secao('2.5 Reacoes');

  // Cada usuario reage apenas em conversas das quais participa.
  const reacoes = [
    { usuario: ana, mensagem: respostaBruno, emoji: '👍' },
    { usuario: bruno, mensagem: pergunta, emoji: '❤️' },
    { usuario: carla, mensagem: doGrupo, emoji: '🔥' },
    { usuario: bruno, mensagem: doGrupo, emoji: '🔥' }
  ];

  for (const { usuario, mensagem, emoji } of reacoes) {
    const { acao } = await ChatService.reagir(mensagem.id, usuario.id, emoji);
    Terminal.item(`${usuario.nome} reagiu ${emoji} -> ${acao}`);
  }

  Terminal.tabela(await Reacao.resumoPorMensagem(doGrupo.id));

  // ===========================================================================
  Terminal.titulo('3. read - consultas');
  // ===========================================================================

  Terminal.secao('3.1 Consulta por e-mail e autenticacao');

  const encontrada = await Usuario.buscarPorEmail('ana@zapchat.dev');
  Terminal.item(`buscarPorEmail: ${encontrada.paraTexto()}`);

  const autenticada = await Usuario.autenticar('ana@zapchat.dev', 'senha123');
  Terminal.item(`autenticar: status "${autenticada.status}" | ultimo acesso ${Terminal.dataHora(autenticada.ultimoAcesso)}`);

  Terminal.secao('3.2 Pesquisa de usuarios por nome, apelido ou e-mail');
  Terminal.tabela((await Usuario.pesquisar('li')).map((usuario) => ({ nome: usuario.nome, email: usuario.email })));

  Terminal.secao('3.3 Painel do usuario (conversas + nao lidas + agenda)');

  const painel = await ChatService.painelDoUsuario(bruno.id);
  Terminal.info(`Usuario: ${painel.usuario.paraTexto()} | mensagens nao lidas: ${painel.totalNaoLidas}`);

  Terminal.tabela(
    painel.conversas.map((conversa) => ({
      titulo: conversa.titulo,
      tipo: conversa.tipo,
      mensagens: conversa.totalMensagens,
      ultima: conversa.ultimaMensagem?.texto ?? '-',
      quando: Terminal.dataHora(conversa.ultimaMensagem?.enviadaEm)
    }))
  );

  Terminal.info('Nao lidas por conversa:');
  Terminal.tabela(painel.naoLidas);

  Terminal.secao('3.4 Historico detalhado da conversa (com $lookup de autor e reacoes)');

  const { mensagens: historico, marcadasComoLidas } = await ChatService.abrirConversa(privada.id, bruno.id);

  Terminal.tabela(
    historico.map((mensagem) => ({
      autor: `${mensagem.autorAvatar} ${mensagem.autorNome}`,
      conteudo: mensagem.conteudo,
      tipo: mensagem.tipo,
      respondendo: mensagem.respondendo ?? '-',
      reacoes: mensagem.reacoes.join(' ') || '-',
      leituras: mensagem.totalLeituras
    }))
  );

  Terminal.sucesso(`${marcadasComoLidas} mensagem(ns) marcada(s) como lida(s) ao abrir a conversa`);

  Terminal.secao('3.5 Busca de mensagens por conteudo (indice de texto)');

  // Mapa de autores para exibir o nome ao lado de cada mensagem.
  const autores = new Map((await Usuario.listar()).map((usuario) => [usuario.id, usuario.nome]));

  const achadas = await Mensagem.pesquisar('README');
  for (const mensagem of achadas) Terminal.item(mensagem.paraTexto(autores.get(String(mensagem.autorId))));

  Terminal.secao('3.6 Estatisticas por autor no grupo e ranking geral');
  Terminal.tabela(await Mensagem.estatisticasPorAutor(grupo.id));
  Terminal.tabela(await Mensagem.rankingRemetentes(5));

  Terminal.secao('3.7 Paginacao do historico');
  const pagina = await Mensagem.listarHistorico(grupo.id, { limite: 2, pular: 1 });
  for (const mensagem of pagina) Terminal.item(mensagem.paraTexto(autores.get(String(mensagem.autorId))));

  // ===========================================================================
  Terminal.titulo('4. update - atualizacao de documentos');
  // ===========================================================================

  Terminal.secao('4.1 Perfil do usuario');

  await ana.atualizar({ recado: 'Finalizando o projeto 1', status: 'ocupado', telefone: '(11) 91234-5678' });
  Terminal.item(`Ana: ${ana.paraTexto()} | recado: "${ana.recado}" | telefone: ${ana.telefone}`);

  await Usuario.alterarSenha(ana.id, 'senha123', 'novaSenha456');
  Terminal.item('senha alterada e conferida com a senha atual');

  Terminal.secao('4.2 Edicao de mensagem (somente o autor)');

  const editada = await Mensagem.editar(doGrupo.id, ana.id, 'Combinado: eu faco as classes, Bruno o banco, Carla o README e Diego os testes.');
  Terminal.item(`conteudo: ${editada.conteudo}`);
  Terminal.item(`editada: ${editada.editada} em ${Terminal.dataHora(editada.editadaEm)}`);

  Terminal.secao('4.3 Grupo: renomear, adicionar participante e promover administrador');

  await Conversa.renomearGrupo(grupo.id, 'Projeto 1 - Web Back-End');
  await ChatService.adicionarAoGrupo(grupo.id, ana.id, diego.id);
  const grupoAtualizado = await Conversa.promoverAdministrador(grupo.id, bruno.id);

  Terminal.item(grupoAtualizado.paraTexto());
  Terminal.item(`administradores: ${grupoAtualizado.administradores.length}`);

  Terminal.secao('4.4 Agenda: favoritar e bloquear');

  const contatoAna = await Contato.buscarUm({ usuarioId: bruno._id, contatoId: ana._id });
  const favoritado = await Contato.alternarFavorito(contatoAna.id);
  Terminal.item(`contato de Bruno favoritado: ${favoritado.favorito}`);

  const desbloqueado = await Contato.definirBloqueio(contatoBloqueado.id, false);
  Terminal.item(`Diego desbloqueado por Eva: bloqueado = ${desbloqueado.bloqueado}`);

  Terminal.secao('4.5 Reacao: alternar (remove quando repetida)');
  const alternada = await ChatService.reagir(respostaBruno.id, ana.id, '👍');
  Terminal.item(`acao: ${alternada.acao} | resumo: ${JSON.stringify(alternada.resumo)}`);

  // ===========================================================================
  Terminal.titulo('5. delete - exclusao de documentos');
  // ===========================================================================

  Terminal.secao('5.1 Exclusao para todos (logica: preserva o historico)');

  const apagada = await Mensagem.excluirParaTodos(comAnexo.id, bruno.id);
  Terminal.item(`mensagem ${apagada.id}: "${apagada.previa}" | excluida = ${apagada.excluida}`);
  Terminal.item(`documento preservado na colecao: ${(await Mensagem.buscarPorId(apagada.id)) !== null}`);

  Terminal.secao('5.2 Exclusao definitiva (remove reacoes e recalcula o resumo da conversa)');

  const { mensagem: descartavel } = await ChatService.enviarMensagem({
    conversaId: privada.id,
    autorId: ana.id,
    conteudo: 'Mensagem enviada por engano'
  });

  await ChatService.reagir(descartavel.id, bruno.id, '😂');

  const exclusao = await ChatService.excluirMensagemDefinitivamente(descartavel.id, ana.id);
  Terminal.item(`reacoes removidas em cascata: ${exclusao.reacoesRemovidas}`);
  Terminal.item(`mensagem no banco: ${await Mensagem.buscarPorId(descartavel.id)}`);

  const conversaRessincronizada = await Conversa.obterPorId(privada.id);
  Terminal.item(`resumo recalculado -> ${conversaRessincronizada.paraTexto()}`);

  Terminal.secao('5.3 Remocao de participante do grupo e de contato da agenda');

  const semDiego = await Conversa.removerParticipante(grupo.id, diego.id);
  Terminal.item(`participantes restantes: ${semDiego.quantidadeParticipantes}`);

  await Contato.remover(ana.id, carla.id);
  Terminal.item(`contatos de Ana: ${await Contato.contar({ usuarioId: ana._id })}`);

  Terminal.secao('5.4 Exclusao de usuario com todas as dependencias');

  // Antes de excluir, Eva recebe conversa, mensagens e reacao, para que a
  // remocao em cascata possa ser observada nas quatro colecoes relacionadas.
  const { mensagem: mensagemEva } = await ChatService.enviarMensagemDireta(
    eva.id,
    diego.id,
    'Diego, consegue revisar meu slide?'
  );

  await ChatService.reagir(mensagemEva.id, diego.id, '👍');

  const { mensagem: respostaDiego } = await ChatService.enviarMensagemDireta(
    diego.id,
    eva.id,
    'Consigo sim, manda o arquivo.'
  );

  await ChatService.reagir(respostaDiego.id, eva.id, '🙏');
  await ChatService.adicionarAoGrupo(grupo.id, ana.id, eva.id);

  Terminal.item(`vinculos de Eva antes da exclusao: ${(await Conversa.listarDoUsuario(eva.id)).length} conversa(s)`);

  const resumoExclusao = await ChatService.excluirUsuario(eva.id);
  Terminal.tabela([resumoExclusao]);

  Terminal.secao('5.5 Exclusao de conversa inteira');

  const resumoConversa = await ChatService.excluirConversa(privada.id, ana.id);
  Terminal.item(`mensagens removidas: ${resumoConversa.mensagensRemovidas}`);
  Terminal.item(`reacoes removidas: ${resumoConversa.reacoesRemovidas}`);
  Terminal.item(`conversas restantes: ${await Conversa.contar()}`);

  // ===========================================================================
  Terminal.titulo('6. validacao e tratamento de excecoes');
  // ===========================================================================

  Terminal.secao('6.1 Campos obrigatorios nao informados');

  await demonstrarFalha('Usuario sem nome, e-mail e senha', () => Usuario.inserir({ apelido: 'fantasma' }));

  await demonstrarFalha('Mensagem sem conteudo', () =>
    ChatService.enviarMensagem({ conversaId: grupo.id, autorId: ana.id })
  );

  await demonstrarFalha('Conversa sem participantes e sem criador', () => Conversa.inserir({ tipo: 'grupo' }));

  await demonstrarFalha('Reacao sem emoji', () => Reacao.alternar(doGrupo.id, ana.id, null));

  await demonstrarFalha('Atualizacao sem nenhum campo valido', () =>
    Usuario.atualizarPorId(ana.id, { campoInexistente: 'x' })
  );

  await demonstrarFalha('Atualizacao apagando um campo obrigatorio', () => Usuario.atualizarPorId(ana.id, { nome: '' }));

  Terminal.secao('6.2 Dados invalidos');

  await demonstrarFalha('E-mail em formato invalido e senha fraca', () =>
    Usuario.inserir({ nome: 'Teste Invalido', email: 'sem-arroba', senha: '123' })
  );

  await demonstrarFalha('Telefone e status fora do padrao', () =>
    Usuario.inserir({
      nome: 'Outro Teste',
      email: 'outro@zapchat.dev',
      senha: 'senha123',
      telefone: '1234',
      status: 'voando'
    })
  );

  await demonstrarFalha('Identificador do MongoDB invalido', () => Usuario.buscarPorId('id-invalido'));

  await demonstrarFalha('Tipo de mensagem inexistente', () =>
    ChatService.enviarMensagem({ conversaId: grupo.id, autorId: ana.id, conteudo: 'oi', tipo: 'holograma' })
  );

  await demonstrarFalha('Mensagem de imagem sem anexo', () =>
    ChatService.enviarMensagem({ conversaId: grupo.id, autorId: ana.id, conteudo: 'foto', tipo: 'imagem' })
  );

  await demonstrarFalha('Emoji fora da lista permitida', () => Reacao.alternar(doGrupo.id, ana.id, '🦄'));

  await demonstrarFalha('Conversa privada com tres participantes', () =>
    Conversa.inserir({ tipo: 'privada', participantes: [ana.id, bruno.id, carla.id], criadoPor: ana.id })
  );

  await demonstrarFalha('Grupo sem nome', () =>
    Conversa.inserir({ tipo: 'grupo', participantes: [ana.id, bruno.id], criadoPor: ana.id })
  );

  await demonstrarFalha('Contato apontando para o proprio usuario', () => Contato.adicionar(ana.id, ana.id));

  Terminal.secao('6.3 Registros inexistentes');

  const idInexistente = '000000000000000000000000';

  await demonstrarFalha('Consultar usuario inexistente', () => Usuario.obterPorId(idInexistente));
  await demonstrarFalha('Atualizar usuario inexistente', () => Usuario.atualizarPorId(idInexistente, { nome: 'Novo Nome' }));
  await demonstrarFalha('Excluir usuario inexistente', () => Usuario.excluirPorId(idInexistente));
  await demonstrarFalha('Abrir conversa inexistente', () => ChatService.abrirConversa(idInexistente, ana.id));
  await demonstrarFalha('Reagir a mensagem inexistente', () => Reacao.alternar(idInexistente, ana.id, '👍'));
  await demonstrarFalha('Remover contato inexistente da agenda', () => Contato.remover(ana.id, diego.id));

  Terminal.secao('6.4 Violacao de indice unico e de regras de negocio');

  await demonstrarFalha('E-mail duplicado (indice unico)', () =>
    Usuario.inserir({ nome: 'Ana Clone', email: 'ana@zapchat.dev', senha: 'senha123' })
  );

  await demonstrarFalha('Apelido duplicado (indice unico)', () =>
    Usuario.inserir({ nome: 'Bruno Clone', email: 'clone@zapchat.dev', senha: 'senha123', apelido: 'bruninho' })
  );

  await demonstrarFalha('Contato repetido na agenda', () => ChatService.adicionarContato(ana.id, bruno.id));

  await demonstrarFalha('Senha incorreta na autenticacao', () => Usuario.autenticar('ana@zapchat.dev', 'errada'));

  await demonstrarFalha('Alterar senha informando a senha atual errada', () =>
    Usuario.alterarSenha(ana.id, 'qualquer123', 'outra456')
  );

  await demonstrarFalha('Enviar mensagem em conversa da qual nao participa', () =>
    ChatService.enviarMensagem({ conversaId: grupo.id, autorId: diego.id, conteudo: 'posso falar?' })
  );

  await demonstrarFalha('Editar mensagem de outro autor', () => Mensagem.editar(doGrupo.id, bruno.id, 'texto alterado'));

  await demonstrarFalha('Apagar novamente uma mensagem ja apagada', async () => {
    const { mensagem } = await ChatService.enviarMensagem({
      conversaId: grupo.id,
      autorId: ana.id,
      conteudo: 'Mensagem que sera apagada duas vezes'
    });

    await Mensagem.excluirParaTodos(mensagem.id, ana.id);

    return Mensagem.excluirParaTodos(mensagem.id, ana.id);
  });

  await demonstrarFalha('Adicionar participante em conversa privada', async () => {
    const outraPrivada = await Conversa.abrirPrivada(ana.id, carla.id);

    return Conversa.adicionarParticipante(outraPrivada.id, diego.id);
  });

  await demonstrarFalha('Adicionar ao grupo sem ser administrador', () =>
    ChatService.adicionarAoGrupo(grupo.id, carla.id, diego.id)
  );

  await demonstrarFalha('Remover participante deixando o grupo com menos de 2', async () => {
    const enxuto = await Conversa.criarGrupo({
      nome: 'Grupo minimo',
      criadoPor: ana.id,
      participantes: [bruno.id]
    });

    return Conversa.removerParticipante(enxuto.id, bruno.id);
  });

  Terminal.secao('6.5 Falhas de conexao com o MongoDB');

  await demonstrarFalha('Operacao antes de conectar ao banco', async () => new Database().obterColecao('usuarios'));

  await demonstrarFalha('Conexao com servidor inexistente (porta 27099)', () =>
    new Database({ uri: 'mongodb://127.0.0.1:27099', banco: 'inexistente', timeoutMs: 800 }).conectar()
  );

  Terminal.sucesso(`${falhasDemonstradas} excecoes capturadas, tratadas e registradas em log`);

  // ===========================================================================
  Terminal.titulo('7. registro de logs');
  // ===========================================================================

  const conteudoLog = fs.readFileSync(logger.arquivos.erros, 'utf8');
  const registros = conteudoLog.split('-'.repeat(70)).filter((bloco) => bloco.trim() !== '');

  Terminal.info(`Arquivo de erros: ${logger.arquivos.erros}`);
  Terminal.info(`Arquivo geral:    ${logger.arquivos.app}`);
  Terminal.info(`Registros de erro no arquivo: ${registros.length}`);

  Terminal.secao('Ultimos 3 registros gravados');
  Terminal.info(registros.slice(-3).join('-'.repeat(70)).trim());

  // ===========================================================================
  Terminal.titulo('8. situacao final do banco de dados');
  // ===========================================================================

  Terminal.tabela(await Manutencao.contarDocumentos());

  const estatisticas = await ChatService.estatisticasGerais();
  Terminal.info(
    `Usuarios: ${estatisticas.totalUsuarios} | Conversas: ${estatisticas.totalConversas} ` +
      `(grupos: ${estatisticas.totalGrupos}) | Mensagens: ${estatisticas.totalMensagens} ` +
      `(excluidas: ${estatisticas.mensagensExcluidas})`
  );

  Terminal.secao('Ranking de remetentes');
  Terminal.tabela(estatisticas.ranking);

  Terminal.secao('Emojis mais usados');
  Terminal.tabela(estatisticas.emojis);

  Terminal.info('');
  Terminal.sucesso('Demonstracao concluida. Execute "npm run seed" e "npm start" para usar o menu interativo.');
});

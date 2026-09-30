'use strict';

/**
 * Script de carga de dados de exemplo.
 *
 * Limpa as colecoes, recria os indices e cadastra usuarios, contatos, conversas
 * privadas, grupos, mensagens e reacoes, permitindo navegar pelo menu do
 * terminal com o banco de dados ja povoado.
 *
 * Execucao: npm run seed
 */

const Aplicacao = require('../src/Aplicacao');
const Manutencao = require('../src/database/Manutencao');
const ChatService = require('../src/services/ChatService');
const { Usuario, Contato, Conversa, Mensagem, Reacao } = require('../src/models');
const Terminal = require('../src/cli/Terminal');

/** Usuarios cadastrados pelo script. */
const USUARIOS = [
  {
    chave: 'ana',
    nome: 'Ana Souza',
    email: 'ana@zapchat.dev',
    senha: 'senha123',
    apelido: 'aninha',
    telefone: '(11) 99999-1111',
    avatar: '👩‍💻',
    recado: 'Estudando Node.js'
  },
  {
    chave: 'bruno',
    nome: 'Bruno Lima',
    email: 'bruno@zapchat.dev',
    senha: 'senha123',
    apelido: 'bruninho',
    telefone: '(11) 98888-2222',
    avatar: '🧑‍🎓',
    recado: 'Disponivel'
  },
  {
    chave: 'carla',
    nome: 'Carla Dias',
    email: 'carla@zapchat.dev',
    senha: 'senha123',
    apelido: 'carlinha',
    telefone: '(21) 97777-3333',
    avatar: '👩‍🏫',
    recado: 'Em aula, respondo depois'
  },
  {
    chave: 'diego',
    nome: 'Diego Alves',
    email: 'diego@zapchat.dev',
    senha: 'senha123',
    apelido: 'diegol',
    telefone: '(31) 96666-4444',
    avatar: '🧑‍🚀',
    recado: 'Focado no TCC'
  },
  {
    chave: 'eva',
    nome: 'Eva Martins',
    email: 'eva@zapchat.dev',
    senha: 'senha123',
    apelido: 'evinha',
    telefone: '(41) 95555-5555',
    avatar: '👩‍🎨',
    recado: 'Desenhando'
  }
];

/** Vinculos de agenda criados pelo script. */
const CONTATOS = [
  { de: 'ana', para: 'bruno', apelido: 'Bruno do trabalho', favorito: true },
  { de: 'ana', para: 'carla', apelido: 'Carla monitora' },
  { de: 'ana', para: 'diego' },
  { de: 'bruno', para: 'ana', apelido: 'Ana chefe', favorito: true },
  { de: 'bruno', para: 'carla' },
  { de: 'carla', para: 'ana' },
  { de: 'carla', para: 'diego', favorito: true },
  { de: 'diego', para: 'eva' },
  { de: 'eva', para: 'diego', apelido: 'Diego (nao responder)', bloqueado: true }
];

/**
 * Popula o banco de dados com os dados de exemplo.
 *
 * @returns {Promise<object>} Identificadores criados, para uso em outros scripts.
 */
async function popularBase() {
  await Manutencao.limparColecoes();
  await Manutencao.criarIndices();

  // --- Usuarios -------------------------------------------------------------
  const usuarios = {};

  for (const { chave, ...dados } of USUARIOS) {
    usuarios[chave] = await ChatService.cadastrarUsuario(dados);
  }

  await Usuario.alterarStatus(usuarios.ana.id, 'online');
  await Usuario.alterarStatus(usuarios.bruno.id, 'ausente');
  await Usuario.alterarStatus(usuarios.carla.id, 'ocupado');

  // --- Contatos -------------------------------------------------------------
  for (const { de, para, ...dados } of CONTATOS) {
    await ChatService.adicionarContato(usuarios[de].id, usuarios[para].id, dados);
  }

  // --- Conversa privada: Ana e Bruno ---------------------------------------
  const privadaAnaBruno = await ChatService.abrirConversaPrivada(usuarios.ana.id, usuarios.bruno.id);

  const { mensagem: primeira } = await ChatService.enviarMensagem({
    conversaId: privadaAnaBruno.id,
    autorId: usuarios.ana.id,
    conteudo: 'Bruno, voce terminou a parte do MongoDB do projeto?'
  });

  const { mensagem: resposta } = await ChatService.enviarMensagem({
    conversaId: privadaAnaBruno.id,
    autorId: usuarios.bruno.id,
    conteudo: 'Terminei sim! Faltam so os indices e a validacao dos campos.',
    respostaA: primeira.id
  });

  await ChatService.enviarMensagem({
    conversaId: privadaAnaBruno.id,
    autorId: usuarios.bruno.id,
    conteudo: 'Segue o diagrama das colecoes',
    tipo: 'imagem',
    anexo: { nome: 'diagrama-colecoes.png', url: 'https://cdn.zapchat.dev/diagrama.png', tamanhoKb: 320 }
  });

  await ChatService.enviarMensagem({
    conversaId: privadaAnaBruno.id,
    autorId: usuarios.ana.id,
    conteudo: 'Perfeito, ficou otimo! Depois me manda o arquivo do relatorio.'
  });

  // --- Conversa privada: Ana e Carla ---------------------------------------
  const privadaAnaCarla = await ChatService.abrirConversaPrivada(usuarios.ana.id, usuarios.carla.id);

  await ChatService.enviarMensagem({
    conversaId: privadaAnaCarla.id,
    autorId: usuarios.carla.id,
    conteudo: 'Ana, a entrega do projeto 1 e na sexta, lembra?'
  });

  await ChatService.enviarMensagem({
    conversaId: privadaAnaCarla.id,
    autorId: usuarios.ana.id,
    conteudo: 'Lembro sim, obrigada! Ja estamos finalizando o CRUD.'
  });

  // --- Grupo do trabalho ----------------------------------------------------
  const { conversa: grupoTrabalho } = await ChatService.criarGrupo({
    nome: 'Trabalho de Web Back-End',
    descricao: 'Grupo para combinar a entrega do projeto 1',
    icone: '📚',
    criadoPor: usuarios.ana.id,
    participantes: [usuarios.bruno.id, usuarios.carla.id]
  });

  const { mensagem: mensagemFixada } = await ChatService.enviarMensagem({
    conversaId: grupoTrabalho.id,
    autorId: usuarios.ana.id,
    conteudo: 'Combinado: eu faco as classes, Bruno o banco e Carla o README.'
  });

  await Mensagem.alternarFixada(mensagemFixada.id);

  const { mensagem: mensagemGrupo } = await ChatService.enviarMensagem({
    conversaId: grupoTrabalho.id,
    autorId: usuarios.bruno.id,
    conteudo: 'Fechado! Subi o arquivo com o modelo das colecoes.',
    tipo: 'arquivo',
    anexo: { nome: 'modelagem.pdf', url: 'https://cdn.zapchat.dev/modelagem.pdf', tamanhoKb: 890 }
  });

  await ChatService.enviarMensagem({
    conversaId: grupoTrabalho.id,
    autorId: usuarios.carla.id,
    conteudo: 'Otimo trabalho, pessoal! Comecei o README hoje.'
  });

  // Diego entra no grupo depois (gera mensagem de sistema).
  await ChatService.adicionarAoGrupo(grupoTrabalho.id, usuarios.ana.id, usuarios.diego.id);

  await ChatService.enviarMensagem({
    conversaId: grupoTrabalho.id,
    autorId: usuarios.diego.id,
    conteudo: 'Obrigado pelo convite! Posso ajudar nos testes.'
  });

  // --- Grupo de amigos ------------------------------------------------------
  const { conversa: grupoAmigos } = await ChatService.criarGrupo({
    nome: 'Amigos da faculdade',
    descricao: 'Assuntos fora da aula',
    icone: '🎉',
    criadoPor: usuarios.diego.id,
    participantes: [usuarios.eva.id, usuarios.bruno.id]
  });

  await ChatService.enviarMensagem({
    conversaId: grupoAmigos.id,
    autorId: usuarios.eva.id,
    conteudo: 'Alguem vai na apresentacao dos projetos sexta?'
  });

  await ChatService.enviarMensagem({
    conversaId: grupoAmigos.id,
    autorId: usuarios.bruno.id,
    conteudo: 'Eu vou! Podemos ir juntos.'
  });

  // --- Reacoes --------------------------------------------------------------
  await ChatService.reagir(resposta.id, usuarios.ana.id, '👍');
  await ChatService.reagir(mensagemGrupo.id, usuarios.ana.id, '🔥');
  await ChatService.reagir(mensagemGrupo.id, usuarios.carla.id, '🔥');
  await ChatService.reagir(mensagemGrupo.id, usuarios.diego.id, '👏');
  await ChatService.reagir(mensagemFixada.id, usuarios.bruno.id, '❤️');

  // --- Leituras -------------------------------------------------------------
  // Bruno le a conversa com Ana; as demais ficam como nao lidas.
  await Mensagem.marcarConversaComoLida(privadaAnaBruno.id, usuarios.bruno.id);

  return {
    usuarios: Object.fromEntries(Object.entries(usuarios).map(([chave, usuario]) => [chave, usuario.id])),
    conversas: {
      privadaAnaBruno: privadaAnaBruno.id,
      privadaAnaCarla: privadaAnaCarla.id,
      grupoTrabalho: grupoTrabalho.id,
      grupoAmigos: grupoAmigos.id
    },
    mensagens: { primeira: primeira.id, resposta: resposta.id, fixada: mensagemFixada.id, grupo: mensagemGrupo.id }
  };
}

module.exports = { popularBase };

// Executa somente quando o arquivo e chamado diretamente (npm run seed).
if (require.main === module) {
  Aplicacao.executar('seed', async () => {
    Terminal.titulo('ZapChat - carga de dados de exemplo');

    const criados = await popularBase();

    Terminal.secao('Documentos criados');
    Terminal.tabela(await Manutencao.contarDocumentos());

    Terminal.secao('Usuarios cadastrados (senha padrao: senha123)');
    Terminal.tabela((await Usuario.listar({}, { ordenar: { nome: 1 } })).map((usuario) => usuario.paraJSON()));

    Terminal.secao('Conversas criadas');
    for (const conversa of await Conversa.listar()) Terminal.item(conversa.paraTexto());

    Terminal.secao('Estatisticas');
    Terminal.item(`Mensagens: ${await Mensagem.contar()}`);
    Terminal.item(`Reacoes: ${await Reacao.contar()}`);
    Terminal.item(`Contatos: ${await Contato.contar()}`);
    Terminal.item(`Nao lidas de Ana: ${await Mensagem.contarNaoLidas(criados.usuarios.ana)}`);

    Terminal.sucesso('Dados de exemplo carregados. Execute "npm start" para abrir o menu.');
  });
}

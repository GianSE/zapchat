'use strict';

/**
 * Rotas da API JSON (recurso extra do projeto).
 *
 * Cada rota apenas chama as classes de entidade ou o ChatService e devolve o
 * resultado. Toda validacao, regra de negocio, tratamento de excecao e registro
 * em log continuam nas classes do nucleo da aplicacao.
 *
 * Formato de cada rota:
 *   { metodo, caminho, status?, acao({ parametros, consulta, corpo }) }
 *
 * Trechos do caminho iniciados por ":" sao parametros (ex.: "/api/usuarios/:id").
 */

const { Usuario, Contato, Conversa, Mensagem, Reacao } = require('../src/models');
const ChatService = require('../src/services/ChatService');
const Manutencao = require('../src/database/Manutencao');

/**
 * Converte uma entidade (ou lista de entidades) para JSON.
 *
 * @param {import('../src/models/Modelo')|Array} valor Entidade ou lista.
 * @returns {object|object[]}
 */
const json = (valor) => (Array.isArray(valor) ? valor.map((item) => item.paraJSON()) : valor.paraJSON());

module.exports = [
  // ---------------------------------------------------------------------------
  // Sessao
  // ---------------------------------------------------------------------------
  {
    metodo: 'POST',
    caminho: '/api/sessao',
    acao: async ({ corpo }) => json(await Usuario.autenticar(corpo.email, corpo.senha))
  },
  {
    metodo: 'POST',
    caminho: '/api/sessao/encerrar',
    acao: async ({ corpo }) => json(await Usuario.alterarStatus(corpo.usuarioId, 'offline'))
  },

  // ---------------------------------------------------------------------------
  // Usuarios
  // ---------------------------------------------------------------------------
  {
    metodo: 'GET',
    caminho: '/api/usuarios',
    acao: async ({ consulta }) => {
      const usuarios = consulta.termo
        ? await Usuario.pesquisar(consulta.termo)
        : await Usuario.listar({}, { ordenar: { nome: 1 } });

      return json(usuarios);
    }
  },
  {
    metodo: 'POST',
    caminho: '/api/usuarios',
    status: 201,
    acao: async ({ corpo }) => json(await ChatService.cadastrarUsuario(corpo))
  },
  {
    metodo: 'GET',
    caminho: '/api/usuarios/:id',
    acao: async ({ parametros }) => json(await Usuario.obterPorId(parametros.id))
  },
  {
    metodo: 'PATCH',
    caminho: '/api/usuarios/:id',
    acao: async ({ parametros, corpo }) => json(await Usuario.atualizarPorId(parametros.id, corpo))
  },
  {
    metodo: 'DELETE',
    caminho: '/api/usuarios/:id',
    acao: async ({ parametros }) => ChatService.excluirUsuario(parametros.id)
  },
  {
    metodo: 'POST',
    caminho: '/api/usuarios/:id/status',
    acao: async ({ parametros, corpo }) => json(await Usuario.alterarStatus(parametros.id, corpo.status))
  },
  {
    metodo: 'POST',
    caminho: '/api/usuarios/:id/senha',
    acao: async ({ parametros, corpo }) =>
      json(await Usuario.alterarSenha(parametros.id, corpo.senhaAtual, corpo.novaSenha))
  },
  {
    metodo: 'GET',
    caminho: '/api/usuarios/:id/painel',
    acao: async ({ parametros }) => {
      const painel = await ChatService.painelDoUsuario(parametros.id);

      return { ...painel, usuario: json(painel.usuario) };
    }
  },
  {
    metodo: 'GET',
    caminho: '/api/usuarios/:id/contatos',
    acao: async ({ parametros, consulta }) =>
      Contato.listarAgenda(parametros.id, {
        somenteFavoritos: consulta.favoritos === 'true',
        incluirBloqueados: consulta.bloqueados !== 'false'
      })
  },
  {
    metodo: 'GET',
    caminho: '/api/usuarios/:id/conversas',
    acao: async ({ parametros }) => Conversa.listarPainelDoUsuario(parametros.id)
  },

  // ---------------------------------------------------------------------------
  // Contatos
  // ---------------------------------------------------------------------------
  {
    metodo: 'POST',
    caminho: '/api/contatos',
    status: 201,
    acao: async ({ corpo }) => {
      const { usuarioId, contatoId, ...dados } = corpo;

      return json(await ChatService.adicionarContato(usuarioId, contatoId, dados));
    }
  },
  {
    metodo: 'PATCH',
    caminho: '/api/contatos/:id',
    acao: async ({ parametros, corpo }) => json(await Contato.atualizarPorId(parametros.id, corpo))
  },
  {
    metodo: 'DELETE',
    caminho: '/api/contatos/:usuarioId/:contatoId',
    acao: async ({ parametros }) => ({
      removido: await Contato.remover(parametros.usuarioId, parametros.contatoId)
    })
  },

  // ---------------------------------------------------------------------------
  // Conversas
  // ---------------------------------------------------------------------------
  {
    metodo: 'POST',
    caminho: '/api/conversas/privada',
    status: 201,
    acao: async ({ corpo }) => json(await ChatService.abrirConversaPrivada(corpo.remetenteId, corpo.destinatarioId))
  },
  {
    metodo: 'POST',
    caminho: '/api/conversas/grupo',
    status: 201,
    acao: async ({ corpo }) => {
      const { conversa, aviso } = await ChatService.criarGrupo(corpo);

      return { conversa: json(conversa), aviso: json(aviso) };
    }
  },
  {
    metodo: 'PATCH',
    caminho: '/api/conversas/:id',
    acao: async ({ parametros, corpo }) => json(await Conversa.renomearGrupo(parametros.id, corpo.nome))
  },
  {
    metodo: 'DELETE',
    caminho: '/api/conversas/:id',
    acao: async ({ parametros, consulta }) => ChatService.excluirConversa(parametros.id, consulta.solicitanteId)
  },
  {
    metodo: 'GET',
    caminho: '/api/conversas/:id/mensagens',
    acao: async ({ parametros, consulta }) => {
      const resultado = await ChatService.abrirConversa(parametros.id, consulta.usuarioId, {
        limite: Number(consulta.limite) || 50
      });

      return { ...resultado, conversa: json(resultado.conversa) };
    }
  },
  {
    metodo: 'POST',
    caminho: '/api/conversas/:id/participantes',
    status: 201,
    acao: async ({ parametros, corpo }) => {
      const { conversa, aviso } = await ChatService.adicionarAoGrupo(
        parametros.id,
        corpo.administradorId,
        corpo.usuarioId
      );

      return { conversa: json(conversa), aviso: json(aviso) };
    }
  },
  {
    metodo: 'DELETE',
    caminho: '/api/conversas/:id/participantes/:usuarioId',
    acao: async ({ parametros }) => json(await Conversa.removerParticipante(parametros.id, parametros.usuarioId))
  },
  {
    metodo: 'POST',
    caminho: '/api/conversas/:id/administradores',
    acao: async ({ parametros, corpo }) => json(await Conversa.promoverAdministrador(parametros.id, corpo.usuarioId))
  },

  // ---------------------------------------------------------------------------
  // Mensagens
  // ---------------------------------------------------------------------------
  {
    metodo: 'GET',
    caminho: '/api/mensagens',
    acao: async ({ consulta }) =>
      json(
        await Mensagem.pesquisar(consulta.termo, {
          conversaId: consulta.conversaId || null,
          autorId: consulta.autorId || null,
          limite: Number(consulta.limite) || 20
        })
      )
  },
  {
    metodo: 'POST',
    caminho: '/api/mensagens',
    status: 201,
    acao: async ({ corpo }) => {
      const { mensagem, conversa } = await ChatService.enviarMensagem(corpo);

      return { mensagem: json(mensagem), conversa: json(conversa) };
    }
  },
  {
    metodo: 'PATCH',
    caminho: '/api/mensagens/:id',
    acao: async ({ parametros, corpo }) => json(await Mensagem.editar(parametros.id, corpo.autorId, corpo.conteudo))
  },
  {
    metodo: 'DELETE',
    caminho: '/api/mensagens/:id',
    acao: async ({ parametros, consulta }) => {
      // modo=definitiva remove o documento; o padrao apaga apenas para todos.
      if (consulta.modo === 'definitiva') {
        return ChatService.excluirMensagemDefinitivamente(parametros.id, consulta.autorId);
      }

      return json(await Mensagem.excluirParaTodos(parametros.id, consulta.autorId));
    }
  },
  {
    metodo: 'POST',
    caminho: '/api/mensagens/:id/reacoes',
    acao: async ({ parametros, corpo }) => ChatService.reagir(parametros.id, corpo.usuarioId, corpo.emoji)
  },
  {
    metodo: 'POST',
    caminho: '/api/mensagens/:id/fixar',
    acao: async ({ parametros }) => json(await Mensagem.alternarFixada(parametros.id))
  },

  // ---------------------------------------------------------------------------
  // Relatorios e apoio a interface
  // ---------------------------------------------------------------------------
  {
    metodo: 'GET',
    caminho: '/api/estatisticas',
    acao: async () => ChatService.estatisticasGerais()
  },
  {
    metodo: 'GET',
    caminho: '/api/colecoes',
    acao: async () => Manutencao.contarDocumentos()
  },
  {
    metodo: 'GET',
    caminho: '/api/dominios',
    acao: async () => ({
      statusUsuario: Usuario.statusValidos,
      tiposConversa: Conversa.tiposValidos,
      tiposMensagem: Mensagem.tiposValidos,
      emojis: Reacao.emojisValidos
    })
  }
];

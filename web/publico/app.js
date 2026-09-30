'use strict';

/**
 * ZapChat - interface de teste (JavaScript puro, sem frameworks).
 *
 * Todas as operacoes sao feitas por chamadas fetch a API JSON do projeto, que
 * por sua vez executa as mesmas classes de entidade usadas pelo menu do
 * terminal. Nenhuma regra de negocio e reimplementada aqui.
 */

/** Estado da tela. */
const estado = {
  usuario: null,
  conversaId: null,
  conversaAtual: null,
  dominios: null,
  conversas: [],
  contatos: [],
  naoLidas: new Map()
};

/** Chave usada para manter a sessao ao recarregar a pagina. */
const CHAVE_SESSAO = 'zapchat.usuarioId';

/** Intervalo (ms) de atualizacao automatica das conversas. */
const INTERVALO_ATUALIZACAO = 5000;

// =============================================================================
// Utilidades
// =============================================================================

const $ = (seletor) => document.querySelector(seletor);
const $$ = (seletor) => Array.from(document.querySelectorAll(seletor));

/**
 * Escapa o texto antes de inseri-lo no HTML.
 *
 * @param {*} texto Valor a escapar.
 * @returns {string}
 */
function escapar(texto) {
  return String(texto ?? '').replace(
    /[&<>"']/g,
    (caractere) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caractere]
  );
}

/**
 * Formata a hora de uma mensagem.
 *
 * @param {string|Date} valor Data recebida da API.
 * @returns {string}
 */
function horario(valor) {
  if (!valor) return '';

  return new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formata data e hora completas.
 *
 * @param {string|Date} valor Data recebida da API.
 * @returns {string}
 */
function dataHora(valor) {
  return valor ? new Date(valor).toLocaleString('pt-BR') : '-';
}

/**
 * Executa uma requisicao na API do projeto.
 *
 * @param {string} caminho Caminho da rota (ex.: "/api/usuarios").
 * @param {object} [opcoes]
 * @param {string} [opcoes.metodo] Metodo HTTP.
 * @param {object} [opcoes.corpo] Corpo JSON.
 * @returns {Promise<*>} Conteudo da resposta.
 * @throws {Error} Erro com "tipo" e "detalhes" vindos da API.
 */
async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const erro = new Error(dados.erro || `Falha na requisicao (${resposta.status})`);

    erro.tipo = dados.tipo || 'Erro';
    erro.detalhes = Array.isArray(dados.detalhes) ? dados.detalhes : [];
    erro.operacao = dados.operacao;

    throw erro;
  }

  return dados;
}

/**
 * Exibe um aviso no canto da tela.
 *
 * @param {string} mensagem Texto principal.
 * @param {object} [opcoes]
 * @param {'sucesso'|'erro'|'alerta'} [opcoes.tipo] Estilo do aviso.
 * @param {string} [opcoes.titulo] Titulo em destaque.
 * @param {string[]} [opcoes.detalhes] Lista de detalhes (ex.: campos invalidos).
 * @returns {void}
 */
function avisar(mensagem, { tipo = 'sucesso', titulo = null, detalhes = [] } = {}) {
  const caixa = document.createElement('div');
  caixa.className = `aviso aviso-${tipo}`;

  const lista = detalhes.length > 0 ? `<ul>${detalhes.map((d) => `<li>${escapar(d)}</li>`).join('')}</ul>` : '';

  caixa.innerHTML = `${titulo ? `<strong>${escapar(titulo)}</strong>` : ''}${escapar(mensagem)}${lista}`;

  $('#avisos').append(caixa);

  setTimeout(() => caixa.remove(), detalhes.length > 0 ? 9000 : 4500);
}

/**
 * Executa uma acao tratando qualquer falha com um aviso na tela.
 *
 * @param {() => Promise<void>} acao Acao executada.
 * @returns {Promise<void>}
 */
async function executar(acao) {
  try {
    await acao();
  } catch (erro) {
    avisar(erro.message, { tipo: 'erro', titulo: erro.tipo, detalhes: erro.detalhes });
  }
}

// =============================================================================
// Caixa de dialogo reutilizavel
// =============================================================================

/**
 * Abre um formulario em janela modal.
 *
 * @param {object} configuracao
 * @param {string} configuracao.titulo Titulo da janela.
 * @param {Array<object>} configuracao.campos Campos do formulario.
 * @param {string} [configuracao.confirmar] Texto do botao de confirmacao.
 * @returns {Promise<object|null>} Valores informados ou null se cancelado.
 */
function abrirFormulario({ titulo, campos, confirmar = 'Confirmar' }) {
  const modal = $('#modal');
  const area = $('#modal-campos');

  $('#modal-titulo').textContent = titulo;
  $('#modal-confirmar').textContent = confirmar;
  area.innerHTML = '';

  for (const campo of campos) {
    if (campo.tipo === 'aviso') {
      const aviso = document.createElement('p');
      aviso.className = 'legenda';
      aviso.textContent = campo.etiqueta;
      area.append(aviso);
      continue;
    }

    if (campo.tipo === 'checkbox') {
      const rotulo = document.createElement('label');
      rotulo.className = 'marcavel';
      rotulo.innerHTML = `<input type="checkbox" name="${escapar(campo.nome)}" ${campo.valor ? 'checked' : ''} /> ${escapar(campo.etiqueta)}`;
      area.append(rotulo);
      continue;
    }

    const rotulo = document.createElement('label');
    rotulo.textContent = campo.etiqueta;

    if (campo.tipo === 'select') {
      const seletor = document.createElement('select');
      seletor.name = campo.nome;
      if (campo.multiplo) seletor.multiple = true;

      for (const opcao of campo.opcoes ?? []) {
        const item = document.createElement('option');
        item.value = opcao.valor;
        item.textContent = opcao.texto;
        if (opcao.valor === campo.valor) item.selected = true;
        seletor.append(item);
      }

      rotulo.append(seletor);
    } else {
      const entrada = document.createElement('input');
      entrada.type = campo.tipo ?? 'text';
      entrada.name = campo.nome;
      entrada.value = campo.valor ?? '';
      entrada.placeholder = campo.exemplo ?? '';
      if (campo.obrigatorio) entrada.required = true;

      rotulo.append(entrada);
    }

    area.append(rotulo);
  }

  modal.showModal();
  $('#modal-campos').querySelector('input, select')?.focus();

  return new Promise((resolver) => {
    const formulario = $('#modal-form');

    const finalizar = (valores) => {
      formulario.onsubmit = null;
      $('#modal-cancelar').onclick = null;
      modal.close();
      resolver(valores);
    };

    formulario.onsubmit = (evento) => {
      evento.preventDefault();

      const dados = new FormData(formulario);
      const valores = {};

      for (const campo of campos) {
        if (campo.tipo === 'aviso') continue;
        if (campo.tipo === 'checkbox') valores[campo.nome] = dados.has(campo.nome);
        else if (campo.multiplo) valores[campo.nome] = dados.getAll(campo.nome);
        else valores[campo.nome] = String(dados.get(campo.nome) ?? '').trim();
      }

      finalizar(valores);
    };

    $('#modal-cancelar').onclick = () => finalizar(null);
  });
}

/**
 * Pede uma confirmacao simples.
 *
 * @param {string} texto Pergunta exibida.
 * @param {string} [confirmar] Texto do botao.
 * @returns {Promise<boolean>}
 */
async function confirmar(texto, confirmar = 'Confirmar') {
  const resposta = await abrirFormulario({
    titulo: 'Confirmação',
    campos: [{ tipo: 'aviso', etiqueta: texto }],
    confirmar
  });

  return resposta !== null;
}

// =============================================================================
// Sessao
// =============================================================================

/**
 * Autentica o usuario e abre a tela principal.
 *
 * @param {string} email E-mail informado.
 * @param {string} senha Senha informada.
 * @returns {Promise<void>}
 */
async function entrar(email, senha) {
  const usuario = await api('/api/sessao', { metodo: 'POST', corpo: { email, senha } });

  await iniciarSessao(usuario);
  avisar(`Bem-vindo(a), ${usuario.nomeExibicao}!`);
}

/**
 * Configura a tela principal para o usuario informado.
 *
 * @param {object} usuario Usuario autenticado.
 * @returns {Promise<void>}
 */
async function iniciarSessao(usuario) {
  estado.usuario = usuario;

  try {
    sessionStorage.setItem(CHAVE_SESSAO, usuario._id);
  } catch {
    /* navegacao privada: a sessao apenas nao sera mantida ao recarregar */
  }

  estado.dominios = estado.dominios ?? (await api('/api/dominios'));

  $('#tela-login').classList.add('oculto');
  $('#tela-app').classList.remove('oculto');

  $('#perfil-avatar').textContent = usuario.avatar ?? '👤';
  $('#perfil-nome').textContent = usuario.nomeExibicao ?? usuario.nome;

  preencherSeletor($('#seletor-status'), estado.dominios.statusUsuario, usuario.status);
  preencherSeletor($('#seletor-tipo'), estado.dominios.tiposMensagem.filter((t) => t !== 'sistema'), 'texto');

  await atualizar();
}

/**
 * Encerra a sessao e volta para a tela de acesso.
 * @returns {Promise<void>}
 */
async function sair() {
  if (estado.usuario) {
    await api('/api/sessao/encerrar', { metodo: 'POST', corpo: { usuarioId: estado.usuario._id } });
  }

  try {
    sessionStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* nada a fazer */
  }

  estado.usuario = null;
  estado.conversaId = null;

  $('#tela-app').classList.add('oculto');
  $('#tela-login').classList.remove('oculto');
}

/**
 * Preenche um elemento select.
 *
 * @param {HTMLSelectElement} seletor Elemento alvo.
 * @param {string[]} valores Opcoes disponiveis.
 * @param {string} selecionado Valor selecionado.
 * @returns {void}
 */
function preencherSeletor(seletor, valores, selecionado) {
  seletor.innerHTML = valores
    .map((valor) => `<option value="${escapar(valor)}" ${valor === selecionado ? 'selected' : ''}>${escapar(valor)}</option>`)
    .join('');
}

// =============================================================================
// Painel: conversas, contatos e mensagens
// =============================================================================

/**
 * Recarrega o painel do usuario (conversas, nao lidas e contatos) e, quando
 * houver conversa aberta, tambem o histórico de mensagens.
 *
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.silencioso] Nao exibe avisos de erro (usado no
 *        recarregamento automatico).
 * @returns {Promise<void>}
 */
async function atualizar({ silencioso = false } = {}) {
  if (!estado.usuario) return;

  try {
    const painel = await api(`/api/usuarios/${estado.usuario._id}/painel`);

    estado.usuario = painel.usuario;
    estado.conversas = painel.conversas;
    estado.contatos = painel.agenda;
    estado.naoLidas = new Map(painel.naoLidas.map((item) => [String(item.conversaId), item.naoLidas]));

    desenharConversas();
    desenharContatos();

    if (estado.conversaId) await desenharMensagens();
  } catch (erro) {
    if (!silencioso) avisar(erro.message, { tipo: 'erro', titulo: erro.tipo, detalhes: erro.detalhes });
  }
}

/**
 * Desenha a lista de conversas na barra lateral.
 * @returns {void}
 */
function desenharConversas() {
  const lista = $('#lista-conversas');

  if (estado.conversas.length === 0) {
    lista.innerHTML = '<li class="vazio">Nenhuma conversa ainda.<br />Use "+ Conversa" ou "+ Grupo".</li>';
    return;
  }

  lista.innerHTML = estado.conversas
    .map((conversa) => {
      const naoLidas = estado.naoLidas.get(String(conversa._id)) ?? 0;
      const selo = naoLidas > 0 ? `<span class="selo">${naoLidas}</span>` : '';
      const previa = conversa.ultimaMensagem?.texto ?? 'Sem mensagens';
      const autor = conversa.ultimaMensagem?.autorNome ? `${escapar(conversa.ultimaMensagem.autorNome)}: ` : '';

      return `
        <li class="item ${conversa._id === estado.conversaId ? 'ativo' : ''}" data-conversa="${escapar(conversa._id)}">
          <div class="item-linha">
            <span class="item-titulo">${escapar(conversa.icone)} ${escapar(conversa.titulo)}</span>
            ${selo}
          </div>
          <p class="item-previa">${autor}${escapar(previa)}</p>
          <p class="item-previa">${conversa.totalMensagens} mensagem(ns) · ${escapar(conversa.tipo)}</p>
        </li>`;
    })
    .join('');

  for (const item of $$('#lista-conversas .item')) {
    item.onclick = () => executar(() => abrirConversa(item.dataset.conversa));
  }
}

/**
 * Desenha a agenda de contatos.
 * @returns {void}
 */
function desenharContatos() {
  const lista = $('#lista-contatos');

  if (estado.contatos.length === 0) {
    lista.innerHTML = '<li class="vazio">Nenhum contato na agenda.</li>';
    return;
  }

  lista.innerHTML = estado.contatos
    .map(
      (contato) => `
      <li class="item ${contato.bloqueado ? 'contato-bloqueado' : ''}" data-contato="${escapar(contato._id)}" data-usuario="${escapar(contato.contatoId)}">
        <div class="item-linha">
          <span class="item-titulo">${escapar(contato.avatar)} ${escapar(contato.exibicao)}</span>
          <span class="acoes-item">
            <button type="button" class="botao botao-texto" data-acao="conversar" title="Abrir conversa">💬</button>
            <button type="button" class="botao botao-texto" data-acao="favorito" title="${contato.favorito ? 'Desfavoritar' : 'Favoritar'}">${contato.favorito ? '⭐' : '☆'}</button>
            <button type="button" class="botao botao-texto" data-acao="bloqueio" title="${contato.bloqueado ? 'Desbloquear' : 'Bloquear'}">${contato.bloqueado ? '🚫' : '🔓'}</button>
            <button type="button" class="botao botao-texto botao-perigo" data-acao="remover" title="Remover">🗑️</button>
          </span>
        </div>
        <p class="item-previa">${escapar(contato.email)} · ${escapar(contato.status)}${contato.bloqueado ? ' · bloqueado' : ''}</p>
      </li>`
    )
    .join('');

  for (const item of $$('#lista-contatos .item')) {
    const contatoId = item.dataset.contato;
    const usuarioId = item.dataset.usuario;
    const dados = estado.contatos.find((contato) => contato._id === contatoId);

    item.querySelector('[data-acao="conversar"]').onclick = () =>
      executar(async () => {
        const conversa = await api('/api/conversas/privada', {
          metodo: 'POST',
          corpo: { remetenteId: estado.usuario._id, destinatarioId: usuarioId }
        });

        trocarAba('conversas');
        await atualizar();
        await abrirConversa(conversa._id);
      });

    item.querySelector('[data-acao="favorito"]').onclick = () =>
      executar(async () => {
        await api(`/api/contatos/${contatoId}`, { metodo: 'PATCH', corpo: { favorito: !dados.favorito } });
        await atualizar();
      });

    item.querySelector('[data-acao="bloqueio"]').onclick = () =>
      executar(async () => {
        await api(`/api/contatos/${contatoId}`, { metodo: 'PATCH', corpo: { bloqueado: !dados.bloqueado } });
        avisar(dados.bloqueado ? 'Contato desbloqueado.' : 'Contato bloqueado.');
        await atualizar();
      });

    item.querySelector('[data-acao="remover"]').onclick = () =>
      executar(async () => {
        if (!(await confirmar(`Remover ${dados.exibicao} da agenda?`, 'Remover'))) return;

        await api(`/api/contatos/${estado.usuario._id}/${usuarioId}`, { metodo: 'DELETE' });
        avisar('Contato removido.');
        await atualizar();
      });
  }
}

/**
 * Abre uma conversa e carrega o historico.
 *
 * @param {string} conversaId Identificador da conversa.
 * @returns {Promise<void>}
 */
async function abrirConversa(conversaId) {
  estado.conversaId = conversaId;

  $('#form-mensagem').classList.remove('oculto');
  $('#chat-acoes').classList.remove('oculto');

  await atualizar();
}

/**
 * Carrega e desenha as mensagens da conversa aberta.
 * @returns {Promise<void>}
 */
async function desenharMensagens() {
  const resultado = await api(`/api/conversas/${estado.conversaId}/mensagens?usuarioId=${estado.usuario._id}`);

  estado.conversaAtual = resultado.conversa;

  const conversa = estado.conversas.find((item) => item._id === estado.conversaId);
  const titulo = conversa?.titulo ?? (resultado.conversa.nome || 'Conversa privada');

  $('#chat-titulo').textContent = `${resultado.conversa.icone} ${titulo}`;
  $('#chat-subtitulo').textContent =
    `${resultado.conversa.tipo} · ${resultado.conversa.participantes.length} participante(s) · ` +
    `${resultado.conversa.totalMensagens} mensagem(ns)`;

  // Somente grupos possuem participantes e nome editaveis.
  const ehGrupo = resultado.conversa.tipo === 'grupo';
  $('#botao-add-participante').classList.toggle('oculto', !ehGrupo);
  $('#botao-renomear').classList.toggle('oculto', !ehGrupo);

  const lista = $('#lista-mensagens');
  const estavaNoFim = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;

  if (resultado.mensagens.length === 0) {
    lista.innerHTML = '<li class="vazio">Nenhuma mensagem nesta conversa ainda.</li>';
    return;
  }

  lista.innerHTML = resultado.mensagens.map((mensagem) => desenharMensagem(mensagem)).join('');

  for (const item of $$('#lista-mensagens .mensagem')) ligarAcoesDaMensagem(item);

  if (estavaNoFim) lista.scrollTop = lista.scrollHeight;
}

/**
 * Monta o HTML de uma mensagem.
 *
 * @param {object} mensagem Mensagem retornada pela API.
 * @returns {string}
 */
function desenharMensagem(mensagem) {
  if (mensagem.tipo === 'sistema') {
    return `<li class="mensagem sistema">${escapar(mensagem.conteudo)}</li>`;
  }

  const minha = String(mensagem.autorId) === estado.usuario._id;

  // Agrupa as reacoes iguais: ["🔥","🔥"] -> "🔥 2"
  const contagem = new Map();
  for (const emoji of mensagem.reacoes ?? []) contagem.set(emoji, (contagem.get(emoji) ?? 0) + 1);

  const reacoes = [...contagem.entries()]
    .map(([emoji, total]) => `<span class="reacao">${escapar(emoji)} ${total}</span>`)
    .join('');

  const citacao = mensagem.respondendo
    ? `<p class="mensagem-citacao">↳ ${escapar(mensagem.respondendo)}</p>`
    : '';

  const anexo = mensagem.anexo
    ? `<span class="mensagem-anexo">📎 ${escapar(mensagem.anexo.nome)} (${escapar(mensagem.tipo)}, ${escapar(mensagem.anexo.tamanhoKb ?? '?')} KB)</span>`
    : '';

  const acoesDoAutor = minha && !mensagem.excluida
    ? `<button type="button" class="botao botao-texto" data-acao="editar" title="Editar">✏️</button>
       <button type="button" class="botao botao-texto botao-perigo" data-acao="apagar" title="Apagar">🗑️</button>`
    : '';

  const acoes = mensagem.excluida
    ? ''
    : `<span class="mensagem-acoes">
         <button type="button" class="botao botao-texto" data-acao="reagir" title="Reagir">😀</button>
         <button type="button" class="botao botao-texto" data-acao="responder" title="Responder">↩️</button>
         <button type="button" class="botao botao-texto" data-acao="fixar" title="Fixar">📌</button>
         ${acoesDoAutor}
       </span>`;

  return `
    <li class="mensagem ${minha ? 'minha' : ''} ${mensagem.excluida ? 'excluida' : ''}" data-mensagem="${escapar(mensagem._id)}">
      ${minha ? '' : `<div class="mensagem-autor">${escapar(mensagem.autorAvatar)} ${escapar(mensagem.autorNome)}</div>`}
      ${citacao}
      <p class="mensagem-texto">${escapar(mensagem.conteudo)}</p>
      ${anexo}
      <div class="mensagem-pe">
        <span>${horario(mensagem.enviadaEm)}</span>
        ${mensagem.editada ? '<span>(editada)</span>' : ''}
        ${mensagem.fixada ? '<span>📌</span>' : ''}
        <span title="Leituras">👁 ${mensagem.totalLeituras}</span>
        <span class="reacoes">${reacoes}</span>
        ${acoes}
      </div>
    </li>`;
}

/**
 * Liga os botoes de acao de uma mensagem.
 *
 * @param {HTMLElement} item Elemento da mensagem.
 * @returns {void}
 */
function ligarAcoesDaMensagem(item) {
  const mensagemId = item.dataset.mensagem;
  const texto = item.querySelector('.mensagem-texto')?.textContent ?? '';

  const acao = (nome, funcao) => {
    const botao = item.querySelector(`[data-acao="${nome}"]`);
    if (botao) botao.onclick = () => executar(funcao);
  };

  acao('reagir', async () => {
    const resposta = await abrirFormulario({
      titulo: 'Reagir à mensagem',
      confirmar: 'Reagir',
      campos: [
        { tipo: 'aviso', etiqueta: 'Reagir novamente com o mesmo emoji remove a reação.' },
        {
          nome: 'emoji',
          etiqueta: 'Emoji',
          tipo: 'select',
          opcoes: estado.dominios.emojis.map((emoji) => ({ valor: emoji, texto: emoji }))
        }
      ]
    });

    if (!resposta) return;

    const { acao: resultado } = await api(`/api/mensagens/${mensagemId}/reacoes`, {
      metodo: 'POST',
      corpo: { usuarioId: estado.usuario._id, emoji: resposta.emoji }
    });

    avisar(`Reação ${resultado}.`);
    await desenharMensagens();
  });

  acao('responder', async () => {
    const resposta = await abrirFormulario({
      titulo: 'Responder',
      confirmar: 'Enviar',
      campos: [
        { tipo: 'aviso', etiqueta: `Respondendo: "${texto}"` },
        { nome: 'conteudo', etiqueta: 'Sua resposta', obrigatorio: true }
      ]
    });

    if (!resposta) return;

    await api('/api/mensagens', {
      metodo: 'POST',
      corpo: {
        conversaId: estado.conversaId,
        autorId: estado.usuario._id,
        conteudo: resposta.conteudo,
        respostaA: mensagemId
      }
    });

    await atualizar();
  });

  acao('fixar', async () => {
    await api(`/api/mensagens/${mensagemId}/fixar`, { metodo: 'POST' });
    await desenharMensagens();
  });

  acao('editar', async () => {
    const resposta = await abrirFormulario({
      titulo: 'Editar mensagem',
      confirmar: 'Salvar',
      campos: [{ nome: 'conteudo', etiqueta: 'Conteúdo', valor: texto, obrigatorio: true }]
    });

    if (!resposta) return;

    await api(`/api/mensagens/${mensagemId}`, {
      metodo: 'PATCH',
      corpo: { autorId: estado.usuario._id, conteudo: resposta.conteudo }
    });

    avisar('Mensagem editada.');
    await desenharMensagens();
  });

  acao('apagar', async () => {
    const resposta = await abrirFormulario({
      titulo: 'Apagar mensagem',
      confirmar: 'Apagar',
      campos: [
        {
          nome: 'modo',
          etiqueta: 'Forma de exclusão',
          tipo: 'select',
          opcoes: [
            { valor: 'todos', texto: 'Apagar para todos (exclusão lógica, mantém no histórico)' },
            { valor: 'definitiva', texto: 'Excluir definitivamente (remove o documento do MongoDB)' }
          ]
        }
      ]
    });

    if (!resposta) return;

    await api(`/api/mensagens/${mensagemId}?autorId=${estado.usuario._id}&modo=${resposta.modo}`, {
      metodo: 'DELETE'
    });

    avisar(resposta.modo === 'definitiva' ? 'Mensagem excluída do banco.' : 'Mensagem apagada para todos.');
    await atualizar();
  });
}

// =============================================================================
// Acoes de conversas e grupos
// =============================================================================

/**
 * Lista os usuarios cadastrados, exceto o usuario logado.
 * @returns {Promise<object[]>}
 */
async function outrosUsuarios() {
  const usuarios = await api('/api/usuarios');

  return usuarios.filter((usuario) => usuario._id !== estado.usuario._id);
}

/**
 * Abre uma conversa privada com outro usuario.
 * @returns {Promise<void>}
 */
async function novaConversa() {
  const usuarios = await outrosUsuarios();

  if (usuarios.length === 0) {
    avisar('Cadastre outro usuário primeiro.', { tipo: 'alerta' });
    return;
  }

  const resposta = await abrirFormulario({
    titulo: 'Nova conversa privada',
    confirmar: 'Abrir',
    campos: [
      {
        nome: 'destinatarioId',
        etiqueta: 'Conversar com',
        tipo: 'select',
        opcoes: usuarios.map((u) => ({ valor: u._id, texto: `${u.avatar} ${u.nome} (${u.email})` }))
      }
    ]
  });

  if (!resposta) return;

  const conversa = await api('/api/conversas/privada', {
    metodo: 'POST',
    corpo: { remetenteId: estado.usuario._id, destinatarioId: resposta.destinatarioId }
  });

  await atualizar();
  await abrirConversa(conversa._id);
}

/**
 * Cria um grupo com os participantes escolhidos.
 * @returns {Promise<void>}
 */
async function novoGrupo() {
  const usuarios = await outrosUsuarios();

  const resposta = await abrirFormulario({
    titulo: 'Novo grupo',
    confirmar: 'Criar grupo',
    campos: [
      { nome: 'nome', etiqueta: 'Nome do grupo', obrigatorio: true, exemplo: 'Trabalho de Web Back-End' },
      { nome: 'descricao', etiqueta: 'Descrição (opcional)' },
      { nome: 'icone', etiqueta: 'Emoji', valor: '👥' },
      {
        nome: 'participantes',
        etiqueta: 'Participantes (Ctrl para marcar mais de um)',
        tipo: 'select',
        multiplo: true,
        opcoes: usuarios.map((u) => ({ valor: u._id, texto: `${u.avatar} ${u.nome}` }))
      }
    ]
  });

  if (!resposta) return;

  const { conversa } = await api('/api/conversas/grupo', {
    metodo: 'POST',
    corpo: {
      nome: resposta.nome,
      descricao: resposta.descricao || null,
      icone: resposta.icone || '👥',
      criadoPor: estado.usuario._id,
      participantes: resposta.participantes
    }
  });

  avisar(`Grupo "${conversa.nome}" criado.`);

  await atualizar();
  await abrirConversa(conversa._id);
}

/**
 * Adiciona um participante ao grupo aberto.
 * @returns {Promise<void>}
 */
async function adicionarParticipante() {
  const participantes = new Set((estado.conversaAtual?.participantes ?? []).map(String));
  const usuarios = (await outrosUsuarios()).filter((usuario) => !participantes.has(usuario._id));

  if (usuarios.length === 0) {
    avisar('Todos os usuários cadastrados já participam deste grupo.', { tipo: 'alerta' });
    return;
  }

  const resposta = await abrirFormulario({
    titulo: 'Adicionar participante',
    confirmar: 'Adicionar',
    campos: [
      { tipo: 'aviso', etiqueta: 'Somente administradores do grupo podem adicionar participantes.' },
      {
        nome: 'usuarioId',
        etiqueta: 'Usuário',
        tipo: 'select',
        opcoes: usuarios.map((u) => ({ valor: u._id, texto: `${u.avatar} ${u.nome}` }))
      }
    ]
  });

  if (!resposta) return;

  await api(`/api/conversas/${estado.conversaId}/participantes`, {
    metodo: 'POST',
    corpo: { administradorId: estado.usuario._id, usuarioId: resposta.usuarioId }
  });

  avisar('Participante adicionado.');
  await atualizar();
}

/**
 * Renomeia o grupo aberto.
 * @returns {Promise<void>}
 */
async function renomearGrupo() {
  const resposta = await abrirFormulario({
    titulo: 'Renomear grupo',
    confirmar: 'Salvar',
    campos: [
      { nome: 'nome', etiqueta: 'Novo nome', valor: estado.conversaAtual?.nome ?? '', obrigatorio: true }
    ]
  });

  if (!resposta) return;

  await api(`/api/conversas/${estado.conversaId}`, { metodo: 'PATCH', corpo: { nome: resposta.nome } });

  avisar('Grupo renomeado.');
  await atualizar();
}

/**
 * Exclui a conversa aberta, com mensagens e reacoes.
 * @returns {Promise<void>}
 */
async function excluirConversa() {
  if (!(await confirmar('Excluir esta conversa e TODAS as suas mensagens e reações?', 'Excluir'))) return;

  const resultado = await api(`/api/conversas/${estado.conversaId}?solicitanteId=${estado.usuario._id}`, {
    metodo: 'DELETE'
  });

  avisar(`Conversa excluída: ${resultado.mensagensRemovidas} mensagem(ns), ${resultado.reacoesRemovidas} reação(ões).`);

  estado.conversaId = null;
  $('#form-mensagem').classList.add('oculto');
  $('#chat-acoes').classList.add('oculto');
  $('#chat-titulo').textContent = 'Selecione uma conversa';
  $('#chat-subtitulo').textContent = '';
  $('#lista-mensagens').innerHTML = '<li class="vazio">Conversa excluída.</li>';

  await atualizar();
}

// =============================================================================
// Envio de mensagens
// =============================================================================

/**
 * Envia a mensagem digitada no rodape da conversa.
 *
 * @param {string} conteudo Texto da mensagem.
 * @param {string} tipo Tipo escolhido.
 * @returns {Promise<void>}
 */
async function enviarMensagem(conteudo, tipo) {
  const dados = { conversaId: estado.conversaId, autorId: estado.usuario._id, conteudo, tipo };

  // Mensagens de midia exigem os dados do anexo.
  if (['imagem', 'arquivo', 'audio', 'video'].includes(tipo)) {
    const anexo = await abrirFormulario({
      titulo: `Anexo da mensagem (${tipo})`,
      confirmar: 'Enviar',
      campos: [
        { nome: 'nome', etiqueta: 'Nome do arquivo', obrigatorio: true, exemplo: 'diagrama.png' },
        { nome: 'url', etiqueta: 'URL', obrigatorio: true, exemplo: 'https://cdn.zapchat.dev/diagrama.png' },
        { nome: 'tamanhoKb', etiqueta: 'Tamanho (KB)', tipo: 'number', valor: '120' }
      ]
    });

    if (!anexo) return;

    dados.anexo = { nome: anexo.nome, url: anexo.url, tamanhoKb: Number(anexo.tamanhoKb) || 1 };
  }

  await api('/api/mensagens', { metodo: 'POST', corpo: dados });
  await atualizar();

  const lista = $('#lista-mensagens');
  lista.scrollTop = lista.scrollHeight;
}

// =============================================================================
// Usuarios, perfil, busca e estatisticas
// =============================================================================

/**
 * Cadastra um novo usuario pela tela de acesso.
 * @returns {Promise<void>}
 */
async function cadastrarUsuario() {
  const resposta = await abrirFormulario({
    titulo: 'Criar conta',
    confirmar: 'Cadastrar',
    campos: [
      { tipo: 'aviso', etiqueta: 'A senha precisa ter no mínimo 6 caracteres, com letras e números.' },
      { nome: 'nome', etiqueta: 'Nome completo', obrigatorio: true, exemplo: 'Maria Oliveira' },
      { nome: 'email', etiqueta: 'E-mail', tipo: 'email', obrigatorio: true, exemplo: 'maria@zapchat.dev' },
      { nome: 'senha', etiqueta: 'Senha', tipo: 'password', obrigatorio: true },
      { nome: 'apelido', etiqueta: 'Apelido (opcional)' },
      { nome: 'telefone', etiqueta: 'Telefone (opcional)', exemplo: '(11) 99999-1111' },
      { nome: 'avatar', etiqueta: 'Emoji do perfil', valor: '👤' },
      { nome: 'recado', etiqueta: 'Recado', valor: 'Disponivel' }
    ]
  });

  if (!resposta) return;

  // Campos vazios sao removidos para nao sobrescrever os padroes da entidade.
  const dados = Object.fromEntries(Object.entries(resposta).filter(([, valor]) => valor !== ''));

  const usuario = await api('/api/usuarios', { metodo: 'POST', corpo: dados });

  avisar(`Conta criada para ${usuario.nome}. Faça login para entrar.`);
  $('#form-login').email.value = usuario.email;
}

/**
 * Edita o perfil do usuario logado.
 * @returns {Promise<void>}
 */
async function editarPerfil() {
  const usuario = estado.usuario;

  const resposta = await abrirFormulario({
    titulo: 'Meu perfil',
    confirmar: 'Salvar',
    campos: [
      { nome: 'nome', etiqueta: 'Nome', valor: usuario.nome, obrigatorio: true },
      { nome: 'apelido', etiqueta: 'Apelido', valor: usuario.apelido ?? '' },
      { nome: 'telefone', etiqueta: 'Telefone', valor: usuario.telefone ?? '', exemplo: '(11) 99999-1111' },
      { nome: 'avatar', etiqueta: 'Emoji do perfil', valor: usuario.avatar ?? '👤' },
      { nome: 'recado', etiqueta: 'Recado', valor: usuario.recado ?? '' }
    ]
  });

  if (!resposta) return;

  const atualizado = await api(`/api/usuarios/${usuario._id}`, { metodo: 'PATCH', corpo: resposta });

  estado.usuario = atualizado;
  $('#perfil-avatar').textContent = atualizado.avatar;
  $('#perfil-nome').textContent = atualizado.nomeExibicao;

  avisar('Perfil atualizado.');
  await atualizar();
}

/**
 * Adiciona um contato a agenda.
 * @returns {Promise<void>}
 */
async function novoContato() {
  const jaNaAgenda = new Set(estado.contatos.map((contato) => String(contato.contatoId)));
  const usuarios = (await outrosUsuarios()).filter((usuario) => !jaNaAgenda.has(usuario._id));

  if (usuarios.length === 0) {
    avisar('Todos os usuários cadastrados já estão na sua agenda.', { tipo: 'alerta' });
    return;
  }

  const resposta = await abrirFormulario({
    titulo: 'Novo contato',
    confirmar: 'Adicionar',
    campos: [
      {
        nome: 'contatoId',
        etiqueta: 'Usuário',
        tipo: 'select',
        opcoes: usuarios.map((u) => ({ valor: u._id, texto: `${u.avatar} ${u.nome} (${u.email})` }))
      },
      { nome: 'apelido', etiqueta: 'Apelido na agenda (opcional)' },
      { nome: 'favorito', etiqueta: 'Marcar como favorito', tipo: 'checkbox' }
    ]
  });

  if (!resposta) return;

  await api('/api/contatos', {
    metodo: 'POST',
    corpo: {
      usuarioId: estado.usuario._id,
      contatoId: resposta.contatoId,
      apelido: resposta.apelido || undefined,
      favorito: resposta.favorito
    }
  });

  avisar('Contato adicionado.');
  await atualizar();
}

/**
 * Pesquisa mensagens pelo conteudo (indice de texto do MongoDB).
 *
 * @param {string} termo Texto pesquisado.
 * @returns {Promise<void>}
 */
async function buscarMensagens(termo) {
  const mensagens = await api(`/api/mensagens?termo=${encodeURIComponent(termo)}`);
  const lista = $('#lista-busca');

  if (mensagens.length === 0) {
    lista.innerHTML = '<li class="vazio">Nenhuma mensagem encontrada.</li>';
    return;
  }

  lista.innerHTML = mensagens
    .map(
      (mensagem) => `
      <li class="item" data-conversa="${escapar(mensagem.conversaId)}">
        <p class="item-previa">${dataHora(mensagem.criadoEm)}</p>
        <div class="item-titulo">${escapar(mensagem.conteudo)}</div>
      </li>`
    )
    .join('');

  for (const item of $$('#lista-busca .item')) {
    item.onclick = () =>
      executar(async () => {
        trocarAba('conversas');
        await abrirConversa(item.dataset.conversa);
      });
  }
}

/**
 * Exibe as estatisticas gerais da aplicacao.
 * @returns {Promise<void>}
 */
async function verEstatisticas() {
  const dados = await api('/api/estatisticas');

  const tabela = (titulo, colunas, linhas) => `
    <div class="grupo-relatorio">
      <h4>${escapar(titulo)}</h4>
      <table class="tabela">
        <tr>${colunas.map((coluna) => `<th>${escapar(coluna)}</th>`).join('')}</tr>
        ${linhas
          .map((linha) => `<tr>${linha.map((celula) => `<td>${escapar(celula)}</td>`).join('')}</tr>`)
          .join('')}
      </table>
    </div>`;

  const modal = $('#modal');

  $('#modal-titulo').textContent = '📊 Estatísticas do banco';
  $('#modal-confirmar').textContent = 'Fechar';
  $('#modal-cancelar').classList.add('oculto');

  $('#modal-campos').innerHTML = [
    tabela(
      'Documentos por coleção',
      ['Coleção', 'Documentos'],
      dados.colecoes.map((linha) => [linha.colecao, linha.documentos])
    ),
    tabela(
      'Resumo',
      ['Indicador', 'Valor'],
      [
        ['Usuários', dados.totalUsuarios],
        ['Conversas', dados.totalConversas],
        ['Grupos', dados.totalGrupos],
        ['Mensagens', dados.totalMensagens],
        ['Mensagens apagadas para todos', dados.mensagensExcluidas]
      ]
    ),
    tabela(
      'Quem mais enviou mensagens',
      ['#', 'Usuário', 'Mensagens'],
      dados.ranking.map((linha) => [linha.posicao, linha.autor, linha.mensagens])
    ),
    tabela(
      'Emojis mais usados',
      ['Emoji', 'Total'],
      dados.emojis.map((linha) => [linha.emoji, linha.total])
    )
  ].join('');

  modal.showModal();

  $('#modal-form').onsubmit = (evento) => {
    evento.preventDefault();
    modal.close();
  };

  // Restaura a janela ao estado normal, inclusive quando fechada com Esc.
  modal.addEventListener(
    'close',
    () => {
      $('#modal-cancelar').classList.remove('oculto');
      $('#modal-form').onsubmit = null;
    },
    { once: true }
  );
}

/**
 * Mostra os usuarios cadastrados na tela de acesso (apoio para o teste).
 * @returns {Promise<void>}
 */
async function listarUsuariosDemo() {
  const usuarios = await api('/api/usuarios');

  if (usuarios.length === 0) {
    avisar('Nenhum usuário cadastrado. Execute "npm run seed" ou crie uma conta.', { tipo: 'alerta' });
    return;
  }

  avisar('Clique em um e-mail para preencher o formulário:', {
    titulo: `${usuarios.length} usuário(s) cadastrado(s)`,
    detalhes: usuarios.map((usuario) => `${usuario.avatar} ${usuario.nome} — ${usuario.email}`)
  });

  $('#form-login').email.value = usuarios[0].email;
}

// =============================================================================
// Abas e eventos
// =============================================================================

/**
 * Troca a aba visivel da barra lateral.
 *
 * @param {string} nome Nome da aba.
 * @returns {void}
 */
function trocarAba(nome) {
  for (const aba of $$('.aba')) aba.classList.toggle('ativa', aba.dataset.aba === nome);
  for (const painel of $$('.painel-aba')) painel.classList.toggle('oculto', painel.dataset.painel !== nome);
}

/**
 * Liga todos os eventos da interface.
 * @returns {void}
 */
function ligarEventos() {
  $('#form-login').onsubmit = (evento) => {
    evento.preventDefault();

    const dados = new FormData(evento.target);

    executar(() => entrar(String(dados.get('email')), String(dados.get('senha'))));
  };

  $('#botao-cadastrar').onclick = () => executar(cadastrarUsuario);
  $('#botao-usuarios-demo').onclick = () => executar(listarUsuariosDemo);
  $('#botao-sair').onclick = () => executar(sair);
  $('#botao-perfil').onclick = () => executar(editarPerfil);
  $('#botao-estatisticas').onclick = () => executar(verEstatisticas);
  $('#botao-nova-conversa').onclick = () => executar(novaConversa);
  $('#botao-novo-grupo').onclick = () => executar(novoGrupo);
  $('#botao-novo-contato').onclick = () => executar(novoContato);
  $('#botao-add-participante').onclick = () => executar(adicionarParticipante);
  $('#botao-renomear').onclick = () => executar(renomearGrupo);
  $('#botao-excluir-conversa').onclick = () => executar(excluirConversa);

  $('#seletor-status').onchange = (evento) =>
    executar(async () => {
      const usuario = await api(`/api/usuarios/${estado.usuario._id}/status`, {
        metodo: 'POST',
        corpo: { status: evento.target.value }
      });

      estado.usuario = usuario;
      avisar(`Status alterado para "${usuario.status}".`);
    });

  $('#form-mensagem').onsubmit = (evento) => {
    evento.preventDefault();

    const formulario = evento.target;
    const conteudo = formulario.conteudo.value.trim();
    const tipo = formulario.tipo.value;

    formulario.conteudo.value = '';

    executar(() => enviarMensagem(conteudo, tipo));
  };

  $('#form-busca').onsubmit = (evento) => {
    evento.preventDefault();

    const termo = String(new FormData(evento.target).get('termo'));

    executar(() => buscarMensagens(termo));
  };

  for (const aba of $$('.aba')) aba.onclick = () => trocarAba(aba.dataset.aba);
}

/**
 * Inicializa a aplicacao: liga os eventos, restaura a sessao e inicia a
 * atualizacao automatica.
 *
 * @returns {Promise<void>}
 */
async function iniciar() {
  ligarEventos();

  // Restaura a sessao ao recarregar a pagina.
  let usuarioId = null;

  try {
    usuarioId = sessionStorage.getItem(CHAVE_SESSAO);
  } catch {
    /* navegacao privada */
  }

  if (usuarioId) {
    try {
      await iniciarSessao(await api(`/api/usuarios/${usuarioId}`));
    } catch {
      try {
        sessionStorage.removeItem(CHAVE_SESSAO);
      } catch {
        /* nada a fazer */
      }
    }
  }

  setInterval(() => atualizar({ silencioso: true }), INTERVALO_ATUALIZACAO);
}

iniciar();

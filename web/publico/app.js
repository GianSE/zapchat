'use strict';

/**
 * ZapChat - visualizador somente leitura (JavaScript puro, sem frameworks).
 *
 * Busca os dados nas quatro rotas GET da API e os desenha na tela. Nenhuma
 * acao aqui altera o banco: as operacoes de escrita ficam no menu do terminal.
 */

const estado = { usuarioId: null, conversaId: null };

const $ = (seletor) => document.querySelector(seletor);

/** Escapa o texto antes de inseri-lo no HTML. */
const escapar = (texto) =>
  String(texto ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Formata a hora de uma mensagem. */
const hora = (valor) =>
  valor ? new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Busca dados na API.
 *
 * @param {string} caminho Rota chamada.
 * @returns {Promise<*>} Conteudo da resposta.
 */
async function api(caminho) {
  const resposta = await fetch(caminho);
  const dados = await resposta.json();

  if (!resposta.ok) throw new Error(`${dados.tipo ?? 'Erro'}: ${dados.erro}`);

  return dados;
}

/**
 * Mostra uma mensagem de erro no painel principal.
 *
 * @param {Error} erro Falha capturada.
 * @returns {void}
 */
function mostrarErro(erro) {
  $('#titulo').textContent = 'Nao foi possivel carregar';
  $('#subtitulo').textContent = erro.message;
  $('#corpo').innerHTML = '';
}

/**
 * Carrega a lista de usuarios no seletor "Ver como".
 * @returns {Promise<void>}
 */
async function carregarUsuarios() {
  const usuarios = await api('/api/usuarios');

  if (usuarios.length === 0) {
    $('#corpo').innerHTML = '<p class="vazio">Banco vazio. Rode <code>npm run seed</code> e recarregue a pagina.</p>';
    return;
  }

  $('#usuario').innerHTML = usuarios
    .map((u) => `<option value="${u._id}">${escapar(u.avatar)} ${escapar(u.nome)}</option>`)
    .join('');

  estado.usuarioId = usuarios[0]._id;

  await carregarConversas();
}

/**
 * Carrega as conversas do usuario selecionado, com as nao lidas.
 * @returns {Promise<void>}
 */
async function carregarConversas() {
  const painel = await api(`/api/usuarios/${estado.usuarioId}/painel`);
  const naoLidas = new Map(painel.naoLidas.map((n) => [String(n.conversaId), n.naoLidas]));

  $('#conversas').innerHTML =
    painel.conversas
      .map((c) => {
        const pendentes = naoLidas.get(String(c._id)) ?? 0;

        return `
          <li class="item" data-id="${c._id}">
            ${pendentes > 0 ? `<span class="badge">${pendentes}</span>` : ''}
            <b>${escapar(c.icone)} ${escapar(c.titulo)}</b>
            <span>${escapar(c.ultimaMensagem?.texto ?? 'sem mensagens')}</span>
            <span>${c.totalMensagens} mensagem(ns) · ${escapar(c.tipo)}</span>
          </li>`;
      })
      .join('') || '<li class="vazio">Este usuario nao participa de nenhuma conversa.</li>';

  for (const item of document.querySelectorAll('#conversas .item')) {
    item.onclick = () => abrirConversa(item.dataset.id);
  }
}

/**
 * Mostra o historico de uma conversa.
 *
 * @param {string} conversaId Identificador da conversa.
 * @returns {Promise<void>}
 */
async function abrirConversa(conversaId) {
  estado.conversaId = conversaId;

  for (const item of document.querySelectorAll('#conversas .item')) {
    item.classList.toggle('ativo', item.dataset.id === conversaId);
  }

  const mensagens = await api(`/api/conversas/${conversaId}/mensagens`);
  const titulo = document.querySelector('#conversas .item.ativo b')?.textContent ?? 'Conversa';

  $('#titulo').textContent = titulo.trim();
  $('#subtitulo').textContent = `${mensagens.length} mensagem(ns) — histórico montado com $lookup (autor + reações)`;

  $('#corpo').innerHTML =
    mensagens
      .map((m) => {
        if (m.tipo === 'sistema') return `<div class="mensagem sistema">${escapar(m.conteudo)}</div>`;

        const minha = String(m.autorId) === estado.usuarioId;

        // Agrupa reacoes iguais: ["🔥","🔥"] vira "🔥 2"
        const contagem = new Map();
        for (const emoji of m.reacoes ?? []) contagem.set(emoji, (contagem.get(emoji) ?? 0) + 1);

        const reacoes = [...contagem].map(([e, t]) => `${e} ${t}`).join('  ');
        const anexo = m.anexo ? ` 📎 ${escapar(m.anexo.nome)}` : '';
        const citacao = m.respondendo ? `<div class="rodape">↳ ${escapar(m.respondendo)}</div>` : '';

        return `
          <div class="mensagem ${minha ? 'minha' : ''}">
            ${minha ? '' : `<div class="autor">${escapar(m.autorAvatar)} ${escapar(m.autorNome)}</div>`}
            ${citacao}
            <p class="texto">${escapar(m.conteudo)}${anexo}</p>
            <div class="rodape">
              ${hora(m.enviadaEm)} · 👁 ${m.totalLeituras}
              ${m.editada ? ' · editada' : ''}${m.fixada ? ' · 📌' : ''} ${reacoes}
            </div>
          </div>`;
      })
      .join('') || '<p class="vazio">Conversa sem mensagens.</p>';
}

/**
 * Mostra as estatisticas gerais no painel principal.
 * @returns {Promise<void>}
 */
async function mostrarEstatisticas() {
  const dados = await api('/api/estatisticas');

  const tabela = (titulo, colunas, linhas) => `
    <h3>${escapar(titulo)}</h3>
    <table>
      <tr>${colunas.map((c) => `<th>${escapar(c)}</th>`).join('')}</tr>
      ${linhas.map((l) => `<tr>${l.map((v) => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}
    </table>`;

  $('#titulo').textContent = '📊 Estatísticas do banco';
  $('#subtitulo').textContent = 'Agregações executadas pelas classes de modelo';

  $('#corpo').innerHTML = [
    tabela('Documentos por coleção', ['Coleção', 'Documentos'], dados.colecoes.map((l) => [l.colecao, l.documentos])),
    tabela('Resumo', ['Indicador', 'Valor'], [
      ['Usuários', dados.totalUsuarios],
      ['Conversas', dados.totalConversas],
      ['Grupos', dados.totalGrupos],
      ['Mensagens', dados.totalMensagens],
      ['Apagadas para todos', dados.mensagensExcluidas]
    ]),
    tabela('Quem mais enviou', ['#', 'Usuário', 'Mensagens'], dados.ranking.map((l) => [l.posicao, l.autor, l.mensagens])),
    tabela('Emojis mais usados', ['Emoji', 'Total'], dados.emojis.map((l) => [l.emoji, l.total]))
  ].join('');
}

/** Executa uma acao tratando qualquer falha. */
const executar = (acao) => acao().catch(mostrarErro);

$('#usuario').onchange = (evento) =>
  executar(async () => {
    estado.usuarioId = evento.target.value;
    await carregarConversas();

    if (estado.conversaId) await abrirConversa(estado.conversaId);
  });

$('#botao-estatisticas').onclick = () => executar(mostrarEstatisticas);

executar(carregarUsuarios);

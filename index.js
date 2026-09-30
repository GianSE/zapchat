'use strict';

/**
 * Ponto de entrada da aplicacao ZapChat.
 *
 * Abre a conexao com o MongoDB e inicia o menu interativo no terminal.
 *
 * Execucao: npm start
 */

const Aplicacao = require('./src/Aplicacao');
const Menu = require('./src/controllers/Menu');

Aplicacao.executar('menu', async () => {
  const menu = new Menu();

  await menu.iniciar();
});

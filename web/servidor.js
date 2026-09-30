'use strict';

/**
 * Ponto de entrada da interface web (recurso extra do projeto).
 *
 * Abre a conexao com o MongoDB e sobe o servidor HTTP nativo que entrega a
 * pagina e a API JSON. O menu do terminal (npm start) continua funcionando de
 * forma independente.
 *
 * Execucao: npm run web
 */

const Aplicacao = require('../src/Aplicacao');
const ServidorWeb = require('./ServidorWeb');

Aplicacao.executar('servidor-web', async () => {
  const servidor = new ServidorWeb();

  await servidor.iniciar();
});

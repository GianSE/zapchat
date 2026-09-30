'use strict';

/**
 * Script de limpeza do banco de dados.
 *
 * Remove todos os documentos das colecoes do projeto, mantendo os indices.
 *
 * Execucao: npm run reset
 */

const Aplicacao = require('../src/Aplicacao');
const Manutencao = require('../src/database/Manutencao');
const Terminal = require('../src/views/Terminal');
const config = require('../src/config/config');

Aplicacao.executar('reset', async () => {
  Terminal.titulo('ZapChat - limpeza do banco de dados');
  Terminal.atencao(`Todos os documentos do banco "${config.mongo.banco}" serao removidos.`);

  const resultado = await Manutencao.limparColecoes();

  Terminal.secao('Documentos removidos');
  Terminal.tabela(resultado);

  Terminal.sucesso('Banco de dados limpo.');
});

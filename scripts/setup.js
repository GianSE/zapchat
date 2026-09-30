'use strict';

/**
 * Script de preparacao do banco de dados.
 *
 * Cria as colecoes e os indices utilizados pela aplicacao (incluindo os indices
 * unicos de e-mail e de reacao e o indice de texto para a busca em mensagens).
 *
 * Execucao: npm run setup
 */

const Aplicacao = require('../src/Aplicacao');
const Manutencao = require('../src/database/Manutencao');
const Terminal = require('../src/cli/Terminal');
const config = require('../src/config/config');

Aplicacao.executar('setup', async () => {
  Terminal.titulo('ZapChat - preparacao do banco de dados');
  Terminal.info(`Banco: ${config.mongo.banco}  |  URI: ${config.mongo.uri}`);

  Terminal.secao('Criando indices');
  const criados = await Manutencao.criarIndices();

  for (const { colecao, indices } of criados) {
    Terminal.item(`${colecao}: ${indices.join(', ')}`);
  }

  Terminal.secao('Indices existentes no banco');
  Terminal.tabela(await Manutencao.listarIndices());

  Terminal.secao('Documentos por colecao');
  Terminal.tabela(await Manutencao.contarDocumentos());

  Terminal.sucesso('Banco de dados preparado. Use "npm run seed" para carregar dados de exemplo.');
});

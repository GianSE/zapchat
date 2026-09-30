'use strict';

/**
 * Configuracao central da aplicacao.
 *
 * As configuracoes podem ser definidas por variaveis de ambiente ou pelo
 * arquivo ".env" na raiz do projeto. A leitura do ".env" e feita com o modulo
 * nativo "fs", evitando a necessidade de bibliotecas externas.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Diretorio raiz do projeto (um nivel acima de "src"). */
const RAIZ_PROJETO = path.resolve(__dirname, '..', '..');

/**
 * Le o arquivo ".env" (quando existir) e carrega os valores em process.env.
 * Variaveis ja definidas no ambiente tem prioridade sobre o arquivo.
 *
 * @returns {void}
 */
function carregarArquivoEnv() {
  const caminhoEnv = path.join(RAIZ_PROJETO, '.env');

  try {
    if (!fs.existsSync(caminhoEnv)) return;

    const conteudo = fs.readFileSync(caminhoEnv, 'utf8');

    for (const linha of conteudo.split(/\r?\n/)) {
      const texto = linha.trim();

      // Ignora linhas vazias e comentarios.
      if (texto === '' || texto.startsWith('#')) continue;

      const separador = texto.indexOf('=');
      if (separador === -1) continue;

      const chave = texto.slice(0, separador).trim();
      let valor = texto.slice(separador + 1).trim();

      // Remove aspas envolvendo o valor, quando presentes.
      if (/^(".*"|'.*')$/.test(valor)) valor = valor.slice(1, -1);

      if (chave !== '' && process.env[chave] === undefined) {
        process.env[chave] = valor;
      }
    }
  } catch (erro) {
    // A falha na leitura do .env nao deve interromper a aplicacao:
    // os valores padrao definidos abaixo serao utilizados.
    console.warn(`[config] Nao foi possivel ler o arquivo .env: ${erro.message}`);
  }
}

carregarArquivoEnv();

/**
 * Converte um valor de ambiente para numero inteiro, com valor padrao.
 *
 * @param {string|undefined} valor Valor lido do ambiente.
 * @param {number} padrao Valor utilizado quando a conversao falhar.
 * @returns {number}
 */
function paraInteiro(valor, padrao) {
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) ? numero : padrao;
}

/** Configuracoes utilizadas pela aplicacao. */
const config = Object.freeze({
  raizProjeto: RAIZ_PROJETO,

  mongo: Object.freeze({
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    banco: process.env.MONGODB_DB || 'zapchat',
    timeoutMs: paraInteiro(process.env.MONGODB_TIMEOUT, 5000)
  }),

  log: Object.freeze({
    diretorio: path.join(RAIZ_PROJETO, 'logs'),
    arquivoErros: 'errors.log',
    arquivoApp: 'app.log',
    nivelMinimo: (process.env.LOG_NIVEL || 'INFO').toUpperCase()
  })
});

module.exports = config;

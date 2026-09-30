'use strict';

const ErroAplicacao = require('./ErroAplicacao');

/**
 * Erro lancado quando a aplicacao nao consegue se conectar ao MongoDB ou tenta
 * utilizar o banco antes de a conexao ter sido estabelecida.
 *
 * @extends ErroAplicacao
 */
class ErroConexao extends ErroAplicacao {}

module.exports = ErroConexao;

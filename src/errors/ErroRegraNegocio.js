'use strict';

const ErroAplicacao = require('./ErroAplicacao');

/**
 * Erro lancado quando uma operacao e valida em formato, mas viola uma regra do
 * dominio de mensagens instantaneas. Exemplos: enviar mensagem em uma conversa
 * da qual o usuario nao participa, ou adicionar um contato para si mesmo.
 *
 * @extends ErroAplicacao
 */
class ErroRegraNegocio extends ErroAplicacao {}

module.exports = ErroRegraNegocio;

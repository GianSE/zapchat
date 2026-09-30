'use strict';

/**
 * Ponto unico de importacao das entidades da aplicacao.
 *
 * Hierarquia de classes:
 *   Modelo (abstrata)
 *     ├── Usuario   -> colecao "usuarios"
 *     ├── Contato   -> colecao "contatos"
 *     ├── Conversa  -> colecao "conversas"
 *     ├── Mensagem  -> colecao "mensagens"
 *     └── Reacao    -> colecao "reacoes"
 */

const Modelo = require('./Modelo');
const Usuario = require('./Usuario');
const Contato = require('./Contato');
const Conversa = require('./Conversa');
const Mensagem = require('./Mensagem');
const Reacao = require('./Reacao');

/** Entidades concretas, na ordem de dependencia entre elas. */
const ENTIDADES = Object.freeze([Usuario, Contato, Conversa, Mensagem, Reacao]);

module.exports = { Modelo, Usuario, Contato, Conversa, Mensagem, Reacao, ENTIDADES };

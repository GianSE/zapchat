'use strict';

/**
 * Ponto unico de importacao das excecoes da aplicacao.
 *
 * Hierarquia:
 *   Error
 *     └── ErroAplicacao
 *           ├── ErroValidacao
 *           ├── ErroNaoEncontrado
 *           ├── ErroRegraNegocio
 *           ├── ErroBanco
 *           └── ErroConexao
 */

module.exports = {
  ErroAplicacao: require('./ErroAplicacao'),
  ErroValidacao: require('./ErroValidacao'),
  ErroNaoEncontrado: require('./ErroNaoEncontrado'),
  ErroRegraNegocio: require('./ErroRegraNegocio'),
  ErroBanco: require('./ErroBanco'),
  ErroConexao: require('./ErroConexao')
};

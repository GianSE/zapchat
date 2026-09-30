'use strict';

/**
 * Funcoes de seguranca para tratamento de senhas.
 *
 * Utiliza o modulo nativo "crypto" do Node.js com o algoritmo scrypt e um salt
 * aleatorio por usuario, de modo que a senha nunca seja gravada em texto puro
 * no MongoDB.
 */

const crypto = require('node:crypto');

/** Tamanho (em bytes) do salt gerado para cada senha. */
const TAMANHO_SALT = 16;

/** Tamanho (em bytes) do hash derivado. */
const TAMANHO_HASH = 32;

class Seguranca {
  /**
   * Gera o hash de uma senha no formato "salt:hash".
   *
   * @param {string} senha Senha em texto puro.
   * @returns {string} Hash pronto para ser armazenado.
   */
  static gerarHashSenha(senha) {
    const salt = crypto.randomBytes(TAMANHO_SALT).toString('hex');
    const hash = crypto.scryptSync(senha, salt, TAMANHO_HASH).toString('hex');

    return `${salt}:${hash}`;
  }

  /**
   * Compara uma senha em texto puro com um hash armazenado.
   *
   * @param {string} senha Senha informada pelo usuario.
   * @param {string} hashArmazenado Hash gravado no banco ("salt:hash").
   * @returns {boolean} true quando a senha corresponde ao hash.
   */
  static verificarSenha(senha, hashArmazenado) {
    if (typeof senha !== 'string' || typeof hashArmazenado !== 'string') return false;

    const [salt, hash] = hashArmazenado.split(':');
    if (!salt || !hash) return false;

    const hashInformado = crypto.scryptSync(senha, salt, TAMANHO_HASH);
    const hashEsperado = Buffer.from(hash, 'hex');

    if (hashInformado.length !== hashEsperado.length) return false;

    // Comparacao em tempo constante, evitando vazamento por tempo de resposta.
    return crypto.timingSafeEqual(hashInformado, hashEsperado);
  }
}

module.exports = Seguranca;

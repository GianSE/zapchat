'use strict';

/**
 * Conjunto de validacoes reutilizaveis pelas entidades.
 *
 * Todos os metodos sao estaticos e acumulam mensagens de erro em um array,
 * permitindo que a entidade informe de uma vez todos os problemas encontrados
 * antes de qualquer acesso ao MongoDB.
 */

const { ObjectId } = require('mongodb');
const { ErroValidacao } = require('../errors');

/** Expressao regular simples para validacao de e-mail. */
const PADRAO_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Expressao regular para telefone no formato brasileiro: (99) 99999-9999. */
const PADRAO_TELEFONE = /^\(\d{2}\)\s?\d{4,5}-?\d{4}$/;

class Validador {
  /**
   * Verifica se um valor foi informado (nao nulo e nao vazio).
   *
   * @param {*} valor Valor a ser verificado.
   * @returns {boolean}
   */
  static informado(valor) {
    if (valor === null || valor === undefined) return false;
    if (typeof valor === 'string') return valor.trim() !== '';
    if (Array.isArray(valor)) return valor.length > 0;
    return true;
  }

  /**
   * Retorna os campos obrigatorios que nao foram informados.
   *
   * @param {object} dados Objeto com os dados da entidade.
   * @param {string[]} campos Lista de campos obrigatorios.
   * @returns {string[]} Campos ausentes.
   */
  static camposAusentes(dados, campos) {
    return campos.filter((campo) => !Validador.informado(dados?.[campo]));
  }

  /**
   * Garante que todos os campos obrigatorios foram informados.
   *
   * @param {object} dados Objeto com os dados da entidade.
   * @param {string[]} campos Lista de campos obrigatorios.
   * @param {string} entidade Nome da entidade (usado na mensagem de erro).
   * @param {string} operacao Operacao em execucao.
   * @returns {void}
   * @throws {ErroValidacao} Quando algum campo obrigatorio estiver ausente.
   */
  static exigirCampos(dados, campos, entidade, operacao) {
    const ausentes = Validador.camposAusentes(dados, campos);
    if (ausentes.length > 0) throw ErroValidacao.camposObrigatorios(ausentes, entidade, operacao);
  }

  /**
   * Valida o tamanho de um texto.
   *
   * @param {string[]} erros Lista acumuladora de erros.
   * @param {*} valor Valor informado.
   * @param {string} campo Nome do campo.
   * @param {object} [limites]
   * @param {number} [limites.min] Tamanho minimo.
   * @param {number} [limites.max] Tamanho maximo.
   * @returns {void}
   */
  static texto(erros, valor, campo, { min = 1, max = 500 } = {}) {
    if (!Validador.informado(valor)) return;

    if (typeof valor !== 'string') {
      erros.push(`Campo "${campo}" deve ser um texto`);
      return;
    }

    const tamanho = valor.trim().length;

    if (tamanho < min) erros.push(`Campo "${campo}" deve ter no minimo ${min} caractere(s)`);
    if (tamanho > max) erros.push(`Campo "${campo}" deve ter no maximo ${max} caractere(s)`);
  }

  /**
   * Valida o formato de um e-mail.
   *
   * @param {string[]} erros Lista acumuladora de erros.
   * @param {*} valor Valor informado.
   * @param {string} [campo] Nome do campo.
   * @returns {void}
   */
  static email(erros, valor, campo = 'email') {
    if (!Validador.informado(valor)) return;

    if (typeof valor !== 'string' || !PADRAO_EMAIL.test(valor.trim())) {
      erros.push(`Campo "${campo}" possui um e-mail invalido (exemplo: usuario@dominio.com)`);
    }
  }

  /**
   * Valida o formato de um telefone brasileiro.
   *
   * @param {string[]} erros Lista acumuladora de erros.
   * @param {*} valor Valor informado.
   * @param {string} [campo] Nome do campo.
   * @returns {void}
   */
  static telefone(erros, valor, campo = 'telefone') {
    if (!Validador.informado(valor)) return;

    if (typeof valor !== 'string' || !PADRAO_TELEFONE.test(valor.trim())) {
      erros.push(`Campo "${campo}" deve seguir o formato (99) 99999-9999`);
    }
  }

  /**
   * Valida a forca minima de uma senha.
   *
   * @param {string[]} erros Lista acumuladora de erros.
   * @param {*} valor Valor informado.
   * @param {string} [campo] Nome do campo.
   * @returns {void}
   */
  static senha(erros, valor, campo = 'senha') {
    if (!Validador.informado(valor)) return;

    if (typeof valor !== 'string' || valor.length < 6) {
      erros.push(`Campo "${campo}" deve ter no minimo 6 caracteres`);
      return;
    }

    if (!/\d/.test(valor) || !/[a-zA-Z]/.test(valor)) {
      erros.push(`Campo "${campo}" deve conter letras e numeros`);
    }
  }

  /**
   * Valida se o valor pertence a um conjunto permitido.
   *
   * @param {string[]} erros Lista acumuladora de erros.
   * @param {*} valor Valor informado.
   * @param {Array<string>} permitidos Valores aceitos.
   * @param {string} campo Nome do campo.
   * @returns {void}
   */
  static enumerado(erros, valor, permitidos, campo) {
    if (!Validador.informado(valor)) return;

    if (!permitidos.includes(valor)) {
      erros.push(`Campo "${campo}" aceita somente: ${permitidos.join(', ')}`);
    }
  }

  /**
   * Valida se o valor e um ObjectId valido do MongoDB.
   *
   * @param {string[]} erros Lista acumuladora de erros.
   * @param {*} valor Valor informado.
   * @param {string} campo Nome do campo.
   * @returns {void}
   */
  static objectId(erros, valor, campo) {
    if (!Validador.informado(valor)) return;

    if (!ObjectId.isValid(valor)) {
      erros.push(`Campo "${campo}" deve ser um identificador valido do MongoDB`);
    }
  }

  /**
   * Valida uma lista de ObjectId.
   *
   * @param {string[]} erros Lista acumuladora de erros.
   * @param {*} valores Lista informada.
   * @param {string} campo Nome do campo.
   * @param {object} [opcoes]
   * @param {number} [opcoes.min] Quantidade minima de itens.
   * @returns {void}
   */
  static listaDeObjectId(erros, valores, campo, { min = 1 } = {}) {
    if (!Validador.informado(valores)) return;

    if (!Array.isArray(valores)) {
      erros.push(`Campo "${campo}" deve ser uma lista`);
      return;
    }

    if (valores.length < min) {
      erros.push(`Campo "${campo}" deve conter no minimo ${min} item(ns)`);
    }

    const invalidos = valores.filter((valor) => !ObjectId.isValid(valor));
    if (invalidos.length > 0) {
      erros.push(`Campo "${campo}" contem identificador(es) invalido(s): ${invalidos.join(', ')}`);
    }
  }

  /**
   * Converte um valor para ObjectId, lancando erro de validacao quando invalido.
   *
   * @param {*} valor Valor a ser convertido.
   * @param {string} campo Nome do campo (usado na mensagem).
   * @param {string} operacao Operacao em execucao.
   * @returns {ObjectId}
   * @throws {ErroValidacao} Quando o valor nao e um ObjectId valido.
   */
  static converterObjectId(valor, campo, operacao) {
    if (valor instanceof ObjectId) return valor;

    if (!Validador.informado(valor)) {
      throw ErroValidacao.camposObrigatorios([campo], 'Identificador', operacao);
    }

    if (!ObjectId.isValid(valor)) {
      throw new ErroValidacao(
        `Campo "${campo}" nao e um identificador valido do MongoDB: "${valor}"`,
        [`Campo "${campo}" deve conter 24 caracteres hexadecimais`],
        { operacao, detalhes: { campo, valor: String(valor) } }
      );
    }

    return new ObjectId(valor);
  }

  /**
   * Lanca ErroValidacao caso a lista de erros nao esteja vazia.
   *
   * @param {string[]} erros Erros acumulados.
   * @param {string} entidade Nome da entidade validada.
   * @param {string} operacao Operacao em execucao.
   * @returns {void}
   * @throws {ErroValidacao}
   */
  static lancarSeHouverErros(erros, entidade, operacao) {
    if (erros.length === 0) return;

    throw new ErroValidacao(
      `Dados invalidos em ${entidade}: ${erros.length} problema(s) encontrado(s)`,
      erros,
      { operacao, detalhes: { entidade } }
    );
  }
}

module.exports = Validador;
module.exports.PADRAO_EMAIL = PADRAO_EMAIL;
module.exports.PADRAO_TELEFONE = PADRAO_TELEFONE;

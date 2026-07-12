import { describe, expect, it } from 'vitest'
import { normalizeProgramToId } from './matching'

describe('normalizeProgramToId', () => {
  it('resolve origens comuns de transferência (com e sem acento/variações)', () => {
    expect(normalizeProgramToId('Livelo')).toBe('livelo')
    expect(normalizeProgramToId('Esfera')).toBe('esfera')
    expect(normalizeProgramToId('Itaú')).toBe('itau')
    expect(normalizeProgramToId('Itau')).toBe('itau')
    expect(normalizeProgramToId('Inter Loop')).toBe('inter-loop')
    expect(normalizeProgramToId('Inter')).toBe('inter-loop')
    expect(normalizeProgramToId('C6')).toBe('atomos-c6')
    expect(normalizeProgramToId('Átomos C6')).toBe('atomos-c6')
    expect(normalizeProgramToId('Amex')).toBe('amex')
  })

  it('resolve destinos comuns (pra uso futuro / robustez)', () => {
    expect(normalizeProgramToId('Smiles')).toBe('smiles')
    expect(normalizeProgramToId('LATAM Pass')).toBe('latam-pass')
    expect(normalizeProgramToId('Tudo Azul')).toBe('tudo-azul')
  })

  it('não chuta: texto desconhecido, vazio ou nulo → null', () => {
    expect(normalizeProgramToId('Programa Inexistente')).toBeNull()
    expect(normalizeProgramToId('')).toBeNull()
    expect(normalizeProgramToId(null)).toBeNull()
    expect(normalizeProgramToId(undefined)).toBeNull()
  })
})

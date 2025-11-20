import { describe, expect, it } from 'vitest'
import { normalizeRole, isSuperRole } from '@/lib/roles'

describe('Security - Normalización y Autorización', () => {
  describe('normalizeRole', () => {
    it('Normaliza superusuario a supervisor', () => {
      expect(normalizeRole('superusuario')).toBe('supervisor')
      expect(normalizeRole('super usuario')).toBe('supervisor')
      expect(normalizeRole('super_usuario')).toBe('supervisor')
    })

    it('Normaliza editor a supervisor', () => {
      expect(normalizeRole('editor')).toBe('supervisor')
    })

    it('Normaliza lector a viewer', () => {
      expect(normalizeRole('lector')).toBe('viewer')
    })

    it('Mantiene roles válidos', () => {
      expect(normalizeRole('admin')).toBe('admin')
      expect(normalizeRole('supervisor')).toBe('supervisor')
      expect(normalizeRole('viewer')).toBe('viewer')
      expect(normalizeRole('agente')).toBe('agente')
    })

    it('Retorna null para valores inválidos', () => {
      expect(normalizeRole(null)).toBeNull()
      expect(normalizeRole(undefined)).toBeNull()
      expect(normalizeRole('')).toBeNull()
      expect(normalizeRole('invalid_role')).toBeNull()
    })
  })

  describe('isSuperRole', () => {
    it('Admin es super role', () => {
      expect(isSuperRole('admin')).toBe(true)
    })

    it('Supervisor es super role', () => {
      expect(isSuperRole('supervisor')).toBe(true)
    })

    it('Viewer no es super role', () => {
      expect(isSuperRole('viewer')).toBe(false)
    })

    it('Agente no es super role', () => {
      expect(isSuperRole('agente')).toBe(false)
    })

    it('Null/undefined no son super role', () => {
      expect(isSuperRole(null)).toBe(false)
      expect(isSuperRole(undefined)).toBe(false)
    })
  })
})

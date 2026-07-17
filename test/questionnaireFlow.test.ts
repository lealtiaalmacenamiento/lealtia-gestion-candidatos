import { describe, expect, it } from 'vitest'
import { normalizeCodigoAgente } from '../src/lib/autoAgente'
import { getPprAgeRange, PPR_PLAN_TABLE, PPR_PLANS } from '../src/lib/pprPlanData'
import {
  extractSemanticAnswers,
  questionnaireInputSchema,
  validateQuestionnaireAnswers,
  type QuestionnaireSection
} from '../src/lib/validation/questionnaireSchemas'

const sections: QuestionnaireSection[] = [
  {
    id: 'contacto',
    titulo: 'Contacto',
    preguntas: [
      { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto', semantica: 'nombre', requerida: true },
      { id: 'correo', etiqueta: 'Correo', tipo: 'email', semantica: 'email', requerida: true },
      { id: 'edad', etiqueta: 'Edad', tipo: 'numero', semantica: 'edad', requerida: true }
    ]
  }
]

describe('código manual de agente', () => {
  it('normaliza a mayúsculas y conserva caracteres permitidos', () => {
    expect(normalizeCodigoAgente(' jaime_2026 ')).toBe('JAIME_2026')
  })

  it('rechaza códigos con espacios o símbolos', () => {
    expect(() => normalizeCodigoAgente('jaime 2026!')).toThrow(/código de agente/i)
  })
})

describe('cuestionarios para prospectos', () => {
  it('extrae los datos necesarios para prospecto y PPR', () => {
    expect(extractSemanticAnswers(sections, {
      nombre: 'Ana Pérez',
      correo: 'ana@example.com',
      edad: 35
    })).toEqual({
      nombre: 'Ana Pérez',
      email: 'ana@example.com',
      edad: 35
    })
  })

  it('detecta respuestas obligatorias y correo inválido', () => {
    expect(validateQuestionnaireAnswers(sections, {
      nombre: '',
      correo: 'incorrecto',
      edad: 35
    })).toEqual([
      'Falta responder: Nombre',
      'Correo inválido: Correo'
    ])
  })

  it('exige opciones en preguntas de selección', () => {
    const result = questionnaireInputSchema.safeParse({
      titulo: 'Diagnóstico PPR',
      slug: 'diagnostico-ppr',
      activo: true,
      requiere_ppr: true,
      secciones: [{
        id: 'objetivos',
        titulo: 'Objetivos',
        preguntas: [{
          id: 'meta',
          etiqueta: 'Meta',
          tipo: 'seleccion',
          semantica: 'otro',
          requerida: true,
          opciones: ['Retiro']
        }]
      }]
    })
    expect(result.success).toBe(false)
  })
})

describe('datos compartidos del simulador PPR', () => {
  it('usa la misma tabla para landing y flujo de cuestionario', () => {
    expect(getPprAgeRange(27)).toBe(30)
    expect(PPR_PLAN_TABLE[30]['65']).toEqual({
      primaAnualUDI: 2255.39,
      meta65UDI: 96934
    })
    expect(PPR_PLANS['65']).toMatchObject({ nombre: '65 años', anios: 65 })
  })
})

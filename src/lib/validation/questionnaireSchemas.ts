import { z } from 'zod'

export const questionnaireQuestionTypeSchema = z.enum([
  'texto',
  'texto_largo',
  'email',
  'telefono',
  'numero',
  'fecha',
  'seleccion',
  'multiple',
  'booleano'
])

export const questionnaireSemanticSchema = z.enum([
  'nombre',
  'email',
  'telefono',
  'edad',
  'otro'
])

export const questionnaireQuestionSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  etiqueta: z.string().trim().min(1).max(240),
  tipo: questionnaireQuestionTypeSchema,
  semantica: questionnaireSemanticSchema.default('otro'),
  requerida: z.boolean().default(false),
  placeholder: z.string().trim().max(240).optional(),
  opciones: z.array(z.string().trim().min(1).max(120)).max(30).optional()
}).superRefine((question, ctx) => {
  if ((question.tipo === 'seleccion' || question.tipo === 'multiple') && (!question.opciones || question.opciones.length < 2)) {
    ctx.addIssue({ code: 'custom', path: ['opciones'], message: 'Agrega al menos dos opciones' })
  }
})

export const questionnaireSectionSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  titulo: z.string().trim().min(1).max(160),
  descripcion: z.string().trim().max(500).optional(),
  preguntas: z.array(questionnaireQuestionSchema).min(1).max(50)
})

export const questionnaireInputSchema = z.object({
  titulo: z.string().trim().min(3).max(160),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  descripcion: z.string().trim().max(1000).nullable().optional(),
  activo: z.boolean().default(true),
  requiere_ppr: z.boolean().default(true),
  secciones: z.array(questionnaireSectionSchema).min(1).max(20)
})

export type QuestionnaireInput = z.infer<typeof questionnaireInputSchema>
export type QuestionnaireSection = z.infer<typeof questionnaireSectionSchema>
export type QuestionnaireQuestion = z.infer<typeof questionnaireQuestionSchema>

export function extractSemanticAnswers(
  sections: QuestionnaireSection[],
  answers: Record<string, unknown>
): Partial<Record<'nombre' | 'email' | 'telefono' | 'edad', string | number>> {
  const result: Partial<Record<'nombre' | 'email' | 'telefono' | 'edad', string | number>> = {}
  for (const section of sections) {
    for (const question of section.preguntas) {
      if (question.semantica === 'otro') continue
      const value = answers[question.id]
      if (typeof value === 'string' || typeof value === 'number') {
        result[question.semantica] = value
      }
    }
  }
  return result
}

export function validateQuestionnaireAnswers(
  sections: QuestionnaireSection[],
  answers: Record<string, unknown>
): string[] {
  const errors: string[] = []
  for (const section of sections) {
    for (const question of section.preguntas) {
      const value = answers[question.id]
      const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0)
      if (question.requerida && empty) errors.push(`Falta responder: ${question.etiqueta}`)
      if (!empty && question.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        errors.push(`Correo inválido: ${question.etiqueta}`)
      }
    }
  }
  return errors
}

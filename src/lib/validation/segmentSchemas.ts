import { z } from 'zod'

export const segmentFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(120, 'El nombre debe tener maximo 120 caracteres'),
  description: z
    .string()
    .trim()
    .max(400, 'La descripcion debe tener maximo 400 caracteres')
    .optional()
    .or(z.literal('')),
  active: z.boolean()
})

export type SegmentFormValues = z.infer<typeof segmentFormSchema>


import { z } from "zod"

const CODE_PATTERN = /^[A-Za-z0-9_-]+$/

export const productTypeFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'El codigo debe tener al menos 2 caracteres')
    .max(16, 'El codigo debe tener maximo 16 caracteres')
    .regex(CODE_PATTERN, 'Solo usa letras, numeros, guion o guion bajo.'),
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

export type ProductTypeFormValues = z.infer<typeof productTypeFormSchema>

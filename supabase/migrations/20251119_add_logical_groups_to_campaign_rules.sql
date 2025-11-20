-- Add logical groups support for combining campaign rules with AND/OR operators
-- This allows rules like: (rule1 AND rule2 AND rule3) OR (rule4 AND rule5)

-- Add logical_group and logical_operator columns to campaign_rules
ALTER TABLE public.campaign_rules 
ADD COLUMN IF NOT EXISTS logical_group INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS logical_operator TEXT DEFAULT 'AND' CHECK (logical_operator IN ('AND', 'OR'));

-- Create index for efficient querying by logical groups
CREATE INDEX IF NOT EXISTS idx_campaign_rules_logical_group 
ON public.campaign_rules(campaign_id, scope, logical_group);

COMMENT ON COLUMN public.campaign_rules.logical_group IS 'Agrupa reglas que se evalúan juntas. Grupos diferentes se combinan con OR, reglas dentro del mismo grupo se combinan con AND';
COMMENT ON COLUMN public.campaign_rules.logical_operator IS 'Operador lógico para combinar con la siguiente regla en el mismo grupo (AND) o para separar grupos (OR cuando cambia el logical_group)';

-- Example structure:
-- logical_group=1, rule1 (AND)
-- logical_group=1, rule2 (AND)  
-- logical_group=1, rule3 (OR) -> last rule of group uses OR to separate from next group
-- logical_group=2, rule4 (AND)
-- logical_group=2, rule5 (END)
-- 
-- Evaluates as: (rule1 AND rule2 AND rule3) OR (rule4 AND rule5)

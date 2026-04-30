import { z } from "zod"

export const EmailTemplate = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  subject: z.string().min(1),
  htmlContent: z.string().min(1),
  textContent: z.string().min(1),
  variables: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type EmailTemplate = z.infer<typeof EmailTemplate>

export const TemplateVariable = z.object({
  name: z.string().min(1),
  defaultValue: z.string().optional(),
  description: z.string().optional(),
})
export type TemplateVariable = z.infer<typeof TemplateVariable>

export const RenderedTemplate = z.object({
  subject: z.string(),
  htmlContent: z.string(),
  textContent: z.string(),
})
export type RenderedTemplate = z.infer<typeof RenderedTemplate>

// In-memory template storage (in production, this would be a database)
const templates: Map<string, EmailTemplate> = new Map()

export function saveTemplate(template: EmailTemplate): EmailTemplate {
  const now = new Date().toISOString()
  const existing = templates.get(template.id)
  
  const toSave: EmailTemplate = {
    ...template,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  
  templates.set(template.id, toSave)
  return toSave
}

export function getTemplate(id: string): EmailTemplate | null {
  return templates.get(id) ?? null
}

export function listTemplates(): EmailTemplate[] {
  return Array.from(templates.values())
}

export function deleteTemplate(id: string): boolean {
  return templates.delete(id)
}

export function renderTemplate(
  template: EmailTemplate,
  variables: Record<string, string>,
): RenderedTemplate {
  let html = template.htmlContent
  let text = template.textContent
  let subject = template.subject
  
  // Replace variables in the format {{variableName}}
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`
    html = html.replaceAll(placeholder, value)
    text = text.replaceAll(placeholder, value)
    subject = subject.replaceAll(placeholder, value)
  }
  
  return {
    subject,
    htmlContent: html,
    textContent: text,
  }
}

export function extractVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g
  const variables = new Set<string>()
  let match
  
  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1])
  }
  
  return Array.from(variables)
}

export function validateTemplate(template: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Check for basic HTML structure
  if (!template.includes('<html') && !template.includes('<body')) {
    errors.push('Template should include <html> and <body> tags for better email client compatibility')
  }
  
  // Check for unclosed tags (basic check)
  const openTags = (template.match(/<([a-z][a-z0-9]*)\b[^>]*>/gi) || []).length
  const closeTags = (template.match(/<\/([a-z][a-z0-9]*)>/gi) || []).length
  
  if (openTags !== closeTags) {
    errors.push('Template may have unclosed HTML tags')
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}
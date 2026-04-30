import { NextResponse, type NextRequest } from "next/server"
import { verifyAdmin, toErrorResponse } from "@/lib/auth/admin"
import {
  saveTemplate,
  getTemplate,
  listTemplates,
  deleteTemplate,
  renderTemplate,
  extractVariables,
  validateTemplate,
} from "@/lib/mailer/templates"
import { EmailTemplate as EmailTemplateSchema } from "@/lib/mailer/templates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    
    if (id) {
      const template = getTemplate(id)
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 })
      }
      return NextResponse.json(template)
    }
    
    return NextResponse.json({ templates: listTemplates() })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const body = await req.json()
    
    const action = body.action
    
    if (action === "validate") {
      const { htmlContent } = body
      const result = validateTemplate(htmlContent || "")
      return NextResponse.json(result)
    }
    
    if (action === "extract-variables") {
      const { htmlContent, textContent, subject } = body
      const variables = new Set<string>()
      
      if (htmlContent) {
        extractVariables(htmlContent).forEach(v => variables.add(v))
      }
      if (textContent) {
        extractVariables(textContent).forEach(v => variables.add(v))
      }
      if (subject) {
        extractVariables(subject).forEach(v => variables.add(v))
      }
      
      return NextResponse.json({ variables: Array.from(variables) })
    }
    
    if (action === "render") {
      const { templateId, variables } = body
      const template = getTemplate(templateId)
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 })
      }
      
      const rendered = renderTemplate(template, variables || {})
      return NextResponse.json(rendered)
    }
    
    // Default: save template
    const templateData = EmailTemplateSchema.parse(body)
    const saved = saveTemplate(templateData)
    return NextResponse.json(saved)
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdmin(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    
    if (!id) {
      return NextResponse.json({ error: "Template ID required" }, { status: 400 })
    }
    
    const deleted = deleteTemplate(id)
    if (!deleted) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
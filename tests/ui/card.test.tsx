import { describe, it, expect } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

describe('Card Component', () => {
  it('renders with default variant', () => {
    const { container } = render(<Card>Card Content</Card>)
    expect(screen.getByText('Card Content')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument()
  })

  it('renders with different variants', () => {
    const { rerender } = render(<Card variant="glass">Glass Card</Card>)
    expect(screen.getByText('Glass Card')).toBeInTheDocument()

    rerender(<Card variant="elevated">Elevated Card</Card>)
    expect(screen.getByText('Elevated Card')).toBeInTheDocument()

    rerender(<Card variant="outline">Outline Card</Card>)
    expect(screen.getByText('Outline Card')).toBeInTheDocument()
  })

  it('renders complete card structure', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>Card Content</CardContent>
        <CardFooter>Card Footer</CardFooter>
      </Card>
    )

    expect(screen.getByText('Card Title')).toBeInTheDocument()
    expect(screen.getByText('Card Description')).toBeInTheDocument()
    expect(screen.getByText('Card Content')).toBeInTheDocument()
    expect(screen.getByText('Card Footer')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">Custom Card</Card>)
    expect(screen.getByText('Custom Card')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="card"]')).toHaveClass('custom-class')
  })

  it('CardTitle renders as heading', () => {
    render(<CardTitle>Title</CardTitle>)
    const title = screen.getByRole('heading', { level: 3 })
    expect(title).toBeInTheDocument()
    expect(title).toHaveTextContent('Title')
  })

  it('CardDescription has muted text style', () => {
    render(<CardDescription>Description text</CardDescription>)
    const description = screen.getByText('Description text')
    expect(description).toHaveClass('text-muted-foreground')
  })
})
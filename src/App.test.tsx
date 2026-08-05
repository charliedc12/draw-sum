import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App.tsx'

describe('App shell', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('opens on Today', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })

  it('shows exactly the four tabs', () => {
    render(<App />)
    const tabs = screen.getByRole('navigation', { name: 'Main' })
    expect(within(tabs).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Today',
      'Path',
      'Session',
      'Log',
    ])
  })

  it('routes to a tab on tap', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: 'Path' }))
    expect(screen.getByRole('heading', { name: 'Path' })).toBeInTheDocument()
  })

  it('reaches Settings from the header, not a tab', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: 'Settings' }))
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })
})

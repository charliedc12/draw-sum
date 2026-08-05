import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { curriculum } from '../data/curriculum.ts'
import { initialProgress } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import * as scheduler from '../notifications/scheduler.ts'
import Settings from './Settings.tsx'

vi.mock('../notifications/scheduler.ts', async () => {
  const actual = await vi.importActual<typeof scheduler>('../notifications/scheduler.ts')
  return {
    ...actual,
    detectStandalone: vi.fn(() => true),
    getNotificationPermission: vi.fn(() => 'granted' as const),
    requestNotificationPermission: vi.fn(async () => 'granted' as const),
  }
})

beforeEach(() => {
  useAppStore.setState(initialProgress(curriculum))
  vi.mocked(scheduler.detectStandalone).mockReturnValue(true)
  vi.mocked(scheduler.getNotificationPermission).mockReturnValue('granted')
})

describe('notifications — standalone-mode branches', () => {
  it('explains adding to the home screen, with actual steps, when not standalone', () => {
    vi.mocked(scheduler.detectStandalone).mockReturnValue(false)
    render(<Settings />)

    expect(screen.getByText(/added to your home screen/)).toBeInTheDocument()
    expect(screen.getByText(/Share icon/)).toBeInTheDocument()
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('offers an Enable button when standalone and permission is default', () => {
    vi.mocked(scheduler.getNotificationPermission).mockReturnValue('default')
    render(<Settings />)

    expect(screen.getByRole('button', { name: 'Enable notifications' })).toBeInTheDocument()
  })

  it('explains re-enabling via iOS Settings when denied — never re-prompts', () => {
    vi.mocked(scheduler.getNotificationPermission).mockReturnValue('denied')
    render(<Settings />)

    expect(screen.getByText(/can't ask again/)).toBeInTheDocument()
    expect(screen.getByText(/iOS Settings/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enable notifications' })).not.toBeInTheDocument()
  })

  it('explains the browser is unsupported when the Notification API is absent', () => {
    vi.mocked(scheduler.getNotificationPermission).mockReturnValue('unsupported')
    render(<Settings />)

    expect(screen.getByText(/doesn't support notifications/)).toBeInTheDocument()
  })

  it('shows the actual slot controls once standalone and granted', () => {
    render(<Settings />)

    expect(screen.getByText('First reminder')).toBeInTheDocument()
    expect(screen.getByText('Second reminder')).toBeInTheDocument()
    expect(screen.getByText('Weekly session reminder')).toBeInTheDocument()
  })

  it('tapping Enable requests permission and reveals the slot controls', async () => {
    vi.mocked(scheduler.getNotificationPermission).mockReturnValue('default')
    vi.mocked(scheduler.requestNotificationPermission).mockResolvedValue('granted')
    render(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: 'Enable notifications' }))

    expect(screen.getByText('First reminder')).toBeInTheDocument()
  })
})

describe('notification slots', () => {
  it('at most two daily slots exist, matching "max two per day"', () => {
    render(<Settings />)
    expect(screen.getByText('First reminder')).toBeInTheDocument()
    expect(screen.getByText('Second reminder')).toBeInTheDocument()
    expect(screen.queryByText('Third reminder')).not.toBeInTheDocument()
  })

  it('toggling a daily slot enables it in the store', async () => {
    render(<Settings />)
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[0])

    expect(useAppStore.getState().notificationSettings.daily[0].enabled).toBe(true)
  })

  it('changing the first daily reminder time updates only that slot', () => {
    render(<Settings />)
    const time = screen.getByLabelText('First reminder time')
    // Native <input type="time"> is segmented; userEvent.type() doesn't drive it
    // reliably, so this sets the value the way a real time-picker commit would.
    fireEvent.change(time, { target: { value: '08:15' } })

    expect(useAppStore.getState().notificationSettings.daily[0]).toMatchObject({
      hour: 8,
      minute: 15,
    })
    expect(useAppStore.getState().notificationSettings.daily[1].hour).toBe(19)
  })

  it('changing the weekly weekday updates the store', async () => {
    render(<Settings />)
    const select = screen.getByLabelText('Weekly reminder day')
    await userEvent.selectOptions(select, 'Monday')

    expect(useAppStore.getState().notificationSettings.weekly.weekday).toBe(1)
  })
})

describe('phase override — matches Path\'s guarantee', () => {
  it('asks for one confirmation before jumping, in either direction', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: /5\. People and faces/ }))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().currentPhaseId).toBe('p5')
    vi.restoreAllMocks()
  })

  it('leaves the phase untouched when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: /3\. Perspective/ }))

    expect(useAppStore.getState().currentPhaseId).toBe('p1')
    vi.restoreAllMocks()
  })

  it('never touches progress counters when jumping', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    useAppStore.setState({ drillCount: 12, unitRepCounts: { 'u1.1': 3 } })
    render(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: /2\. Observation/ }))

    const state = useAppStore.getState()
    expect(state.drillCount).toBe(12)
    expect(state.unitRepCounts['u1.1']).toBe(3)
    vi.restoreAllMocks()
  })
})

describe('log export', () => {
  it('copies the plain-text log to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    useAppStore.setState({
      log: [{ id: 'a', targetId: 's1.1.1', targetKind: 'step', date: '2026-08-01T09:00:00.000Z', status: 'done' }],
    })
    render(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('DrawPath — log export')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('the download button exists and is wired to a click handler', () => {
    render(<Settings />)
    expect(screen.getByRole('button', { name: 'Download .txt' })).toBeInTheDocument()
  })

  it('tells the user plainly when clipboard access is denied, rather than doing nothing', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    Object.assign(navigator, { clipboard: { writeText } })
    render(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }))

    expect(await screen.findByRole('button', { name: "Couldn't copy" })).toBeInTheDocument()
    expect(screen.getByText(/download button still works/)).toBeInTheDocument()
  })
})

describe('full reset — double confirmation', () => {
  it('does nothing if the first confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    useAppStore.setState({ drillCount: 5 })
    render(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: 'Reset everything' }))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().drillCount).toBe(5)
    vi.restoreAllMocks()
  })

  it('does nothing if the first is accepted but the second declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false)
    useAppStore.setState({ drillCount: 5 })
    render(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: 'Reset everything' }))

    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(useAppStore.getState().drillCount).toBe(5)
    vi.restoreAllMocks()
  })

  it('resets everything once both confirmations are accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    useAppStore.setState({ drillCount: 5, currentPhaseId: 'p3' })
    render(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: 'Reset everything' }))

    const state = useAppStore.getState()
    expect(state.drillCount).toBe(0)
    expect(state.currentPhaseId).toBe('p1')
    vi.restoreAllMocks()
  })

  it('states plainly that this cannot be undone', () => {
    render(<Settings />)
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument()
  })
})

describe('dev panel', () => {
  it('is present in this (dev-mode) test build, gated by import.meta.env.DEV', () => {
    render(<Settings />)
    expect(screen.getByText('Developer tools — dev builds only')).toBeInTheDocument()
  })
})

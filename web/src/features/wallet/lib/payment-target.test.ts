import { beforeEach, describe, expect, test, vi } from 'vitest'

import { submitPaymentForm } from './payment'

describe('payment form navigation', () => {
  beforeEach(() => {
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
  })

  test('submits in the current tab so async payment requests are not blocked', () => {
    let submittedForm: HTMLFormElement | undefined
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      submittedForm = node as HTMLFormElement
      return node
    })
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)
    submitPaymentForm('https://pay.example.test/submit.php', { trade: 'T1' })
    expect(submittedForm?.target).toBe('_self')
  })
})

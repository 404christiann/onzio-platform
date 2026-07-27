import { beforeEach, vi } from 'vitest'

// vi.clearAllMocks() in test files clears call history but NOT mockReturnValueOnce
// queues or mockImplementation. This global beforeEach ensures full reset between tests.
beforeEach(() => {
  vi.resetAllMocks()
})

import { describe, expect, it } from 'vitest'
import { publicReplayErrorCopy } from './errors'

describe('public replay error copy', () => {
  it('localizes unauthorized delete failures', () => {
    expect(publicReplayErrorCopy('ru', {
      code: 'unauthorized',
      message: 'This replay cannot be deleted with the provided token.',
    })).toBe('Недостаточно прав, чтобы удалить этот повтор.')
  })
})

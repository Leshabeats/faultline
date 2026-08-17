import { describe, expect, it } from 'vitest'
import { publicReplayShareUrl } from './shareLink'

describe('public replay share url', () => {
  it('copies the current public URL when the page is already open', () => {
    expect(publicReplayShareUrl('pub-1', 'http://127.0.0.1:4173/#/r/pub-1'))
      .toBe('http://127.0.0.1:4173/#/r/pub-1')
  })

  it('falls back to the hash route when no href is available', () => {
    expect(publicReplayShareUrl('pub-1')).toBe('/#/r/pub-1')
  })
})

import { describe, expect, it } from 'vitest'
import { isPublicReplayId, publicReplayHash, readAppRoute, workspaceHref } from './routing'

describe('public replay routing', () => {
  it('accepts hash routes used by GitHub Pages', () => {
    expect(readAppRoute({
      hash: '#/r/AbCdEfGhIjKlMnOpQrStUv',
      pathname: '/faultline/',
      search: '',
    })).toEqual({ kind: 'public-replay', id: 'AbCdEfGhIjKlMnOpQrStUv' })
  })

  it('accepts a clean pathname when a host can rewrite it', () => {
    expect(readAppRoute({
      hash: '',
      pathname: '/r/AbCdEfGhIjKlMnOpQrStUv',
      search: '',
    })).toEqual({ kind: 'public-replay', id: 'AbCdEfGhIjKlMnOpQrStUv' })
  })

  it('ignores sequential or undersized ids', () => {
    expect(isPublicReplayId('1')).toBe(false)
    expect(readAppRoute({
      hash: '#/r/1',
      pathname: '/',
      search: '',
    })).toEqual({ kind: 'workspace' })
  })

  it('builds a hash URL that stays compatible with static hosting', () => {
    expect(publicReplayHash('AbCdEfGhIjKlMnOpQrStUv')).toBe('#/r/AbCdEfGhIjKlMnOpQrStUv')
  })

  it('leaves pathname replay routes instead of only clearing the hash', () => {
    expect(workspaceHref({
      origin: 'http://127.0.0.1:4173',
      pathname: '/r/AbCdEfGhIjKlMnOpQrStUv',
    })).toBe('http://127.0.0.1:4173/')
  })
})

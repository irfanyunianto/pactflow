import { describe, expect, test } from 'bun:test'
import { collectAgreementReads, getAgreementRole, selectDashboardAgreements } from '../dashboardScope'
import type { AgreementData } from '../../types/pactflow'

const wallet = '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD'
const other = '0x1111111111111111111111111111111111111111'
const nextWallet = '0x2222222222222222222222222222222222222222'
const agreement = (overrides: Partial<AgreementData> = {}): AgreementData => ({
  funder: other, builder: other, arbitrator: other, token: other, status: 0,
  milestones: [], totalAmount: 1n, totalFunded: 0n, pendingCount: 0n,
  activeCount: 0n, isFunded: false, ...overrides,
})
const registry = new Map([
  ['3', agreement({ funder: nextWallet, status: 0 })],
  ['2', agreement({ arbitrator: wallet.toLowerCase(), status: 2 })],
  ['1', agreement({ builder: wallet.toLowerCase(), status: 1 })],
  ['0', agreement({ funder: wallet.toLowerCase(), status: 0 })],
])

describe('dashboard ownership and status scope', () => {
  for (const role of ['funder', 'builder', 'arbitrator'] as const) {
    test(`matches ${role} without case sensitivity`, () => {
      expect(getAgreementRole(agreement({ [role]: wallet.toLowerCase() }), wallet)).toBe(role)
      expect(getAgreementRole(agreement({ [role]: wallet }), wallet.toLowerCase())).toBe(role)
    })
  }
  test('does not match unrelated or disconnected addresses', () => {
    expect(getAgreementRole(agreement(), wallet)).toBeNull()
    expect(getAgreementRole(agreement({ funder: wallet }))).toBeNull()
  })
  test('my scope includes all three roles once and excludes unrelated records', () => {
    const result = selectDashboardAgreements(registry, 'mine', wallet, 'all')
    expect(result.filtered.map(([id]) => id)).toEqual(['2', '1', '0'])
    expect(result.counts).toEqual({ all: 3, active: 1, completed: 1, cancelled: 1 })
  })
  for (const [filter, expected] of [['active', '0'], ['completed', '1'], ['cancelled', '2']] as const) {
    test(`combines ${filter} with ownership while keeping scope counts`, () => {
      const result = selectDashboardAgreements(registry, 'mine', wallet, filter)
      expect(result.filtered.map(([id]) => id)).toEqual([expected])
      expect(result.counts.all).toBe(3)
      expect(selectDashboardAgreements(registry, 'all', wallet, filter).counts.all).toBe(4)
    })
  }
  test('wallet with no agreements is empty only within its own scope', () => {
    expect(selectDashboardAgreements(registry, 'mine', '0x9999', 'all').counts.all).toBe(0)
    expect(selectDashboardAgreements(registry, 'all', '0x9999', 'all').counts.all).toBe(4)
  })
  test('switching wallets recomputes ownership, counts, and status intersection', () => {
    const result = selectDashboardAgreements(registry, 'mine', nextWallet, 'all')
    expect(result.filtered.map(([id]) => id)).toEqual(['3'])
    expect(result.counts).toEqual({ all: 1, active: 1, completed: 0, cancelled: 0 })
    expect(selectDashboardAgreements(registry, 'mine', nextWallet, 'completed').filtered).toEqual([])
  })
  test('disconnected all scope exposes the registry with status still applied', () => {
    expect(selectDashboardAgreements(registry, 'all', undefined, 'all').counts.all).toBe(4)
    expect(selectDashboardAgreements(registry, 'all', undefined, 'active').filtered.map(([id]) => id)).toEqual(['3', '0'])
    expect(selectDashboardAgreements(registry, 'mine', undefined, 'all').filtered).toEqual([])
  })
})

describe('complete registry reads', () => {
  const ids = [3n, 2n, 1n, 0n]
  const successful = Array.from(registry.values()).map(result => ({ status: 'success', result }))
  test('waits for reads even when a wallet has no matches so far', () => {
    expect(collectAgreementReads(ids, undefined).complete).toBe(false)
    expect(collectAgreementReads(ids, successful.slice(0, 1)).complete).toBe(false)
  })
  test('rejects a partial registry with one failed read', () => {
    const result = collectAgreementReads(ids, [successful[0], { status: 'failure' }, ...successful.slice(2)])
    expect(result.complete).toBe(false)
    expect([...result.errors]).toEqual(['2'])
  })
  test('malformed successful data is a read error, not a false empty result', () => {
    const result = collectAgreementReads([0n], [{ status: 'success', result: { funder: wallet } }])
    expect(result.complete).toBe(false)
    expect(result.errors.has('0')).toBe(true)
  })
  test('retry recovery replaces the failed result with the complete registry', () => {
    const result = collectAgreementReads(ids, successful)
    expect(result.complete).toBe(true)
    expect(result.errors.size).toBe(0)
    expect(selectDashboardAgreements(result.agreements, 'mine', wallet, 'all').counts.all).toBe(3)
  })
  test('confirmed zero registry is complete', () => {
    expect(collectAgreementReads([], undefined).complete).toBe(true)
  })
})

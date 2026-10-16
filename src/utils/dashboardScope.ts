import type { AgreementData } from '@/types/pactflow'
import { AgreementStatus } from '@/contracts/pactflow'

export type AgreementScope = 'mine' | 'all'
export type AgreementFilter = 'all' | 'active' | 'completed' | 'cancelled'
export type AgreementRole = 'funder' | 'builder' | 'arbitrator'

export function getAgreementRole(agreement: AgreementData, address?: string): AgreementRole | null {
  if (!address) return null
  const normalized = address.toLowerCase()
  return (['funder', 'builder', 'arbitrator'] as const)
    .find(role => agreement[role].toLowerCase() === normalized) ?? null
}

/** Only a complete registry may supply counts, an empty state, or a filtered list. */
export function collectAgreementReads(
  ids: readonly bigint[],
  reads: readonly { status: string; result?: unknown }[] | undefined,
) {
  const agreements = new Map<string, AgreementData>()
  const errors = new Set<string>()
  ids.forEach((id, index) => {
    const read = reads?.[index]
    if (!read) return
    const data = read.result as AgreementData | undefined
    if (read.status === 'success' && data &&
      typeof data.funder === 'string' && typeof data.builder === 'string' &&
      typeof data.arbitrator === 'string' && typeof data.totalAmount === 'bigint' &&
      typeof data.status === 'number' && Array.isArray(data.milestones)) {
      agreements.set(id.toString(), data)
    } else {
      errors.add(id.toString())
    }
  })
  return { agreements, errors, complete: agreements.size === ids.length && errors.size === 0 }
}

export function selectDashboardAgreements(
  agreements: Map<string, AgreementData>, scope: AgreementScope,
  address: string | undefined, filter: AgreementFilter,
) {
  const scoped = Array.from(agreements.entries())
    .filter(([, agreement]) => scope === 'all' || getAgreementRole(agreement, address) !== null)
  const counts = {
    all: scoped.length,
    active: scoped.filter(([, ag]) => Number(ag.status) === Number(AgreementStatus.Active)).length,
    completed: scoped.filter(([, ag]) => Number(ag.status) === Number(AgreementStatus.Completed)).length,
    cancelled: scoped.filter(([, ag]) => Number(ag.status) === Number(AgreementStatus.Cancelled)).length,
  }
  const statuses = { active: AgreementStatus.Active, completed: AgreementStatus.Completed, cancelled: AgreementStatus.Cancelled }
  const filtered = filter === 'all' ? scoped : scoped.filter(([, ag]) => Number(ag.status) === Number(statuses[filter]))
  return { counts, filtered }
}

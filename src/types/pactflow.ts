// Strongly-typed shapes that match the actual ABI output from wagmi useReadContract.
// wagmi returns Solidity structs as named objects, never positional arrays.

import { AgreementStatus, MilestoneStatus } from '@/contracts/pactflow'

export interface MilestoneData {
  description: string
  amount: bigint
  deadline: bigint       // uint64 — seconds since epoch
  disputeDeadline: bigint // uint64
  status: MilestoneStatus | number
  evidenceUrl: string
  fundsReleased: boolean
}

export interface AgreementData {
  funder: string
  builder: string
  arbitrator: string
  token: string
  status: AgreementStatus | number
  milestones: MilestoneData[]
  totalAmount: bigint    // sum of all milestone amounts (set at creation)
  totalFunded: bigint    // actual funded amount (set by fundAgreement)
  pendingCount: bigint
  activeCount: bigint
  isFunded: boolean
}

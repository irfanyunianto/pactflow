import artifact from './PactFlowABI.json'
import { getUsdc, requireChain } from '@/onchain-facts'

export const ARC_TESTNET_CHAIN_ID = 5042002

const chain = requireChain(ARC_TESTNET_CHAIN_ID)
const usdcFact = getUsdc(ARC_TESTNET_CHAIN_ID)
if (!usdcFact) throw new Error('USDC not found on Arc Testnet')

export const USDC_ADDRESS = usdcFact.address as `0x${string}`
export const USDC_DECIMALS = usdcFact.decimals

export const PACTFLOW_ADDRESS = '0x555a4cb9b7796d692c4a5edeb845effd9c8af470' as const
export const PACTFLOW_ABI = artifact.abi

export const EXPLORER_BASE = chain.explorerBase

export function buildTxUrl(hash: string) {
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function buildAddressUrl(addr: string) {
  return `${EXPLORER_BASE}/address/${addr}`
}

export enum AgreementStatus {
  Active = 0,
  Completed = 1,
  Cancelled = 2,
}

export enum MilestoneStatus {
  Pending = 0,
  Submitted = 1,
  Approved = 2,
  Released = 3,
  Disputed = 4,
  Refunded = 5,
}

export const MILESTONE_STATUS_LABELS: Record<number, string> = {
  0: 'Pending',
  1: 'Submitted',
  2: 'Approved',
  3: 'Released',
  4: 'Disputed',
  5: 'Refunded',
}

export const AGREEMENT_STATUS_LABELS: Record<number, string> = {
  0: 'Active',
  1: 'Completed',
  2: 'Cancelled',
}

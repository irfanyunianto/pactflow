import {
  useReadContract, useWriteContract, useWaitForTransactionReceipt,
  useAccount,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { useCallback, useEffect, useRef } from 'react'
import {
  PACTFLOW_ADDRESS,
  PACTFLOW_ABI,
  USDC_ADDRESS,
  ARC_TESTNET_CHAIN_ID,
} from '@/contracts/pactflow'
import { retryRefetch } from '@/utils/retryRefetch'

export function useAgreementCount() {
  return useReadContract({
    address: PACTFLOW_ADDRESS,
    abi: PACTFLOW_ABI,
    functionName: 'agreementCount',
    chainId: ARC_TESTNET_CHAIN_ID,
  })
}

export function useAgreement(agreementId: bigint | undefined) {
  return useReadContract({
    address: PACTFLOW_ADDRESS,
    abi: PACTFLOW_ABI,
    functionName: 'getAgreement',
    args: agreementId !== undefined ? [agreementId] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: agreementId !== undefined },
  })
}

export function useMilestone(agreementId: bigint | undefined, milestoneIndex: bigint | undefined) {
  return useReadContract({
    address: PACTFLOW_ADDRESS,
    abi: PACTFLOW_ABI,
    functionName: 'getMilestone',
    args: agreementId !== undefined && milestoneIndex !== undefined
      ? [agreementId, milestoneIndex]
      : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: agreementId !== undefined && milestoneIndex !== undefined },
  })
}

export function useMilestoneCount(agreementId: bigint | undefined) {
  return useReadContract({
    address: PACTFLOW_ADDRESS,
    abi: PACTFLOW_ABI,
    functionName: 'getMilestoneCount',
    args: agreementId !== undefined ? [agreementId] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: agreementId !== undefined },
  })
}

export function useAgreementBalance(agreementId: bigint | undefined) {
  return useReadContract({
    address: PACTFLOW_ADDRESS,
    abi: PACTFLOW_ABI,
    functionName: 'agreementBalance',
    args: agreementId !== undefined ? [agreementId] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: agreementId !== undefined },
  })
}

export function usePendingWithdrawals(address: `0x${string}` | undefined) {
  return useReadContract({
    address: PACTFLOW_ADDRESS,
    abi: PACTFLOW_ABI,
    functionName: 'pendingWithdrawals',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })
}

export function useUSDCBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })
}

export function useUSDCAllowance(owner: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner ? [owner, PACTFLOW_ADDRESS] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!owner },
  })
}

// ── Re-export pure types so callers can import from one place ─────────────────
export type { SyncResult, RefetchFn, PostconditionFn } from '@/utils/retryRefetch'

// ── Bounded-retry refetch hook ────────────────────────────────────────────────
//
// Wraps the pure `retryRefetch` utility with React lifecycle management:
//   - Cancels any in-flight loop when syncAll() is called again (supersede).
//   - Cancels all loops on component unmount via AbortController.
//   - Returns a stable `syncAll` callback (changes only when options change).
//   - Threads an optional `check` postcondition into every retryRefetch call.
//
// SyncResult:
//   'fresh'     — postcondition passed; data confirmed post-tx.
//   'exhausted' — all attempts fired, postcondition never passed.
//   'cancelled' — signal aborted (unmount / wallet / agreement change).
//
// CRITICAL: callers MUST NOT call setSyncState('idle') when the result is
// 'cancelled' — doing so would stomp a newer sync's 'syncing' state.

import type { SyncResult, RefetchFn, PostconditionFn } from '@/utils/retryRefetch'

export function useRefetchGroup(
  refetches: RefetchFn[],
  options?: { maxAttempts?: number; intervalMs?: number },
): { syncAll: (check?: PostconditionFn) => Promise<SyncResult>; abort: () => void } {
  const { maxAttempts = 4, intervalMs = 1500 } = options ?? {}

  const refetchesRef  = useRef(refetches)
  // The current AbortController — replaced on each syncAll() call and
  // aborted on unmount or on explicit abort().
  const controllerRef = useRef<AbortController | null>(null)

  // Keep the refetches list current without re-creating syncAll.
  useEffect(() => { refetchesRef.current = refetches })

  // Abort any running loop on unmount.
  useEffect(() => {
    return () => { controllerRef.current?.abort() }
  }, [])

  const syncAll = useCallback((check?: PostconditionFn): Promise<SyncResult> => {
    // Supersede any prior loop.
    controllerRef.current?.abort()
    const ctrl = new AbortController()
    controllerRef.current = ctrl

    return retryRefetch(refetchesRef.current, ctrl.signal, { maxAttempts, intervalMs, check })
  }, [maxAttempts, intervalMs])

  // Explicitly abort the current loop without starting a new one.
  // Use this when identity changes (wallet/chain) invalidate in-flight syncs.
  const abort = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  return { syncAll, abort }
}

// ── Write hooks ───────────────────────────────────────────────────────────────

export function useCreateAgreement() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function create(args: {
    builder: `0x${string}`
    arbitrator: `0x${string}`
    milestones: Array<{ description: string; amount: bigint; deadline: bigint }>
  }) {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'createAgreement',
      args: [args.builder, args.arbitrator, USDC_ADDRESS, args.milestones],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { create, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useFundAgreement() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function fund(agreementId: bigint) {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'fundAgreement',
      args: [agreementId],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { fund, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useApproveUSDC() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function approve(amount: bigint) {
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PACTFLOW_ADDRESS, amount],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useSubmitEvidence() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function submit(agreementId: bigint, milestoneIndex: bigint, evidenceUrl: string) {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'submitEvidence',
      args: [agreementId, milestoneIndex, evidenceUrl],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { submit, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useApproveMilestone() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function approve(agreementId: bigint, milestoneIndex: bigint) {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'approveMilestone',
      args: [agreementId, milestoneIndex],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useReleaseMilestone() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function release(agreementId: bigint, milestoneIndex: bigint) {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'releaseMilestone',
      args: [agreementId, milestoneIndex],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { release, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useRaiseDispute() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function raise(agreementId: bigint, milestoneIndex: bigint) {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'raiseDispute',
      args: [agreementId, milestoneIndex],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { raise, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useResolveDispute() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function resolve(agreementId: bigint, milestoneIndex: bigint, favorFunder: boolean) {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'resolveDispute',
      args: [agreementId, milestoneIndex, favorFunder],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { resolve, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useCancelAgreement() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function cancel(agreementId: bigint) {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'cancelAgreement',
      args: [agreementId],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { cancel, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useClaimExpiredMilestone() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function claimExpired(agreementId: bigint, milestoneIndex: bigint) {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'claimExpiredMilestone',
      args: [agreementId, milestoneIndex],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { claimExpired, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useWithdraw() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  function withdraw() {
    writeContract({
      address: PACTFLOW_ADDRESS,
      abi: PACTFLOW_ABI,
      functionName: 'withdraw',
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return { withdraw, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useWalletRole(
  funder: string | undefined,
  builder: string | undefined,
  arbitrator: string | undefined,
): 'funder' | 'builder' | 'arbitrator' | 'observer' | null {
  const { address } = useAccount()
  if (!address) return null
  if (!funder && !builder && !arbitrator) return null
  const addr = address.toLowerCase()
  if (funder?.toLowerCase() === addr) return 'funder'
  if (builder?.toLowerCase() === addr) return 'builder'
  if (arbitrator?.toLowerCase() === addr) return 'arbitrator'
  return 'observer'
}

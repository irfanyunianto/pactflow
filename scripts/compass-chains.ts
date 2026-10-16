/**
 * Metadata adapter for Compass chain IDs. The original private
 * @circlefin/compass-chains package is not published to the npm registry.
 * Use the already installed viem definitions; never substitute an RPC here.
 */
import type { Chain } from 'viem'
import {
  arcTestnet, mainnet, sepolia, base, baseSepolia, arbitrum, arbitrumSepolia,
  avalanche, avalancheFuji, optimism, optimismSepolia, polygon, polygonAmoy,
  unichain, unichainSepolia,
} from 'viem/chains'

const chains: Record<string, Chain> = {
  Arc_Testnet: arcTestnet,
  Ethereum: mainnet,
  Ethereum_Sepolia: sepolia,
  Base: base,
  Base_Sepolia: baseSepolia,
  Arbitrum: arbitrum,
  Arbitrum_Sepolia: arbitrumSepolia,
  Avalanche: avalanche,
  Avalanche_Fuji: avalancheFuji,
  Optimism: optimism,
  Optimism_Sepolia: optimismSepolia,
  Polygon: polygon,
  Polygon_Amoy: polygonAmoy,
  Unichain: unichain,
  Unichain_Sepolia: unichainSepolia,
}

export function getChain(id: string) {
  const chain = Object.prototype.hasOwnProperty.call(chains, id) ? chains[id] : undefined
  if (!chain) throw new Error(`Unsupported Compass chain ID: ${id}`)
  return {
    id: chain.id,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    explorerUrl: chain.blockExplorers?.default.url,
  }
}

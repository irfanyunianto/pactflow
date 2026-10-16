import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { getChain } from '../compass-chains'

void describe('Compass metadata adapter', () => {
  void test('Arc keeps USDC gas and its original explorer', () => {
    const chain = getChain('Arc_Testnet')
    assert.equal(chain.id, 5042002)
    assert.equal(chain.nativeCurrency.symbol, 'USDC')
    assert.equal(chain.explorerUrl, 'https://testnet.arcscan.app')
  })
  void test('Base Sepolia keeps native ETH gas', () => {
    const chain = getChain('Base_Sepolia')
    assert.equal(chain.id, 84532)
    assert.equal(chain.nativeCurrency.symbol, 'ETH')
    assert.equal(chain.explorerUrl, 'https://sepolia.basescan.org')
  })
  void test('unknown IDs fail closed instead of using another chain', () => {
    assert.throws(() => getChain('Arc_Testne'), /Unsupported Compass chain ID/)
    assert.throws(() => getChain('toString'))
  })
})

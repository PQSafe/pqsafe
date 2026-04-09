import { useState } from 'react'
import type { PQKeyPair } from '../../crypto/keygen'
import { bytesToHex } from '@noble/hashes/utils.js'
import { clearWallet } from '../../store/chromeStorage'

interface Props {
  wallet: PQKeyPair
  onSign: () => void
  onReset: () => void
}

export function Dashboard({ wallet, onSign, onReset }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const [showReset, setShowReset] = useState(false)

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleReset = async () => {
    await clearWallet()
    onReset()
  }

  const truncAddr = wallet.address.slice(0, 10) + '...' + wallet.address.slice(-8)
  const dsaPubHex = bytesToHex(wallet.dsa.publicKey)
  const kemPubHex = bytesToHex(wallet.kem.publicKey)

  return (
    <div className="flex flex-col gap-4">
      {/* Address Card */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 p-4">
        <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Your PQ Address</div>
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-emerald-300 flex-1">{truncAddr}</code>
          <button
            onClick={() => copyToClipboard(wallet.address, 'address')}
            className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition"
          >
            {copied === 'address' ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Key Info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3">
          <div className="text-[10px] text-gray-500 mb-1">Signing Algorithm</div>
          <div className="text-xs font-semibold text-white">ML-DSA-65</div>
          <div className="text-[10px] text-gray-500">FIPS 204</div>
          <div className="text-[10px] text-gray-600 mt-1">{(wallet.dsa.publicKey.length / 1024).toFixed(1)}KB pubkey</div>
        </div>
        <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3">
          <div className="text-[10px] text-gray-500 mb-1">Key Encapsulation</div>
          <div className="text-xs font-semibold text-white">ML-KEM-768</div>
          <div className="text-[10px] text-gray-500">FIPS 203</div>
          <div className="text-[10px] text-gray-600 mt-1">{(wallet.kem.publicKey.length / 1024).toFixed(1)}KB pubkey</div>
        </div>
      </div>

      {/* Public Key Export */}
      <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3">
        <div className="text-[10px] text-gray-500 mb-2">Public Keys</div>
        <div className="flex gap-2">
          <button
            onClick={() => copyToClipboard(dsaPubHex, 'dsa')}
            className="flex-1 text-[10px] py-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition"
          >
            {copied === 'dsa' ? 'Copied!' : 'Copy DSA Key'}
          </button>
          <button
            onClick={() => copyToClipboard(kemPubHex, 'kem')}
            className="flex-1 text-[10px] py-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition"
          >
            {copied === 'kem' ? 'Copied!' : 'Copy KEM Key'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={onSign}
        className="w-full py-3 rounded-xl font-semibold text-sm
          bg-gradient-to-r from-emerald-500 to-cyan-500 text-black
          hover:from-emerald-400 hover:to-cyan-400 transition-all"
      >
        Sign Message
      </button>

      {/* Reset */}
      {!showReset ? (
        <button
          onClick={() => setShowReset(true)}
          className="text-[10px] text-gray-600 hover:text-gray-400 transition"
        >
          Reset Wallet
        </button>
      ) : (
        <div className="flex items-center gap-2 justify-center">
          <span className="text-[10px] text-red-400">Delete wallet?</span>
          <button onClick={handleReset} className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">
            Yes, delete
          </button>
          <button onClick={() => setShowReset(false)} className="text-[10px] px-2 py-1 rounded bg-gray-700 text-gray-400">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

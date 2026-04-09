import { useState } from 'react'
import type { PQKeyPair } from '../../crypto/keygen'
import { generateWallet } from '../../crypto/keygen'
import { saveWallet } from '../../store/chromeStorage'

interface Props {
  onCreated: (kp: PQKeyPair) => void
}

export function Welcome({ onCreated }: Props) {
  const [generating, setGenerating] = useState(false)

  const handleCreate = async () => {
    setGenerating(true)
    // Small delay to show spinner (keygen is ~50-100ms)
    await new Promise(r => setTimeout(r, 50))
    const wallet = generateWallet()
    await saveWallet(wallet)
    onCreated(wallet)
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 pt-8">
      {/* Shield icon */}
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      </div>

      <div className="text-center">
        <h1 className="text-xl font-bold mb-2">PQSafe Wallet</h1>
        <p className="text-sm text-gray-400 max-w-[280px]">
          The world's first post-quantum secure crypto wallet.
          Protected by NIST ML-DSA & ML-KEM standards.
        </p>
      </div>

      {/* Feature badges */}
      <div className="flex flex-wrap justify-center gap-2">
        {['ML-DSA-65', 'ML-KEM-768', 'FIPS 204', 'FIPS 203'].map(label => (
          <span key={label} className="text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
            {label}
          </span>
        ))}
      </div>

      <button
        onClick={handleCreate}
        disabled={generating}
        className="w-full max-w-[260px] py-3 rounded-xl font-semibold text-sm
          bg-gradient-to-r from-emerald-500 to-cyan-500 text-black
          hover:from-emerald-400 hover:to-cyan-400
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200"
      >
        {generating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full" />
            Generating Quantum-Safe Keys...
          </span>
        ) : (
          'Create Wallet'
        )}
      </button>

      <p className="text-[10px] text-gray-600 text-center max-w-[260px]">
        Generates ML-DSA-65 signing keys and ML-KEM-768 encryption keys using cryptographically secure randomness.
      </p>
    </div>
  )
}

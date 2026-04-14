import { useState } from 'react'
import type { PQKeyPair } from '../../crypto/keygen'
import { generateWallet } from '../../crypto/keygen'
import { saveWallet } from '../../store/chromeStorage'

interface Props {
  onCreated: (kp: PQKeyPair) => void
  onImport: () => void
}

export function Welcome({ onCreated, onImport }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')
    setBusy(true)
    try {
      await new Promise(r => setTimeout(r, 30))
      const wallet = generateWallet()
      await saveWallet(wallet, password)
      onCreated(wallet)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-5 pt-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </div>

      <div className="text-center">
        <h1 className="text-lg font-bold mb-1">PQSafe Wallet</h1>
        <p className="text-[11px] text-gray-400 max-w-[280px]">
          Post-quantum keys, protected by a password on your device.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        {['ML-DSA-65', 'ML-KEM-768', 'FIPS 204', 'FIPS 203'].map(label => (
          <span key={label} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
            {label}
          </span>
        ))}
      </div>

      <form onSubmit={handleCreate} className="w-full max-w-[280px] space-y-2.5">
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white
            placeholder:text-gray-600 focus:outline-none focus:border-emerald-500"
        />
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Confirm password"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white
            placeholder:text-gray-600 focus:outline-none focus:border-emerald-500"
        />
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-xl font-semibold text-sm
            bg-gradient-to-r from-emerald-500 to-cyan-500 text-black
            hover:from-emerald-400 hover:to-cyan-400
            disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {busy ? 'Generating Quantum-Safe Keys...' : 'Create Wallet'}
        </button>
      </form>

      <button
        onClick={onImport}
        className="text-[11px] text-gray-500 hover:text-emerald-300 transition"
      >
        Already have a wallet? Import
      </button>

      <p className="text-[9px] text-gray-600 text-center max-w-[260px] leading-relaxed">
        Your password encrypts the wallet with AES-256-GCM (PBKDF2, 600k iterations). Lose it and your keys are gone — there is no recovery.
      </p>
    </div>
  )
}

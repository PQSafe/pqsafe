import { useState } from 'react'
import type { PQKeyPair } from '../../crypto/keygen'
import { loadWallet, clearWallet } from '../../store/chromeStorage'

interface Props {
  address: string
  onUnlocked: (kp: PQKeyPair) => void
  onReset: () => void
}

export function Unlock({ address, onUnlocked, onReset }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showReset, setShowReset] = useState(false)

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const kp = await loadWallet(password)
      onUnlocked(kp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed')
    } finally {
      setBusy(false)
    }
  }

  const handleReset = async () => {
    await clearWallet()
    onReset()
  }

  const truncAddr = address.slice(0, 10) + '...' + address.slice(-8)

  return (
    <div className="flex flex-col items-center justify-center gap-5 pt-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <div className="text-center">
        <h1 className="text-lg font-bold mb-1">Unlock Wallet</h1>
        <code className="text-[11px] text-emerald-300 font-mono">{truncAddr}</code>
      </div>

      <form onSubmit={handleUnlock} className="w-full max-w-[280px] space-y-3">
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white
            placeholder:text-gray-600 focus:outline-none focus:border-emerald-500"
        />
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full py-2.5 rounded-xl font-semibold text-sm
            bg-gradient-to-r from-emerald-500 to-cyan-500 text-black
            hover:from-emerald-400 hover:to-cyan-400
            disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {busy ? 'Unlocking...' : 'Unlock'}
        </button>
      </form>

      {!showReset ? (
        <button
          onClick={() => setShowReset(true)}
          className="text-[10px] text-gray-600 hover:text-gray-400 transition"
        >
          Forgot password? Reset wallet
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-red-400">This deletes your keys forever.</span>
          <button onClick={handleReset} className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-400">
            Delete
          </button>
          <button onClick={() => setShowReset(false)} className="text-[10px] px-2 py-1 rounded bg-gray-700 text-gray-400">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

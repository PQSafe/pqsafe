import { useState, useEffect } from 'react'
import type { PQKeyPair } from '../crypto/keygen'
import { loadWallet } from '../store/chromeStorage'
import { Welcome } from './views/Welcome'
import { Dashboard } from './views/Dashboard'
import { SignMessage } from './views/SignMessage'

type View = 'welcome' | 'dashboard' | 'sign'

export function App() {
  const [view, setView] = useState<View>('welcome')
  const [wallet, setWallet] = useState<PQKeyPair | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWallet().then(w => {
      if (w) {
        setWallet(w)
        setView('dashboard')
      }
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
      </div>
    )
  }

  const onWalletCreated = (kp: PQKeyPair) => {
    setWallet(kp)
    setView('dashboard')
  }

  const onReset = () => {
    setWallet(null)
    setView('welcome')
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-xs font-bold text-black">
            PQ
          </div>
          <span className="font-semibold text-sm">PQSafe</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Quantum-Safe
        </span>
      </header>

      {/* Content */}
      <main className="flex-1 p-4">
        {view === 'welcome' && <Welcome onCreated={onWalletCreated} />}
        {view === 'dashboard' && wallet && (
          <Dashboard
            wallet={wallet}
            onSign={() => setView('sign')}
            onReset={onReset}
          />
        )}
        {view === 'sign' && wallet && (
          <SignMessage
            wallet={wallet}
            onBack={() => setView('dashboard')}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="px-4 py-2 text-center text-[10px] text-gray-600 border-t border-gray-800">
        FIPS 204 (ML-DSA-65) + FIPS 203 (ML-KEM-768)
      </footer>
    </div>
  )
}

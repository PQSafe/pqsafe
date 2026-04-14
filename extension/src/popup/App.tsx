import { useState, useEffect } from 'react'
import type { PQKeyPair } from '../crypto/keygen'
import { hasStoredWallet, getStoredWalletMeta } from '../store/chromeStorage'
import { Welcome } from './views/Welcome'
import { Unlock } from './views/Unlock'
import { ImportWallet } from './views/ImportWallet'
import { ExportWallet } from './views/ExportWallet'
import { Dashboard } from './views/Dashboard'
import { SignMessage } from './views/SignMessage'
import { EncryptMessage } from './views/EncryptMessage'
import { DecryptMessage } from './views/DecryptMessage'

type View = 'welcome' | 'unlock' | 'import' | 'dashboard' | 'sign' | 'encrypt' | 'decrypt' | 'export'

export function App() {
  const [view, setView] = useState<View>('welcome')
  const [wallet, setWallet] = useState<PQKeyPair | null>(null)
  const [storedAddress, setStoredAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      if (await hasStoredWallet()) {
        const meta = await getStoredWalletMeta()
        setStoredAddress(meta?.address || null)
        setView('unlock')
      } else {
        setView('welcome')
      }
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
      </div>
    )
  }

  const onUnlocked = (kp: PQKeyPair) => { setWallet(kp); setView('dashboard') }
  const onCreated = (kp: PQKeyPair) => { setWallet(kp); setView('dashboard') }
  const onReset = () => { setWallet(null); setStoredAddress(null); setView('welcome') }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-xs font-bold text-black">PQ</div>
          <span className="font-semibold text-sm">PQSafe</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Quantum-Safe
        </span>
      </header>

      <main className="flex-1 p-4">
        {view === 'welcome' && <Welcome onCreated={onCreated} onImport={() => setView('import')} />}
        {view === 'unlock' && storedAddress && (
          <Unlock address={storedAddress} onUnlocked={onUnlocked} onReset={onReset} />
        )}
        {view === 'import' && <ImportWallet onImported={onUnlocked} onBack={() => setView('welcome')} />}
        {view === 'dashboard' && wallet && (
          <Dashboard
            wallet={wallet}
            onSign={() => setView('sign')}
            onEncrypt={() => setView('encrypt')}
            onDecrypt={() => setView('decrypt')}
            onExport={() => setView('export')}
            onReset={onReset}
          />
        )}
        {view === 'sign' && wallet && <SignMessage wallet={wallet} onBack={() => setView('dashboard')} />}
        {view === 'encrypt' && <EncryptMessage onBack={() => setView('dashboard')} />}
        {view === 'decrypt' && wallet && <DecryptMessage wallet={wallet} onBack={() => setView('dashboard')} />}
        {view === 'export' && <ExportWallet onBack={() => setView('dashboard')} />}
      </main>

      <footer className="px-4 py-2 text-center text-[10px] text-gray-600 border-t border-gray-800">
        FIPS 204 (ML-DSA-65) + FIPS 203 (ML-KEM-768)
      </footer>
    </div>
  )
}

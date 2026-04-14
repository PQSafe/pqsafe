import { useState, useRef } from 'react'
import type { PQKeyPair } from '../../crypto/keygen'
import type { EncryptedWallet } from '../../crypto/walletCrypto'
import { decryptWallet } from '../../crypto/walletCrypto'
import { saveEncryptedWallet } from '../../store/chromeStorage'

interface Props {
  onImported: (kp: PQKeyPair) => void
  onBack: () => void
}

export function ImportWallet({ onImported, onBack }: Props) {
  const [blob, setBlob] = useState<EncryptedWallet | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as EncryptedWallet
      if (parsed.version !== 1 || parsed.kdf !== 'pbkdf2-sha256' || !parsed.ciphertext) {
        throw new Error('Not a valid PQSafe wallet file')
      }
      setBlob(parsed)
      setFileName(file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid file')
    }
  }

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!blob) return
    setError(null)
    setBusy(true)
    try {
      const kp = await decryptWallet(blob, password)
      await saveEncryptedWallet(blob)
      onImported(kp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <button onClick={onBack} className="self-start text-xs text-gray-400 hover:text-white transition flex items-center gap-1">
        <span>&larr;</span> Back
      </button>

      <h2 className="text-lg font-bold">Import Wallet</h2>
      <p className="text-[11px] text-gray-500">
        Import a PQSafe encrypted wallet file (.json) exported from another device.
      </p>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="w-full py-2.5 rounded-xl border border-dashed border-gray-700 text-sm text-gray-400 hover:border-emerald-500 hover:text-emerald-300 transition"
      >
        {fileName ? `📄 ${fileName}` : 'Choose wallet file...'}
      </button>

      {blob && (
        <form onSubmit={handleImport} className="space-y-2.5">
          <code className="block text-[10px] text-emerald-300 text-center">{blob.address.slice(0, 10)}...{blob.address.slice(-8)}</code>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password for this wallet"
            autoFocus
            className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500"
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {busy ? 'Importing...' : 'Import & Unlock'}
          </button>
        </form>
      )}

      {error && !blob && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}

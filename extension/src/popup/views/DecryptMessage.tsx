import { useState } from 'react'
import type { PQKeyPair } from '../../crypto/keygen'
import { decryptFromSender, type EncryptedMessage } from '../../crypto/hybridEncrypt'

interface Props {
  wallet: PQKeyPair
  onBack: () => void
}

export function DecryptMessage({ wallet, onBack }: Props) {
  const [input, setInput] = useState('')
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleDecrypt = async () => {
    setError(null)
    setPlaintext(null)
    setBusy(true)
    try {
      const blob = JSON.parse(input.trim()) as EncryptedMessage
      const msg = await decryptFromSender(wallet.kem.secretKey, blob)
      setPlaintext(msg)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decryption failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      <button onClick={onBack} className="self-start text-xs text-gray-400 hover:text-white transition flex items-center gap-1">
        <span>&larr;</span> Back
      </button>

      <h2 className="text-lg font-bold">Decrypt Message</h2>
      <p className="text-[11px] text-gray-500">
        Paste an encrypted message (JSON) that someone sent to your ML-KEM-768 public key.
      </p>

      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Paste encrypted message JSON..."
        rows={5}
        className="w-full rounded-lg bg-gray-800 border border-gray-700 p-2.5 text-[11px] font-mono text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500 resize-none break-all"
      />

      <button
        onClick={handleDecrypt}
        disabled={busy || !input.trim()}
        className="w-full py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {busy ? 'Decrypting...' : 'Decrypt with My KEM Key'}
      </button>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {plaintext && (
        <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/30 p-3 space-y-2">
          <div className="text-[10px] text-emerald-400">✓ Decrypted</div>
          <p className="text-sm text-white break-words whitespace-pre-wrap">{plaintext}</p>
        </div>
      )}
    </div>
  )
}

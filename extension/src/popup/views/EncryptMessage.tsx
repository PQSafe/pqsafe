import { useState } from 'react'
import { hexToBytes } from '@noble/hashes/utils.js'
import { encryptToRecipient } from '../../crypto/hybridEncrypt'

interface Props {
  onBack: () => void
}

export function EncryptMessage({ onBack }: Props) {
  const [recipientKem, setRecipientKem] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleEncrypt = async () => {
    setError(null)
    setResult(null)
    if (!recipientKem.trim() || !message.trim()) return
    setBusy(true)
    try {
      const clean = recipientKem.trim().replace(/^0x/, '')
      const pubKey = hexToBytes(clean)
      if (pubKey.length !== 1184) {
        throw new Error(`Expected 1184-byte ML-KEM-768 pubkey, got ${pubKey.length}`)
      }
      const blob = await encryptToRecipient(pubKey, message)
      setResult(JSON.stringify(blob))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Encryption failed')
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      <button onClick={onBack} className="self-start text-xs text-gray-400 hover:text-white transition flex items-center gap-1">
        <span>&larr;</span> Back
      </button>

      <h2 className="text-lg font-bold">Encrypt to Recipient</h2>
      <p className="text-[11px] text-gray-500">
        Encrypt a message to someone's ML-KEM-768 public key. Only they can decrypt it with their KEM secret key.
      </p>

      <textarea
        value={recipientKem}
        onChange={e => setRecipientKem(e.target.value)}
        placeholder="Recipient ML-KEM-768 public key (hex, 2368 chars)"
        rows={3}
        className="w-full rounded-lg bg-gray-800 border border-gray-700 p-2.5 text-[11px] font-mono text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500 resize-none break-all"
      />

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Message to encrypt..."
        rows={3}
        className="w-full rounded-lg bg-gray-800 border border-gray-700 p-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500 resize-none"
      />

      <button
        onClick={handleEncrypt}
        disabled={busy || !recipientKem.trim() || !message.trim()}
        className="w-full py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {busy ? 'Encrypting...' : 'Encrypt with ML-KEM-768'}
      </button>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {result && (
        <div className="rounded-xl bg-gray-800/50 border border-gray-700 p-3 space-y-2">
          <div className="text-[10px] text-emerald-400">✓ Encrypted ({result.length} bytes JSON)</div>
          <code className="block text-[9px] text-gray-400 break-all leading-relaxed max-h-24 overflow-y-auto">
            {result.slice(0, 200)}...
          </code>
          <button
            onClick={handleCopy}
            className="w-full text-[10px] py-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition"
          >
            {copied ? 'Copied!' : 'Copy Ciphertext'}
          </button>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { PQKeyPair } from '../../crypto/keygen'
import { signMessage, verifySignature } from '../../crypto/sign'
import { bytesToHex } from '@noble/hashes/utils.js'

interface Props {
  wallet: PQKeyPair
  onBack: () => void
}

export function SignMessage({ wallet, onBack }: Props) {
  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState<Uint8Array | null>(null)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [signing, setSigning] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleSign = async () => {
    if (!message.trim()) return
    setSigning(true)
    await new Promise(r => setTimeout(r, 30))
    const sig = signMessage(wallet.dsa.secretKey, message)
    const valid = verifySignature(wallet.dsa.publicKey, message, sig)
    setSignature(sig)
    setVerified(valid)
    setSigning(false)
  }

  const copySignature = async () => {
    if (!signature) return
    await navigator.clipboard.writeText(bytesToHex(signature))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sigHex = signature ? bytesToHex(signature) : ''

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="self-start text-xs text-gray-400 hover:text-white transition flex items-center gap-1"
      >
        <span>&larr;</span> Back
      </button>

      <h2 className="text-lg font-bold">Sign Message</h2>
      <p className="text-[11px] text-gray-500">
        Sign any message with your ML-DSA-65 private key. The signature proves you control this wallet.
      </p>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Enter message to sign..."
        className="w-full h-24 rounded-lg bg-gray-800 border border-gray-700 p-3 text-sm text-white
          placeholder:text-gray-600 focus:outline-none focus:border-emerald-500 resize-none"
      />

      <button
        onClick={handleSign}
        disabled={!message.trim() || signing}
        className="w-full py-2.5 rounded-xl font-semibold text-sm
          bg-gradient-to-r from-emerald-500 to-cyan-500 text-black
          hover:from-emerald-400 hover:to-cyan-400
          disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {signing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full" />
            Signing...
          </span>
        ) : (
          'Sign with ML-DSA-65'
        )}
      </button>

      {signature && (
        <div className="rounded-xl bg-gray-800/50 border border-gray-700 p-3 space-y-3">
          {/* Verification badge */}
          <div className="flex items-center gap-2">
            {verified ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                Signature Verified
              </span>
            ) : (
              <span className="text-xs text-red-400">Verification Failed</span>
            )}
          </div>

          {/* Signature display */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1">
              Signature ({signature.length} bytes)
            </div>
            <code className="block text-[9px] text-gray-400 break-all leading-relaxed max-h-20 overflow-y-auto">
              {sigHex.slice(0, 128)}...
            </code>
          </div>

          <button
            onClick={copySignature}
            className="w-full text-[10px] py-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition"
          >
            {copied ? 'Copied Full Signature!' : 'Copy Full Signature'}
          </button>
        </div>
      )}
    </div>
  )
}

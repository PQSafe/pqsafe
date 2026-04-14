import { useEffect, useState } from 'react'
import { getRawEncryptedWallet } from '../../store/chromeStorage'
import type { EncryptedWallet } from '../../crypto/walletCrypto'

interface Props {
  onBack: () => void
}

export function ExportWallet({ onBack }: Props) {
  const [blob, setBlob] = useState<EncryptedWallet | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getRawEncryptedWallet().then(setBlob)
  }, [])

  const handleDownload = () => {
    if (!blob) return
    const json = JSON.stringify(blob, null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `pqsafe-wallet-${blob.address.slice(3, 11)}-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    setDone(true)
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <button onClick={onBack} className="self-start text-xs text-gray-400 hover:text-white transition flex items-center gap-1">
        <span>&larr;</span> Back
      </button>

      <h2 className="text-lg font-bold">Export Wallet</h2>
      <p className="text-[11px] text-gray-500">
        Download your wallet as an encrypted JSON file. It stays AES-256 encrypted — only your password can unlock it.
      </p>

      <div className="rounded-xl bg-gray-800/50 border border-gray-700 p-3 text-[10px] text-gray-400 space-y-1">
        <div>Format: <span className="text-emerald-300">PQSafe v1</span></div>
        <div>KDF: <span className="text-gray-300">PBKDF2-SHA256 (600k iters)</span></div>
        <div>Cipher: <span className="text-gray-300">AES-256-GCM</span></div>
        {blob && <div className="break-all pt-1 text-gray-500">Address: {blob.address}</div>}
      </div>

      <button
        onClick={handleDownload}
        disabled={!blob}
        className="w-full py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 transition-all"
      >
        {done ? '✓ Downloaded' : 'Download Encrypted Wallet'}
      </button>

      <p className="text-[10px] text-gray-600 text-center leading-relaxed">
        Store the file somewhere safe. Without both the file AND your password, the wallet cannot be recovered.
      </p>
    </div>
  )
}

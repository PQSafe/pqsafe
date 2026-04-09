chrome.runtime.onInstalled.addListener(() => {
  console.log('PQSafe Wallet installed')
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ type: 'PONG', version: '0.1.0' })
  }
  return false
})

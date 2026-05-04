// Mock verifier for CLI smoke test — always returns valid: true
// Should pass 4/5 (fail the negative test)
export default {
  async verify() {
    return { valid: true }
  }
}

import type { Check, Finding, ScanInput } from '../types.js';

const SPEND_PATTERNS = [
  /max_spend/i, /spending_limit/i, /budget_cap/i, /max_cost/i,
  /spend_limit/i, /cost_limit/i, /maxBudget/i, /spendingCap/i,
  /payment_limit/i, /transaction_limit/i,
];

const PAYMENT_INDICATORS = [
  /stripe/i, /airwallex/i, /paypal/i, /braintree/i,
  /payment/i, /charge/i, /invoice/i, /billing/i,
  /spend/i, /pay\(/i, /purchase/i,
];

export const spendingLimitsCheck: Check = {
  id: 'spending-limits',
  name: 'Missing Spending Limits',
  run({ code }: ScanInput): Finding[] {
    const hasPayment = PAYMENT_INDICATORS.some(p => p.test(code));
    if (!hasPayment) return [];

    const hasLimit = SPEND_PATTERNS.some(p => p.test(code));
    if (hasLimit) return [];

    return [{
      id: 'spending-limits',
      name: 'Missing Spending Limits',
      severity: 'CRITICAL',
      status: 'FAIL',
      message: 'Agent can make payments but no spending limit is defined. An injected or runaway agent can drain your account.',
      fix: 'Add a max_spend or budget_cap to every agent with payment tools. Use PQSafe spend envelopes for cryptographic enforcement.',
      docs: 'https://pqsafe.xyz/scan/docs/spending-limits',
    }];
  },
};

# PQSafe AgentPay Subgraph — Arbitrum Sepolia

Indexes `SpendEnvelopeRegistryV2_1` events on Arbitrum Sepolia.

## Prerequisites

```bash
npm install -g @graphprotocol/graph-cli
```

## 1. After deploying the contract — update subgraph.yaml

Open `subgraph.yaml` and replace:
- `address: "0x0000000000000000000000000000000000000000"` → actual deployed address
- `startBlock: 0` → block number of the deploy transaction (from Arbiscan)

## 2. Generate types

```bash
cd evm/subgraph/sepolia
graph codegen subgraph.yaml
graph build subgraph.yaml
```

## 3. Authenticate with The Graph

```bash
graph auth --studio <DEPLOY_KEY>
```

Get your deploy key from: https://thegraph.com/studio/

## 4. Create subgraph (one time)

In The Graph Studio UI, create a subgraph named `pqsafe-agentpay-sepolia`.

## 5. Deploy to Subgraph Studio (Sepolia)

```bash
graph deploy --studio pqsafe-agentpay-sepolia subgraph.yaml
```

## 6. Verify indexing

After deployment, check the dashboard:
https://thegraph.com/studio/subgraph/pqsafe-agentpay-sepolia/

Sample query to verify EnvelopeCommitted events are indexed:
```graphql
{
  envelopes(first: 5, orderBy: committedAt, orderDirection: desc) {
    id
    issuer
    maxAmount
    currency
    status
    committedAt
  }
}
```

## Goldsky alternative (faster for testnet)

```bash
npm install -g @goldsky/cli
goldsky login
goldsky subgraph deploy pqsafe-agentpay-sepolia/1.0.0 \
  --path . \
  --network arbitrum-sepolia
```

Goldsky endpoint: `https://api.goldsky.com/api/public/<project>/subgraphs/pqsafe-agentpay-sepolia/1.0.0/gn`

## ABI source

The ABI is read from:
```
evm/out/SpendEnvelopeRegistryV2_1.sol/SpendEnvelopeRegistryV2_1.json
```

Run `forge build` in `evm/` before `graph codegen`.

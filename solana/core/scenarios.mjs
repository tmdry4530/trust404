// Generated demonstration data. No chain RPC was used.
export const SCENARIOS = [
  {
    "id": "limit",
    "label": "1회 결제 한도 초과",
    "receipt": {
      "schema": "trust404.solana.payment-refusal.v1",
      "context": {
        "genesisHash": "Gkr9wt3d5dJEiRQ6kq267T9DMMWPqCAqiPjc88zQxv5J",
        "programId": "EKmv2G2v7BWoHvFQTWEjg5rEEKoyHNDCsGx1Y42t1CME",
        "publisher": "2deHpaKkTiAyxjX2SBwom4ysf3Y2WmHTgcwy3f1oi8ZP"
      },
      "issuer": "2deHpaKkTiAyxjX2SBwom4ysf3Y2WmHTgcwy3f1oi8ZP",
      "policy": {
        "id": "agent-payments-v1",
        "asset": "USDC",
        "mint": "4DGqNA8T2WBpkWv79XEwsUmrGefj9d4KbxGYBthyd11T",
        "decimals": 6,
        "perPaymentLimitMinor": "100000000",
        "allowedRecipients": [
          "4yf8S7sfKnm7pfA1Moh5TZoTStMuydPVoTjvjx6fAFfd"
        ]
      },
      "request": {
        "id": "PAY-404-0001",
        "agent": "Atlas Procurement",
        "agentKey": "9SXJfRk17Yd4XP9GhKo2dp2tF1ke28xosbijgHY7Pooi",
        "merchant": "Northstar Compute",
        "recipient": "4yf8S7sfKnm7pfA1Moh5TZoTStMuydPVoTjvjx6fAFfd",
        "amountMinor": "185000000",
        "asset": "USDC",
        "mint": "4DGqNA8T2WBpkWv79XEwsUmrGefj9d4KbxGYBthyd11T",
        "decimals": 6
      },
      "decision": {
        "policyHash": "35c66e2729082a72f8848ce6a08e430a9cf65a08b7b6232e50ab4d840899e20e",
        "issuedAt": "2026-11-23T03:20:00Z",
        "reasonCode": "LIMIT_EXCEEDED",
        "requestLeaf": "7692fe46952705bb758d6141ff4052cedd2556b91ace1e7d20d1c77e9ab8100d",
        "requestRef": {
          "batchId": "1",
          "slot": "4201",
          "root": "83f24e8d15b4a3c63e0597d136132d2dec09cddf02e18547f8e1cfcca00ea623",
          "index": 0
        }
      },
      "proofs": {
        "request": {
          "batchId": "1",
          "index": 0,
          "siblings": [
            "2f202b2f1349609edab19f48ad39282928c74c3048283d8e51631e708ebfea01",
            "a9aad6c5bb296cfaacca851885d34195c760bc89cc1aa4b3ed255868d7501b89"
          ]
        },
        "decision": {
          "batchId": "2",
          "index": 0,
          "siblings": [
            "c8970c575ee1d1a2699e2606c93dea22899f6e3c8081147006486961408f5e27",
            "5c7ef975b2149668793ffd872c79236bb990557170d2a5b4e6193a7a7d8e8402"
          ]
        }
      },
      "requestSignature": "21f7abdf6c4285bfc0f1ab46be5d631d5cc9ab0ca4575879e47a4c512fb1a1af584b34db1d48b613562dd15421fed6ca9c13912cd254304392861f4b35f67c07",
      "signature": "3f3982587555faa3ee89df98f514288ba1aac8a1644f486ec6c987134967d3eeeabaf135e315968502d56a4a8240c1f4e15cf1b39a35131d7689315a1ac68f0a"
    }
  },
  {
    "id": "merchant",
    "label": "허용 목록 밖 가맹점",
    "receipt": {
      "schema": "trust404.solana.payment-refusal.v1",
      "context": {
        "genesisHash": "Gkr9wt3d5dJEiRQ6kq267T9DMMWPqCAqiPjc88zQxv5J",
        "programId": "EKmv2G2v7BWoHvFQTWEjg5rEEKoyHNDCsGx1Y42t1CME",
        "publisher": "2deHpaKkTiAyxjX2SBwom4ysf3Y2WmHTgcwy3f1oi8ZP"
      },
      "issuer": "2deHpaKkTiAyxjX2SBwom4ysf3Y2WmHTgcwy3f1oi8ZP",
      "policy": {
        "id": "agent-payments-v1",
        "asset": "USDC",
        "mint": "4DGqNA8T2WBpkWv79XEwsUmrGefj9d4KbxGYBthyd11T",
        "decimals": 6,
        "perPaymentLimitMinor": "100000000",
        "allowedRecipients": [
          "4yf8S7sfKnm7pfA1Moh5TZoTStMuydPVoTjvjx6fAFfd"
        ]
      },
      "request": {
        "id": "PAY-404-0002",
        "agent": "Atlas Procurement",
        "agentKey": "9SXJfRk17Yd4XP9GhKo2dp2tF1ke28xosbijgHY7Pooi",
        "merchant": "Orbit Index",
        "recipient": "BWPnYLrKinMHKSE1ZHHwnqup33Dh5PMe4DKuLPDQXExP",
        "amountMinor": "42000000",
        "asset": "USDC",
        "mint": "4DGqNA8T2WBpkWv79XEwsUmrGefj9d4KbxGYBthyd11T",
        "decimals": 6
      },
      "decision": {
        "policyHash": "35c66e2729082a72f8848ce6a08e430a9cf65a08b7b6232e50ab4d840899e20e",
        "issuedAt": "2026-11-23T03:20:00Z",
        "reasonCode": "MERCHANT_NOT_ALLOWED",
        "requestLeaf": "2f202b2f1349609edab19f48ad39282928c74c3048283d8e51631e708ebfea01",
        "requestRef": {
          "batchId": "1",
          "slot": "4201",
          "root": "83f24e8d15b4a3c63e0597d136132d2dec09cddf02e18547f8e1cfcca00ea623",
          "index": 1
        }
      },
      "proofs": {
        "request": {
          "batchId": "1",
          "index": 1,
          "siblings": [
            "7692fe46952705bb758d6141ff4052cedd2556b91ace1e7d20d1c77e9ab8100d",
            "a9aad6c5bb296cfaacca851885d34195c760bc89cc1aa4b3ed255868d7501b89"
          ]
        },
        "decision": {
          "batchId": "2",
          "index": 1,
          "siblings": [
            "6ec680ca65d1e6f661c0c25eb0b77a3185326696c1228402e46335b889019308",
            "5c7ef975b2149668793ffd872c79236bb990557170d2a5b4e6193a7a7d8e8402"
          ]
        }
      },
      "requestSignature": "154dd5ecd731a6efe6b7624e5dd5ad34c924e3191e95b371509524a3b400e684df8321524419086d81faddc1f6ce9e890099e8ee91885918030cf39214d11f06",
      "signature": "ffe5ce1d0437dcb08c763e83bd07bd69e250ccc3feb071e4c74aaa9bac3a8b791db9d6c2ddcf3ba46d8f46c78e166b53cf1c07fca2892fe156a11601cbee2005"
    }
  },
  {
    "id": "false-reason",
    "label": "유효한 서명 · 잘못된 거절",
    "receipt": {
      "schema": "trust404.solana.payment-refusal.v1",
      "context": {
        "genesisHash": "Gkr9wt3d5dJEiRQ6kq267T9DMMWPqCAqiPjc88zQxv5J",
        "programId": "EKmv2G2v7BWoHvFQTWEjg5rEEKoyHNDCsGx1Y42t1CME",
        "publisher": "2deHpaKkTiAyxjX2SBwom4ysf3Y2WmHTgcwy3f1oi8ZP"
      },
      "issuer": "2deHpaKkTiAyxjX2SBwom4ysf3Y2WmHTgcwy3f1oi8ZP",
      "policy": {
        "id": "agent-payments-v1",
        "asset": "USDC",
        "mint": "4DGqNA8T2WBpkWv79XEwsUmrGefj9d4KbxGYBthyd11T",
        "decimals": 6,
        "perPaymentLimitMinor": "100000000",
        "allowedRecipients": [
          "4yf8S7sfKnm7pfA1Moh5TZoTStMuydPVoTjvjx6fAFfd"
        ]
      },
      "request": {
        "id": "PAY-404-0003",
        "agent": "Atlas Procurement",
        "agentKey": "9SXJfRk17Yd4XP9GhKo2dp2tF1ke28xosbijgHY7Pooi",
        "merchant": "Northstar Compute",
        "recipient": "4yf8S7sfKnm7pfA1Moh5TZoTStMuydPVoTjvjx6fAFfd",
        "amountMinor": "64000000",
        "asset": "USDC",
        "mint": "4DGqNA8T2WBpkWv79XEwsUmrGefj9d4KbxGYBthyd11T",
        "decimals": 6
      },
      "decision": {
        "policyHash": "35c66e2729082a72f8848ce6a08e430a9cf65a08b7b6232e50ab4d840899e20e",
        "issuedAt": "2026-11-23T03:20:00Z",
        "reasonCode": "LIMIT_EXCEEDED",
        "requestLeaf": "a9aad6c5bb296cfaacca851885d34195c760bc89cc1aa4b3ed255868d7501b89",
        "requestRef": {
          "batchId": "1",
          "slot": "4201",
          "root": "83f24e8d15b4a3c63e0597d136132d2dec09cddf02e18547f8e1cfcca00ea623",
          "index": 2
        }
      },
      "proofs": {
        "request": {
          "batchId": "1",
          "index": 2,
          "siblings": [
            "d3f48359b20d1937e57c1b45ada3f34ddf716203e1246359e1c05b9b8eeda420"
          ]
        },
        "decision": {
          "batchId": "2",
          "index": 2,
          "siblings": [
            "e9efec416c2af065bc49507855b904121fda64751d0f31678a5f94b6588e7ac7"
          ]
        }
      },
      "requestSignature": "3c15fdb1005ef29cf19efe263580ef81886c1c6261f07af7ea92e59fce5e3c0ba3b61e23ccec61848de4643eab6b370d1fbd1eab56618140c0d771e315aeec05",
      "signature": "85b14ff3ddd19a8c373accabe37acddc89835145064de8a1b09f3158b9041b3b09e59f4764ca48defdc034c32017fe181e118eafa48ec5ac4834b22de0af6e0a"
    }
  },
  {
    "id": "tamper",
    "label": "서명 후 결제 금액 변조",
    "receipt": {
      "schema": "trust404.solana.payment-refusal.v1",
      "context": {
        "genesisHash": "Gkr9wt3d5dJEiRQ6kq267T9DMMWPqCAqiPjc88zQxv5J",
        "programId": "EKmv2G2v7BWoHvFQTWEjg5rEEKoyHNDCsGx1Y42t1CME",
        "publisher": "2deHpaKkTiAyxjX2SBwom4ysf3Y2WmHTgcwy3f1oi8ZP"
      },
      "issuer": "2deHpaKkTiAyxjX2SBwom4ysf3Y2WmHTgcwy3f1oi8ZP",
      "policy": {
        "id": "agent-payments-v1",
        "asset": "USDC",
        "mint": "4DGqNA8T2WBpkWv79XEwsUmrGefj9d4KbxGYBthyd11T",
        "decimals": 6,
        "perPaymentLimitMinor": "100000000",
        "allowedRecipients": [
          "4yf8S7sfKnm7pfA1Moh5TZoTStMuydPVoTjvjx6fAFfd"
        ]
      },
      "request": {
        "id": "PAY-404-0001",
        "agent": "Atlas Procurement",
        "agentKey": "9SXJfRk17Yd4XP9GhKo2dp2tF1ke28xosbijgHY7Pooi",
        "merchant": "Northstar Compute",
        "recipient": "4yf8S7sfKnm7pfA1Moh5TZoTStMuydPVoTjvjx6fAFfd",
        "amountMinor": "85000000",
        "asset": "USDC",
        "mint": "4DGqNA8T2WBpkWv79XEwsUmrGefj9d4KbxGYBthyd11T",
        "decimals": 6
      },
      "decision": {
        "policyHash": "35c66e2729082a72f8848ce6a08e430a9cf65a08b7b6232e50ab4d840899e20e",
        "issuedAt": "2026-11-23T03:20:00Z",
        "reasonCode": "LIMIT_EXCEEDED",
        "requestLeaf": "7692fe46952705bb758d6141ff4052cedd2556b91ace1e7d20d1c77e9ab8100d",
        "requestRef": {
          "batchId": "1",
          "slot": "4201",
          "root": "83f24e8d15b4a3c63e0597d136132d2dec09cddf02e18547f8e1cfcca00ea623",
          "index": 0
        }
      },
      "proofs": {
        "request": {
          "batchId": "1",
          "index": 0,
          "siblings": [
            "2f202b2f1349609edab19f48ad39282928c74c3048283d8e51631e708ebfea01",
            "a9aad6c5bb296cfaacca851885d34195c760bc89cc1aa4b3ed255868d7501b89"
          ]
        },
        "decision": {
          "batchId": "2",
          "index": 0,
          "siblings": [
            "c8970c575ee1d1a2699e2606c93dea22899f6e3c8081147006486961408f5e27",
            "5c7ef975b2149668793ffd872c79236bb990557170d2a5b4e6193a7a7d8e8402"
          ]
        }
      },
      "requestSignature": "21f7abdf6c4285bfc0f1ab46be5d631d5cc9ab0ca4575879e47a4c512fb1a1af584b34db1d48b613562dd15421fed6ca9c13912cd254304392861f4b35f67c07",
      "signature": "3f3982587555faa3ee89df98f514288ba1aac8a1644f486ec6c987134967d3eeeabaf135e315968502d56a4a8240c1f4e15cf1b39a35131d7689315a1ac68f0a"
    }
  }
];

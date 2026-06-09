export const attestationStoreAbi = [
  {
    type: "function",
    name: "getDeposits",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "wallet", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "poolId", type: "uint8" },
          { name: "poolName", type: "string" },
          { name: "intentText", type: "string" },
          { name: "timestamp", type: "uint256" },
          { name: "loggedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getRebalances",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "wallet", type: "address" },
          { name: "fromPoolId", type: "uint8" },
          { name: "toPoolId", type: "uint8" },
          { name: "oldAPY", type: "uint256" },
          { name: "newAPY", type: "uint256" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getDepositCount",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getRebalanceCount",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

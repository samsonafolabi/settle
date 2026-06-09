export const apyFeedAbi = [
  {
    type: "function",
    name: "poolCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "apy", type: "uint256" },
          { name: "risk", type: "string" },
          { name: "active", type: "bool" },
          { name: "lastUpdated", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "APYUpdated",
    inputs: [
      { name: "poolId", type: "uint256", indexed: true },
      { name: "poolName", type: "string", indexed: true },
      { name: "oldAPY", type: "uint256", indexed: false },
      { name: "newAPY", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

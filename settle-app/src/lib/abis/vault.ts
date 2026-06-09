export const vaultAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "poolId", type: "uint8" },
      { name: "intentText", type: "string" },
      { name: "safetyPrompt", type: "string" },
      { name: "poolPrompt", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getTotalDepositSTT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAccordDeposit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    // Public mapping getter for:
    // mapping(address => UserPosition) public positions;
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "balance", type: "uint256" },
      { name: "depositTime", type: "uint256" },
      { name: "accruedInterest", type: "uint256" },
      { name: "lastClaimTime", type: "uint256" },
      { name: "poolId", type: "uint8" },
      { name: "poolAPY", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
  {
    // Contract also exposes this helper. Keep both to prevent ABI drift bugs.
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "balance", type: "uint256" },
          { name: "depositTime", type: "uint256" },
          { name: "accruedInterest", type: "uint256" },
          { name: "lastClaimTime", type: "uint256" },
          { name: "poolId", type: "uint8" },
          { name: "poolAPY", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPendingDeposit",
    stateMutability: "view",
    inputs: [{ name: "depositId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "wallet", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "requestedPoolId", type: "uint8" },
          { name: "intentText", type: "string" },
          { name: "poolPrompt", type: "string" },
          { name: "depositId", type: "bytes32" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setAPYThreshold",
    stateMutability: "nonpayable",
    inputs: [{ name: "bps", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "DepositInitiated",
    inputs: [
      { name: "depositId", type: "bytes32", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "poolId", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AccordVerdictRequested",
    inputs: [
      { name: "depositId", type: "bytes32", indexed: true },
      { name: "requestId", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AccordPoolRequested",
    inputs: [
      { name: "depositId", type: "bytes32", indexed: true },
      { name: "requestId", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "DepositFinalised",
    inputs: [
      { name: "depositId", type: "bytes32", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "poolId", type: "uint8", indexed: false },
      { name: "apy", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DepositRefunded",
    inputs: [
      { name: "depositId", type: "bytes32", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Rebalanced",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "fromPoolId", type: "uint8", indexed: false },
      { name: "toPoolId", type: "uint8", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AccordCallbackReceived",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true },
      { name: "depositId", type: "bytes32", indexed: true },
      { name: "isSafety", type: "bool", indexed: false },
      { name: "status", type: "uint8", indexed: false },
      { name: "responseCount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AccordStringResult",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true },
      { name: "depositId", type: "bytes32", indexed: true },
      { name: "result", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AccordNumberResult",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true },
      { name: "depositId", type: "bytes32", indexed: true },
      { name: "result", type: "int256", indexed: false },
    ],
  },
] as const;

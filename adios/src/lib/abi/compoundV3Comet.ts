// Compound V3 Comet ABI
// Source: https://github.com/compound-finance/comet/blob/main/contracts/CometMainInterface.sol
// Functions: supply, withdraw, balanceOf only — what the depositor needs

export const COMPOUND_V3_COMET_ABI = [
  // Supply base token (USDC) into the market
  // Requires prior ERC20 approve(comet, amount) on the base token
  {
    name: "supply",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  // Withdraw base token from the market
  // Pass exact balanceOf amount — do NOT use maxUint256
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  // Returns supply balance including accrued interest (base token units)
  // Equivalent to aToken balanceOf in Aave
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

import {
  createWalletClient,
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  maxUint256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";
import { AAVE_V3_POOL_ABI, ERC20_ABI } from "../abi/aaveV3Pool";
import { YIELD_CHAINS } from "../shared/config";
import type { LogEntry } from "@/types";

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  10: optimism,
  137: polygon,
};

export class AaveDepositor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private walletClient: any;
  private publicClient: PublicClient;
  private address: `0x${string}`;
  private chainId: number;
  private onLog: (log: Omit<LogEntry, "id">) => void;

  constructor(
    privateKey: string,
    chainId: number,
    onLog?: (log: Omit<LogEntry, "id">) => void
  ) {
    const chainConfig = YIELD_CHAINS[chainId];
    if (!chainConfig) throw new Error(`Unsupported yield chain: ${chainId}`);

    const chain = CHAIN_MAP[chainId];
    if (!chain) throw new Error(`No viem chain for chainId ${chainId}`);

    const account = privateKeyToAccount(
      (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`
    );

    this.address = account.address;
    this.chainId = chainId;

    // walletClient uses Alchemy (reliable tx submission)
    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(chainConfig.txRpcUrl),
    });

    // publicClient uses public RPC (reads, dry-run sims — no rate limit)
    this.publicClient = createPublicClient({
      chain,
      transport: http(chainConfig.rpcUrl),
    }) as PublicClient;

    this.onLog = onLog ?? (() => {});
  }

  private log(level: LogEntry["level"], message: string) {
    this.onLog({ timestamp: Date.now(), level, message });
  }

  async getUsdcBalance(): Promise<bigint> {
    const config = YIELD_CHAINS[this.chainId];
    return this.publicClient.readContract({
      address: config.usdc,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.address],
    }) as Promise<bigint>;
  }

  async getATokenBalance(): Promise<bigint> {
    const config = YIELD_CHAINS[this.chainId];
    return this.publicClient.readContract({
      address: config.aToken,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [this.address],
    }) as Promise<bigint>;
  }

  async deposit(
    amount: bigint,
    dryRun: boolean
  ): Promise<{ txHash?: string; simulated: boolean }> {
    const config = YIELD_CHAINS[this.chainId];
    const amountFmt = (Number(amount) / 1e6).toFixed(4);

    this.log("INFO", `${dryRun ? "[DRY RUN] " : ""}Depositing ${amountFmt} USDC into Aave on ${config.name}`);

    if (dryRun) {
      try {
        await this.publicClient.simulateContract({
          address: config.usdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [config.aavePool, amount],
          account: this.address,
        });
        await this.publicClient.simulateContract({
          address: config.aavePool,
          abi: AAVE_V3_POOL_ABI,
          functionName: "supply",
          args: [config.usdc, amount, this.address, 0],
          account: this.address,
        });
        this.log("SUCCESS", `[DRY RUN] Deposit simulation passed — ${amountFmt} USDC would be supplied`);
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 80) : String(e);
        this.log("WARN", `[DRY RUN] Simulation skipped (RPC limit or no balance): ${msg}`);
      }
      return { simulated: true };
    }

    // Check native gas balance before any tx
    const nativeSymbols: Record<number, string> = { 137: "POL", 10: "ETH", 8453: "ETH", 42161: "ETH" };
    const nativeSymbol = nativeSymbols[this.chainId] ?? "ETH";
    try {
      const gasBalance = await this.publicClient.getBalance({ address: this.address });
      if (gasBalance === 0n) {
        this.log("ERROR", `No ${nativeSymbol} for gas on ${config.name}. Fund ${this.address} with ${nativeSymbol} to execute live transactions.`);
        return { simulated: false };
      }
    } catch {
      // If balance check fails, proceed anyway — tx will fail with a clearer error
    }

    // Approve USDC to Aave Pool
    const allowance = (await this.publicClient.readContract({
      address: config.usdc,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.address, config.aavePool],
    })) as bigint;

    if (allowance < amount) {
      this.log("INFO", "Approving USDC to Aave Pool...");
      const approveHash = await this.walletClient.writeContract({
        address: config.usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [config.aavePool, maxUint256],
      });
      const approveReceipt = await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
      if (approveReceipt.status !== "success") {
        throw new Error(`Aave USDC approval tx reverted: ${approveHash}`);
      }
      this.log("SUCCESS", `Approval TX: ${approveHash}`);
    }

    // Supply to Aave
    const txHash = await this.walletClient.writeContract({
      address: config.aavePool,
      abi: AAVE_V3_POOL_ABI,
      functionName: "supply",
      args: [config.usdc, amount, this.address, 0],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") {
      throw new Error(`Aave supply tx reverted: ${txHash}`);
    }

    this.log("SUCCESS", `Deposited ${amountFmt} USDC — TX: ${txHash}`);
    return { txHash, simulated: false };
  }

  async withdraw(
    dryRun: boolean
  ): Promise<{ txHash?: string; amountReceived: bigint; simulated: boolean }> {
    const config = YIELD_CHAINS[this.chainId];

    const aBalance = await this.getATokenBalance();
    const amountFmt = (Number(aBalance) / 1e6).toFixed(4);

    if (aBalance === 0n) {
      this.log("INFO", "No Aave position to withdraw");
      return { amountReceived: 0n, simulated: dryRun };
    }

    this.log("INFO", `${dryRun ? "[DRY RUN] " : ""}Withdrawing ${amountFmt} USDC from Aave on ${config.name}`);

    if (dryRun) {
      try {
        await this.publicClient.simulateContract({
          address: config.aavePool,
          abi: AAVE_V3_POOL_ABI,
          functionName: "withdraw",
          args: [config.usdc, maxUint256, this.address],
          account: this.address,
        });
        this.log("SUCCESS", `[DRY RUN] Withdraw simulation passed — ${amountFmt} USDC`);
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 80) : String(e);
        this.log("WARN", `[DRY RUN] Withdraw sim skipped (RPC limit or no position): ${msg}`);
      }
      return { amountReceived: aBalance, simulated: true };
    }

    // Measure actual USDC delta for accurate amountReceived
    const usdcBefore = await this.getUsdcBalance();

    const txHash = await this.walletClient.writeContract({
      address: config.aavePool,
      abi: AAVE_V3_POOL_ABI,
      functionName: "withdraw",
      args: [config.usdc, maxUint256, this.address],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") {
      throw new Error(`Aave withdraw tx reverted: ${txHash}`);
    }

    // Actual received = post-withdraw USDC balance delta
    const usdcAfter = await this.getUsdcBalance();
    const received = usdcAfter - usdcBefore;

    this.log("SUCCESS", `Withdrew ${(Number(received) / 1e6).toFixed(4)} USDC from Aave — TX: ${txHash}`);
    return { txHash, amountReceived: received, simulated: false };
  }
}

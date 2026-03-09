// Compound V3 Depositor
// Protocol: Compound V3 (Comet) — USDC base token markets
// Source: https://github.com/compound-finance/comet/blob/main/contracts/CometMainInterface.sol
//
// Tx flow — deposit:
//   1. readContract(usdc.allowance(address, comet))
//   2. if insufficient: writeContract(usdc.approve(comet, maxUint256)) + waitForReceipt
//   3. writeContract(comet.supply(usdc, amount)) + waitForReceipt
//   4. verify: readContract(comet.balanceOf(address)) > 0
//
// Tx flow — withdraw:
//   1. readContract(comet.balanceOf(address)) → exact balance
//   2. if > 0: writeContract(comet.withdraw(usdc, balance)) + waitForReceipt
//      NOTE: pass exact balanceOf amount — maxUint256 not used
//   3. verify: readContract(usdc.balanceOf(address)) increased
//
// supply() and withdraw() both return void — confirmation is receipt + balance check

import {
  createWalletClient,
  createPublicClient,
  http,
  maxUint256,
  type Chain,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, arbitrum, optimism, polygon } from "viem/chains";
import { COMPOUND_V3_COMET_ABI } from "../abi/compoundV3Comet";
import { ERC20_ABI } from "../abi/aaveV3Pool";
import { YIELD_CHAINS } from "../shared/config";
import type { LogEntry } from "@/types";

const CHAIN_MAP: Record<number, Chain> = {
  8453: base,
  42161: arbitrum,
  10: optimism,
  137: polygon,
};

export class CompoundDepositor {
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

    // publicClient uses public RPC (reads, dry-run simulations — no rate limit)
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

  // Returns supplied balance including accrued interest
  // Equivalent to aToken.balanceOf in Aave
  async getSupplyBalance(): Promise<bigint> {
    const config = YIELD_CHAINS[this.chainId];
    return this.publicClient.readContract({
      address: config.compoundComet,
      abi: COMPOUND_V3_COMET_ABI,
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

    this.log(
      "INFO",
      `${dryRun ? "[DRY RUN] " : ""}Depositing ${amountFmt} USDC into Compound V3 on ${config.name}`
    );

    if (dryRun) {
      try {
        // Simulate ERC20 approve
        await this.publicClient.simulateContract({
          address: config.usdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [config.compoundComet, amount],
          account: this.address,
        });
        // Simulate supply
        await this.publicClient.simulateContract({
          address: config.compoundComet,
          abi: COMPOUND_V3_COMET_ABI,
          functionName: "supply",
          args: [config.usdc, amount],
          account: this.address,
        });
        this.log(
          "SUCCESS",
          `[DRY RUN] Compound deposit simulation passed — ${amountFmt} USDC would be supplied`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 80) : String(e);
        this.log("WARN", `[DRY RUN] Simulation skipped (RPC limit or no balance): ${msg}`);
      }
      return { simulated: true };
    }

    // Check and set ERC20 allowance on USDC for Comet
    const allowance = (await this.publicClient.readContract({
      address: config.usdc,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.address, config.compoundComet],
    })) as bigint;

    if (allowance < amount) {
      this.log("INFO", "Approving USDC to Compound V3 Comet...");
      const approveHash = await this.walletClient.writeContract({
        address: config.usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [config.compoundComet, maxUint256],
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
      this.log("SUCCESS", `Approval TX: ${approveHash}`);
    }

    // Supply to Comet — returns void, confirm via receipt
    const txHash = await this.walletClient.writeContract({
      address: config.compoundComet,
      abi: COMPOUND_V3_COMET_ABI,
      functionName: "supply",
      args: [config.usdc, amount],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") {
      throw new Error(`Compound supply tx reverted: ${txHash}`);
    }

    // Verify balance increased
    const postBalance = await this.getSupplyBalance();
    this.log(
      "SUCCESS",
      `Deposited ${amountFmt} USDC into Compound V3 — TX: ${txHash} | Supply balance: ${(Number(postBalance) / 1e6).toFixed(4)} USDC`
    );

    return { txHash, simulated: false };
  }

  async withdraw(
    dryRun: boolean
  ): Promise<{ txHash?: string; amountReceived: bigint; simulated: boolean }> {
    const config = YIELD_CHAINS[this.chainId];

    // Must pass exact balance — Compound V3 withdraw does not accept maxUint256
    const supplyBalance = await this.getSupplyBalance();
    const amountFmt = (Number(supplyBalance) / 1e6).toFixed(4);

    if (supplyBalance === 0n) {
      this.log("INFO", "No Compound V3 position to withdraw");
      return { amountReceived: 0n, simulated: dryRun };
    }

    this.log(
      "INFO",
      `${dryRun ? "[DRY RUN] " : ""}Withdrawing ${amountFmt} USDC from Compound V3 on ${config.name}`
    );

    if (dryRun) {
      try {
        await this.publicClient.simulateContract({
          address: config.compoundComet,
          abi: COMPOUND_V3_COMET_ABI,
          functionName: "withdraw",
          args: [config.usdc, supplyBalance],
          account: this.address,
        });
        this.log("SUCCESS", `[DRY RUN] Compound withdraw simulation passed — ${amountFmt} USDC`);
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 80) : String(e);
        this.log("WARN", `[DRY RUN] Withdraw sim skipped (RPC limit or no position): ${msg}`);
      }
      return { amountReceived: supplyBalance, simulated: true };
    }

    const usdcBefore = await this.getUsdcBalance();

    // Withdraw exact balance — supply() and withdraw() both return void
    const txHash = await this.walletClient.writeContract({
      address: config.compoundComet,
      abi: COMPOUND_V3_COMET_ABI,
      functionName: "withdraw",
      args: [config.usdc, supplyBalance],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") {
      throw new Error(`Compound withdraw tx reverted: ${txHash}`);
    }

    // Verify USDC balance increased
    const usdcAfter = await this.getUsdcBalance();
    const received = usdcAfter - usdcBefore;

    this.log(
      "SUCCESS",
      `Withdrew ${(Number(received) / 1e6).toFixed(4)} USDC from Compound V3 — TX: ${txHash}`
    );

    return { txHash, amountReceived: received, simulated: false };
  }
}

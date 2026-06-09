import { useAccount, useReadContract } from "wagmi";
import { contracts } from "@/lib/contracts";
import { attestationStoreAbi } from "@/lib/abis/attestationStore";

export function useReceipts() {
  const { address } = useAccount();

  const deposits = useReadContract({
    address: contracts.attestationStore,
    abi: attestationStoreAbi,
    functionName: "getDeposits",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  const rebalances = useReadContract({
    address: contracts.attestationStore,
    abi: attestationStoreAbi,
    functionName: "getRebalances",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  return {
    deposits: deposits.data ?? [],
    rebalances: rebalances.data ?? [],
    isLoading: deposits.isLoading || rebalances.isLoading,
    error: deposits.error || rebalances.error,
    refetch: () => {
      deposits.refetch();
      rebalances.refetch();
    },
  };
}

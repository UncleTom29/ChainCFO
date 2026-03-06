import { createPublicClient, http, bytesToHex, hexToBytes, parseAbi, encodeFunctionData, decodeFunctionResult } from 'viem';
import { sepolia } from 'viem/chains';

const client = createPublicClient({ chain: sepolia, transport: http('https://eth-sepolia.g.alchemy.com/v2/3MMaXlOkQyjVCCW1HNbY67u_BlkXI3Ff') });
const address = '0x4Fc42373230F8b69785ba8c5A472D6453d5e48C9';
const abi = parseAbi([
  "function getPolicy() view returns (uint256 maxAllocationBps, uint256 minLiquidityBufferBps, uint256 maxProtocols, uint256 rebalanceIntervalSecs, bool requireProofOfReserve)",
  "function currentPolicy() view returns (uint256, uint256, uint256, uint256, bool)"
]);

async function run() {
  const dataGetPolicy = encodeFunctionData({ abi, functionName: 'getPolicy' });
  const dataCurrentPolicy = encodeFunctionData({ abi, functionName: 'currentPolicy' });

  console.log("getPolicy data:", dataGetPolicy);
  console.log("currentPolicy data:", dataCurrentPolicy);

  try {
    const res = await client.call({ to: address, data: dataGetPolicy });
    console.log("getPolicy RES:", res.data);
    const decoded = decodeFunctionResult({ abi, functionName: "getPolicy", data: res.data! });
    console.log("decoded getPolicy:", decoded);
  } catch (err) {
    console.log("Error getPolicy:", err);
  }

  try {
    const res = await client.call({ to: address, data: dataCurrentPolicy });
    console.log("currentPolicy RES:", res.data);
    const decoded = decodeFunctionResult({ abi, functionName: "currentPolicy", data: res.data! });
    console.log("decoded currentPolicy:", decoded);
  } catch (err) { }
}
run();

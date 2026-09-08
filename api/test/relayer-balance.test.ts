import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { sql } from "../src/db/client";
import { resetDb } from "./helpers";
import { setChainClient } from "../src/chain/relayer";
import { fakeChain } from "./fake-chain";
import { runKeeperOnce } from "../src/worker/keeper";

const NOW = 1_757_000_000;
const RELAYER = "0xaf1444abf40afc91bcb4a6793765553c6bccea0d";
let chain: ReturnType<typeof fakeChain>;

beforeEach(async () => {
  await resetDb();
  chain = fakeChain({ nativeBalances: { [RELAYER]: 4_640_000_000_000_000_000n } });
  setChainClient(chain.client);
});
afterEach(() => setChainClient(null));

const samples = async () => sql`SELECT chain_id, address, balance_wei::text AS balance_wei, extract(epoch FROM sampled_at)::bigint AS at FROM relayer_balance_samples ORDER BY id`;

describe("FR-WRK-074 relayer gas sample", () => {
  it("FR_WRK_074_a_keeper_tick_writes_one_sample_of_the_relayer_native_balance", async () => {
    await runKeeperOnce({ now: NOW });
    const rows = await samples();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chain_id: 10143, address: RELAYER, balance_wei: "4640000000000000000" });
    expect(Number(rows[0]!.at)).toBe(NOW);
  });

  it("FR_WRK_074_a_failed_read_writes_nothing_and_the_tick_still_settles", async () => {
    chain.state.failNextNativeRead = new Error("rpc down");
    const logs: object[] = [];
    const r = await runKeeperOnce({ now: NOW, log: (e) => logs.push(e) });
    expect(await samples()).toHaveLength(0);
    expect(r.failed).toBe(0);
    expect(logs.some((l) => JSON.stringify(l).includes("relayer_balance"))).toBe(true);
  });

  it("FR_WRK_074_samples_older_than_seven_days_are_pruned_on_the_tick", async () => {
    await sql`INSERT INTO relayer_balance_samples (chain_id, address, balance_wei, sampled_at) VALUES
      (10143, ${RELAYER}, 1, to_timestamp(${NOW - 8 * 86400})), (10143, ${RELAYER}, 2, to_timestamp(${NOW - 6 * 86400}))`;
    await runKeeperOnce({ now: NOW });
    const rows = await samples();
    expect(rows.map((r: { balance_wei: string }) => r.balance_wei)).toEqual(["2", "4640000000000000000"]);
  });
});

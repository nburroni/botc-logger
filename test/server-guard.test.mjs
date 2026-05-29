import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGas } from "../tools/gas-harness.mjs";

const COMPLETE = {
  date: "2026-05-04", numPlayers: 8, script: "Trouble Brewing",
  startingRole: "Empath", startingTeam: "Good", startDemon: "Imp",
  winningTeam: "Good", winLoss: "W",
};

test("missingRequiredFields: complete payload returns []", () => {
  const gas = loadGas();
  assert.deepEqual(gas.missingRequiredFields(COMPLETE), []);
});

test("missingRequiredFields: flags blank and absent fields", () => {
  const gas = loadGas();
  const partial = { date: "2026-05-04", numPlayers: 8, script: "TB",
                    startingRole: "Empath", startingTeam: "Good" };
  assert.deepEqual(
    gas.missingRequiredFields(partial).sort(),
    ["startDemon", "winLoss", "winningTeam"].sort(),
  );
});

test("missingRequiredFields: treats whitespace-only as missing", () => {
  const gas = loadGas();
  const p = Object.assign({}, COMPLETE, { startDemon: "   " });
  assert.deepEqual(gas.missingRequiredFields(p), ["startDemon"]);
});

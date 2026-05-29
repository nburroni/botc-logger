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

// A minimal sheet stub. getLastDataRow scans column 1 over getMaxRows(); we
// return all-empty so the next write lands at row 3. setValues records writes.
function makeSheet() {
  const writes = [];
  return {
    writes,
    getMaxRows: () => 50,
    getRange: () => ({
      getValues: () => Array.from({ length: 50 }, () => [""]),
      setValues: (vals) => { writes.push(vals[0]); },
      setNumberFormat: () => {},
    }),
  };
}

test("doPost: rejects an incomplete payload and writes nothing", () => {
  const sheet = makeSheet();
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const e = { postData: { contents: JSON.stringify({ key: "h", date: "2026-05-04", script: "TB" }) } };
  const body = JSON.parse(gas.doPost(e)._s);
  assert.match(body.error, /Missing required fields/);
  assert.equal(sheet.writes.length, 0);
});

test("doPost: accepts a complete payload and writes one row", () => {
  const sheet = makeSheet();
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const payload = Object.assign({ key: "h" }, COMPLETE);
  const body = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } })._s);
  assert.equal(body.success, true);
  assert.equal(sheet.writes.length, 1);
});

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

test("doPost: writes traveller and extra columns to the right places (A–AN)", () => {
  const sheet = makeSheet();
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const payload = Object.assign({ key: "h", clientId: "cid-trav" }, COMPLETE, {
    traveller1: "Apprentice", traveller1GE: "Good",
    traveller3: "Gangster", traveller3GE: "Evil",
    travellerNotes: "joined N2",
    wizardGame: "Y", wishNotes: "wished X",
    winLossNotes: "demon exe", overallGameNotes: "fun",
  });
  gas.doPost({ postData: { contents: JSON.stringify(payload) } });
  const row = sheet.writes[0]; // 0-based array; COL values are 1-based
  assert.equal(row.length, 40);          // A–AN
  assert.equal(row[27], "Apprentice");   // AB TRAVELLER_1
  assert.equal(row[28], "Good");         // AC TRAVELLER_1_GE
  assert.equal(row[31], "Gangster");     // AF TRAVELLER_3
  assert.equal(row[32], "Evil");         // AG TRAVELLER_3_GE
  assert.equal(row[33], "joined N2");    // AH TRAVELLER_NOTES
  assert.equal(row[35], "Y");            // AJ WIZARD_GAME
  assert.equal(row[36], "wished X");     // AK WISH_NOTES
  assert.equal(row[37], "demon exe");    // AL WIN_LOSS_NOTES
  assert.equal(row[38], "fun");          // AM OVERALL_GAME_NOTES
  assert.equal(row[39], "cid-trav");     // AN CLIENT_ID (relocated from AB)
});

test("rowToHistoryEntry: reads traveller and extra columns back", () => {
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" } });
  const row = new Array(40).fill("");
  row[27] = "Apprentice"; row[28] = "Good";
  row[33] = "tnotes"; row[35] = "N"; row[38] = "overall";
  const e = gas.rowToHistoryEntry(row);
  assert.equal(e.traveller1, "Apprentice");
  assert.equal(e.traveller1GE, "Good");
  assert.equal(e.travellerNotes, "tnotes");
  assert.equal(e.wizardGame, "N");
  assert.equal(e.overallGameNotes, "overall");
});

test("rowToHistoryEntry: includes the sheet row number", () => {
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" } });
  const row = new Array(40).fill("");
  row[0] = "2026-05-04"; // DATE col A
  const e = gas.rowToHistoryEntry(row, 7);
  assert.equal(e.rowNum, 7);
});

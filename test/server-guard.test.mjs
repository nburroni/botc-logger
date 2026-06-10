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
      clearDataValidations: () => {},
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

// Like makeSheet but seeds one existing data row (sheet row `atRow`) with the
// given clientId in column AN (40), so update-path tests can assert the
// existing clientId is preserved. getLastDataRow scans column A (DATE).
function makeSheetWithRow(atRow, clientId) {
  const writes = [];
  const maxRows = 50;
  const colA = Array.from({ length: maxRows }, () => [""]);
  colA[atRow - 1] = ["2026-05-01"]; // DATE present so getLastDataRow finds it
  return {
    writes,
    getMaxRows: () => maxRows,
    getRange: (r, c, numR, numC) => ({
      // Column-A scan for getLastDataRow.
      getValues: () => {
        if (c === 1 && numC === 1) return colA;
        // CLIENT_ID single-column read at (atRow, 40).
        if (c === 40 && numC === 1) {
          const out = Array.from({ length: numR }, () => [""]);
          out[atRow - r] = [clientId];
          return out;
        }
        return Array.from({ length: numR }, () => new Array(numC).fill(""));
      },
      setValues: (vals) => { writes.push({ row: r, vals: vals[0] }); },
      clearDataValidations: () => {},
      setNumberFormat: () => {},
    }),
  };
}

test("doPost update: writes to the given rowNum, not appending", () => {
  const sheet = makeSheetWithRow(5, "existing-cid");
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const payload = Object.assign({ key: "h", action: "update", rowNum: 5,
    clientId: "new-cid-ignored" }, COMPLETE);
  const body = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } })._s);
  assert.equal(body.success, true);
  assert.equal(body.updated, true);
  assert.equal(body.row, 5);
  assert.equal(sheet.writes.length, 1);
  assert.equal(sheet.writes[0].row, 5);
});

test("doPost update: preserves the existing clientId at column AN", () => {
  const sheet = makeSheetWithRow(5, "existing-cid");
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const payload = Object.assign({ key: "h", action: "update", rowNum: 5,
    clientId: "new-cid-ignored" }, COMPLETE);
  gas.doPost({ postData: { contents: JSON.stringify(payload) } });
  assert.equal(sheet.writes[0].vals[39], "existing-cid"); // AN = index 39
});

test("doPost update: rejects an incomplete payload, writes nothing", () => {
  const sheet = makeSheetWithRow(5, "existing-cid");
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const payload = { key: "h", action: "update", rowNum: 5, date: "2026-05-04", script: "TB" };
  const body = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } })._s);
  assert.match(body.error, /Missing required fields/);
  assert.equal(sheet.writes.length, 0);
});

test("doPost update: rejects rowNum past the last data row", () => {
  const sheet = makeSheetWithRow(5, "existing-cid"); // lastDataRow = 5
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const payload = Object.assign({ key: "h", action: "update", rowNum: 99 }, COMPLETE);
  const body = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } })._s);
  assert.match(body.error, /out of range/i);
  assert.equal(sheet.writes.length, 0);
});

test("doPost update: rejects rowNum below the data start (row 2)", () => {
  const sheet = makeSheetWithRow(5, "existing-cid");
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const payload = Object.assign({ key: "h", action: "update", rowNum: 2 }, COMPLETE);
  const body = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } })._s);
  assert.match(body.error, /out of range/i);
  assert.equal(sheet.writes.length, 0);
});

test("doPost update: rejects a non-numeric rowNum", () => {
  const sheet = makeSheetWithRow(5, "existing-cid");
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const payload = Object.assign({ key: "h", action: "update", rowNum: "banana" }, COMPLETE);
  const body = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } })._s);
  assert.match(body.error, /out of range/i);
  assert.equal(sheet.writes.length, 0);
});

test("doPost update: preserves an empty clientId on a legacy row (AN blank)", () => {
  const sheet = makeSheetWithRow(5, "");
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  const payload = Object.assign({ key: "h", action: "update", rowNum: 5,
    clientId: "new-cid-ignored" }, COMPLETE);
  gas.doPost({ postData: { contents: JSON.stringify(payload) } });
  assert.equal(sheet.writes[0].vals[39], ""); // AN stays blank, payload UUID ignored
});

// Stub whose setValues throws a validation-style error on first call, then
// succeeds. Records clearDataValidations calls. Mirrors Apps Script's behaviour
// when a cell's data-validation rejects a written value.
//
// IMPORTANT — real Apps Script behaviour (verified empirically against the live
// runtime): setValues() does NOT throw synchronously when a value violates a
// cell's data-validation. The rejection is deferred to flush() (after the call
// returns), and the offending cell's value is silently dropped — leaving a
// truncated row. The ONLY reliable fix is to clearDataValidations() on the row
// BEFORE setValues. This stub models that: if validations were not cleared
// before the write, any value in a "validated" column index is dropped (set to
// "") to mimic the silent truncation; once cleared, the full row lands.
function makeValidationStub(atRow, validatedCols = [9, 15]) { // J=idx9, P=idx15
  const calls = { setValues: 0, clearDataValidations: 0, written: null, clearedBeforeWrite: false };
  const maxRows = 50;
  const colA = Array.from({ length: maxRows }, () => [""]);
  colA[atRow - 1] = ["2026-05-01"];
  let cleared = false;
  return {
    calls,
    getMaxRows: () => maxRows,
    getRange: (r, c, numR, numC) => ({
      getValues: () => {
        if (c === 1 && numC === 1) return colA;
        return Array.from({ length: numR || 1 }, () => new Array(numC || 1).fill(""));
      },
      setValues: (vals) => {
        calls.setValues++;
        calls.clearedBeforeWrite = cleared;
        const row = vals[0].slice();
        if (!cleared && (numC || 0) >= 40) {
          // Mimic flush-time silent truncation: drop values in validated columns.
          validatedCols.forEach(i => { row[i] = ""; });
        }
        calls.written = row;
      },
      clearDataValidations: () => { calls.clearDataValidations++; cleared = true; },
      setNumberFormat: () => {},
    }),
  };
}

test("writeRow: clears validations before writing so the full row lands", () => {
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" } });
  const sheet = makeValidationStub(5);
  const row = new Array(40).fill("");
  row[0] = "2026-06-08"; row[9] = "Drunk"; row[15] = "Imp"; row[18] = "W";
  gas.writeRow(sheet, 5, row);
  assert.equal(sheet.calls.clearDataValidations, 1);
  assert.equal(sheet.calls.clearedBeforeWrite, true);   // cleared BEFORE setValues
  assert.equal(sheet.calls.written[9], "Drunk");        // validated col J landed
  assert.equal(sheet.calls.written[15], "Imp");         // validated col P landed
  assert.equal(sheet.calls.written[18], "W");           // col S landed
});

test("writeRow: without the clear, a validated-column value would be dropped (guards the regression)", () => {
  // Demonstrates the stub models real truncation: a direct setValues (no clear)
  // drops validated columns. This is what the OLD try/catch fix failed to prevent.
  const sheet = makeValidationStub(5);
  const target = sheet.getRange(5, 1, 1, 40);
  const row = new Array(40).fill(""); row[9] = "Drunk"; row[18] = "W";
  target.setValues([row]); // no clear first
  assert.equal(sheet.calls.written[9], "");   // J dropped — the bug
  assert.equal(sheet.calls.written[18], "W");  // S (unvalidated) survives
});

test("doPost append: a validation-rejecting row still lands fully (regression)", () => {
  const sheet = makeValidationStub(4); // lastDataRow = 4, append targets row 5
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" }, sheet });
  // midGameRole "g" (col J, idx9) is the kind of off-list value that triggered
  // the original silent truncation.
  const payload = Object.assign({ key: "h", clientId: "cid-x" }, COMPLETE, { midGameRole: "g", startDemon: "Imp" });
  const body = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify(payload) } })._s);
  assert.equal(body.success, true);
  assert.equal(sheet.calls.clearDataValidations, 1);
  assert.equal(sheet.calls.clearedBeforeWrite, true);
  assert.equal(sheet.calls.written[9], "g");   // mid role landed (col J)
  assert.equal(sheet.calls.written[15], "Imp"); // start demon landed (col P)
  assert.equal(sheet.calls.written[18], "W");   // winLoss landed (col S)
});

test("rowToHistoryEntry: includes clientId from column AN", () => {
  const gas = loadGas({ properties: { PASSWORD_HASH: "h" } });
  const row = new Array(40).fill("");
  row[0] = "2026-06-08"; row[39] = "cid-abc"; // AN = index 39
  const e = gas.rowToHistoryEntry(row, 5);
  assert.equal(e.clientId, "cid-abc");
});

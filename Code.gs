/**
 * Blood on the Clocktower Game Logger — Google Apps Script Backend
 *
 * SETUP:
 * 1. Open your BotC spreadsheet in Google Sheets
 * 2. Go to Extensions → Apps Script
 * 3. Delete any existing code in Code.gs and paste this entire file
 * 4. Click "Deploy" → "New deployment"
 * 5. Choose type: "Web app"
 * 6. Set "Execute as" → "Me"
 * 7. Set "Who has access" → "Anyone" (so your phone can reach it without sign-in)
 * 8. Click "Deploy" and authorize when prompted
 * 9. Copy the Web App URL — you'll paste it into the HTML form
 */

// ——— CONFIGURATION ———
// SHA-256 hash of the access password, stored in Script Properties so it
// never appears in source code. Set it once via:
//   Apps Script editor → Project Settings → Script Properties → Add property
//   Key:   PASSWORD_HASH
//   Value: <your sha-256 hex string>
const PASSWORD_HASH = PropertiesService.getScriptProperties().getProperty("PASSWORD_HASH");

// Name of the sheet/tab where game data lives (the one with your columns)
const DATA_SHEET_NAME = "DATA ENTRY";  // Must match your sheet tab name exactly

// Column order (A=1, B=2, ... AA=27) matching your spreadsheet
const COL = {
  DATE: 1,            // A
  EVENT: 2,           // B
  LOCATION: 3,        // C
  LIVE_ONLINE: 4,     // D
  SCRIPT: 5,          // E
  STORYTELLER: 6,     // F
  NUM_PLAYERS: 7,     // G
  STARTING_ROLE: 8,   // H
  STARTING_TEAM: 9,   // I
  MID_GAME_ROLE: 10,  // J
  MID_GAME_TEAM: 11,  // K
  ENDING_ROLE: 12,    // L
  ENDING_TEAM: 13,    // M
  ROLE_NOTES: 14,     // N
  LIVED_DIED_NOTES: 15, // O
  START_DEMON: 16,    // P
  END_DEMON: 17,      // Q
  WINNING_TEAM: 18,   // R
  WIN_LOSS: 19,       // S
  LAST_NIGHT: 20,     // T
  FABLED_1: 21,       // U
  FABLED_2: 22,       // V
  FABLED_3: 23,       // W
  FABLED_NOTES: 24,   // X
  LORIC_1: 25,        // Y
  LORIC_2: 26,        // Z
  LORIC_NOTES: 27,    // AA
  SPECIAL_WIN_TYPE: 35 // AI
};

/**
 * Handle GET requests — returns current dropdown options from existing data
 * so the form can show autocomplete suggestions.
 */
function doGet(e) {
  const callback = e.parameter.callback || "";
  try {
    if (!e.parameter.key || e.parameter.key !== PASSWORD_HASH) {
      return jsonpResponse({ error: "Unauthorized" }, callback);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DATA_SHEET_NAME);

    if (!sheet) {
      return jsonpResponse({ error: "Sheet '" + DATA_SHEET_NAME + "' not found. Check DATA_SHEET_NAME in Code.gs." }, callback);
    }

    if (e.parameter.action === "history") {
      const lastDataRow = getLastDataRow(sheet, COL.DATE);
      if (lastDataRow < 3) {
        return jsonResponse({ rows: [], total: 0, hasMore: false });
      }
      const all = sheet.getRange(3, 1, lastDataRow - 2, 35).getValues()
        .filter(r => r[COL.DATE - 1] !== "" && r[COL.DATE - 1] !== null);
      const total  = all.length;
      const rawLimit = parseInt(e.parameter.limit);
      const limit    = Math.min(Math.max(isNaN(rawLimit) ? 10 : rawLimit, 1), 50);
      const offset = Math.max(parseInt(e.parameter.offset) || 0, 0);
      const slice  = all.slice().reverse().slice(offset, offset + limit);
      return jsonResponse({
        rows:    slice.map(rowToHistoryEntry),
        total:   total,
        hasMore: offset + limit < total,
      });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      return jsonpResponse({ options: getEmptyOptions() }, callback);
    }

    const data = sheet.getRange(3, 1, lastRow - 2, 35).getValues();

    const options = {
      events: uniqueNonEmpty(data.map(r => r[COL.EVENT - 1])),
      locations: uniqueNonEmpty(data.map(r => r[COL.LOCATION - 1])),
      scripts: uniqueNonEmpty(data.map(r => r[COL.SCRIPT - 1])),
      storytellers: uniqueNonEmpty(data.map(r => r[COL.STORYTELLER - 1])),
      roles: uniqueNonEmpty([
        ...data.map(r => r[COL.STARTING_ROLE - 1]),
        ...data.map(r => r[COL.MID_GAME_ROLE - 1]),
        ...data.map(r => r[COL.ENDING_ROLE - 1])
      ]),
      demons: uniqueNonEmpty([
        ...data.map(r => r[COL.START_DEMON - 1]),
        ...data.map(r => r[COL.END_DEMON - 1])
      ]),
      fabled: uniqueNonEmpty([
        ...data.map(r => r[COL.FABLED_1 - 1]),
        ...data.map(r => r[COL.FABLED_2 - 1]),
        ...data.map(r => r[COL.FABLED_3 - 1])
      ]),
      lorics: uniqueNonEmpty([
        ...data.map(r => r[COL.LORIC_1 - 1]),
        ...data.map(r => r[COL.LORIC_2 - 1])
      ])
    };

    return jsonpResponse({ options: options }, callback);

  } catch (err) {
    return jsonpResponse({ error: err.message }, callback);
  }
}

/**
 * Handle POST requests — appends a new game row
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (!body.key || body.key !== PASSWORD_HASH) {
      return jsonResponse({ error: "Unauthorized" });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DATA_SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ error: "Sheet '" + DATA_SHEET_NAME + "' not found." });
    }

    // Build the row array matching columns A–AI
    const row = new Array(35).fill("");

    row[COL.DATE - 1]           = body.date || "";
    row[COL.EVENT - 1]          = body.event || "";
    row[COL.LOCATION - 1]       = body.location || "";
    row[COL.LIVE_ONLINE - 1]    = body.liveOnline || "";
    row[COL.SCRIPT - 1]         = body.script || "";
    row[COL.STORYTELLER - 1]    = body.storyteller || "";
    row[COL.NUM_PLAYERS - 1]    = body.numPlayers ? parseInt(body.numPlayers) : "";
    row[COL.STARTING_ROLE - 1]  = body.startingRole || "";
    row[COL.STARTING_TEAM - 1]  = body.startingTeam || "";
    row[COL.MID_GAME_ROLE - 1]  = body.midGameRole || "";
    row[COL.MID_GAME_TEAM - 1]  = body.midGameTeam || "";
    row[COL.ENDING_ROLE - 1]    = body.endingRole || "";
    row[COL.ENDING_TEAM - 1]    = body.endingTeam || "";
    row[COL.ROLE_NOTES - 1]     = body.roleNotes || "";
    row[COL.LIVED_DIED_NOTES - 1] = body.livedDiedNotes || "";
    row[COL.START_DEMON - 1]    = body.startDemon || "";
    row[COL.END_DEMON - 1]      = body.endDemon || "";
    row[COL.WINNING_TEAM - 1]   = body.winningTeam || "";
    row[COL.WIN_LOSS - 1]       = body.winLoss || "";
    row[COL.LAST_NIGHT - 1]     = body.lastNight || "";
    row[COL.FABLED_1 - 1]       = body.fabled1 || "";
    row[COL.FABLED_2 - 1]       = body.fabled2 || "";
    row[COL.FABLED_3 - 1]       = body.fabled3 || "";
    row[COL.FABLED_NOTES - 1]   = body.fabledNotes || "";
    row[COL.LORIC_1 - 1]        = body.loric1 || "";
    row[COL.LORIC_2 - 1]        = body.loric2 || "";
    row[COL.LORIC_NOTES - 1]     = body.loricNotes || "";
    row[COL.SPECIAL_WIN_TYPE - 1] = body.specialWinType || "";

    // `appendRow` / `getLastRow` count rows that only have data-validation or
    // formatting, so on this sheet they land ~1000 rows below the real data.
    // Instead, find the last row that actually has a DATE value and write the
    // next row directly.
    const lastDataRow = getLastDataRow(sheet, COL.DATE);
    const newRow = Math.max(lastDataRow + 1, 3); // data starts at row 3
    sheet.getRange(newRow, 1, 1, 35).setValues([row]);

    if (body.date) {
      sheet.getRange(newRow, COL.DATE).setNumberFormat("d MMM yyyy");
    }

    return jsonResponse({ success: true, row: newRow });

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ——— HELPERS ———

// Returns the 1-indexed row number of the last row in `col` that has a
// non-empty value. Returns 0 if the column is empty. This ignores rows that
// only have data-validation or formatting (unlike `sheet.getLastRow()`).
function getLastDataRow(sheet, col) {
  const values = sheet.getRange(1, col, sheet.getMaxRows(), 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i][0];
    if (v !== "" && v !== null && v !== undefined) return i + 1;
  }
  return 0;
}

function uniqueNonEmpty(arr) {
  const set = new Set();
  arr.forEach(v => {
    const s = String(v).trim();
    if (s && s !== "undefined" && s !== "null") set.add(s);
  });
  return Array.from(set).sort();
}

function getEmptyOptions() {
  return {
    events: [],
    locations: [],
    scripts: [],
    storytellers: [],
    roles: [],
    demons: [],
    fabled: [],
    lorics: []
  };
}

function rowToHistoryEntry(row) {
  const dateVal = row[COL.DATE - 1];
  let dateStr = "";
  if (dateVal instanceof Date && !isNaN(dateVal)) {
    dateStr = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "d MMM yyyy");
  } else if (dateVal) {
    dateStr = String(dateVal);
  }
  return {
    date:           dateStr,
    script:         String(row[COL.SCRIPT - 1]          || ""),
    startingRole:   String(row[COL.STARTING_ROLE - 1]   || ""),
    startingTeam:   String(row[COL.STARTING_TEAM - 1]   || ""),
    winLoss:        String(row[COL.WIN_LOSS - 1]         || ""),
    winningTeam:    String(row[COL.WINNING_TEAM - 1]     || ""),
    numPlayers:     Number(row[COL.NUM_PLAYERS - 1])     || 0,
    startDemon:     String(row[COL.START_DEMON - 1]      || ""),
    endDemon:       String(row[COL.END_DEMON - 1]        || ""),
    midGameRole:    String(row[COL.MID_GAME_ROLE - 1]    || ""),
    midGameTeam:    String(row[COL.MID_GAME_TEAM - 1]    || ""),
    endingRole:     String(row[COL.ENDING_ROLE - 1]      || ""),
    endingTeam:     String(row[COL.ENDING_TEAM - 1]      || ""),
    specialWinType: String(row[COL.SPECIAL_WIN_TYPE - 1] || ""),
    event:          String(row[COL.EVENT - 1]            || ""),
    location:       String(row[COL.LOCATION - 1]         || ""),
    liveOnline:     String(row[COL.LIVE_ONLINE - 1]      || ""),
    storyteller:    String(row[COL.STORYTELLER - 1]      || ""),
    lastNight:      String(row[COL.LAST_NIGHT - 1]       || ""),
    roleNotes:      String(row[COL.ROLE_NOTES - 1]       || ""),
    livedDiedNotes: String(row[COL.LIVED_DIED_NOTES - 1] || ""),
    fabled1:        String(row[COL.FABLED_1 - 1]         || ""),
    fabled2:        String(row[COL.FABLED_2 - 1]         || ""),
    fabled3:        String(row[COL.FABLED_3 - 1]         || ""),
    fabledNotes:    String(row[COL.FABLED_NOTES - 1]     || ""),
    loric1:         String(row[COL.LORIC_1 - 1]          || ""),
    loric2:         String(row[COL.LORIC_2 - 1]          || ""),
    loricNotes:     String(row[COL.LORIC_NOTES - 1]      || ""),
  };
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse(obj, callback) {
  if (callback) {
    // JSONP: wrap JSON in callback function call, serve as JavaScript
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(obj) + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  // Fallback to plain JSON if no callback
  return jsonResponse(obj);
}

/**
 * Utility: store PASSWORD_HASH in Script Properties so it never has to
 * appear in source code. Called by `make setup-hash` via `clasp run`, or
 * you can run it manually from the Apps Script editor.
 *
 * @param {string} hash  The SHA-256 hex string to store.
 */
function setPasswordHash(hash) {
  PropertiesService.getScriptProperties().setProperty("PASSWORD_HASH", hash);
  return "PASSWORD_HASH set (" + hash.substring(0, 8) + "...)";
}

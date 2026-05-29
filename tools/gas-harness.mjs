// Loads the real Code.gs into a Node vm context with stubbed Apps Script
// globals so its pure helpers and doPost can be tested without Google's
// runtime. Pass `properties` for Script Properties (e.g. PASSWORD_HASH) and a
// `sheet` stub for SpreadsheetApp.getActiveSpreadsheet().getSheetByName().
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, "..", "Code.gs"), "utf8");

export function loadGas({ properties = {}, sheet = null } = {}) {
  const ctx = {
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in properties ? properties[k] : null),
        setProperty: () => {},
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
    },
    ContentService: {
      MimeType: { JSON: "json", JAVASCRIPT: "javascript" },
      // jsonResponse returns createTextOutput(...).setMimeType(...); expose the
      // serialized string as ._s so tests can parse it back.
      createTextOutput: (s) => ({ _s: s, setMimeType() { return this; } }),
    },
    Session: { getScriptTimeZone: () => "UTC" },
    Utilities: { formatDate: (d) => String(d) },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "Code.gs" });
  return ctx;
}

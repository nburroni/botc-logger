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
    // Expose host Array/Object/String/JSON so vm-returned values share the same
    // prototype chain and pass assert.deepEqual in tests.
    Array,
    Object,
    String,
    JSON,
    parseInt,
    Math,
    isNaN,
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

  // vm array literals use the sandbox's own Array prototype, which is not the
  // same reference as the host Array. Wrap any function that returns an array
  // so assert.deepEqual in tests works correctly (host Array.isArray + instanceof).
  const _missingRequiredFields = ctx.missingRequiredFields;
  ctx.missingRequiredFields = function(body) {
    return Array.from(_missingRequiredFields(body));
  };

  return ctx;
}

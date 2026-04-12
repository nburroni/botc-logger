# BotC Logger

A lightweight web app for logging **Blood on the Clocktower** game sessions. Records game details to a connected Google Sheet for tracking personal stats and role performance over time.

![BotC Logger](botc_head.webp)

## Features

- **Game logging** — Record date, event, location, format (live/online), script, storyteller, player count, and personal role
- **Role tracking** — 140+ BotC characters with automatic Good/Evil team assignment, mid-game role change support, and Fabled/Loric character tracking
- **Outcome calculation** — Automatically determines win/loss based on your ending team vs. the winning team
- **Smart autocomplete** — Merges a static character almanac with dynamic suggestions pulled from your game history in the sheet
- **Google Sheets backend** — Persists all data via Google Apps Script (JSONP for reads, `no-cors` POST for writes); no server required
- **Offline-friendly** — Cookie-based auth with connection status indicator; falls back to built-in lists when offline
- **Dark-themed mobile-first UI** — Designed for quick logging on your phone between games, with collapsible sections, chip selectors, and toast notifications

## Project Structure

```
index.html      — Page markup (form, setup overlay, header)
styles.css      — All styling (dark theme, chips, autocomplete, toast)
app.js          — Client logic (auth, autocomplete, form submit, JSONP)
Code.gs         — Google Apps Script backend (deploy this in your sheet)
botc_head.webp  — App icon
.env            — Deployment ID and password (local only, not committed)
```

## How It Works

1. **Connect** — Enter your Google Apps Script Deployment ID and password on first use (stored in browser cookies)
2. **Log a game** — Fill out game details, select your role and team, note the demon and outcome
3. **Submit** — Data is POSTed to Google Apps Script, which appends a row to your Google Sheet
4. **Autocomplete** — On load (and after each submit), the app fetches unique values from your sheet via JSONP to populate autocomplete suggestions
5. **Analyze** — Use your Google Sheet for stats, charts, and role performance tracking

## Setup

### 1. Prepare the Google Sheet

Create a Google Sheet with a tab named **`DATA ENTRY`** (must match `DATA_SHEET_NAME` in `Code.gs`). Columns A–AA should match the field order defined in `Code.gs` (Date, Event, Location, Live/Online, Script, Storyteller, # Players, Starting Role, ..., Loric Notes).

### 2. Deploy the Apps Script

1. In your sheet, go to **Extensions → Apps Script**
2. Delete any existing code in `Code.gs` and paste the contents of `Code.gs` from this repo
3. Set the `PASSWORD_HASH` constant to the SHA-256 hash of your chosen password. You can generate it with:
   ```bash
   echo -n 'YourPasswordHere' | shasum -a 256 | cut -d' ' -f1
   ```
4. Click **Deploy → New deployment**
5. Type: **Web app**, Execute as: **Me**, Who has access: **Anyone**
6. Click **Deploy**, authorize when prompted, and copy the **Deployment ID**

> **Important:** Every time you edit `Code.gs`, you must create a **new deployment** (Deploy → New deployment) for changes to take effect. Simply saving the script is not enough — the old deployment ID still serves the old code.

### 3. Host the frontend

Serve `index.html` from any static host (GitHub Pages, Vercel, a local server, etc.). On first visit, enter your Deployment ID and password in the setup overlay.

## Tech Stack

- Vanilla HTML / CSS / JavaScript (no build step, no dependencies)
- Google Apps Script backend (`doGet` for JSONP reads, `doPost` for writes)
- Google Sheets for data storage
- SHA-256 client-side password hashing via Web Crypto API
- JSONP for CORS-free GET requests; `no-cors` fetch for POST writes

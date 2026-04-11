# EnviroTrack — Caputo Foods Environmental Monitoring

> Web application for managing the environmental monitoring program (SQF 2.4.H) across all Caputo Foods production facilities.

---

## Overview

EnviroTrack is a Progressive Web App (PWA) built for the Caputo Foods Quality Control team. It manages weekly environmental swab testing across four production plants, tracks pathogen results, handles retest workflows, and generates SQF-compliant reports.

---

## Features

- **Weekly Test Generator** — Randomly selects sampling points from the master list, avoiding repetition across the last 4 cycles. Respects Zone 2/3/4 coverage requirements.
- **Lab Result Tracking** — Records Negative / Positive results per test with per-pathogen detail (E.Coli, Listeria, Salmonella, S.Aureus).
- **Retest Workflow** — When a test is Positive, automatically schedules 3 retests on consecutive workdays. Closes the original case immediately.
- **Auto-resolve** — When all 3 retests come back Negative, the case closes automatically.
- **SQF Compliance Reports** — Calculates compliance score against SQF 11th Edition § 2.4.H requirements with exportable PDF reports.
- **Master Point Management** — Add, edit, deactivate, or reactivate sampling points per plant without losing historical data.
- **User Management** — PIN-based authentication with Inspector, Manager, and Administrator roles.
- **PDF Export** — Professional landscape PDF reports for weekly forms, retests, history, and SQF compliance — all in English.
- **Session Timeout** — Auto-logout after 5 minutes of inactivity with a 60-second warning.

---

## Plants Covered

| Plant | SQF Reference | Zones |
|-------|--------------|-------|
| 1945  | 2.4.H.8      | 2, 3, 4 |
| 1935  | 2.4.H.9      | 2, 3, 4 |
| 1931 East | 2.4.H.10 | 2, 3, 4 |
| 1931 West | 2.4.H.11 | 2, 3, 4 |

---

## Project Structure

```
caputo-env-monitoring/
├── index.html          # App shell — HTML structure + login screen
├── css/
│   └── styles.css      # All styles and CSS variables
└── js/
    ├── data.js         # MASTER sampling point database + constants
    ├── storage.js      # localStorage helpers, toast notifications
    ├── auth.js         # Login, logout, PIN authentication
    ├── navigation.js   # Page routing and tab switching
    ├── generator.js    # Weekly test generation and override logic
    ├── pdf.js          # All PDF export functions (English)
    ├── history.js      # Test history search and filtering
    ├── retests.js      # Retest workflow and lab result recording
    ├── dashboard.js    # Dashboard stats and summary
    ├── reports.js      # Analytics, charts, and SQF compliance
    ├── settings.js     # Master point and user management
    └── init.js         # Session timeout and app initialization
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML, CSS, JavaScript |
| PDF Generation | [jsPDF](https://github.com/parallax/jsPDF) + jsPDF-AutoTable |
| Charts | [Chart.js](https://www.chartjs.org/) |
| Storage | `localStorage` (browser-based, no backend required) |
| Auth | PIN-based (client-side) |

---

## Getting Started

### Run locally

No build step required. Simply open `index.html` in a browser:

```bash
# Option 1: open directly
open index.html

# Option 2: use a local server (recommended)
npx serve .
# or
python3 -m http.server 8080
```

> **Note:** Some browsers block local file access for multi-file projects. Using a local server avoids this.



Additional users can be created from **Settings → Users** (Admin only).

---

## Data Storage

All data is stored in the browser's `localStorage`. This means:

- Data persists between sessions on the same device/browser
- Data is **not** shared between devices automatically
- Clearing browser data will erase all records

**Keys used:**

| Key | Contents |
|-----|---------|
| `cap_h` | All test history records |
| `cap_w` | Weekly session log |
| `cap_rv` | Resolved retest cases |
| `cap_users` | User accounts |
| `cap_master_add` | Custom-added sampling points |
| `cap_master_del` | Deactivated sampling points |

---

## SQF Compliance Logic

The app evaluates compliance against these requirements:

1. Minimum 10 tests per plant per week
2. Coverage of Zones 2, 3, and 4 every cycle
3. First retest started within 3 business days of a positive result
4. All positive cases resolved (retests completed)
5. MASTER point coverage > 80%

An overall compliance score (0–100%) is calculated with weighted averages and displayed with a color-coded badge (green ≥ 95%, yellow ≥ 80%, red < 80%).

---

## PDF Reports

All PDFs are generated in **English** and include:

- Caputo Foods logo and header
- SQF reference number
- Document Control History table
- Approval signature block
- "Confidential" badge

Report types:
- **Weekly Collection Form** — used in the field during sampling
- **Retest Form** — one per retest event
- **History Export** — filtered test records
- **Analytics Report** — KPIs, charts summary, top failing points
- **SQF Compliance Report** — audit-ready compliance summary

---

## Development Notes

- The `const LOGO` variable in `data.js` contains the Caputo Foods logo as a base64-encoded JPEG. Do not modify this — it is used in all PDF headers.
- The `const MASTER` object contains all sampling points for all four plants. Adding points through the UI writes to `localStorage`, not to this constant.
- Charts (Chart.js instances) are stored in `chartInstances` and destroyed before rebuilding to prevent canvas memory leaks.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-10 | Initial release — all 4 plants, PDF export, SQF compliance |

---

## License

Internal use only — Caputo Foods / Nexio. Not for public distribution.

# EnviroTrack — Caputo Foods Environmental Monitoring

A browser-based quality control app for managing SQF-compliant environmental swab testing across four Caputo Foods production facilities (1945, 1935, 1931 East, 1931 West).

## What it does

Generates weekly sampling plans from a 500+ point master database, records lab results per pathogen (E.Coli, Listeria, Salmonella, S.Aureus), manages the full retest workflow when a sample tests positive, and produces audit-ready PDF reports — all stored locally in the browser with no backend required.

## Key features
- Smart test generator with 4-week rotation to avoid repeating sampling points
- Per-pathogen result tracking with automatic retest scheduling (3 consecutive workdays)
- Auto-resolution when all 3 retests come back negative
- SQF compliance scoring against 5 program requirements
- Professional PDF export for weekly forms, retests, history, and compliance reports
- PIN-based access with Inspector, Manager, and Administrator roles
- 5-minute session timeout with activity tracking

## Tech stack
Vanilla HTML/CSS/JS · jsPDF · Chart.js · localStorage

## Project structure
```
caputo-env-monitoring/
├── index.html
├── css/styles.css
└── js/
    ├── data.js        # 500+ master sampling points
    ├── generator.js   # Weekly test logic
    ├── retests.js     # Retest workflow
    ├── pdf.js         # All PDF exports (English)
    ├── reports.js     # Analytics + SQF compliance
    └── ...8 more modules
```

## Getting started
```bash
npx serve .
# or just open index.html in a browser
```
Default admin PIN: `0000`

---
*Internal use only — Caputo Foods / Nexio*

// ═══════════════════════════════════════════════════════════════
// ONE-TIME RE-MIGRATION: the MasterPoints list was emptied, so this
// RE-INSERTS all 698 points with the CORRECT values, using the
// verified MASTER recovered from git as the source of truth.
// Uses the MasterPoints WRITE (create) flow.
//
// Reads the flow URL straight from functions/.env (never hard-coded).
//
// Usage:
//   node _fixmaster.js --dry     # print what it would insert, write nothing
//   node _fixmaster.js --test    # insert ONLY 1945 sample 200, to verify
//   node _fixmaster.js           # insert all 698 points
//
// SAFETY: run --test first. Verify in SharePoint that 1945/200 area =
// "Vibratory Conveyor". If correct → DELETE that one test point in the
// list → then run the full insert (so 200 isn't duplicated).
// After it all runs OK: log out/in of the app to re-pull. Then DELETE
// this file.
// ═══════════════════════════════════════════════════════════════
const { execSync } = require('child_process');
const fs = require('fs');

// ── 1. Correct MASTER from git (the verified, pre-migration source) ──
const raw = execSync('git show ce7af53:js/data.js').toString();
const m = raw.match(/const MASTER\s*=\s*(\{[\s\S]*?\});/);
if (!m) { console.error('Could not recover MASTER from git commit ce7af53'); process.exit(1); }
const MASTER = JSON.parse(m[1]);
const points = [];
for (const dept in MASTER) for (const p of MASTER[dept]) {
  points.push({ department: dept, sample: p.sample, zone: p.zone,
    area: p.area || '', line: String(p.line == null ? '' : p.line), location: p.location || '' });
}

// ── 2. Flow URL from functions/.env ──
const env = {};
fs.readFileSync('functions/.env', 'utf8').split('\n').forEach(l => {
  const mm = l.match(/^([A-Z_]+)\s*=\s*(.*)$/); if (mm) env[mm[1]] = mm[2].trim();
});
const WRITE = env.FLOW_MASTERPOINTS_WRITE;
if (!WRITE) { console.error('Missing FLOW_MASTERPOINTS_WRITE in functions/.env'); process.exit(1); }

const args = process.argv.slice(2);
const TEST = args.includes('--test');
const DRY  = args.includes('--dry');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = new Date().toISOString();

let list = points;
if (TEST) list = points.filter(p => p.department === '1945' && p.sample === 200);
const items = list.map(p => ({
  department: p.department, sample: p.sample, zone: p.zone,
  area: p.area, line: p.line, location: p.location, active: true,
  enteredByEmail: 'migration', enteredByName: 'Data Migration', enteredAt: now
}));

(async () => {
  console.log((DRY ? '[DRY RUN] ' : '') + 'Points to insert: ' + items.length +
    ' (per building: ' + JSON.stringify(count(items)) + ')');
  if (DRY) { items.slice(0, 8).forEach(it => console.log('  ', it.department, 'sample', it.sample, '→ area:', it.area, '| line:', it.line, '| loc:', it.location)); if (items.length > 8) console.log('  ...and', items.length - 8, 'more'); return; }

  const BATCH = 20;
  let done = 0, fail = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    try {
      const r = await fetch(WRITE, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: 'MasterPoints', action: 'create', items: chunk }) });
      if (r.status >= 200 && r.status < 300) done += chunk.length;
      else { fail += chunk.length; console.error('\n  batch HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200)); }
    } catch (e) { fail += chunk.length; console.error('\n  batch error: ' + e.message); }
    process.stdout.write('  progress: ' + done + '/' + items.length + (fail ? ' (' + fail + ' failed)' : '') + '   \r');
    await sleep(500);
  }
  console.log('\nDone. Inserted: ' + done + '  Failed: ' + fail);
  if (TEST) console.log('\n➡  VERIFY in SharePoint: 1945 / sample 200 → area must read "Vibratory Conveyor".\n   If correct: DELETE that test point in the list, then run the full insert:  node _fixmaster.js');
  else console.log('\n➡  VERIFY the list now has 698 points, then log out/in of the app to re-pull. Then delete _fixmaster.js');
})();

function count(arr){ const c={}; arr.forEach(x=>c[x.department]=(c[x.department]||0)+1); return c; }

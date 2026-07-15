# EnviroTrack — Monthly Report email (simple direct-send)

The app generates last month's PDF (with charts) and sends it **straight** to a
tiny 2-action Power Automate flow that emails it to QA. **No scheduled trigger,
no SharePoint file fetching, no path/filename matching** — the app hands the PDF
bytes and the ready email body to the flow.

**How it works**
1. An admin opens the app → **Reports** → clicks **"Send Monthly Report to QA"**.
2. The app builds the previous month's PDF, base64-encodes it, and POSTs it (via
   the Firebase `spProxy`, op `emailmonthly`) to the flow below.
3. The flow emails the PDF as an attachment. Done.

The app side is implemented. Build the flow (2 actions) and wire the URL.

---

## The flow — `EnviroTrack_EmailMonthlyReport`

### 1. Trigger — When an HTTP request is received
- Add trigger **"When an HTTP request is received"**.
- **Who can trigger:** Anyone (the app calls it through the Firebase proxy).
- Paste this **Request Body JSON Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "fileName":      { "type": "string" },
      "contentBase64": { "type": "string" },
      "subject":       { "type": "string" },
      "bodyHtml":      { "type": "string" }
    }
  }
  ```

### 2. Send an email (V2) — Office 365 Outlook
- **To:** `jagudelo@caputocheese.com` (add QA emails later, separated by `;`)
- **Subject:** dynamic → `subject`
- **Body:** switch to code view `</>` and insert dynamic → `bodyHtml`
  (it is already full HTML built by the app).
- **Attachments** (advanced parameter):
  - **Attachments Name - 1:** dynamic → `fileName`
  - **Attachments Content - 1:** expression → `base64ToBinary(triggerBody()?['contentBase64'])`

Save. Copy the trigger's **HTTP POST URL**.

### 3. Wire the URL into the app's proxy
- In `functions/.env` add a line:
  ```
  FLOW_EMAIL_MONTHLY=<the HTTP POST URL you just copied>
  ```
- Redeploy the proxy:
  ```
  firebase deploy --only functions:spProxy
  ```
  (`functions/index.js` already maps op `emailmonthly` → `FLOW_EMAIL_MONTHLY`.)

---

## Testing
1. Deploy the app (push) and the function.
2. In the app (as admin) → Reports → **Send Monthly Report to QA**.
3. The email arrives with the PDF attached and the professional body
   (period, buildings, generated date). The subject shows the month.

## Notes
- Recipients live only in the Send email action — edit them there anytime.
- The email fires when the admin clicks, so pick your moment (e.g. the 1st).
- The app also archives a copy to the SharePoint "Monthly Reports" folder
  (best-effort; the email does not depend on it).
- The old scheduled/file-fetch flow (`EnviroTrack_MonthlyReport_Send`) is no
  longer needed — you can delete it.

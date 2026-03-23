# Step-by-Step Guide: OutSystems Notification System

## Context

When an elderly person falls, the phone app sends data to the Node.js backend, which then POSTs to OutSystems at the `CreateElderlyLog` endpoint. **The backend already sends this payload:**

```json
{
  "elderly_id": 1234567891234567,
  "guardian_id": 1234567891234567,
  "latitude": 1.2966,
  "longitude": 103.8502,
  "address": "Tanjong Pagar, Singapore",
  "status": "FALLEN",
  "timestamp": "2026-03-24T00:44:06.000Z"
}
```

The key field is **`status: "FALLEN"`** — this is what triggers the notification. The OutSystems team needs to react to this value when the log is created.

---

## Step 1: Understand the Data Model

Your OutSystems app should already have these entities (or similar):

| Entity | Key Fields |
|---|---|
| **Elderly** | `elderly_id`, `name`, `phone_number` |
| **Guardian** | `guardian_id`, `name`, `email`, `phone_number`, `telegram_chat_id` (optional) |
| **ElderlyLog** | `elderly_id`, `guardian_id`, `latitude`, `longitude`, `address`, `status`, `timestamp` |

If Guardian doesn't have contact fields (email/phone), **add them now** — you need them to send notifications.

---

## Step 2: Modify the `CreateElderlyLog` Server Action

This is where the notification logic lives. Open the **Server Action** that handles the incoming POST from the backend.

**Current flow:**
```
CreateElderlyLog (REST endpoint)
  -> Validate input
  -> Insert into ElderlyLog table
  -> Return success
```

**New flow:**
```
CreateElderlyLog (REST endpoint)
  -> Validate input
  -> Insert into ElderlyLog table
  -> IF status = "FALLEN"
      -> Look up Guardian by guardian_id
      -> Send notification (email/SMS/Telegram)
  -> Return success
```

**In Service Studio:**

1. Open the `CreateElderlyLog` Server Action
2. After the `CreateElderlyLog` entity action (the DB insert), add an **If** node
3. Set condition to: `ElderlyLogInput.status = "FALLEN"`
4. On the **True** branch — add the notification logic (Steps 3-5 below)
5. On the **False** branch — just continue to the end node (no notification needed)

---

## Step 3: Look Up Guardian Contact Info

On the **True** branch of the If:

1. Add an **Aggregate** (or SQL query)
2. Source: `Guardian` entity
3. Filter: `Guardian.guardian_id = ElderlyLogInput.guardian_id`
4. This gives you the guardian's `email`, `phone_number`, etc.

**If no guardian found**, add an If check and log a warning — don't crash the action.

---

## Step 4: Choose & Implement Notification Channel

Pick **at least one**. Email is the easiest in OutSystems.

### Option 1: Email (Easiest)

1. Go to **Logic** > **Server Actions**
2. In your True branch, after the Aggregate, add a **Send Email** node
3. Configure:
   - **To**: `GetGuardian.List.Current.Guardian.email`
   - **Subject**: `"FALL ALERT - Elderly ID " + ElderlyLogInput.elderly_id`
   - **Body** (use an Email Screen or HTML):

```html
<h2>Fall Alert</h2>
<p>A fall has been detected.</p>
<table>
  <tr><td><b>Elderly ID:</b></td><td>{ElderlyLogInput.elderly_id}</td></tr>
  <tr><td><b>Location:</b></td><td>{ElderlyLogInput.address}</td></tr>
  <tr><td><b>Coordinates:</b></td><td>{ElderlyLogInput.latitude}, {ElderlyLogInput.longitude}</td></tr>
  <tr><td><b>Time:</b></td><td>{ElderlyLogInput.timestamp}</td></tr>
  <tr><td><b>Status:</b></td><td>{ElderlyLogInput.status}</td></tr>
</table>
<p>Please check on them immediately.</p>
```

4. Make sure **SMTP is configured** in Service Center (`Administration > Email`) — for testing, use a Gmail SMTP or your school's SMTP server.

### Option 2: Telegram Bot (Most Visible)

This requires a **REST API call** from OutSystems.

**Pre-setup (one-time, anyone on the team can do this):**

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`, follow prompts, get a **Bot Token**
3. Have the guardian start a chat with the bot and send any message
4. Get the guardian's **chat_id** by visiting: `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Store `telegram_chat_id` in the Guardian entity

**In Service Studio:**

1. Go to **Logic** > **Integrations** > **REST** > **Consume REST API**
2. Add a new single method:
   - **Name**: `SendTelegramMessage`
   - **Method**: POST
   - **URL**: `https://api.telegram.org/bot{BotToken}/sendMessage`
3. Set the **Request Body** structure:

```json
{
  "chat_id": "",
  "text": "",
  "parse_mode": "HTML"
}
```

4. Back in your `CreateElderlyLog` action, after the Guardian lookup, add a call to `SendTelegramMessage`:
   - **chat_id**: `GetGuardian.List.Current.Guardian.telegram_chat_id`
   - **text**: Build with string concat:

```
"FALL ALERT" + NewLine() +
NewLine() +
"Location: " + ElderlyLogInput.address + NewLine() +
"Coordinates: " + ElderlyLogInput.latitude + ", " + ElderlyLogInput.longitude + NewLine() +
"Time: " + ElderlyLogInput.timestamp + NewLine() +
NewLine() +
"Please check immediately."
```

### Option 3: SMS (via Twilio)

1. Install the **Twilio Connector** from OutSystems Forge
2. Configure with your Twilio Account SID, Auth Token, and a Twilio phone number
3. In the True branch, call the Twilio `SendMessage` action:
   - **To**: `GetGuardian.List.Current.Guardian.phone_number`
   - **Body**: Same alert text as above (plain text, no HTML)

---

## Step 5: Add Error Handling

Wrap the notification logic in an **Exception Handler** so a failed notification doesn't break the log creation.

1. Select all the notification nodes (Guardian lookup + Send notification)
2. Right-click > **Enclose in Exception Handler**
3. In the **AllExceptions** handler:
   - Add a **LogMessage** action: `"Failed to send notification for guardian_id: " + guardian_id`
   - Continue to the End node (don't re-throw)

This ensures the ElderlyLog is **always saved**, even if the notification fails.

---

## Step 6: Test End-to-End

1. Make sure your OutSystems app is published
2. Set `OUTSYSTEMS_BASE_URL` in the backend's `.env`
3. Open the phone PWA
4. Hit **"Simulate Drop"**
5. Verify:
   - ElderlyLog appears in OutSystems database
   - Guardian receives email/Telegram/SMS
   - Guardian dashboard shows the alert via WebSocket

---

## Summary Flowchart

```
Phone (fall detected)
  |
  v
Node.js Backend (scores motion, creates incident)
  |
  |---> WebSocket --> Guardian Dashboard (real-time UI alert)
  |
  +---> POST /ElderlyLog/CreateElderlyLog --> OutSystems
                                                |
                                                v
                                          Save to DB
                                                |
                                          status = "FALLEN"?
                                            |           |
                                           YES          NO
                                            |           |
                                            v          done
                                      Lookup Guardian
                                            |
                                            v
                                     Send Notification
                                    (Email / Telegram / SMS)
```

---

## Quick Reference: What Each Team Member Needs to Do

| Role | Task |
|---|---|
| **OutSystems Dev** | Steps 2-5: Add If check, Guardian lookup, notification call, error handling |
| **OutSystems Admin** | Configure SMTP (for email) or add Telegram REST integration |
| **Backend Dev** | Already done — payload is sent with `status: "FALLEN"` |
| **Tester** | Step 6: Use "Simulate Drop" button to trigger end-to-end flow |

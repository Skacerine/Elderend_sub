  Step-by-step testing guide

  1. Build and start
  cd Elderend_sub
  docker compose up --build
  Wait for all 3 services to show as running. You should see:
  - medicare-backend — "Backend listening on port 4000"
  - guardian-ui — Vite ready on port 5173
  - phone-pwa — Vite ready on port 5174

  2. Verify backend health
  docker compose ps
  Check that medicare-backend shows (healthy). You can also hit it directly:
  http://localhost:4000/medicine/health
  Expected: {"status":"online","service":"medicine-proxy"}

  3. Test Guardian UI Medicare tab
  - Open http://localhost:5173, log in
  - Go to Medicare tab
  - Schedule tab — click different days, verify medicines change per day
  - Calendar tab — click different dates, verify correct meds show
  - Inventory tab — click day buttons (Mon-Sun pills), reload page, confirm they persist
  - Add a medicine — fill form, select specific days, submit, verify it appears only on those days

  4. Test Elderly phone-pwa
  - Open http://localhost:5174, log in
  - Verify only today's medicines show (not all medicines)
  - If today is e.g. Friday and a medicine is only set for Mon/Wed, it should NOT appear

  5. Test container communication
  # Check logs for any CORS or connection errors
  docker compose logs backend | grep -i error
  docker compose logs guardian-ui | grep -i error

  # Hit the medicine API through Docker
  curl http://localhost:4000/medicine/1

  6. Test restart resilience
  # Kill just the backend, watch frontends handle it
  docker compose restart backend

  # Verify guardian-ui Medicare tab recovers automatically (30s auto-refresh)

  7. Clean up
  docker compose down




  Detailed   ---                                                                                                                           Step-by-Step Testing Guide
                                                                                                                              
  Prerequisites

  - Docker Desktop running
  - A browser (Chrome recommended for DevTools)
  - OutSystems ManageMedicine API needs to be online (check with your teammate)

  ---
  Part 1: Docker Compose

  cd "C:\Users\aleco\Desktop\SMU Y2 SEM2\ESD\Elderall_phonedropper\Elderend_sub"
  docker compose down
  docker compose up --builds
  ├───────────────────────────────────────┼──────────────────────────┤
  │ http://localhost:4000/health          │ {"ok":true, ...}         │
  ├───────────────────────────────────────┼──────────────────────────┤
  │ http://localhost:4000/medicine/health │ {"status":"online", ...} │
  ├───────────────────────────────────────┼──────────────────────────┤
  │ http://localhost:4000/gps/health      │ {"status":"online", ...} │
  └───────────────────────────────────────┴──────────────────────────┘

  ---
  Part 3: Guardian UI (http://localhost:5173)

  3a. Login
  - Open http://localhost:5173
  - Should redirect to login page
  - Login with: phone 6588888888, password guard123
  - Should redirect to GuardianUI dashboard

  3b. Tab names (NavBar)
  - Tab 1 says GuardianUI (not "GuardianPhoneDropper")
  - Tab 2 says ElderWatch
  - Tab 3 says Medicare
  - Tab 4 says ElderWatch(Dev)
  - Tab 5 says GuardianUI(Dev)

  3c. GuardianUI tab (main dashboard)
  - No gap/empty space on the right side (old Incident Details panel is gone)
  - "System Armed" / "Live Feed" badges visible
  - Subtitle says "Real-time fall monitoring and guardian alert system"
  - Metric footers say "Live alert stream", "Sound notification", "Recent alerts received"
  - Status shows "Active" (not "Score threshold: 100")
  - No technical jargon (no "WebSocket", "risk threshold", "motion features")
  - Click "Enable Sound" — should say "Alert Sound Enabled"
  - Click "Test Alarm Sound" — alarm plays
  - Click "Stop Alarm" — alarm stops

  3d. ElderWatch tab (user-friendly)
  - Map loads with home marker and 500m boundary circle
  - Red dot (elderly) moves on its own every ~3 seconds (simulated tracking)
  - Trail line appears behind the marker
  - Right sidebar shows: status (HOME/OUTSIDE), quick actions, recent alerts
  - No left sidebar (no D-pad, no simulation speed, no tracking mode)
  - No bottom panel tabs (no AMQP broker, no coord log)
  - Marker is not draggable
  - Map legend says "LIVE TRACKING" and elderly label (not "drag to move")
  - If marker drifts past 500m, toast + alert appears "Left Home Zone"
  - "Call Elderly" and "Emergency SOS" buttons work (show alert dialog)

  3e. Medicare tab
  - Schedule tab: 7 day buttons at top (Mon-Sun), today highlighted
  - Click different days — medicine list changes per day
  - Calendar tab: month calendar shows, click dates to see daily meds
  - Navigate months with < > arrows
  - Inventory tab: click "+ Add" to open form
  - Add a medicine with specific days (e.g., Mon/Wed/Fri only)
  - Day buttons persist: click day pills on a medicine, reload page, days should stay
  - Restock button works — opens inline +/- input
  - Delete (x) button removes a medicine

  ▎ Note: If OutSystems ManageMedicine is still down, medicines won't load. You'll see "Could not reach medication service."  
  This is an external issue.

  3f. ElderWatch(Dev) tab
  - Full dev controls visible: D-pad, simulation speed slider, tracking mode selector
  - Scenario replay buttons (Wander + Alert, Park Walk, Hospital Visit)
  - Marker is draggable
  - Bottom panel has 3 tabs: ALERTS, AMQP BROKER, COORD LOG
  - Health indicators in header (GPS Svc, Log Svc, etc.)
  - Header says "ElderWatch (Dev)"

  3g. GuardianUI(Dev) tab
  - Extended dev panels visible (Event Stream, Live Payload, System Notes)
  - All original dev features work

  ---
  Part 4: Phone PWA — Elderly Side (http://localhost:5174)

  4a. Login
  - Open http://localhost:5174
  - Login with: phone 6591234567, password elder123
  - Greeting shows ("Good morning/afternoon/evening")

  4b. Medicine day filtering
  - Title says "Today's Medicines"
  - Only medicines scheduled for today's day appear (not all medicines)
  - E.g., if today is Friday and a med is set for Mon/Wed only, it should NOT show
  - If no meds for today: "No medicines scheduled today" with checkmark

  4c. Fall protection
  - "Enable Protection" button works
  - Status changes to "Protected" with green indicator
  - "Alert My Guardian" button sends simulated fall alert
  - "Pause" button pauses monitoring

  ---
  Part 5: Cross-Service Communication

  5a. Fall alert flow
  - On phone-pwa: click "Alert My Guardian!"
  - On guardian-ui (GuardianUI tab): popup should appear with fall alert details
  - Alarm should sound (if enabled)
  - "Dismiss" closes the popup

  5b. Container resilience
  docker compose restart backend
  - Guardian UI Medicare tab auto-recovers after ~30 seconds
  - No crash on either frontend

  ---
  Part 6: Vercel Deployment

  After pushing code:
  - All the above tests pass on the Vercel URLs too
  - Check that Render backend redeploys with the updated medicine routes

  ---
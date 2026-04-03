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
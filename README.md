# Elderall Phone Drop Detection System

A simple system that helps protect elderly people by detecting when they might have fallen using their smartphone.

## What It Does

- **Phone App**: Runs on the elderly person's phone and watches for sudden movements
- **Guardian Dashboard**: Shows alerts on a computer or tablet when a fall is detected
- **Backend Service**: Processes the motion data and sends alerts instantly

## How to Run It

From project root:

```
docker compose up --build
```

Then:

Guardian UI on laptop: http://localhost:5173
Phone PWA on phone: http://YOUR_LAPTOP_IP:5174

Example:

http://192.168.1.10:5174

Use ipconfig on Windows to find your laptop IPv4 address.

## How to Test It

On laptop:

- open Guardian UI
- click Enable Alert Sound

On phone:

- open Phone PWA using laptop IP
- tap Start Monitoring
- or tap Simulate Drop

Expected result:

- backend receives motion event
- backend detects drop
- Guardian UI gets live alert
- alarm plays
- vibration attempts if supported

## How It Works

The phone app uses the phone's built-in motion sensors to detect:
- Sudden drops or falls
- Strong impacts
- Quick spinning movements
- Being still after a possible fall

When something suspicious is detected, it sends an alert to the guardian dashboard immediately.

## Requirements

- Docker and Docker Compose
- Modern web browser
- Phone with motion sensors (most smartphones)

## Project Structure

```
├── backend/          # Server that processes alerts
├── phone-pwa/        # App for elderly person's phone
└── guardian-ui/      # Dashboard for caregivers
```

- [ ] Database integration for persistent incident storage
- [ ] User authentication & role-based access
- [ ] Mobile app native integration (React Native)
- [ ] Machine learning-based drop scoring refinement
- [ ] SMS/email notifications for guardians
- [ ] Incident timeline visualization
- [ ] Multi-elderly user support
- [ ] Admin dashboard for system monitoring
- [ ] Geolocation tracking integration
- [ ] Two-way communication (elderly → guardian alert confirmation)

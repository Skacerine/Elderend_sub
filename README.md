# Elderall Phone Drop Detection System

A simple system that helps protect elderly people by detecting when they might have fallen using their smartphone.

## What It Does

- **Phone App**: Runs on the elderly person's phone and watches for sudden movements
- **Guardian Dashboard**: Shows alerts on a computer or tablet when a fall is detected
- **Backend Service**: Processes the motion data and sends alerts instantly

## Quick Setup (5 Minutes)

### 1. Install Everything
```bash
# Install backend
cd backend && npm install

# Install phone app
cd ../phone-pwa && npm install

# Install guardian dashboard
cd ../guardian-ui && npm install
```

### 2. Start the System
```bash
# Terminal 1: Start backend
cd backend && npm run dev

# Terminal 2: Start phone app
cd ../phone-pwa && npm run dev

# Terminal 3: Start guardian dashboard
cd ../guardian-ui && npm run dev
```

### 3. Open in Browser
- Phone App: http://localhost:5173
- Guardian Dashboard: http://localhost:5174

## 5. How to run it

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

## 6. How to test it

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

## Technical Details

- **Backend**: Node.js server with WebSocket for real-time alerts
- **Phone App**: React Progressive Web App (works like a native app)
- **Guardian Dashboard**: React web app with live alerts
- **Detection**: Simple scoring system (0-100) based on motion patterns

## Requirements

- Node.js 18 or newer
- Modern web browser
- Phone with motion sensors (most smartphones)

## Project Structure

```
├── backend/          # Server that processes alerts
├── phone-pwa/        # App for elderly person's phone
└── guardian-ui/      # Dashboard for caregivers
```

## Project Review

### ✅ Strengths
- **Well-structured**: Clear separation between backend, phone app, and guardian dashboard
- **Real-time alerts**: WebSocket implementation provides instant notifications
- **Cross-platform**: Works on any device with a modern web browser
- **Simple deployment**: Docker setup makes it easy to run anywhere
- **Progressive Web App**: Phone app can be installed like a native app

### ⚠️ Areas for Improvement
- **Production readiness**: Docker containers use development servers instead of production builds
- **Data persistence**: Currently uses in-memory storage (data lost on restart)
- **Security**: No authentication or authorization implemented
- **Scalability**: Single backend instance, no load balancing
- **Testing**: Limited automated tests for the detection algorithm

### 🔧 Technical Notes
- **Detection accuracy**: The scoring system is basic but effective for proof-of-concept
- **Browser compatibility**: Requires DeviceMotionEvent support (most modern phones)
- **Network dependency**: Phone app needs internet connection to send alerts
- **Battery impact**: Continuous motion monitoring may drain phone battery faster

### 📈 Recommended Next Steps
1. Add user authentication and data encryption
2. Implement persistent database storage (MongoDB/PostgreSQL)
3. Add automated tests for detection accuracy
4. Optimize battery usage with smarter monitoring intervals
5. Add offline alert queuing for when network is unavailable
6. Implement multi-device support for multiple elderly users

This is a solid foundation for an elderly fall detection system with good real-time capabilities and easy setup.

---

## 💡 Future Enhancements

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

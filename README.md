# Elderall Phone Drop Detection System

Elderall is a lightweight elderly safety prototype that uses a smartphone to detect possible falls and send a live alert to a guardian dashboard.

In simple terms, the phone acts like a motion-sensitive watcher. If it detects a movement pattern that looks dangerous, such as a sudden drop, impact, spin, and then stillness, it sends that information to a backend service. The backend then decides whether the event is serious enough to trigger an alert. If it is, the guardian dashboard immediately shows an emergency alert and plays an alarm sound.

This project was built as a practical proof-of-concept to show how web technologies, motion sensors, and real-time communication can be used to support elderly care in a simple and accessible way.

---

## What Problem This Project Solves

Older adults who live alone may be vulnerable if they fall and are unable to call for help. Traditional monitoring systems can be expensive, intrusive, or require dedicated hardware. This project explores a more accessible alternative by using something many people already have: a smartphone.

The idea is not to replace professional medical devices, but to demonstrate how a phone-based monitoring system can help detect suspicious movement and notify a guardian quickly.

---

## What the System Does

The system has three main parts:

### 1. Phone App (https://phonedropper9000-xi.vercel.app)
The phone app runs as a Progressive Web App (PWA) on the elderly person’s phone. It reads the phone’s motion sensors and watches for suspicious movement patterns.

### 2. Backend Service - no UI for this but it is hosted on render (wss://elderend-backend.onrender.com)
The backend receives motion data from the phone, calculates a risk score, and decides whether the movement is serious enough to count as a possible fall.

### 3. Guardian Dashboard (https://guardianphonedropper.vercel.app)
The guardian dashboard receives live alerts from the backend. When a serious event is detected, it displays the alert details, plays an alarm sound, and attempts to vibrate the device if supported.

---

## How motion is calibrated

When the phone is being monitored, it keeps watching motion changes in the background. The app looks for signs such as:

- a sudden drop in acceleration
- a strong impact
- a rapid spin or rotation
- stillness immediately after the suspicious movement

These motion signals are grouped into a small set of features and sent to the backend. The backend then assigns a score based on how dangerous the movement looks.

If the score is high enough, the system treats it as a possible fall and sends a live alert to the guardian dashboard.

This means the phone is not simply reacting to any movement. It is trying to identify a pattern that resembles a fall, rather than ordinary handling.

---

## Current Alert Sensitivity

The system currently only triggers a real alert when the motion score is:

```js
score >= 100

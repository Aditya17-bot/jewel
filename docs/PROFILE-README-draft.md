# Aditya Sridhar

Student, working mostly in Python, with a strong interest in Artificial Intelligence and Machine Learning.

I like building small projects and experimenting with algorithms to understand how intelligent systems actually behave — and applying that to practical problems. Most of what I build has to run on the machine in front of me: a laptop GPU, no server budget, no paid APIs. That constraint decides a lot of the design, and it is usually the interesting part.

📧 aditya17sep@gmail.com

---

## What I'm working on

### 🦯 BlindAssist — camera-based assistive navigation
**[`object_detection_blind`](https://github.com/Aditya17-bot/object_detection_blind)** · Python · YOLO · ONNX / TFLite · Vosk

Detects indoor objects from a live camera, works out direction and closeness, and decides what is worth saying out loud. Runs offline, end to end.

Measured on real clips rather than claimed: **100% direction accuracy** across reviewed announcement keyframes, **5.8 FPS** on a laptop CPU, announcements ~0.4 s from first sighting. Object naming is the weak point and [`EVALUATION.md`](https://github.com/Aditya17-bot/object_detection_blind/blob/main/EVALUATION.md) says so, along with everything else that does not work yet.

### 💍 Aurelia Antlers — jewellery digital twins & virtual try-on
**[`jewel`](https://github.com/Aditya17-bot/jewel)** · React · three.js · MediaPipe · Canvas 2D

A jeweller's catalogue you can turn, and a customer trying it on through their own camera. No server, no API keys, no GPU — MediaPipe's 468 facial landmarks in-browser mean the person is already solved geometry, so the whole problem reduces to materials and light.

### 🗣️ Offline voice assistant
**[`voice_ai`](https://github.com/Aditya17-bot/voice_ai)** · Python

Real-time audio in, audio out. Speech recognition, language model and speech synthesis all run locally — nothing leaves the machine.

### 📈 FINN — transformer trading signals for Nifty 50
**[`FINN_news`](https://github.com/Aditya17-bot/FINN_news)** · Python · PyTorch

A daily signal engine combining price and volume technicals, macro context, news sentiment, insider deal flow and institutional FII/DII flow into next-day directional signals.

### 💳 Finance AI platform
**[`finance-ai-platform`](https://github.com/Aditya17-bot/finance-ai-platform)** · FastAPI · Streamlit · scikit-learn

Fraud detection, credit risk scoring and spending-profile classification behind one API and one UI.

---

## How I like to work

Read a failure until it explains itself, instead of guessing at fixes. The bugs I am most pleased to have found were usually the third theory, not the first — and the fastest way to the third theory is to measure the thing rather than reason about it.

I try to write down what did **not** work, and why, next to what did.

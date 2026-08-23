# GitHub profile — the parts that need your login

There is no `gh` CLI and no API token on this machine, so descriptions and pins cannot be
set from here. Both are about ten minutes of clicking. Everything is written out below so
it is paste, not thinking.

---

## 1. Profile README — do this one first

It is the first screen anyone sees, and `github.com/Aditya17-bot/Aditya17-bot` is currently
empty. The draft is at `docs/PROFILE-README-draft.md` in this repo.

**Read it before you push it.** It uses your own bio wording, but the project blurbs and the
"how I like to work" section are my summary of your work and should sound like you.

```bash
git clone https://github.com/Aditya17-bot/Aditya17-bot.git ~/profile-readme
cp /c/adi/aurelia-ref/docs/PROFILE-README-draft.md ~/profile-readme/README.md
cd ~/profile-readme
git add README.md && git commit -m "docs: profile README" && git push
```

---

## 2. Pin these six, in this order

Settings live on your profile page → **Customize your pins**.

Order matters — it is read left to right, and the first two carry the most weight.

1. **object_detection_blind** — depth, measured results, an honest evaluation
2. **jewel** — the one with pictures on the page, and the broadest stack
3. **FINN_news** — ML applied to a real domain end to end
4. **finance-ai-platform** — a service, not a notebook: API + UI + models
5. **voice_ai** — offline ASR + LLM + TTS, which is a hard constraint met
6. **Fraud_detection** — the classic problem, done two ways

Deliberately not pinned: `Logistics` (a fork), `stocks_price`, `budgeting_app`,
`convolution_neural_network`, `neural_network`. Coursework and half-projects dilute a page.
Six good repositories beat fourteen ambiguous ones.

---

## 3. Descriptions — paste one per repo

Repo page → **About** (gear icon, top right) → Description.

| Repo | Description |
|---|---|
| `object_detection_blind` | Offline camera assistant for blind navigation: YOLO detection, direction and proximity reasoning, and a two-tier voice router. 100% direction accuracy, 21 ms/frame on an RTX 3050. |
| `jewel` | Jewellery digital twins you can turn, and virtual try-on through your own camera. React + three.js + MediaPipe, no server and no API keys. |
| `FINN_news` | Daily directional signals for Nifty 50, combining technicals, macro, news sentiment, insider deals and FII/DII flow. |
| `finance-ai-platform` | FastAPI + Streamlit service for fraud detection, credit risk scoring and spending-profile classification. |
| `voice_ai` | Fully offline conversational assistant — speech recognition, language model and speech synthesis all run locally. |
| `telegram_trading_bot` | Intraday Nifty 50 PDH/PDL breakout scanner with Telegram alerts. *(already set)* |
| `Fraud_detection` | Credit-card fraud detection two ways: a supervised Random Forest and an unsupervised Isolation Forest on the same imbalanced data. |
| `youtube_automation` | Faceless YouTube pipeline — one engine, several channels, each a config file plus a format plugin. No paid services. |
| `Gene-Anomaly-detection` | Anomaly detection over gene-expression data. |
| `budgeting_app` | React Native expense tracker. |
| `stocks_price` | Streamlit dashboard for equity price history. |
| `convolution_neural_network` | CNN implemented and trained from scratch, for learning how the layers actually behave. |
| `neural_network` | A neural network written from first principles — forward pass, backprop, no framework. |
| `Logistics` | *(fork — consider deleting, or say what you changed)* |

Add topics too, in the same About panel — they are how people find you:
`computer-vision` `pytorch` `yolo` `accessibility` `machine-learning` `fastapi` `react`
`threejs` `mediapipe` `streamlit`.

---

## 4. Two things to tidy

- **`telegran_trading-_bot`** appears to be a typo-named duplicate of `telegram_trading_bot`.
  Keep one, delete the other.
- **Set the homepage** on each repo that has a live URL (About → Website). Nothing is
  deployed yet, which is why nothing is clickable — see below.

---

## 5. The one that would change the most

`jewel` is a static site. **Deploy it**, then put the URL in About → Website, so the link
shows on the repo page *and* on your profile. A hiring manager who can click and use the
thing is worth more than one who reads about it.

Cloudflare Pages is free and this repo is already built for it — `worker/index.js` passes
its tests. It needs a `wrangler.toml` and one deploy. Roughly twenty minutes, and it was
deferred rather than blocked.

---

## What was already done for you

- `README.md` here rewritten: three GIFs and a still at the top, then what the project is,
  then the five problems whose obvious answer was wrong.
- `docs/*.gif` built from frames already in the tree — 1.9 MB, renders on the repo page,
  no hosting.
- `object_detection_blind/README.md` rewritten as a showcase and committed there
  (**not pushed** — push it yourself when you are happy with it).

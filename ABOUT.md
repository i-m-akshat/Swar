# About Vocalis — Speech Intelligence & Speaker Diarization 🎙️✨

**Vocalis** is an open-source, privacy-first speech intelligence platform designed to transcribe, translate, and separate speakers with acoustic precision.

---

## 🎯 The Problem with Traditional Speech-to-Text

Most standard speech recognition tools (like basic Whisper wrappers or cloud STT APIs) suffer from three critical flaws:

1. **They don't know who is talking:** Whisper is a text prediction engine. It converts spoken sounds into words, but it has no understanding of vocal anatomy, pitch, or speaker identities.
2. **Punctuation is not a speaker boundary:** Whisper frequently invents question marks or periods in the middle of a continuous sentence. If a system relies on punctuation to decide when someone stopped talking, it breaks single sentences across multiple "phantom" speakers.
3. **Cross-talk and bleed contaminate voices:** When two people talk over each other, naive audio padding accidentally captures the other person's voice, confusing the AI into thinking both people are the same speaker or creating dozens of false speakers.

---

## 💡 How Vocalis Solves This

Vocalis decouples **what was said** (linguistic text) from **who said it** (acoustic vocal tract geometry):

```text
┌─────────────────────────┐           ┌─────────────────────────┐
│     Whisper Turbo       │           │   SpeechBrain ECAPA     │
│  "What was spoken?"     │           │   "Who is speaking?"    │
│  (Words & Timestamps)   │           │  (192-dim Vocal Tract)  │
└───────────┬─────────────┘           └───────────┬─────────────┘
            │                                     │
            └──────────────────┬──────────────────┘
                               │
                               ▼
            ┌─────────────────────────────────────┐
            │      Acoustic Graph Clustered       │
            │        Synchronized Dialogue        │
            └─────────────────────────────────────┘
```

1. **Acoustic-First Slicing:** Speaker turns are separated based on physical silence pauses ($\ge 280\text{ms}$) and acoustic energy drops, ensuring true conversational boundaries.
2. **Circular Self-Reflection:** When analyzing short phrases (*"Yeah"*, *"Got it"*), Vocalis repeats only the speaker's own syllables rather than grabbing surrounding audio, eliminating neighbor contamination.
3. **Adaptive Graph Diarization:** Instead of guessing a fixed number of speakers, Vocalis builds a similarity graph and uses Laplacian Eigengap analysis to automatically discover the true number of participants.
4. **Multi-Sample Voiceprints:** Vocalis learns what a person sounds like across multiple sentences and devices, allowing you to name a speaker once and have Vocalis recognize them in future recordings.

---

## 🚀 Key Use Cases

| Use Case | How Vocalis Helps |
| :--- | :--- |
| **🎙️ Podcasts & Video Interviews** | Accurately distinguishes the host from the guest, even in fast-paced debates, and exports color-coded transcripts and SRT subtitles. |
| **💼 Executive Boardroom Meetings** | Automatically tracks action items by speaker identity and preserves confidentiality by keeping all data local on your hardware. |
| **⚖️ Legal Depositions & Hearings** | Provides timestamped transcripts with biometric audit trails adhering to data compliance and retention standards. |
| **🎧 Call Centers & Support Calls** | Accurately separates the customer service representative from the customer for sentiment analysis and agent training. |
| **🩺 Clinical & Medical Consultations** | Clarifies doctor instructions versus patient responses while maintaining HIPAA-friendly air-gapped data isolation. |

---

## 🛠️ Key Product Features

* **Interactive Media Player:** Click on any sentence in the transcript to instantly jump the video/audio player to that exact millisecond.
* **Variable Playback Speeds:** Listen at `0.75x`, `1.0x`, `1.25x`, `1.5x`, or `2.0x` without pitch distortion.
* **Live Keyword Search:** Instant yellow highlighting across thousands of lines of transcript text.
* **In-Place Speaker Renaming:** Rename *"Speaker 1"* to *"Elon Musk"* in one click, updating all turns across the entire recording.
* **Biometric Voiceprint Library:** Save acoustic profiles to recognize recurrent speakers automatically.
* **Export Hub:** Copy clean text to your clipboard or download formatted `.txt` transcripts and `.srt` subtitle files.

---

## 📊 Comparison: Vocalis vs. Cloud Speech APIs

| Feature | Vocalis Platform 🎙️ | AWS Transcribe / Google STT | Generic Open-Source Whisper |
| :--- | :--- | :--- | :--- |
| **Data Privacy** | **100% Local / Air-Gapped** | Sent to third-party cloud | 100% Local |
| **Speaker Diarization** | **ECAPA-TDNN + Graph Laplacian** | Basic probabilistic GMM | ❌ No diarization (text only) |
| **Cross-Talk Protection** | **Circular Reflection Padding** | ⚠️ Severe voice bleed | ❌ N/A |
| **Speaker Enrollment** | **Multi-Sample Gaussian Library** | ❌ Complex / Costly add-on | ❌ None |
| **Word Timestamps** | **Native Acoustic Alignment** | Standard | Standard |
| **Cost per 1,000 Hours** | **~$2.40 (Serverless) / $0 (Local)** | **~$1,440.00 – $2,400.00** | $0 (No diarization) |
| **Regulatory Compliance** | **GDPR Right-to-be-Forgotten & Audit Trail** | Vendor Dependent | None |

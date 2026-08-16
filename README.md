# Vocalis — Speech Intelligence & Acoustic Graph Diarization Engine 🎙️⚡

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.2.1-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org/)
[![CUDA](https://img.shields.io/badge/NVIDIA-CUDA_Accelerated-76B900?logo=nvidia&logoColor=white)](https://developer.nvidia.com/cuda-zone)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![Fastify](https://img.shields.io/badge/Fastify-Node.js-000000?logo=fastify&logoColor=white)](https://www.fastify.io/)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=black)](https://react.dev/)

**Vocalis** is an end-to-end, privacy-first speech intelligence platform capable of transcribing, translating, and diarizing multi-speaker audio with acoustic graph precision. Powered by **Faster-Whisper Turbo** and **SpeechBrain ECAPA-TDNN** on CUDA, Vocalis decouples acoustic vocal tract clustering from linguistic text, ensuring reliable speaker identification without cross-talk bleed or hallucinated punctuation boundaries.

---

## 📑 Table of Contents
1. [Core Capabilities](#-core-capabilities)
2. [Architecture Overview](#-architecture-overview)
3. [Quickstart (Docker)](#-quickstart-docker)
4. [REST API Documentation](#-rest-api-documentation)
5. [Database Schema](#-database-schema)
6. [Documentation Sitemap](#-documentation-sitemap)
7. [License](#-license)

---

## 🌟 Core Capabilities

* **🌐 99+ Languages & Real-Time English Translation:** Transcribe native speech or translate non-English audio directly into English using Whisper Turbo.
* **🔬 Acoustic-First VAD Segmentation:** Anchors speaker turns to physical acoustic silence pauses ($\ge 280\text{ms}$) rather than error-prone punctuation heuristics.
* **🛡️ Circular Self-Reflection Padding:** Guarantees pure acoustic embeddings for short utterances (*"Yeah"*, *"Okay"*) with zero neighbor contamination.
* **📊 Adaptive Spectral Graph Diarization:** Dynamically estimates speaker counts ($K$) using Laplacian Eigengap analysis and percentile-based similarity graphs.
* **⭐ Multi-Sample Gaussian Voiceprint Library:** Enrolls and tracks speaker voiceprints across different microphones using continuous Gaussian centroid updates ($\mathbf{c}_{t+1} = \frac{N\mathbf{c}_t + \mathbf{e}}{N+1}$).
* **🧹 Automated Storage Lifecycle:** MinIO bucket policy automatically purges heavy raw video uploads after 48 hours while preserving lightweight transcripts and telemetry in PostgreSQL.
* **⚖️ GDPR & CCPA Compliance:** Dedicated Right-to-be-Forgotten endpoints (`DELETE /api/speaker/:id`) and full biometric audit logging.

---

## 🏗️ Architecture Overview

```text
┌────────────────────────┐
│   Vocalis Web Client   │ ◄─── Modern Dark UI (React + Vanilla CSS)
│ (http://localhost:5173)│
└───────────┬────────────┘
            │ HTTP / REST
            ▼
┌────────────────────────┐
│  Fastify API Gateway   │ ◄─── Node.js / BullMQ Queue Dispatcher
│ (http://localhost:3000)│
└─────┬────────────┬─────┘
      │            │
      ▼            ▼
┌───────────┐ ┌─────────────┐
│MinIO (S3) │ │ PostgreSQL  │ ◄─── pgvector 192-dim Voiceprint Index
│ 48h Auto  │ │  (pgvector) │
└─────┬─────┘ └──────┬──────┘
      │              │
      ▼              ▼
┌────────────────────────────────────────────────────────────┐
│ Unified GPU Worker (Faster-Whisper + SpeechBrain on CUDA) │
│ ├── 1. FFmpeg 16kHz PCM S16LE Audio Extraction            │
│ ├── 2. 80Hz Butterworth High-Pass + RMS Normalization      │
│ ├── 3. Faster-Whisper Turbo Batch Decoding (int8 CUDA)    │
│ ├── 4. Acoustic VAD Pause Slicing (>= 280ms)              │
│ ├── 5. ECAPA-TDNN Batched 192-dim Vector Extraction       │
│ ├── 6. Mutual k-NN Laplacian Graph & Eigengap Diarization  │
│ └── 7. Multi-Sample Voiceprint Identification             │
└────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quickstart (Docker)

### 1. Prerequisites
* **Docker Desktop** (with WSL2 backend on Windows)
* **NVIDIA GPU** with NVIDIA Container Toolkit (Recommended for CUDA acceleration; falls back to CPU if unavailable).

### 2. Setup Environment
```bash
git clone https://github.com/your-org/vocalis.git
cd vocalis
cp .env.example .env
```

### 3. Launch the Stack
```bash
docker compose up -d --build
```

### 4. Access the Application
* **Vocalis UI:** [http://localhost:5173](http://localhost:5173)
* **Fastify Backend API:** [http://localhost:3000](http://localhost:3000)
* **MinIO Console:** [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadmin`)

---

## 🔌 REST API Documentation

### 1. Upload & Process Media
`POST /api/upload?language=hi&task=transcribe`
* **Content-Type:** `multipart/form-data` (`file`)
* **Query Parameters:**
  * `language`: ISO language code (e.g. `en`, `hi`, `es`, `fr`, or omit for auto-detect).
  * `task`: `transcribe` (default) or `translate` (translate to English).
* **Response:**
  ```json
  {
    "jobId": "7bdc90af-606d-4959-8ff4-5f50438cf188",
    "status": "processing"
  }
  ```

### 2. Poll Job Status & Transcript
`GET /api/job/:jobId`
* **Response:**
  ```json
  {
    "job": { "id": "7bdc90af-...", "status": "completed" },
    "transcripts": [
      {
        "speaker_name": "Raj Shamani",
        "start_time": 0.0,
        "end_time": 4.2,
        "text": "Welcome to the podcast everyone."
      }
    ],
    "benchmarks": {
      "gpu_time_ms": 72150,
      "cpu_time_ms": 1420,
      "detected_language": "hi",
      "detected_prob": 0.98
    }
  }
  ```

### 3. Rename Speaker Across Job
`POST /api/speaker/rename`
* **Body:** `{ "jobId": "...", "oldName": "Speaker 1", "newName": "Raj Shamani" }`

### 4. Enroll / Update Voiceprint Profile
`POST /api/speaker/enroll`
* **Body:** `{ "name": "Raj Shamani", "jobId": "...", "speakerName": "Speaker 1" }`
* **Action:** Computes a 192-dimensional acoustic centroid from the speaker's turns and updates their profile via running Gaussian averaging.

### 5. Delete Voiceprint (GDPR)
`DELETE /api/speaker/:id`
* **Action:** Permanently removes the biometric vector from PostgreSQL and logs the deletion to `voiceprint_audit_logs`.

---

## 🗄️ Database Schema

```sql
-- Core job metadata
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  status VARCHAR(50) NOT NULL,
  video_length_secs FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transcribed dialogue turns
CREATE TABLE transcripts (
  id SERIAL PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  speaker_name VARCHAR(255),
  text TEXT NOT NULL,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL
);

-- Multi-sample biometric voiceprint library
CREATE TABLE enrolled_speakers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  embedding vector(192) NOT NULL,
  sample_count INT DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- GDPR / Biometric audit trail
CREATE TABLE voiceprint_audit_logs (
  id SERIAL PRIMARY KEY,
  speaker_name VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📚 Documentation Sitemap

* 🏛️ **[ARCHITECTURE.md](ARCHITECTURE.md):** Deep dive into the software engineering architecture, microservices, queue protocols, and data pipelines.
* 📖 **[ABOUT.md](ABOUT.md):** High-level explanation of the problem, value proposition, and user experience.
* 🧠 **[ALGORITHMS.md](ALGORITHMS.md):** Mathematical and AI engineering documentation covering ECAPA-TDNN embeddings, Graph Laplacians, Cannot-Link constraints, and Hungarian macro-window matching.
* ☁️ **[DEPLOYMENT.md](DEPLOYMENT.md):** Production hybrid-cloud hosting guide (Modal.com Serverless GPU + AWS EC2).
* 🖥️ **[frontend/README.md](frontend/README.md):** React client architecture, CSS tokens, and UI component guide.

---

## 💻 Hardware Requirements & Sizing

| Environment | Minimum Spec | Recommended Spec | Inference Speed (10 min audio) |
| :--- | :--- | :--- | :--- |
| **Local Dev (Consumer GPU)** | NVIDIA GTX 1650 (4GB VRAM), 8GB RAM | NVIDIA RTX 3060 / 4060 (8GB+ VRAM), 16GB RAM | **~45s – 75s** |
| **Cloud Dedicated GPU** | AWS `g4dn.xlarge` (NVIDIA T4 16GB) | AWS `g5.xlarge` (NVIDIA A10G 24GB) | **~15s – 25s** |
| **Serverless GPU** | Modal.com T4 GPU ($0.000164/s) | Modal.com L4 / A10G GPU | **~12s – 18s** |
| **CPU-Only Fallback** | 4 vCPUs, 8GB RAM | 8 vCPUs, 16GB RAM | **~3m – 5m** |

---

## 🛠️ Troubleshooting & FAQ

### 1. NVIDIA Container Toolkit Not Detected
If `worker_gpu` exits with a CUDA error:
```bash
# Verify NVIDIA GPU is visible inside Docker
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

### 2. Port Conflicts (`5173`, `3000`, `5434`, `6381`, `9000`)
If a port is already in use by another application:
* Modify the host-side port mappings in [`docker-compose.yml`](docker-compose.yml) (e.g. change `"3000:3000"` to `"3001:3000"`).

### 3. Clearing Data & Scratch Files
To reset all state, run the provided cleanup utility:
```bash
python clean.py
```

---

## 📄 License
MIT License. Created with ❤️ for high-precision speech intelligence.

import os

base_dir = r"A:\AIProjects\VAD_FullStack"

files = {
    "docker-compose.yml": """version: '3.8'

services:
  backend:
    build: ./backend
    command: npm run dev
    volumes:
      - ./backend:/app
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/vad_db
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio
      - MINIO_PORT=9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
    depends_on:
      - db
      - redis
      - minio

  frontend:
    build: ./frontend
    command: npm run dev -- --host 0.0.0.0
    volumes:
      - ./frontend:/app
    ports:
      - "5173:5173"

  worker_gpu:
    build: ./worker_gpu
    command: python main.py
    volumes:
      - ./worker_gpu:/app
      - ./model_cache:/root/.cache
    environment:
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
    depends_on:
      - redis
      - minio
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  worker_cpu:
    build: ./worker_cpu
    command: python main.py
    volumes:
      - ./worker_cpu:/app
      - ./model_cache:/root/.cache
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/vad_db
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    depends_on:
      - db
      - redis
      - minio

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - minio_data:/data

  db:
    image: pgvector/pgvector:pg15
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=vad_db
    ports:
      - "5434:5432"
    volumes:
      - postgres_fullstack_data:/var/lib/postgresql/data

  redis:
    image: redis:alpine
    ports:
      - "6381:6379"

volumes:
  postgres_fullstack_data:
  minio_data:
""",

    "backend/Dockerfile": """FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .""",

    "backend/package.json": """{
  "name": "vad-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@fastify/multipart": "^8.2.0",
    "bullmq": "^5.7.8",
    "fastify": "^4.26.2",
    "ioredis": "^5.3.2",
    "minio": "^7.1.3",
    "pg": "^8.11.3"
  }
}""",

    "backend/server.js": """const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const cors = require('@fastify/cors');
const { Queue } = require('bullmq');
const Minio = require('minio');
const crypto = require('crypto');

const fastify = Fastify({ logger: true });
fastify.register(cors);
fastify.register(multipart, { limits: { fileSize: 2000 * 1024 * 1024 } }); // 2GB

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const gpuQueue = new Queue('gpu_queue', { connection: { url: process.env.REDIS_URL || 'redis://redis:6379' } });

fastify.post('/upload', async (request, reply) => {
    const data = await request.file();
    const jobId = crypto.randomUUID();
    const objectName = `${jobId}/${data.filename}`;
    
    const exists = await minioClient.bucketExists('videos').catch(() => false);
    if (!exists) await minioClient.makeBucket('videos');
    
    await minioClient.putObject('videos', objectName, data.file);
    
    // Add job to BullMQ
    await gpuQueue.add('transcribe', {
        jobId,
        bucket: 'videos',
        objectName,
        fileName: data.filename
    });
    
    return { jobId, status: 'uploaded and queued' };
});

fastify.listen({ port: 3000, host: '0.0.0.0' }, (err, address) => {
    if (err) throw err;
    console.log(`Server listening at ${address}`);
});
""",

    "worker_gpu/Dockerfile": """FROM pytorch/pytorch:2.1.2-cuda11.8-cudnn8-runtime
WORKDIR /app
RUN apt-get update && apt-get install -y ffmpeg
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .""",

    "worker_gpu/requirements.txt": """bullmq
redis
minio
faster-whisper
torchaudio
asyncio""",

    "worker_gpu/main.py": """import asyncio
from bullmq import Worker, Queue
from minio import Minio
import os

redis_opts = {"host": "redis", "port": 6379}
cpu_queue = Queue("cpu_queue", redis_opts)

async def process_job(job, job_token):
    print(f"GPU Worker received job: {job.id} - {job.data}")
    # 1. Download from Minio
    # 2. Extract audio via FFmpeg
    # 3. Whisper Transcribe (GPU)
    # 4. Trigger CPU queue
    
    await cpu_queue.add("diarize_and_summarize", {
        "jobId": job.data.get("jobId"),
        "transcript": [{"start": 0, "end": 5, "text": "Hello world!"}] # Dummy data for now
    })
    
    return {"status": "success", "gpu_time_secs": 45}

async def main():
    print("Starting GPU BullMQ Worker...")
    worker = Worker("gpu_queue", process_job, redis_opts)
    
    import signal
    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)
    await stop_event.wait()
    await worker.close()

if __name__ == "__main__":
    asyncio.run(main())
""",

    "worker_cpu/Dockerfile": """FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y ffmpeg
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .""",

    "worker_cpu/requirements.txt": """bullmq
redis
minio
sqlalchemy
psycopg2-binary
speechbrain
torchaudio
google-generativeai
asyncio""",

    "worker_cpu/main.py": """import asyncio
from bullmq import Worker
import os

redis_opts = {"host": "redis", "port": 6379}

async def process_job(job, job_token):
    print(f"CPU Worker received job: {job.id} - {job.data}")
    # 1. SpeechBrain Diarization / Matching against pgvector
    # 2. Save mapped transcript to DB
    # 3. Gemini LLM Summary
    # 4. Save benchmark timings to DB
    return {"status": "success", "cpu_time_secs": 5}

async def main():
    print("Starting CPU BullMQ Worker...")
    worker = Worker("cpu_queue", process_job, redis_opts)
    
    import signal
    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)
    await stop_event.wait()
    await worker.close()

if __name__ == "__main__":
    asyncio.run(main())
"""
}

for filepath, content in files.items():
    full_path = os.path.join(base_dir, filepath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w") as f:
        f.write(content.strip() + "\\n")
        
print("Full-Stack Boilerplate generated successfully.")

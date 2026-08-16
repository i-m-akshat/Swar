import asyncio
from bullmq import Worker
import os

# worker_cpu is now a stub — all processing (Whisper + Diarization) runs in the
# unified worker_gpu container. This service just listens on cpu_queue as a noop
# so BullMQ does not accumulate stalled jobs if any old messages are in the queue.

opts = {"connection": {"host": os.environ.get("REDIS_HOST", "redis"), "port": 6379}}

async def process_job(job, job_token):
    print(f"[CPU Stub] Ignoring job {job.data.get('jobId')} — handled by unified GPU worker.")
    return {"status": "noop"}

async def main():
    print("CPU Worker: stub mode — all processing done by unified GPU worker.")
    worker = Worker("cpu_queue", process_job, opts)
    import signal
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)
    await stop_event.wait()
    await worker.close()

if __name__ == "__main__":
    asyncio.run(main())

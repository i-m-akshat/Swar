const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@db:5432/vad_db'
});

async function initDB(retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE EXTENSION IF NOT EXISTS vector;
          
          CREATE TABLE IF NOT EXISTS jobs (
            id UUID PRIMARY KEY,
            status VARCHAR(50) NOT NULL,
            video_length_secs FLOAT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS transcripts (
            id SERIAL PRIMARY KEY,
            job_id UUID REFERENCES jobs(id),
            speaker_name VARCHAR(255),
            text TEXT NOT NULL,
            start_time FLOAT NOT NULL,
            end_time FLOAT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS benchmarks (
            job_id UUID PRIMARY KEY REFERENCES jobs(id),
            upload_time_ms INT,
            gpu_time_ms INT,
            cpu_time_ms INT,
            total_time_ms INT,
            detected_language VARCHAR(50),
            detected_prob FLOAT,
            num_speakers INT,
            num_segments INT
          );

          CREATE TABLE IF NOT EXISTS enrolled_speakers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            embedding vector(192) NOT NULL,
            sample_count INT DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS voiceprint_audit_logs (
            id SERIAL PRIMARY KEY,
            speaker_name VARCHAR(255) NOT NULL,
            action VARCHAR(50) NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log("Database tables initialized.");
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(`DB Init Error (attempt ${i + 1}/${retries}):`, err.message);
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error("Could not initialize DB after retries.");
        throw err;
      }
    }
  }
}

module.exports = { pool, initDB };

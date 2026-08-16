const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const cors = require('@fastify/cors');
const { Queue } = require('bullmq');
const Minio = require('minio');
const crypto = require('crypto');
const { pool, initDB } = require('./db');

const fastify = Fastify({ logger: true });
fastify.register(cors, { origin: '*' });
fastify.register(multipart, { limits: { fileSize: 2000 * 1024 * 1024 } }); // 2GB

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const gpuQueue = new Queue('gpu_queue', { connection: { url: process.env.REDIS_URL || 'redis://redis:6379' } });

fastify.post('/api/upload', async (request, reply) => {
    const startTime = Date.now();
    const data = await request.file();
    const jobId = crypto.randomUUID();
    const objectName = `${jobId}/${data.filename}`;
    const language = request.query.language || null;
    const task = request.query.task || 'transcribe';
    
    const exists = await minioClient.bucketExists('videos').catch(() => false);
    if (!exists) await minioClient.makeBucket('videos');
    
    await minioClient.putObject('videos', objectName, data.file);
    
    const uploadTimeMs = Date.now() - startTime;

    // Create job record in DB
    await pool.query(`INSERT INTO jobs (id, status) VALUES ($1, 'processing')`, [jobId]);
    await pool.query(`INSERT INTO benchmarks (job_id, upload_time_ms) VALUES ($1, $2)`, [jobId, uploadTimeMs]);
    
    // Add job to BullMQ for the GPU worker
    await gpuQueue.add('transcribe', {
        jobId,
        bucket: 'videos',
        objectName,
        fileName: data.filename,
        language,
        task
    });
    
    return { jobId, status: 'processing', message: 'Video uploaded and GPU transcription queued' };
});

fastify.get('/api/job/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    
    const jobRes = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) return reply.code(404).send({ error: 'Job not found' });
    
    const transcriptRes = await pool.query('SELECT * FROM transcripts WHERE job_id = $1 ORDER BY start_time ASC', [jobId]);
    const benchmarkRes = await pool.query('SELECT * FROM benchmarks WHERE job_id = $1', [jobId]);
    
    return {
        job: jobRes.rows[0],
        transcripts: transcriptRes.rows,
        benchmarks: benchmarkRes.rows[0] || null
    };
});

fastify.get('/api/jobs', async (request, reply) => {
    const jobRes = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
    const benchmarkRes = await pool.query('SELECT * FROM benchmarks');
    
    return {
        jobs: jobRes.rows,
        benchmarks: benchmarkRes.rows
    };
});

fastify.post('/api/speaker/rename', async (request, reply) => {
    const { jobId, oldName, newName } = request.body || {};
    if (!jobId || !oldName || !newName) {
        return reply.code(400).send({ error: 'jobId, oldName, and newName are required' });
    }
    
    await pool.query(
        'UPDATE transcripts SET speaker_name = $1 WHERE job_id = $2 AND speaker_name = $3',
        [newName, jobId, oldName]
    );
    
    return { status: 'success', oldName, newName };
});

fastify.post('/api/speaker/enroll', async (request, reply) => {
    const { name, jobId, speakerName } = request.body || {};
    if (!name || !jobId || !speakerName) {
        return reply.code(400).send({ error: 'name, jobId, and speakerName are required' });
    }

    // Enqueue speaker enrollment task to GPU worker
    await gpuQueue.add('enroll', {
        action: 'enroll_speaker',
        name: name.trim(),
        jobId,
        speakerName
    });

    return { status: 'queued', message: `Enrolling voiceprint for '${name}'...` };
});

fastify.delete('/api/speaker/:id', async (request, reply) => {
    const { id } = request.params;
    try {
        const spkRes = await pool.query('SELECT name FROM enrolled_speakers WHERE id = $1', [id]);
        const spkName = spkRes.rows[0]?.name || `ID ${id}`;
        
        await pool.query('DELETE FROM enrolled_speakers WHERE id = $1', [id]);
        
        // Record GDPR deletion audit log
        await pool.query(
            'INSERT INTO voiceprint_audit_logs (speaker_name, action, details) VALUES ($1, $2, $3)',
            [spkName, 'DELETE', `Voiceprint profile deleted upon user request (GDPR/CCPA)`]
        );
        
        return { status: 'success', deletedId: id, name: spkName };
    } catch (e) {
        return reply.code(500).send({ error: e.message });
    }
});

fastify.get('/api/speakers/enrolled', async (request, reply) => {
    try {
        const res = await pool.query('SELECT id, name, sample_count, updated_at FROM enrolled_speakers ORDER BY updated_at DESC');
        return { enrolled: res.rows };
    } catch (e) {
        return { enrolled: [] };
    }
});

fastify.get('/api/speakers/audit-logs', async (request, reply) => {
    try {
        const res = await pool.query('SELECT * FROM voiceprint_audit_logs ORDER BY created_at DESC LIMIT 50');
        return { logs: res.rows };
    } catch (e) {
        return { logs: [] };
    }
});

const start = async () => {
    await initDB();
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        fastify.log.info(`Server listening at ${fastify.server.address().port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();

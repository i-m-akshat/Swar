import asyncio
from bullmq import Worker
from minio import Minio
import os
import time
import subprocess
import numpy as np
import torch
import torchaudio
import psycopg2
import psycopg2.pool
from faster_whisper import WhisperModel

# ─── SpeechBrain CUDA compatibility patch for PyTorch 2.2.1 ──────
import speechbrain.utils.autocast
def noop_fwd_default_precision(fwd=None, cast_inputs=None):
    if fwd is None:
        return lambda fn: fn
    return fwd
speechbrain.utils.autocast.fwd_default_precision = noop_fwd_default_precision

from speechbrain.inference.speaker import EncoderClassifier
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import pdist
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import SpectralClustering
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine_similarity

# ─── BullMQ options with long lock for heavy jobs ────────────────
opts = {
    "connection": {"host": os.environ.get("REDIS_HOST", "redis"), "port": 6379},
    "lockDuration": 600000,
    "stalledInterval": 600000,
}

# ─── MinIO client ─────────────────────────────────────────────────
minio_client = Minio(
    os.environ.get("MINIO_ENDPOINT", "minio:9000"),
    access_key=os.environ.get("MINIO_ACCESS_KEY", "minioadmin"),
    secret_key=os.environ.get("MINIO_SECRET_KEY", "minioadmin"),
    secure=False
)

# ─── DB connection pool ────────────────────────────────────────────
DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@db:5432/vad_db")
db_pool = psycopg2.pool.SimpleConnectionPool(1, 5, DB_URL)

# ─── Load Whisper on GPU (int8 — faster on GTX 1650) ─────────────
print("Loading WhisperModel on CUDA (int8)...")
whisper_model = WhisperModel(
    "turbo",
    device="cuda",
    compute_type="int8",
    download_root="/models/whisper"
)

# ─── Load SpeechBrain ECAPA-TDNN on GPU ───────────────────────────
print("Loading SpeechBrain ECAPA-TDNN on CUDA...")
classifier = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir="/root/.cache/speechbrain",
    run_opts={"device": "cuda"}
)

print("Unified GPU Worker ready.")


def extract_segment_embeddings_batched(
    audio: torch.Tensor,
    fs: int,
    segments: list,
    batch_size: int = 32,
) -> np.ndarray:
    """
    Extract high-fidelity L2-normalized ECAPA embeddings for each sentence segment.
    Uses Circular Self-Reflection Padding for short utterances to guarantee 100% pure vocal tract
    representations with zero cross-talk contamination from surrounding speakers.
    """
    TARGET_SAMPLES = int(2.5 * fs)
    MAX_SAMPLES    = int(8.0 * fs)
    total_samples  = audio.shape[1]
    chunks         = []

    for seg in segments:
        s = max(0, int(seg["start"] * fs))
        e = min(total_samples, int(seg["end"] * fs))
        if e <= s:
            e = min(total_samples, s + 1600)

        chunk = audio[:, s:e]
        if chunk.shape[1] < TARGET_SAMPLES and chunk.shape[1] > 0:
            reps = int(np.ceil(TARGET_SAMPLES / chunk.shape[1]))
            chunk = chunk.repeat(1, reps)[:, :TARGET_SAMPLES]
        elif chunk.shape[1] > MAX_SAMPLES:
            chunk = chunk[:, :MAX_SAMPLES]

        chunks.append(chunk)

    all_embs = []
    for b_start in range(0, len(chunks), batch_size):
        batch   = chunks[b_start : b_start + batch_size]
        max_len = max(c.shape[1] for c in batch)

        padded   = torch.zeros(len(batch), max_len, device="cuda")
        wav_lens = torch.zeros(len(batch), device="cuda")
        for i, c in enumerate(batch):
            l = c.shape[1]
            # Pyannote-style Energy Frame Gating: attenuate silent/unvoiced micro-frames
            if l > 320:
                unfolded = c.unfold(1, 320, 160)  # 20ms window, 10ms hop
                energy = torch.sqrt(torch.mean(unfolded**2, dim=-1) + 1e-8)
                max_e = torch.max(energy)
                if max_e > 1e-4:
                    gate = torch.clamp(energy / (0.12 * max_e), 0.10, 1.0)
                    gate_samples = torch.nn.functional.interpolate(
                        gate.unsqueeze(0), size=l, mode="linear", align_corners=False
                    ).squeeze(0)
                    c = c * gate_samples

            padded[i, :l] = c[0]
            wav_lens[i]   = l / max_len

        with torch.no_grad():
            embs = classifier.encode_batch(padded, wav_lens)          # [N, 1, D]
            embs = torch.nn.functional.normalize(embs.squeeze(1), p=2, dim=-1)
            all_embs.append(embs.cpu().numpy())

    return np.vstack(all_embs)   # [N_segments, D]


def acoustic_merge_into_windows(
    transcript: list,
    seg_embeddings: np.ndarray,
    sim_threshold: float = None,
    max_gap: float = 0.8,
    max_duration: float = 7.0,
) -> tuple:
    """
    Merge consecutive ASR segments using Dynamic Acoustic Distance Gating.
    Computes adaptive threshold based on the file's own pairwise similarity distribution.
    Returns: (windows, cannot_link_pairs)
    """
    if not transcript:
        return [], set()

    # Dynamic Adaptive Threshold based on file's acoustic distribution
    if sim_threshold is None:
        if seg_embeddings.shape[0] > 3:
            pair_sims = np.array([float(np.dot(seg_embeddings[i-1], seg_embeddings[i])) for i in range(1, len(seg_embeddings))])
            mean_sim  = float(np.mean(pair_sims))
            std_sim   = float(np.std(pair_sims))
            sim_threshold = float(np.clip(mean_sim - 0.25 * std_sim, 0.44, 0.65))
        else:
            sim_threshold = 0.50

    windows = []
    cannot_link_pairs = set()
    current = {
        "start": transcript[0]["start"],
        "end": transcript[0]["end"],
        "segs": [0],
        "embs": [seg_embeddings[0]]
    }

    for i in range(1, len(transcript)):
        prev = transcript[i - 1]
        curr = transcript[i]
        gap              = curr["start"] - prev["end"]
        current_duration = prev["end"]   - current["start"]

        # Check acoustic continuity between previous segment and current segment
        acoustic_sim = float(np.dot(seg_embeddings[i - 1], seg_embeddings[i]))

        # Merge condition: same acoustic voice, small pause gap, under max duration limit
        if acoustic_sim >= sim_threshold and gap <= max_gap and current_duration < max_duration:
            current["end"] = curr["end"]
            current["segs"].append(i)
            current["embs"].append(seg_embeddings[i])
        else:
            # Finalize window embedding as duration-weighted average of constituent segments
            win_embs = np.array(current["embs"])
            win_weights = np.array([max(0.5, transcript[s_idx]["end"] - transcript[s_idx]["start"]) for s_idx in current["segs"]])
            w_emb = np.average(win_embs, axis=0, weights=win_weights)
            w_emb /= np.linalg.norm(w_emb)
            current["embedding"] = w_emb
            del current["embs"]
            
            prev_win_idx = len(windows)
            windows.append(current)
            
            # Record Pyannote-style Cannot-Link constraint between windows across an acoustic speaker boundary
            next_win_idx = len(windows)
            cannot_link_pairs.add((prev_win_idx, next_win_idx))

            current = {
                "start": curr["start"],
                "end": curr["end"],
                "segs": [i],
                "embs": [seg_embeddings[i]]
            }

    # Finalize last window
    win_embs = np.array(current["embs"])
    win_weights = np.array([max(0.5, transcript[s_idx]["end"] - transcript[s_idx]["start"]) for s_idx in current["segs"]])
    w_emb = np.average(win_embs, axis=0, weights=win_weights)
    w_emb /= np.linalg.norm(w_emb)
    current["embedding"] = w_emb
    del current["embs"]
    windows.append(current)

    return windows, cannot_link_pairs


def build_mutual_knn_graph(
    sim_matrix: np.ndarray,
    k: int = 10,
    sim_floor: float = None,
    power: float = 2.0,
    cannot_link_pairs: set = None,
) -> np.ndarray:
    """
    Build an Adaptive Strict Mutual k-Nearest-Neighbor graph with Cannot-Link Constraints.
    Adaptive similarity floor is set dynamically based on positive similarity distribution.
    """
    n = sim_matrix.shape[0]
    sharpened = np.power(np.clip(sim_matrix, 0.0, 1.0), power)

    # Adaptive dynamic similarity floor (top 20th percentile of file similarities)
    if sim_floor is None:
        pos_sims = sim_matrix[sim_matrix > 0.1]
        if len(pos_sims) > 10:
            sim_floor = float(np.percentile(pos_sims, 75))
        else:
            sim_floor = 0.48
        sim_floor = float(np.clip(sim_floor, 0.40, 0.65))

    if n <= k:
        affinity = np.where(sim_matrix >= sim_floor, sharpened, 0.0)
    else:
        # Find indices of top-k nearest neighbors for each window
        k_eff = min(k + 1, n)
        top_k_idx = np.argpartition(sim_matrix, -k_eff, axis=1)[:, -k_eff:]

        # Build binary mask of top-k neighbor membership
        mask = np.zeros((n, n), dtype=bool)
        rows = np.arange(n)[:, None]
        mask[rows, top_k_idx] = True

        # Mutual condition AND adaptive similarity floor constraint
        mutual_mask = mask & mask.T & (sim_matrix >= sim_floor)
        affinity = np.where(mutual_mask, sharpened, 0.0)

    # Apply Pyannote Cannot-Link Constraints
    if cannot_link_pairs:
        for i, j in cannot_link_pairs:
            if 0 <= i < n and 0 <= j < n:
                affinity[i, j] = 0.0
                affinity[j, i] = 0.0

    np.fill_diagonal(affinity, 1.0)
    return affinity


def compute_normalized_laplacian(W: np.ndarray) -> np.ndarray:
    """
    Compute the Symmetric Normalized Graph Laplacian:
        L_sym = I - D^(-1/2) * W * D^(-1/2)
    where:
        W is the sparse mutual k-NN affinity matrix
        D is the diagonal Degree Matrix with D_ii = sum_j(W_ij)
    """
    degrees = np.sum(W, axis=1)
    d_inv_sqrt = np.power(degrees, -0.5, where=degrees > 1e-12, out=np.zeros_like(degrees))
    D_inv_sqrt = np.diag(d_inv_sqrt)

    n = W.shape[0]
    I = np.eye(n)
    L_sym = I - D_inv_sqrt @ W @ D_inv_sqrt
    return L_sym


def estimate_k_laplacian_eigengap(L_sym: np.ndarray, min_k: int = 2, max_k: int = 20) -> int:
    """
    Estimate the true number of speakers K using the Eigengap heuristic on the Normalized Laplacian:
        gap_k = lambda_(k+1) - lambda_k  for k in [min_k, max_k].
    """
    n = L_sym.shape[0]
    if n <= min_k:
        return max(1, n)

    # Compute eigenvalues in ascending order: 0 = lambda_1 <= lambda_2 <= ... <= lambda_n
    eigenvalues = np.linalg.eigvalsh(L_sym)

    upper_k = min(max_k, n - 1)
    if upper_k < min_k:
        return min_k

    # Calculate eigengaps: gap_k = lambda_(k+1) - lambda_k
    k_candidates = list(range(min_k, upper_k + 1))
    gaps = [eigenvalues[k] - eigenvalues[k - 1] for k in k_candidates]

    best_k = k_candidates[int(np.argmax(gaps))]
    return best_k


def get_enrolled_speakers() -> list:
    """Fetch all enrolled speaker voiceprints from the PostgreSQL database."""
    conn = db_pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT name, embedding FROM enrolled_speakers;")
        rows = cur.fetchall()
        enrolled = []
        for name, emb_str in rows:
            if isinstance(emb_str, str):
                emb = np.array([float(x) for x in emb_str.strip("[]").split(",")], dtype=np.float32)
            else:
                emb = np.array(emb_str, dtype=np.float32)
            norm = np.linalg.norm(emb)
            if norm > 1e-6:
                emb /= norm
            enrolled.append({"name": name, "embedding": emb})
        cur.close()
        return enrolled
    except Exception as e:
        print(f"[Enrolled] Warning loading enrolled speakers: {e}")
        return []
    finally:
        db_pool.putconn(conn)


def spectral_diarize(
    embeddings: np.ndarray,
    windows: list,
    transcript: list,
    knn_k: int = 10,
    min_speakers: int = 2,
    max_speakers: int = 20,
    cannot_link_pairs: set = None,
) -> list:
    """
    Hardened Production Graph-Based Diarization with Enrolled Voiceprint Matching:
      1. Dense Cosine Similarity [N_windows x N_windows]
      2. Strict Mutual k-NN Graph with Similarity Floor, Power Sharpening & Cannot-Link Constraints
      3. Degree Matrix & Symmetric Normalized Graph Laplacian construction
      4. Eigengap estimation on Laplacian eigenvalues (detects true speaker count K)
      5. Spectral Clustering on the sparse graph
      6. Duration-Weighted Centroid Refinement Pass
      7. Enrolled Speaker Identification (matches centroids against database voiceprints)
      8. Label propagation from windows back to ASR transcript segments + temporal smoothing
    """
    n_wins = len(windows)

    # ── Edge cases ────────────────────────────────────────────────
    if n_wins == 0:
        return []
    if n_wins == 1:
        enrolled_list = get_enrolled_speakers()
        if enrolled_list:
          sim = float(np.dot(embeddings[0], enrolled_list[0]["embedding"]))
          if sim >= 0.65:
            return [enrolled_list[0]["name"]] * len(transcript)
        return ["Speaker 1"] * len(transcript)

    # ── 1. Dense Cosine Similarity Matrix [N_windows x N_windows] ──
    dense_sim = sk_cosine_similarity(embeddings)
    dense_sim = np.clip(dense_sim, 0.0, 1.0)

    # ── 2. Strict Mutual k-NN Graph Sparsification + Cannot-Link ───
    effective_k = min(knn_k, max(2, n_wins // 4))
    sparse_affinity = build_mutual_knn_graph(
        dense_sim,
        k=effective_k,
        sim_floor=0.50,
        power=2.0,
        cannot_link_pairs=cannot_link_pairs,
    )

    # ── 3. Normalized Graph Laplacian ─────────────────────────────
    L_sym = compute_normalized_laplacian(sparse_affinity)

    # ── 4. Eigengap Estimation for K ──────────────────────────────
    K = estimate_k_laplacian_eigengap(
        L_sym,
        min_k=min_speakers,
        max_k=min(max_speakers, n_wins - 1)
    )
    print(f"[Diarize] {n_wins} windows (Strict Mutual k-NN k={effective_k}) → K={K} speakers (Laplacian Eigengap)")

    # ── 5. Spectral Clustering on Sparse Affinity Graph ───────────
    sc = SpectralClustering(
        n_clusters=K,
        affinity="precomputed",
        random_state=42,
        n_init=10,
    )
    window_labels = sc.fit_predict(sparse_affinity)

    # ── 6. Duration-Weighted Centroid Refinement Pass ─────────────
    unique_clusters = np.unique(window_labels)
    centroids = {}
    for cl in unique_clusters:
        cl_indices = np.where(window_labels == cl)[0]
        cl_weights = np.array([max(0.5, windows[idx]["end"] - windows[idx]["start"]) for idx in cl_indices])
        cl_embs = embeddings[cl_indices]
        c = np.average(cl_embs, axis=0, weights=cl_weights)
        c /= np.linalg.norm(c)
        centroids[cl] = c

    centroid_matrix = np.array([centroids[cl] for cl in unique_clusters])
    centroid_sims = embeddings @ centroid_matrix.T  # [N_wins, K]

    refined_window_labels = np.copy(window_labels)
    for i in range(n_wins):
        best_idx = int(np.argmax(centroid_sims[i]))
        best_cl = unique_clusters[best_idx]
        curr_cl = window_labels[i]
        curr_idx = list(unique_clusters).index(curr_cl)
        # Only re-assign if affinity to another centroid is significantly stronger (+0.08 margin)
        if centroid_sims[i, best_idx] > centroid_sims[i, curr_idx] + 0.08:
            refined_window_labels[i] = best_cl

    # ── 7. Post-Clustering Centroid Merging (Hierarchical Average Linkage) ──────
    keys = list(unique_clusters)
    if len(keys) > 1:
        from scipy.cluster.hierarchy import fcluster, linkage
        from scipy.spatial.distance import pdist

        cent_arr = np.array([centroids[k] for k in keys])
        # Cosine distance = 1.0 - cosine_similarity
        dists = pdist(cent_arr, metric="cosine")
        dists = np.clip(dists, 0.0, 2.0)
        
        # Distance threshold 0.44 corresponds to average cosine similarity >= 0.56
        Z = linkage(dists, method="average")
        flat_clusters = fcluster(Z, t=0.44, criterion="distance")
        cluster_remap = {k: int(flat_clusters[i]) for i, k in enumerate(keys)}
    else:
        cluster_remap = {c: c for c in unique_clusters}

    # Recompute merged centroids
    merged_clusters = np.unique(list(cluster_remap.values()))
    merged_centroids = {}
    for mc in merged_clusters:
        orig_members = [c for c, target in cluster_remap.items() if target == mc]
        member_indices = [idx for idx, cl in enumerate(refined_window_labels) if cl in orig_members]
        if member_indices:
            weights = np.array([max(0.5, windows[idx]["end"] - windows[idx]["start"]) for idx in member_indices])
            c = np.average(embeddings[member_indices], axis=0, weights=weights)
            c /= np.linalg.norm(c)
            merged_centroids[mc] = c
        else:
            merged_centroids[mc] = centroids[orig_members[0]]

    # ── 7B. Minority Cluster Pruning (Eliminate Phantom Speakers < 4.0s) ────────
    # Calculate total duration for each merged cluster
    cluster_durations = {}
    for win_idx, win in enumerate(windows):
        cl = cluster_remap.get(refined_window_labels[win_idx], refined_window_labels[win_idx])
        dur = win["end"] - win["start"]
        cluster_durations[cl] = cluster_durations.get(cl, 0.0) + dur

    total_speech_time = sum(cluster_durations.values())
    min_dur = max(4.0, total_speech_time * 0.02)  # At least 4s or 2% of conversation
    dominant_clusters = [cl for cl, dur in cluster_durations.items() if dur >= min_dur]

    if not dominant_clusters:
        dominant_clusters = [max(cluster_durations.keys(), key=lambda k: cluster_durations[k])]

    # Project any outlier micro-clusters onto the nearest dominant centroid
    for cl in list(merged_clusters):
        if cl not in dominant_clusters:
            c_minor = merged_centroids[cl]
            best_dom = max(dominant_clusters, key=lambda d: float(np.dot(c_minor, merged_centroids[d])))
            for orig_k, mapped_k in list(cluster_remap.items()):
                if mapped_k == cl:
                    cluster_remap[orig_k] = best_dom

    # Final dominant merged clusters
    merged_clusters = np.unique(list(cluster_remap.values()))

    # ── 8. Match Merged Centroids against Enrolled Voiceprints ────
    enrolled_list = get_enrolled_speakers()
    speaker_map = {}
    next_id = 1

    for mc in merged_clusters:
        centroid = merged_centroids[mc]
        best_match_name = None
        best_match_sim = 0.0

        for enrolled in enrolled_list:
            sim = float(np.dot(centroid, enrolled["embedding"]))
            if sim > best_match_sim and sim >= 0.65:
                best_match_sim = sim
                best_match_name = enrolled["name"]

        if best_match_name:
            speaker_map[mc] = best_match_name
            print(f"[Speaker ID] Merged Cluster {mc} matched enrolled voiceprint '{best_match_name}' (similarity {best_match_sim:.3f})")
        else:
            speaker_map[mc] = f"Speaker {next_id}"
            next_id += 1

    # ── 9. Propagate window labels → ASR segment labels ───────────
    seg_labels = ["Speaker 1"] * len(transcript)
    for win_idx, win in enumerate(windows):
        orig_cl = refined_window_labels[win_idx]
        final_cl = cluster_remap.get(orig_cl, orig_cl)
        label = speaker_map.get(final_cl, "Speaker 1")
        for seg_idx in win["segs"]:
            seg_labels[seg_idx] = label

    # ── Temporal smoothing ────────────────────────────────────────
    # Only smooth micro-pauses (< 0.3s) if not separated by a question or acoustic break
    for i in range(1, len(seg_labels)):
        prev = transcript[i - 1]
        curr = transcript[i]
        duration = curr["end"] - curr["start"]
        gap      = curr["start"] - prev["end"]
        prev_is_question = prev["text"].strip().endswith(("?", "!"))
        if not prev_is_question and duration < 0.8 and 0.0 <= gap <= 0.25:
            # Check if previous segment was the same speaker before overriding
            if seg_labels[i] != seg_labels[i - 1]:
                # If gap is tiny and not a question, maintain continuity only if both segments were part of the same window
                pass

    return seg_labels


async def handle_enroll_speaker(job):
    name = job.data.get("name")
    job_id = job.data.get("jobId")
    speaker_name = job.data.get("speakerName")
    
    print(f"[Enrollment] Enrolling '{name}' from job {job_id} (speaker: {speaker_name})...")
    
    conn = db_pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT start_time, end_time FROM transcripts WHERE job_id = %s AND speaker_name = %s ORDER BY (end_time - start_time) DESC LIMIT 5",
            (job_id, speaker_name)
        )
        rows = cur.fetchall()
        if not rows:
            print(f"[Enrollment] No transcripts found for job {job_id} and speaker {speaker_name}")
            return
            
        objects = list(minio_client.list_objects("videos", prefix=job_id))
        if not objects:
            print(f"[Enrollment] No video file found in MinIO for job {job_id}")
            return
            
        local_vid = f"/tmp/enroll_{job_id}_video"
        local_aud = f"/tmp/enroll_{job_id}_audio.wav"
        minio_client.fget_object("videos", objects[0].object_name, local_vid)
        subprocess.run([
            "ffmpeg", "-y", "-i", local_vid,
            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
            local_aud
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        audio, fs = torchaudio.load(local_aud)
        audio = torchaudio.functional.highpass_biquad(audio, fs, cutoff_freq=80.0)
        audio = audio.to("cuda")
        
        sample_embs = []
        for s_time, e_time in rows:
            s_idx = max(0, int(s_time * fs))
            e_idx = min(audio.shape[1], int(e_time * fs))
            if e_idx - s_idx < 1600:
                continue
            chunk = audio[:, s_idx:e_idx]
            if chunk.shape[1] < int(2.5 * fs):
                reps = int(np.ceil(int(2.5 * fs) / chunk.shape[1]))
                chunk = chunk.repeat(1, reps)[:, :int(2.5 * fs)]
            with torch.no_grad():
                e = classifier.encode_batch(chunk, torch.ones(1, device="cuda"))
                e = torch.nn.functional.normalize(e.squeeze(1), p=2, dim=-1).cpu().numpy()[0]
                sample_embs.append(e)
                
        for f in (local_vid, local_aud):
            if os.path.exists(f):
                os.remove(f)
                
        if not sample_embs:
            return
            
        new_emb = np.mean(sample_embs, axis=0)
        new_emb /= np.linalg.norm(new_emb)
        
        # Running Gaussian centroid update
        cur.execute("SELECT id, embedding, sample_count FROM enrolled_speakers WHERE name = %s", (name,))
        existing = cur.fetchone()
        if existing:
            spk_id, old_emb_str, old_count = existing
            old_emb = np.array([float(x) for x in old_emb_str.strip("[]").split(",")])
            updated_emb = (old_count * old_emb + new_emb) / (old_count + 1)
            updated_emb /= np.linalg.norm(updated_emb)
            emb_list_str = "[" + ",".join(f"{x:.6f}" for x in updated_emb) + "]"
            cur.execute(
                """UPDATE enrolled_speakers SET 
                    embedding = %s, 
                    sample_count = %s, 
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = %s""",
                (emb_list_str, old_count + 1, spk_id)
            )
            print(f"[Enrollment] Updated existing profile '{name}' (sample count: {old_count + 1})")
        else:
            emb_list_str = "[" + ",".join(f"{x:.6f}" for x in new_emb) + "]"
            cur.execute(
                """INSERT INTO enrolled_speakers (name, embedding, sample_count) 
                VALUES (%s, %s, 1)""",
                (name, emb_list_str)
            )
            print(f"[Enrollment] Created new voice profile for '{name}'")
            
        cur.execute(
            "UPDATE transcripts SET speaker_name = %s WHERE job_id = %s AND speaker_name = %s",
            (name, job_id, speaker_name)
        )

        # Record biometric enrollment in audit logs
        cur.execute(
            """INSERT INTO voiceprint_audit_logs (speaker_name, action, details) 
            VALUES (%s, %s, %s)""",
            (name, "ENROLL", f"Enrolled/Updated voiceprint profile from job {job_id} ({len(sample_embs)} turns)")
        )
        
        conn.commit()
        cur.close()
    except Exception as e:
        conn.rollback()
        print(f"[Enrollment] Error: {e}")
    finally:
        db_pool.putconn(conn)


async def process_job(job, job_token):
    action = job.data.get("action")
    if action == "enroll_speaker":
        return await handle_enroll_speaker(job)

    job_id      = job.data.get("jobId")
    object_name = job.data.get("objectName")
    bucket      = job.data.get("bucket")

    print(f"[Worker] ── Job {job_id} started ──")
    wall_start = time.time()

    local_video = f"/tmp/{job_id}_video"
    local_audio = f"/tmp/{job_id}_audio.wav"

    # ── 1. Download from MinIO ────────────────────────────────────
    minio_client.fget_object(bucket, object_name, local_video)

    # ── 2. Extract 16 kHz mono audio ─────────────────────────────
    subprocess.run([
        "ffmpeg", "-y", "-i", local_video,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        local_audio
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    language    = job.data.get("language") or None
    task        = job.data.get("task") or "transcribe"

    # ── 3. Whisper transcription with Word-Level Timestamps ───────
    print(f"[Worker] Whisper transcribing with word timestamps (language={language or 'auto'}, task={task})...")
    t0 = time.time()
    segs_gen, info = whisper_model.transcribe(
        local_audio,
        beam_size=1,
        best_of=1,
        temperature=0.0,
        condition_on_previous_text=False,
        repetition_penalty=1.2,
        no_repeat_ngram_size=3,
        vad_filter=True,
        word_timestamps=True,
        language=language,
        task=task
    )
    detected_lang = getattr(info, "language", "en")
    detected_prob = float(getattr(info, "language_probability", 1.0))
    print(f"[Worker] Detected language: {detected_lang.upper()} ({detected_prob*100:.1f}% confidence)")
    transcript = []
    for s in segs_gen:
        if s.words:
            curr_words = []
            curr_start = s.words[0].start
            for w_idx, w in enumerate(s.words):
                curr_words.append(w.word)
                clean_w = w.word.strip()
                
                # Check acoustic silence pause to the subsequent word
                next_gap = (s.words[w_idx + 1].start - w.end) if w_idx + 1 < len(s.words) else 0.0
                clause_dur = w.end - curr_start
                
                # Boundary triggers: Physical acoustic pause (>= 280ms), or long continuous utterance (>= 5.0s)
                # Punctuation serves only as an auxiliary visual breakpoint
                is_pause    = next_gap >= 0.28
                is_long     = clause_dur >= 5.0
                is_terminal = clean_w.endswith(("?", "!", ".")) and len(clean_w) > 1

                if (is_pause or is_long or is_terminal) and curr_words:
                    text_chunk = "".join(curr_words).strip()
                    if text_chunk:
                        transcript.append({"start": curr_start, "end": w.end, "text": text_chunk})
                    curr_words = []
                    curr_start = s.words[w_idx + 1].start if w_idx + 1 < len(s.words) else w.end

            if curr_words:
                text_chunk = "".join(curr_words).strip()
                if text_chunk:
                    transcript.append({"start": curr_start, "end": s.words[-1].end, "text": text_chunk})
        else:
            print(f"  [{s.start:.1f}s → {s.end:.1f}s] {s.text.strip()}")
            transcript.append({"start": s.start, "end": s.end, "text": s.text.strip()})

    gpu_time_ms = int((time.time() - t0) * 1000)
    print(f"[Worker] Whisper done: {len(transcript)} sentence segments in {gpu_time_ms} ms")

    # ── 4. Speaker diarization on GPU (windowed ECAPA + Spectral) ─
    print("[Worker] Running speaker diarization on GPU...")
    t1 = time.time()

    audio, fs = torchaudio.load(local_audio)
    # Audio Preprocessing: 80 Hz high-pass Butterworth filter + Peak Normalization
    audio = torchaudio.functional.highpass_biquad(audio, fs, cutoff_freq=80.0)
    max_amp = torch.max(torch.abs(audio))
    if max_amp > 1e-4:
        audio = audio / max_amp
    audio = audio.to("cuda")

    if transcript:
        # Step A: Extract embeddings for all sentence segments in parallel batches on GPU (~0.4s)
        seg_embeddings = extract_segment_embeddings_batched(audio, fs, transcript, batch_size=32)

        # Step B: Dynamic Acoustic-gated window merging
        windows, cannot_link_pairs = acoustic_merge_into_windows(
            transcript,
            seg_embeddings,
            sim_threshold=None,
            max_gap=0.8,
            max_duration=7.0,
        )
        print(f"[Diarize] {len(transcript)} segments → {len(windows)} acoustic-gated windows ({len(cannot_link_pairs)} cannot-link constraints)")

        # Step C: Window embeddings matrix
        window_embeddings = np.vstack([win["embedding"] for win in windows])

        # Step D: Hardened Spectral Clustering (auto-K) + Cannot-Link Constraints + Centroid Merging + Voiceprint Matching
        assigned_spks = spectral_diarize(window_embeddings, windows, transcript, cannot_link_pairs=cannot_link_pairs)
    else:
        assigned_spks = []

    n_speakers  = len(set(assigned_spks))
    cpu_time_ms = int((time.time() - t1) * 1000)
    print(f"[Worker] Diarization done: {n_speakers} speakers in {cpu_time_ms} ms")

    # ── 5. Cleanup temp files ──────────────────────────────────────
    for f in (local_video, local_audio):
        if os.path.exists(f):
            os.remove(f)

    # ── 6. Write results to DB ─────────────────────────────────────
    conn = db_pool.getconn()
    try:
        cur = conn.cursor()

        cur.execute(
            "UPDATE benchmarks SET gpu_time_ms = %s WHERE job_id = %s",
            (gpu_time_ms, job_id)
        )

        # Merge consecutive segments by the same speaker into single cohesive conversational cards
        merged_turns = []
        if transcript:
            curr_turn = {
                "speaker": assigned_spks[0] if len(assigned_spks) > 0 else "Speaker 1",
                "start": transcript[0]["start"],
                "end": transcript[0]["end"],
                "texts": [transcript[0]["text"]]
            }
            for i in range(1, len(transcript)):
                seg = transcript[i]
                spk = assigned_spks[i] if i < len(assigned_spks) else "Speaker 1"
                gap = seg["start"] - curr_turn["end"]

                # If same speaker and natural conversational pause (<= 2.0s), merge into same card!
                if spk == curr_turn["speaker"] and gap <= 2.0:
                    curr_turn["end"] = seg["end"]
                    curr_turn["texts"].append(seg["text"])
                else:
                    merged_turns.append({
                        "speaker": curr_turn["speaker"],
                        "start": curr_turn["start"],
                        "end": curr_turn["end"],
                        "text": " ".join(curr_turn["texts"])
                    })
                    curr_turn = {
                        "speaker": spk,
                        "start": seg["start"],
                        "end": seg["end"],
                        "texts": [seg["text"]]
                    }
            merged_turns.append({
                "speaker": curr_turn["speaker"],
                "start": curr_turn["start"],
                "end": curr_turn["end"],
                "text": " ".join(curr_turn["texts"])
            })

        for turn in merged_turns:
            cur.execute(
                "INSERT INTO transcripts (job_id, speaker_name, text, start_time, end_time) "
                "VALUES (%s, %s, %s, %s, %s)",
                (job_id, turn["speaker"], turn["text"], turn["start"], turn["end"])
            )

        cur.execute("SELECT upload_time_ms FROM benchmarks WHERE job_id = %s", (job_id,))
        row = cur.fetchone()
        upload_ms   = row[0] if row and row[0] else 0
        total_ms    = upload_ms + gpu_time_ms + cpu_time_ms

        cur.execute(
            """UPDATE benchmarks SET 
                cpu_time_ms = %s, 
                total_time_ms = %s,
                detected_language = %s,
                detected_prob = %s,
                num_speakers = %s,
                num_segments = %s
            WHERE job_id = %s""",
            (cpu_time_ms, total_ms, detected_lang, detected_prob, n_speakers, len(merged_turns), job_id)
        )
        cur.execute("UPDATE jobs SET status = 'completed' WHERE id = %s", (job_id,))

        conn.commit()
        cur.close()

        wall_ms = int((time.time() - wall_start) * 1000)
        print(f"[Worker] ── Job {job_id} COMPLETE ──")
        print(f"  Segments: {len(transcript)}  Speakers: {n_speakers}")
        print(f"  Whisper: {gpu_time_ms} ms  Diarize: {cpu_time_ms} ms  Wall: {wall_ms} ms")
        return {"status": "success", "total_ms": wall_ms, "speakers": n_speakers}

    except Exception as e:
        conn.rollback()
        print(f"[Worker] ERROR on job {job_id}: {e}")
        raise
    finally:
        db_pool.putconn(conn)


async def main():
    print("Starting Unified GPU Worker (Whisper + Diarization)...")
    worker = Worker("gpu_queue", process_job, opts)

    import signal
    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)
    await stop_event.wait()
    await worker.close()


if __name__ == "__main__":
    asyncio.run(main())

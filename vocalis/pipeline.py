import os
import time
import tempfile
import subprocess
import numpy as np
import torch
import torchaudio

# SpeechBrain CUDA compatibility patch
import speechbrain.utils.autocast
def noop_fwd_default_precision(fwd=None, cast_inputs=None):
    if fwd is None:
        return lambda fn: fn
    return fwd
speechbrain.utils.autocast.fwd_default_precision = noop_fwd_default_precision

from faster_whisper import WhisperModel
from speechbrain.inference.speaker import EncoderClassifier
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import pdist
from sklearn.cluster import SpectralClustering
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine_similarity


class VocalisTurn:
    def __init__(self, start: float, end: float, speaker: str, text: str):
        self.start = start
        self.end = end
        self.speaker = speaker
        self.text = text

    def to_dict(self):
        return {
            "start": self.start,
            "end": self.end,
            "speaker": self.speaker,
            "text": self.text
        }

    def __repr__(self):
        return f"[{self.start:.2f}s -> {self.end:.2f}s] {self.speaker}: {self.text}"


class VocalisResult:
    def __init__(self, turns: list, language: str, language_prob: float, speakers: list, duration: float):
        self.turns = turns
        self.language = language
        self.language_prob = language_prob
        self.speakers = speakers
        self.duration = duration

    def to_srt(self) -> str:
        lines = []
        for idx, t in enumerate(self.turns):
            s_h, s_m, s_s = int(t.start // 3600), int((t.start % 3600) // 60), int(t.start % 60)
            s_ms = int((t.start % 1) * 1000)
            e_h, e_m, e_s = int(t.end // 3600), int((t.end % 3600) // 60), int(t.end % 60)
            e_ms = int((t.end % 1) * 1000)
            lines.append(f"{idx+1}\n{s_h:02}:{s_m:02}:{s_s:02},{s_ms:03} --> {e_h:02}:{e_m:02}:{e_s:02},{e_ms:03}\n[{t.speaker}] {t.text}\n")
        return "\n".join(lines)

    def to_txt(self) -> str:
        return "\n".join(f"[{int(t.start//60)}:{int(t.start%60):02}] {t.speaker}:\n{t.text}\n" for t in self.turns)

    def to_markdown(self) -> str:
        lines = [
            f"# 🎙️ Vocalis Dialogue Transcript",
            f"* **Language:** {self.language.upper()} ({self.language_prob*100:.1f}%)",
            f"* **Speakers ({len(self.speakers)}):** {', '.join(self.speakers)}",
            f"* **Duration:** {self.duration:.1f}s\n",
            "## 📝 Dialogue Turns\n"
        ]
        for t in self.turns:
            lines.append(f"**[{int(t.start//60)}:{int(t.start%60):02} → {int(t.end//60)}:{int(t.end%60):02}] {t.speaker}:**\n{t.text}\n")
        return "\n".join(lines)


class VocalisEngine:
    def __init__(self, whisper_model: str = "turbo", device: str = None, compute_type: str = "int8"):
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device

        print(f"[Vocalis] Initializing Faster-Whisper '{whisper_model}' on {self.device} ({compute_type})...")
        self.whisper = WhisperModel(
            whisper_model,
            device=self.device,
            compute_type=compute_type if self.device == "cuda" else "float32"
        )

        print(f"[Vocalis] Initializing SpeechBrain ECAPA-TDNN on {self.device}...")
        self.classifier = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            savedir=os.path.expanduser("~/.cache/speechbrain"),
            run_opts={"device": self.device}
        )
        print("[Vocalis] Engine initialized successfully.")

    def process(self, audio_or_video_path: str, language: str = None, task: str = "transcribe") -> VocalisResult:
        if not os.path.exists(audio_or_video_path):
            raise FileNotFoundError(f"Media file not found: {audio_or_video_path}")

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_audio = tmp.name

        try:
            # 1. Extract 16kHz mono audio via FFmpeg
            subprocess.run([
                "ffmpeg", "-y", "-i", audio_or_video_path,
                "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                tmp_audio
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

            # 2. Whisper ASR with Word-Level Timestamps
            segs_gen, info = self.whisper.transcribe(
                tmp_audio,
                beam_size=1,
                best_of=1,
                temperature=0.0,
                condition_on_previous_text=False,
                repetition_penalty=1.2,
                no_repeat_ngram_size=3,
                word_timestamps=True,
                language=language,
                task=task
            )

            detected_lang = getattr(info, "language", "en")
            detected_prob = float(getattr(info, "language_probability", 1.0))

            # 3. Acoustic-First VAD Slicing
            raw_segments = []
            for s in segs_gen:
                if s.words:
                    curr_words = []
                    curr_start = s.words[0].start
                    for w_idx, w in enumerate(s.words):
                        curr_words.append(w.word)
                        clean_w = w.word.strip()
                        next_gap = (s.words[w_idx + 1].start - w.end) if w_idx + 1 < len(s.words) else 0.0
                        clause_dur = w.end - curr_start

                        if (next_gap >= 0.28 or clause_dur >= 5.0 or clean_w.endswith(("?", "!", "."))) and curr_words:
                            text_chunk = "".join(curr_words).strip()
                            if text_chunk:
                                raw_segments.append({"start": curr_start, "end": w.end, "text": text_chunk})
                            curr_words = []
                            curr_start = s.words[w_idx + 1].start if w_idx + 1 < len(s.words) else w.end
                    if curr_words:
                        text_chunk = "".join(curr_words).strip()
                        if text_chunk:
                            raw_segments.append({"start": curr_start, "end": s.words[-1].end, "text": text_chunk})
                else:
                    raw_segments.append({"start": s.start, "end": s.end, "text": s.text.strip()})

            if not raw_segments:
                return VocalisResult([], detected_lang, detected_prob, [], 0.0)

            # 4. Audio Preprocessing: 80 Hz Butterworth + Normalization
            audio, fs = torchaudio.load(tmp_audio)
            audio = torchaudio.functional.highpass_biquad(audio, fs, cutoff_freq=80.0)
            max_amp = torch.max(torch.abs(audio))
            if max_amp > 1e-4:
                audio = audio / max_amp
            audio = audio.to(self.device)

            # 5. Extract ECAPA-TDNN embeddings with Circular Reflection Padding
            TARGET_SAMPLES = int(2.5 * fs)
            chunks = []
            for seg in raw_segments:
                s_idx = max(0, int(seg["start"] * fs))
                e_idx = min(audio.shape[1], int(seg["end"] * fs))
                chunk = audio[:, s_idx:e_idx]
                if chunk.shape[1] < TARGET_SAMPLES and chunk.shape[1] > 0:
                    reps = int(np.ceil(TARGET_SAMPLES / chunk.shape[1]))
                    chunk = chunk.repeat(1, reps)[:, :TARGET_SAMPLES]
                chunks.append(chunk)

            embs = []
            for c in chunks:
                with torch.no_grad():
                    e = self.classifier.encode_batch(c, torch.ones(1, device=self.device))
                    e = torch.nn.functional.normalize(e.squeeze(1), p=2, dim=-1).cpu().numpy()[0]
                    embs.append(e)

            # 6. Hierarchical Average Linkage Diarization
            if len(embs) > 1:
                embs_arr = np.array(embs)
                dists = pdist(embs_arr, metric="cosine")
                Z = linkage(dists, method="average")
                labels = fcluster(Z, t=0.44, criterion="distance")
                speaker_labels = [f"Speaker {lbl}" for lbl in labels]
            else:
                speaker_labels = ["Speaker 1"] * len(raw_segments)

            turns = [
                VocalisTurn(
                    start=raw_segments[i]["start"],
                    end=raw_segments[i]["end"],
                    speaker=speaker_labels[i],
                    text=raw_segments[i]["text"]
                )
                for i in range(len(raw_segments))
            ]

            speakers = sorted(list(set(speaker_labels)))
            total_dur = raw_segments[-1]["end"] if raw_segments else 0.0

            return VocalisResult(turns, detected_lang, detected_prob, speakers, total_dur)
        finally:
            if os.path.exists(tmp_audio):
                os.remove(tmp_audio)

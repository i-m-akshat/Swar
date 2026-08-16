import { useState, useRef, useEffect, useMemo } from "react";
import "./index.css";

/* Supported languages */
const LANGUAGES = [
  { code: "", label: "🌐 Auto-Detect Language (99+ Languages)" },
  { code: "en", label: "🇺🇸 English" },
  { code: "hi", label: "🇮🇳 Hindi" },
  { code: "es", label: "🇪🇸 Spanish" },
  { code: "fr", label: "🇫🇷 French" },
  { code: "de", label: "🇩🇪 German" },
  { code: "ja", label: "🇯🇵 Japanese" },
  { code: "zh", label: "🇨🇳 Chinese (Mandarin)" },
  { code: "ar", label: "🇸🇦 Arabic" },
  { code: "ru", label: "🇷🇺 Russian" },
  { code: "pt", label: "🇵🇹 Portuguese" },
  { code: "it", label: "🇮🇹 Italian" },
];

/* Speaker Color System */
const SPEAKER_COLORS = ["spk-1", "spk-2", "spk-3", "spk-4", "spk-5", "spk-6"];
const speakerClassMap = new Map();
let speakerColorIdx = 0;
function getSpeakerClass(name) {
  if (!name) return "spk-other";
  if (!speakerClassMap.has(name)) {
    speakerClassMap.set(name, SPEAKER_COLORS[speakerColorIdx++ % SPEAKER_COLORS.length]);
  }
  return speakerClassMap.get(name);
}

/* Format seconds -> m:ss */
function fmt(secs) {
  if (secs == null || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = String(Math.floor(secs % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/* ─────────────────────── Icons ─────────────────────────────── */
const IconLotus = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {/* Central Lotus Petal */}
    <path d="M12 2.5C10.5 6 9 9.5 9 13.5c0 2.2 1.34 4 3 4s3-1.8 3-4c0-4-1.5-7.5-3-11z" fill="currentColor" fillOpacity="0.2" />
    {/* Inner Left Petal */}
    <path d="M12 17.5c-3 0-6.5-1.5-8.5-5.5 2.2-1.2 5.2-1.5 8.5.5" />
    {/* Inner Right Petal */}
    <path d="M12 17.5c3 0 6.5-1.5 8.5-5.5-2.2-1.2-5.2-1.5-8.5.5" />
    {/* Outer Left Petal */}
    <path d="M3.5 12c-1.5 3-1.2 5.5.5 7 2.2 2 5.5 1 8-1.5" />
    {/* Outer Right Petal */}
    <path d="M20.5 12c1.5 3 1.2 5.5-.5 7-2.2 2-5.5 1-8-1.5" />
    {/* Base Calyx */}
    <path d="M7.5 21.5c2.5 1 6.5 1 9 0" strokeWidth="2" />
  </svg>
);

const IconWaveform = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4" />
  </svg>
);

const IconUpload = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);

const IconFingerprint = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/>
    <path d="M5 19.5C5.5 18 6 15 6 12c0-.7.1-1.4.3-2"/>
    <path d="M12 10a2 2 0 0 0-2 2c0 3.5-1 6.5-2 8.5"/>
    <path d="M12 6a6 6 0 0 1 6 6c0 3-1 6-2 8"/>
    <path d="M16 14c0 2-.5 4-1 6"/>
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const IconSparkles = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
  </svg>
);

/* ─────────────────────── App Component ──────────────────────── */
export default function App() {
  const [file, setFile]                   = useState(null);
  const [jobId, setJobId]                 = useState(null);
  const [videoUrl, setVideoUrl]           = useState(null);
  const [status, setStatus]               = useState("");
  const [selectedLang, setSelectedLang]   = useState("");
  const [taskMode, setTaskMode]           = useState("transcribe");
  const [transcripts, setTranscripts]     = useState([]);
  const [benchmarks, setBenchmarks]       = useState(null);
  const [allBenchmarks, setAllBenchmarks] = useState([]);
  const [currentTime, setCurrentTime]     = useState(0);
  const [playbackRate, setPlaybackRate]   = useState(1.0);

  // Tab State: 'transcript' vs 'intelligence'
  const [activeTab, setActiveTab]         = useState("transcript");
  const [intelligence, setIntelligence]   = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Enrolled Speakers Library
  const [enrolledSpeakers, setEnrolledSpeakers] = useState([]);
  const [voiceprintModalOpen, setVoiceprintModalOpen] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery]     = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("all");

  // Speaker Renaming & Enrollment Modal
  const [renameModal, setRenameModal]     = useState({ open: false, oldName: "", newName: "", saveVoiceprint: true });
  const [copySuccess, setCopySuccess]     = useState(false);
  const [enrollStatus, setEnrollStatus]   = useState("");

  const videoRef      = useRef(null);
  const transcriptRef = useRef(null);

  /* Poll active job status */
  useEffect(() => {
    let iv;
    if (jobId && status !== "completed" && status !== "error") {
      iv = setInterval(async () => {
        try {
          const res = await fetch(`/api/job/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            setStatus(data.job.status);
            setTranscripts(data.transcripts || []);
            setBenchmarks(data.benchmarks || null);
            if (data.job.status === "completed") {
              fetchIntelligence(jobId);
            }
          }
        } catch (e) {
          console.error("Poll error:", e);
        }
      }, 2000);
    }
    return () => clearInterval(iv);
  }, [jobId, status]);

  /* Fetch benchmarks and enrolled speakers on mount */
  const fetchBenchmarks = async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setAllBenchmarks(data.benchmarks || []);
      }
    } catch (e) {
      console.error("Failed to load benchmarks:", e);
    }
  };

  const fetchEnrolledSpeakers = async () => {
    try {
      const res = await fetch("/api/speakers/enrolled");
      if (res.ok) {
        const data = await res.json();
        setEnrolledSpeakers(data.enrolled || []);
      }
    } catch (e) {
      console.error("Failed to load enrolled speakers:", e);
    }
  };

  const fetchIntelligence = async (id) => {
    try {
      const res = await fetch(`/api/job/${id}/summary`);
      if (res.ok) {
        const data = await res.json();
        if (data.intelligence) {
          setIntelligence(data.intelligence);
        }
      }
    } catch (e) {
      console.error("Error fetching intelligence:", e);
    }
  };

  useEffect(() => {
    fetchBenchmarks();
    fetchEnrolledSpeakers();
  }, []);

  /* Auto-scroll to active transcript turn */
  useEffect(() => {
    const active = transcriptRef.current?.querySelector(".transcript-segment.active");
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentTime]);

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleRateChange = (rate) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setTranscripts([]);
    setBenchmarks(null);
    setIntelligence(null);
    setVideoUrl(URL.createObjectURL(file));

    const fd = new FormData();
    fd.append("file", file);

    const queryParams = new URLSearchParams();
    if (selectedLang) queryParams.set("language", selectedLang);
    if (taskMode) queryParams.set("task", taskMode);

    try {
      const res = await fetch(`/api/upload?${queryParams.toString()}`, { method: "POST", body: fd });
      const data = await res.json();
      setJobId(data.jobId);
      setStatus(data.status);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  /* Generate Gemini Meeting Intelligence */
  const handleGenerateIntelligence = async () => {
    if (!jobId) return;
    setIsSummarizing(true);
    try {
      const res = await fetch(`/api/job/${jobId}/summarize`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIntelligence(data.intelligence);
      }
    } catch (e) {
      console.error("Failed to generate intelligence:", e);
    } finally {
      setIsSummarizing(false);
    }
  };

  /* Rename Speaker across Job + Optional Multi-Sample Voiceprint Enrollment */
  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    const newName = renameModal.newName.trim();
    if (!newName || !jobId) return;

    try {
      if (renameModal.saveVoiceprint) {
        setEnrollStatus(`Enrolling '${newName}' voiceprint...`);
        await fetch("/api/speaker/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName,
            jobId,
            speakerName: renameModal.oldName
          })
        });
        setTimeout(() => {
          fetchEnrolledSpeakers();
          setEnrollStatus("");
        }, 2000);
      }

      const res = await fetch("/api/speaker/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          oldName: renameModal.oldName,
          newName
        })
      });
      if (res.ok) {
        setTranscripts(prev =>
          prev.map(t => t.speaker_name === renameModal.oldName ? { ...t, speaker_name: newName } : t)
        );
      }

      setRenameModal({ open: false, oldName: "", newName: "", saveVoiceprint: true });
    } catch (err) {
      console.error("Rename/Enroll failed:", err);
    }
  };

  /* Delete Enrolled Speaker (GDPR) */
  const handleDeleteEnrolled = async (id) => {
    try {
      const res = await fetch(`/api/speaker/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEnrolledSpeakers(prev => prev.filter(s => s.id !== id));
      }
    } catch (e) {
      console.error("Failed to delete enrolled speaker:", e);
    }
  };

  /* Speaker Dynamics & Talk-Time Analytics HUD Calculations */
  const speakerDynamics = useMemo(() => {
    if (transcripts.length === 0) return [];
    const stats = {};
    let totalDuration = 0;

    for (const t of transcripts) {
      const spk = t.speaker_name || "Unknown";
      const dur = Math.max(0.1, t.end_time - t.start_time);
      const words = t.text.trim().split(/\s+/).filter(Boolean).length;
      totalDuration += dur;

      if (!stats[spk]) {
        stats[spk] = { name: spk, duration: 0, turns: 0, words: 0 };
      }
      stats[spk].duration += dur;
      stats[spk].turns += 1;
      stats[spk].words += words;
    }

    return Object.values(stats).map(s => {
      const percent = totalDuration > 0 ? (s.duration / totalDuration) * 100 : 0;
      const wpm = s.duration > 0 ? Math.round((s.words / s.duration) * 60) : 0;
      return {
        ...s,
        percent: Math.round(percent),
        wpm
      };
    }).sort((a, b) => b.duration - a.duration);
  }, [transcripts]);

  /* Set of enrolled names for quick badge checks */
  const enrolledNameSet = useMemo(() => {
    return new Set(enrolledSpeakers.map(s => s.name.toLowerCase()));
  }, [enrolledSpeakers]);

  /* Filtered Transcripts */
  const filteredTranscripts = useMemo(() => {
    return transcripts.filter((t) => {
      const matchSpeaker = selectedSpeaker === "all" || t.speaker_name === selectedSpeaker;
      const matchQuery = !searchQuery.trim() || t.text.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSpeaker && matchQuery;
    });
  }, [transcripts, selectedSpeaker, searchQuery]);

  /* Export Handlers */
  const copyFullTranscript = () => {
    const text = transcripts.map(t => `[${fmt(t.start_time)} - ${fmt(t.end_time)}] ${t.speaker_name || "Unknown"}:\n${t.text}\n`).join("\n");
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  const downloadText = () => {
    const text = transcripts.map(t => `[${fmt(t.start_time)} - ${fmt(t.end_time)}] ${t.speaker_name || "Unknown"}:\n${t.text}\n`).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swar-transcript-${jobId || "export"}.txt`;
    a.click();
  };

  const downloadSRT = () => {
    const srt = transcripts.map((t, idx) => {
      const sH = String(Math.floor(t.start_time / 3600)).padStart(2, "0");
      const sM = String(Math.floor((t.start_time % 3600) / 60)).padStart(2, "0");
      const sS = String(Math.floor(t.start_time % 60)).padStart(2, "0");
      const sMS = String(Math.floor((t.start_time % 1) * 1000)).padStart(3, "0");

      const eH = String(Math.floor(t.end_time / 3600)).padStart(2, "0");
      const eM = String(Math.floor((t.end_time % 3600) / 60)).padStart(2, "0");
      const eS = String(Math.floor(t.end_time % 60)).padStart(2, "0");
      const eMS = String(Math.floor((t.end_time % 1) * 1000)).padStart(3, "0");

      return `${idx + 1}\n${sH}:${sM}:${sS},${sMS} --> ${eH}:${eM}:${eS},${eMS}\n${t.speaker_name ? `[${t.speaker_name}] ` : ""}${t.text}\n`;
    }).join("\n");

    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swar-subtitles-${jobId || "export"}.srt`;
    a.click();
  };

  /* Download Full Meeting Markdown (.md) */
  const downloadMarkdownReport = () => {
    let mdContent = intelligence?.raw_markdown;
    if (!mdContent) {
      mdContent = `# 🎙️ Swar (स्वर) Dialogue Transcript\n\n` +
        transcripts.map(t => `**[${fmt(t.start_time)} → ${fmt(t.end_time)}] ${t.speaker_name || "Unknown"}:**\n${t.text}\n`).join("\n");
    }
    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swar-report-${jobId || "export"}.md`;
    a.click();
  };

  /* Print / Save Formatted PDF */
  const handlePrintPDF = () => {
    window.print();
  };

  const isProcessing = status === "processing" || status === "uploading";

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="site-header">
        <div className="site-branding">
          <div className="site-logo-badge lotus-badge" title="Swar (स्वर) — Acoustic Speech Intelligence">
            <IconLotus />
          </div>
          <div>
            <h1 className="site-title">
              <span className="hindi-main-title">स्वर</span>
              <span className="latin-sub-badge">SWAR</span>
            </h1>
            <p className="site-tagline">Speech Intelligence &amp; Acoustic Graph Diarization Engine</p>
          </div>
        </div>

        <div className="header-telemetry-pills">
          <button
            className="telemetry-pill live action-pill"
            onClick={() => setVoiceprintModalOpen(true)}
            title="Open Voiceprint Profile Library"
          >
            <IconFingerprint />
            Voiceprint Library ({enrolledSpeakers.length})
          </button>
          <span className="telemetry-pill">🌐 99+ Languages</span>
          <span className="telemetry-pill">🛡️ 48h Storage Auto-Purge</span>
        </div>
      </header>

      {/* ── Upload & Configuration Hub ── */}
      <section className="upload-hub">
        <div className="upload-controls-row">
          {/* File Picker */}
          <div className="file-input-wrapper">
            <label className="file-label" htmlFor="file-input">
              <IconUpload />
              <span className="file-name-text">{file ? file.name : "Select or Drop Audio/Video File..."}</span>
            </label>
            <input
              id="file-input"
              type="file"
              accept="video/*,audio/*"
              onChange={handleFileChange}
            />
          </div>

          {/* Multilingual Selector */}
          <div className="config-control">
            <label className="control-label" htmlFor="lang-select">Language</label>
            <select
              id="lang-select"
              className="custom-select"
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              disabled={isProcessing}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Mode Selector */}
          <div className="config-control">
            <label className="control-label" htmlFor="task-select">Task</label>
            <select
              id="task-select"
              className="custom-select"
              value={taskMode}
              onChange={(e) => setTaskMode(e.target.value)}
              disabled={isProcessing}
            >
              <option value="transcribe">✍️ Transcribe Native Language</option>
              <option value="translate">🌐 Translate to English</option>
            </select>
          </div>

          {/* Submit Action */}
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!file || isProcessing}
          >
            {status === "uploading" ? "Uploading Media..." : status === "processing" ? "Transcribing & Diarizing..." : "Process Audio"}
          </button>
        </div>

        {/* Live Status Bar */}
        {(status || enrollStatus) && (
          <div className="job-status-banner">
            <div className="status-indicator">
              <span className={`status-dot ${status || "processing"}`} />
              <span className="status-text">
                {enrollStatus ? enrollStatus :
                  status === "uploading" ? "Uploading to storage..." :
                  status === "processing" ? "Running Whisper Turbo transcription & Graph Diarization on GPU..." :
                  status === "completed" ? "Job complete. Transcript synchronized below." :
                  status === "error" ? "Error processing audio." : ""}
              </span>
            </div>
            {jobId && <span className="job-id-tag">Job: {jobId.slice(0, 8)}</span>}
          </div>
        )}
      </section>

      {/* ── Main Media & Intelligence Grid ── */}
      <div className="main-grid">
        {/* Playback & Telemetry Column */}
        <div className="panel player-panel">
          <div className="panel-header">
            <span className="panel-title">Media Playback</span>
            {videoUrl && (
              <div className="rate-selector">
                {[1.0, 1.25, 1.5, 2.0].map((rate) => (
                  <button
                    key={rate}
                    className={`rate-btn ${playbackRate === rate ? "active" : ""}`}
                    onClick={() => handleRateChange(rate)}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="video-wrapper">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="video-element"
                onTimeUpdate={handleTimeUpdate}
              />
            ) : (
              <div className="video-empty">
                <IconWaveform />
                <p>Upload a video or audio file to preview playback and view synchronized speaker intelligence.</p>
              </div>
            )}
          </div>

          {/* Real-time Telemetry Metrics */}
          {benchmarks && (
            <div className="telemetry-grid">
              <div className="telemetry-card">
                <span className="telemetry-label">Language</span>
                <span className="telemetry-val">
                  {benchmarks.detected_language ? `🌐 ${benchmarks.detected_language.toUpperCase()}` : "🌐 Auto"}
                  {benchmarks.detected_prob ? ` (${(benchmarks.detected_prob * 100).toFixed(0)}%)` : ""}
                </span>
              </div>
              <div className="telemetry-card">
                <span className="telemetry-label">Whisper GPU</span>
                <span className="telemetry-val highlight">
                  {benchmarks.gpu_time_ms ? `${(benchmarks.gpu_time_ms / 1000).toFixed(2)}s` : "—"}
                </span>
              </div>
              <div className="telemetry-card">
                <span className="telemetry-label">Diarization</span>
                <span className="telemetry-val">
                  {benchmarks.cpu_time_ms ? `${(benchmarks.cpu_time_ms / 1000).toFixed(2)}s` : "—"}
                </span>
              </div>
              <div className="telemetry-card">
                <span className="telemetry-label">Total Time</span>
                <span className="telemetry-val">
                  {benchmarks.total_time_ms ? `${(benchmarks.total_time_ms / 1000).toFixed(2)}s` : "—"}
                </span>
              </div>
            </div>
          )}

          {/* Speaker Dynamics & Talk-Time Analytics HUD */}
          {speakerDynamics.length > 0 && (
            <div className="speaker-dynamics-section">
              <div className="dynamics-header">
                <span className="roster-heading">Speaker Dynamics &amp; Talk-Time</span>
              </div>
              
              {/* Talk Time Proportion Bar */}
              <div className="talk-time-bar-container">
                <div className="talk-time-bar">
                  {speakerDynamics.map((spk) => (
                    <div
                      key={spk.name}
                      className={`talk-time-slice ${getSpeakerClass(spk.name)}`}
                      style={{ width: `${spk.percent}%` }}
                      title={`${spk.name}: ${spk.percent}% talk time`}
                    />
                  ))}
                </div>
              </div>

              {/* Individual Dynamics Grid */}
              <div className="speaker-dynamics-grid">
                {speakerDynamics.map((spk) => {
                  const isEnrolled = enrolledNameSet.has(spk.name.toLowerCase());
                  return (
                    <div key={spk.name} className="dynamics-card">
                      <div className="dynamics-top">
                        <span className={`dynamics-name ${getSpeakerClass(spk.name)}`}>
                          {isEnrolled && "⭐ "}
                          {spk.name}
                        </span>
                        <span className="dynamics-percent">{spk.percent}%</span>
                      </div>
                      <div className="dynamics-stats">
                        <span>⏱️ {fmt(spk.duration)}</span>
                        <span>💬 {spk.turns} turns</span>
                        <span>⚡ {spk.wpm} WPM</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Speaker Roster Bar */}
          {speakerDynamics.length > 0 && (
            <div className="speaker-roster-section">
              <span className="roster-heading">Identified Speakers ({speakerDynamics.length}):</span>
              <div className="speaker-roster-chips">
                {speakerDynamics.map(({ name, turns }) => {
                  const isEnrolled = enrolledNameSet.has(name.toLowerCase());
                  return (
                    <button
                      key={name}
                      className={`speaker-chip-btn ${getSpeakerClass(name)}`}
                      onClick={() => setRenameModal({ open: true, oldName: name, newName: name, saveVoiceprint: true })}
                      title={`Click to rename / enroll ${name}`}
                    >
                      {isEnrolled && <span className="enrolled-badge-star" title="Enrolled Voiceprint Profile">⭐</span>}
                      <span>{name}</span>
                      <span className="roster-count">{turns} turns</span>
                      <IconEdit />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right View: Synchronized Dialogue OR Gemini Meeting Intelligence */}
        <div className="panel transcript-panel">
          <div className="panel-header transcript-header-row">
            {/* View Switcher Tabs */}
            <div className="tab-switcher">
              <button
                className={`tab-btn ${activeTab === "transcript" ? "active" : ""}`}
                onClick={() => setActiveTab("transcript")}
              >
                📝 Dialogue ({filteredTranscripts.length})
              </button>
              <button
                className={`tab-btn ${activeTab === "intelligence" ? "active" : ""}`}
                onClick={() => setActiveTab("intelligence")}
              >
                🧠 Gemini Intelligence {intelligence ? "✨" : ""}
              </button>
            </div>

            {/* Global Export Hub */}
            {transcripts.length > 0 && (
              <div className="transcript-actions">
                <button className="icon-btn" onClick={downloadMarkdownReport} title="Download Full Markdown Report (.md)">
                  <IconDownload /> .MD
                </button>
                <button className="icon-btn" onClick={handlePrintPDF} title="Print or Save Formatted PDF">
                  <IconDownload /> PDF
                </button>
                <button className="icon-btn" onClick={copyFullTranscript} title="Copy Transcript to Clipboard">
                  <IconCopy /> {copySuccess ? "Copied!" : "Copy"}
                </button>
                <button className="icon-btn" onClick={downloadSRT} title="Download Subtitles SRT">
                  SRT
                </button>
              </div>
            )}
          </div>

          {/* TAB 1: Synchronized Dialogue Transcript */}
          {activeTab === "transcript" && (
            <>
              {transcripts.length > 0 && (
                <div className="transcript-filters">
                  <div className="search-box">
                    <IconSearch />
                    <input
                      type="text"
                      placeholder="Search dialogue keywords..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="search-input"
                    />
                    {searchQuery && (
                      <button className="clear-search" onClick={() => setSearchQuery("")}>×</button>
                    )}
                  </div>

                  {speakerDynamics.length > 1 && (
                    <select
                      className="speaker-filter-select"
                      value={selectedSpeaker}
                      onChange={(e) => setSelectedSpeaker(e.target.value)}
                    >
                      <option value="all">All Speakers ({speakerDynamics.length})</option>
                      {speakerDynamics.map(({ name }) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="transcript-body" ref={transcriptRef}>
                {transcripts.length === 0 ? (
                  <div className="transcript-empty">
                    <IconWaveform />
                    <span>{isProcessing ? "Transcribing & identifying speakers..." : "Awaiting media upload"}</span>
                  </div>
                ) : filteredTranscripts.length === 0 ? (
                  <div className="transcript-empty">
                    <span>No dialogue matching "{searchQuery}"</span>
                  </div>
                ) : (
                  filteredTranscripts.map((t, i) => {
                    const isActive = currentTime >= t.start_time && currentTime <= t.end_time;
                    const isEnrolled = enrolledNameSet.has((t.speaker_name || "").toLowerCase());
                    return (
                      <div
                        key={t.id || i}
                        className={`transcript-segment${isActive ? " active" : ""}`}
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = t.start_time;
                            videoRef.current.play();
                          }
                        }}
                      >
                        <div className="segment-meta">
                          <button
                            className={`speaker-chip ${getSpeakerClass(t.speaker_name)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameModal({ open: true, oldName: t.speaker_name || "Unknown", newName: t.speaker_name || "", saveVoiceprint: true });
                            }}
                            title="Click to rename speaker / enroll voiceprint"
                          >
                            {isEnrolled && <span className="enrolled-badge-star" title="Enrolled Voiceprint Profile">⭐ </span>}
                            {t.speaker_name || "Unknown"}
                          </button>
                          <span className="segment-time">{fmt(t.start_time)} → {fmt(t.end_time)}</span>
                        </div>
                        <p className="segment-text">
                          {searchQuery ? highlightText(t.text, searchQuery) : t.text}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* TAB 2: Gemini Meeting Intelligence */}
          {activeTab === "intelligence" && (
            <div className="intelligence-body">
              {!intelligence && !isSummarizing && (
                <div className="intelligence-placeholder">
                  <IconSparkles />
                  <h3>Generate Executive Intelligence</h3>
                  <p>Use Google Gemini to extract executive summaries, key notes, speaker action items, and timestamped chapters from this conversation.</p>
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerateIntelligence}
                    disabled={transcripts.length === 0}
                  >
                    ✨ Generate Meeting Intelligence
                  </button>
                </div>
              )}

              {isSummarizing && (
                <div className="intelligence-placeholder">
                  <span className="status-dot processing" style={{ width: 16, height: 16 }} />
                  <h3>Analyzing Conversation with Gemini...</h3>
                  <p>Extracting key takeaways, speaker commitments, and chapter markers.</p>
                </div>
              )}

              {intelligence && (
                <div className="intelligence-content">
                  {/* Executive Summary */}
                  <div className="intelligence-card">
                    <h4 className="card-heading">🎯 Executive Summary</h4>
                    <p className="summary-text">{intelligence.executive_summary}</p>
                  </div>

                  {/* Chapters */}
                  {intelligence.chapters?.length > 0 && (
                    <div className="intelligence-card">
                      <h4 className="card-heading">📌 Timeline Chapters</h4>
                      <div className="chapters-list">
                        {intelligence.chapters.map((c, idx) => (
                          <button
                            key={idx}
                            className="chapter-chip"
                            onClick={() => {
                              if (videoRef.current) {
                                videoRef.current.currentTime = c.start_time || 0;
                                videoRef.current.play();
                              }
                            }}
                          >
                            <span className="chapter-time">{c.time_str}</span>
                            <span className="chapter-title">{c.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Notes */}
                  {intelligence.key_notes?.length > 0 && (
                    <div className="intelligence-card">
                      <h4 className="card-heading">📝 Key Takeaways &amp; Notes</h4>
                      <ul className="notes-list">
                        {intelligence.key_notes.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Items */}
                  {intelligence.action_items?.length > 0 && (
                    <div className="intelligence-card">
                      <h4 className="card-heading">✅ Action Items &amp; Commitments</h4>
                      <div className="action-items-list">
                        {intelligence.action_items.map((item, idx) => (
                          <div key={idx} className="action-item-row">
                            <input type="checkbox" className="action-checkbox" />
                            <div className="action-item-details">
                              <span className="action-speaker">@{item.speaker}</span>
                              <span className="action-task">{item.task}</span>
                            </div>
                            <span className={`priority-tag ${item.priority?.toLowerCase()}`}>
                              {item.priority}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Decisions */}
                  {intelligence.decisions?.length > 0 && (
                    <div className="intelligence-card">
                      <h4 className="card-heading">💡 Key Decisions Reached</h4>
                      <ul className="notes-list">
                        {intelligence.decisions.map((d, idx) => (
                          <li key={idx}>✅ {d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Speaker Renaming & Enrollment Modal ── */}
      {renameModal.open && (
        <div className="modal-backdrop" onClick={() => setRenameModal({ open: false, oldName: "", newName: "", saveVoiceprint: true })}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Rename &amp; Enroll Speaker</h3>
            <p className="modal-subtitle">
              Rename <strong>{renameModal.oldName}</strong> across all turns in this recording.
            </p>

            <form onSubmit={handleRenameSubmit}>
              <input
                type="text"
                className="modal-input"
                placeholder="e.g. Raj Shamani, Sally, John"
                value={renameModal.newName}
                onChange={(e) => setRenameModal(prev => ({ ...prev, newName: e.target.value }))}
                autoFocus
              />

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={renameModal.saveVoiceprint}
                  onChange={(e) => setRenameModal(prev => ({ ...prev, saveVoiceprint: e.target.checked }))}
                />
                <span>Save/Update voiceprint in library (multi-sample Gaussian profile)</span>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRenameModal({ open: false, oldName: "", newName: "", saveVoiceprint: true })}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Voiceprint Library Modal (GDPR Compliant) ── */}
      {voiceprintModalOpen && (
        <div className="modal-backdrop" onClick={() => setVoiceprintModalOpen(false)}>
          <div className="modal-card voiceprint-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-title">Voiceprint Library</h3>
              <button className="clear-search" onClick={() => setVoiceprintModalOpen(false)}>×</button>
            </div>
            <p className="modal-subtitle">
              Enrolled acoustic profiles used for cross-recording speaker identification.
            </p>

            {enrolledSpeakers.length === 0 ? (
              <div className="voiceprint-empty">
                <IconFingerprint />
                <p>No voiceprints enrolled yet. Click any speaker chip in a transcript to enroll their voice.</p>
              </div>
            ) : (
              <div className="voiceprint-list">
                {enrolledSpeakers.map((spk) => (
                  <div key={spk.id} className="voiceprint-item">
                    <div className="voiceprint-info">
                      <span className="voiceprint-name">⭐ {spk.name}</span>
                      <span className="voiceprint-meta">{spk.sample_count} Gaussian samples • {new Date(spk.updated_at).toLocaleDateString()}</span>
                    </div>
                    <button
                      className="icon-btn danger"
                      onClick={() => handleDeleteEnrolled(spk.id)}
                      title="Delete Voiceprint Profile (GDPR)"
                    >
                      <IconTrash /> Delete
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setVoiceprintModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Telemetry & Historical Benchmarks ── */}
      <div className="benchmarks-panel">
        <div className="panel-header">
          <span className="panel-title">System Performance Telemetry</span>
          {allBenchmarks.length > 0 && (
            <span className="panel-badge">{allBenchmarks.length} jobs completed</span>
          )}
        </div>

        {allBenchmarks.length === 0 ? (
          <p className="benchmarks-empty">No previous jobs recorded yet.</p>
        ) : (
          <div className="benchmarks-table-wrapper">
            <table className="benchmarks-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Language</th>
                  <th>Upload</th>
                  <th>Whisper GPU</th>
                  <th>Diarization</th>
                  <th>Total Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allBenchmarks.slice(0, 10).map((b) => (
                  <tr key={b.job_id}>
                    <td className="mono-cell">{b.job_id ? b.job_id.slice(0, 8) : "—"}</td>
                    <td>{b.detected_language ? `🌐 ${b.detected_language.toUpperCase()}` : "🌐 Auto"}</td>
                    <td>{b.upload_time_ms ? `${b.upload_time_ms} ms` : "—"}</td>
                    <td className="highlight-cell">{b.gpu_time_ms ? `${(b.gpu_time_ms / 1000).toFixed(2)}s` : "—"}</td>
                    <td>{b.cpu_time_ms ? `${(b.cpu_time_ms / 1000).toFixed(2)}s` : "—"}</td>
                    <td className="bold-cell">{b.total_time_ms ? `${(b.total_time_ms / 1000).toFixed(2)}s` : "—"}</td>
                    <td><span className="status-chip completed">Completed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* Helper to highlight search keywords in transcript */
function highlightText(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="search-highlight">{part}</mark>
    ) : (
      part
    )
  );
}

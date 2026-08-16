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

  /* Rename Speaker across Job + Optional Multi-Sample Voiceprint Enrollment */
  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    const newName = renameModal.newName.trim();
    if (!newName || !jobId) return;

    try {
      // 1. Rename in database
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

      // 2. Optionally enroll into multi-sample voiceprint library
      if (renameModal.saveVoiceprint) {
        setEnrollStatus("Enrolling voiceprint...");
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
        }, 3000);
      }

      setRenameModal({ open: false, oldName: "", newName: "", saveVoiceprint: true });
    } catch (err) {
      console.error("Rename/Enroll failed:", err);
    }
  };

  /* Delete Enrolled Speaker (GDPR / Right to be forgotten) */
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

  /* Distinct Speaker List with Counts */
  const speakerStats = useMemo(() => {
    const counts = {};
    for (const t of transcripts) {
      const name = t.speaker_name || "Unknown";
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
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
    a.download = `vocalis-transcript-${jobId || "export"}.txt`;
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
    a.download = `vocalis-subtitles-${jobId || "export"}.srt`;
    a.click();
  };

  const isProcessing = status === "processing" || status === "uploading";

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="site-header">
        <div className="site-branding">
          <div className="site-logo-badge">
            <IconWaveform />
          </div>
          <div>
            <h1 className="site-title">Vocalis</h1>
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
          <span className="telemetry-pill">🛡️ 48h Storage Lifecycle Active</span>
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

          {/* Speaker Roster Bar */}
          {speakerStats.length > 0 && (
            <div className="speaker-roster-section">
              <span className="roster-heading">Identified Speakers ({speakerStats.length}):</span>
              <div className="speaker-roster-chips">
                {speakerStats.map(({ name, count }) => {
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
                      <span className="roster-count">{count} turns</span>
                      <IconEdit />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Transcript Column */}
        <div className="panel transcript-panel">
          <div className="panel-header transcript-header-row">
            <div className="transcript-title-group">
              <span className="panel-title">Transcript</span>
              {transcripts.length > 0 && (
                <span className="panel-badge">{filteredTranscripts.length} turns</span>
              )}
            </div>

            {/* Transcript Actions */}
            {transcripts.length > 0 && (
              <div className="transcript-actions">
                <button className="icon-btn" onClick={copyFullTranscript} title="Copy Full Transcript">
                  <IconCopy /> {copySuccess ? "Copied!" : "Copy"}
                </button>
                <button className="icon-btn" onClick={downloadText} title="Download TXT">
                  <IconDownload /> TXT
                </button>
                <button className="icon-btn" onClick={downloadSRT} title="Download Subtitles SRT">
                  <IconDownload /> SRT
                </button>
              </div>
            )}
          </div>

          {/* Search & Filter Controls */}
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

              {speakerStats.length > 1 && (
                <select
                  className="speaker-filter-select"
                  value={selectedSpeaker}
                  onChange={(e) => setSelectedSpeaker(e.target.value)}
                >
                  <option value="all">All Speakers ({speakerStats.length})</option>
                  {speakerStats.map(({ name }) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Transcript Scroll Area */}
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

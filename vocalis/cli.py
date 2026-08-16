import argparse
import sys
import os
from .pipeline import VocalisEngine


def main():
    parser = argparse.ArgumentParser(
        prog="vocalis",
        description="🎙️ Vocalis — Speech Intelligence & Acoustic Graph Diarization CLI"
    )
    parser.add_argument("input", help="Path to input audio or video file (.mp3, .wav, .mp4, .m4a, .webm)")
    parser.add_argument("--lang", default=None, help="Spoken language ISO code (e.g. 'en', 'hi', 'es'). Default: auto-detect.")
    parser.add_argument("--task", default="transcribe", choices=["transcribe", "translate"], help="Task mode: 'transcribe' or 'translate' to English.")
    parser.add_argument("--model", default="turbo", help="Faster-Whisper model size ('turbo', 'base', 'small', 'medium', 'large-v3').")
    parser.add_argument("--device", default=None, choices=["cuda", "cpu"], help="Inference device (default: auto-detect CUDA).")
    parser.add_argument("--export-srt", default=None, help="Export subtitle file (.srt)")
    parser.add_argument("--export-txt", default=None, help="Export text transcript (.txt)")
    parser.add_argument("--export-md", default=None, help="Export markdown report (.md)")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file '{args.input}' does not exist.", file=sys.stderr)
        sys.exit(1)

    print(f"[Vocalis CLI] Processing '{args.input}'...")
    engine = VocalisEngine(whisper_model=args.model, device=args.device)
    result = engine.process(args.input, language=args.lang, task=args.task)

    print(f"\n✨ Processing Complete!")
    print(f"  Detected Language: {result.language.upper()} ({result.language_prob*100:.1f}%)")
    print(f"  Speakers Identified ({len(result.speakers)}): {', '.join(result.speakers)}")
    print(f"  Total Dialogue Turns: {len(result.turns)}\n")
    print("=" * 60)

    for turn in result.turns:
        m_s = int(turn.start // 60)
        s_s = int(turn.start % 60)
        m_e = int(turn.end // 60)
        s_e = int(turn.end % 60)
        print(f"[{m_s}:{s_s:02} → {m_e}:{s_e:02}] {turn.speaker}: {turn.text}")

    print("=" * 60)

    if args.export_srt:
        with open(args.export_srt, "w", encoding="utf-8") as f:
            f.write(result.to_srt())
        print(f"📁 Exported subtitles to: {args.export_srt}")

    if args.export_txt:
        with open(args.export_txt, "w", encoding="utf-8") as f:
            f.write(result.to_txt())
        print(f"📁 Exported text transcript to: {args.export_txt}")

    if args.export_md:
        with open(args.export_md, "w", encoding="utf-8") as f:
            f.write(result.to_markdown())
        print(f"📁 Exported Markdown report to: {args.export_md}")


if __name__ == "__main__":
    main()

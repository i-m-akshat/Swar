from setuptools import setup, find_packages

setup(
    name="swar",
    version="1.0.0",
    description="Swar (स्वर) — Speech Intelligence & Acoustic Graph Diarization Engine",
    author="Swar Open Source Team",
    packages=find_packages(),
    install_requires=[
        "torch>=2.0.0",
        "torchaudio>=2.0.0",
        "faster-whisper>=1.0.0",
        "speechbrain>=1.0.0",
        "numpy>=1.22.0",
        "scipy>=1.10.0",
        "scikit-learn>=1.2.0"
    ],
    entry_points={
        "console_scripts": [
            "swar=swar.cli:main",
        ],
    },
    python_requires=">=3.9",
)

# Speechlytic-AI-based-DLD-Screening-System-
VocaSense is an AI-powered speech analytics platform designed to support early screening research for Developmental Language Disorder (DLD) in children. It analyses speech recordings using acoustic and linguistic features, offering story-based assessments, audio analysis, research insights, visual reports and access to speech-language resources.



🌟 Key Features

Audio Recording & Upload: Record speech through a microphone or upload WAV recordings.

Audio Quality Assessment: Evaluate recording duration, sample rate, channels, clipping and audio quality.

Acoustic Feature Extraction: Analyse pitch, MFCCs, RMS energy, silence fraction, zero-crossing rate and spectral characteristics.

Story-Based Assessment: Interactive reading activities designed for different age groups.

Speech Analytics: Generate analytical reports from recorded speech.

Research Dataset Management: Organise recordings and participant metadata.

Comparative Analysis: Compare acoustic measurements across recordings.

AI Chatbot: Planned DLD information assistant.

SLP Directory: Planned directory of speech-language pathologists.

🛠️ Technology Stack

Component

Technology

Frontend

Next.js, React, TypeScript

Backend

Python, FastAPI

Audio Processing

Librosa, SoundFile, NumPy

Machine Learning

Scikit-learn

Data Visualisation

React / Custom UI

API Communication

REST API

📁 Project Structure

VocaSense/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   └── types/
│   └── package.json
│
├── backend/
│   ├── app/
│   ├── models/
│   ├── dataset/
│   └── requirements.txt
│
└── README.md

The structure above is an illustrative overview; adapt it to the actual repository.

🚀 Getting Started

Prerequisites

Python 3.11+

Node.js 22+

npm

Git

1. Clone the Repository

git clone YOUR_REPOSITORY_URL
cd VocaSense

2. Start the Backend

cd backend
python -m venv venv

Activate the environment:

Windows:

.\venv\Scripts\Activate.ps1

Install dependencies:

pip install -r requirements.txt

Start FastAPI:

python -m uvicorn app.main:app --reload

Backend: http://127.0.0.1:8000

API documentation: http://127.0.0.1:8000/docs

3. Start the Frontend

Open another terminal:

cd frontend
npm install
npm run dev

Frontend: http://localhost:3000

🔬 Research Scope

VocaSense focuses on exploring acoustic and linguistic characteristics associated with children's speech and language development. Its research direction includes feature extraction, narrative speech analysis, comparative studies and machine-learning experimentation.

Future development aims to incorporate appropriately labelled datasets and validated assessment methodologies.

⚠️ Research & Clinical Disclaimer

VocaSense is an experimental research prototype. Its outputs are exploratory observations and must not be interpreted as a diagnosis, clinical risk score or definitive identification of DLD. It does not replace assessment by qualified speech-language professionals.

All research involving children's recordings must follow applicable consent, privacy, ethics and data-protection requirements.

🗺️ Future Roadmap

Improved acoustic and linguistic analysis.

Integration of clinically characterised research datasets.

Supervised machine-learning experimentation.

Enhanced narrative and phonological analysis.

AI-powered DLD information chatbot.

Speech-language pathologist directory.

Multilingual research support.

👨‍💻 Project Information

Project: VocaSense
Domain: Artificial Intelligence | Speech Analytics | HealthTech
Research Focus: Developmental Language Disorder (DLD)
Application: Web-Based Research Platform

VocaSense — Technology that listens, analyses and supports better understanding of children's communication development.

<div align="center">
<img width="800" height="260" alt="speechlytic-logo" src="https://github.com/user-attachments/assets/c18fd399-98a8-48b7-88a3-80442c61b51c" />

# Speechlytic

### AI-Powered Speech & Language Analytics

**Understand Every Voice. Unlock Every Potential.**

---

## 📖 About the Project

Speechlytic is an AI-powered speech and language analytics platform developed to support early-screening research into **Developmental Language Disorder (DLD) in children**. The project explores how artificial intelligence, digital audio processing and language analysis can be combined to study children's speech and communication development.

The platform provides an integrated environment for collecting speech samples, analysing audio recordings, extracting acoustic characteristics and organising research data. It aims to help researchers explore variations in children's speech patterns through measurable audio features and structured speech activities.

Speechlytic focuses on combining acoustic analysis with language-oriented assessment activities to create a more comprehensive research environment for understanding speech and language development.

## 🎯 Project Objectives

- Explore the application of AI and machine learning in child speech analysis.
- Extract meaningful acoustic features from children's speech recordings.
- Support structured speech collection through story-based reading activities.
- Investigate acoustic and linguistic patterns associated with language development.
- Provide an organised environment for managing research recordings and participant metadata.
- Encourage evidence-based research into early identification of potential language difficulties.
- Develop a foundation for future supervised machine-learning experiments using appropriately labelled datasets.

## ✨ Key Features

### 🎙️ Audio Recording & Upload

- Record speech directly through the browser microphone.
- Upload existing WAV audio recordings.
- Manage multiple recordings within a research session.
- Preview and listen to recorded audio.

### 🔊 Audio Quality Assessment

- Validate WAV file formats and recording properties.
- Measure audio duration, sample rate and channel information.
- Examine signal energy and peak amplitude.
- Identify clipping and potential recording-quality issues.

### 📊 Acoustic Feature Extraction

Speechlytic extracts measurable acoustic characteristics, including:

- Mel-Frequency Cepstral Coefficients (MFCCs).
- Root Mean Square (RMS) energy.
- Zero-Crossing Rate (ZCR).
- Spectral Centroid.
- Fundamental Frequency (Pitch).
- Silence Fraction.
- Waveform characteristics.

These measurements support exploratory analysis and comparison of speech recordings.

### 📚 Story-Based Speech Assessment

- Interactive reading activities for different child age groups.
- Structured speech collection using age-appropriate passages.
- Recording and organisation of story-reading samples.
- Exploration of narrative and reading-related speech characteristics.

### 📈 Speech Analytics & Visualisation

- Generate analytical reports from audio recordings.
- Visualise extracted acoustic measurements.
- Display waveform representations.
- Examine MFCC characteristics and other audio features.
- Compare completed recordings through analytical reports.

### 🗂️ Research Dataset Management

- Organise speech recordings.
- Maintain participant-related metadata.
- Track recording status and audio quality.
- Filter and compare research samples.
- Export research metadata and analytical measurements.

### 🤖 AI Chatbot (Planned)

A conversational assistant designed to provide general information about Developmental Language Disorder, speech and language development, and relevant research resources.

### 🩺 Speech-Language Pathologist Directory (Planned)

A directory intended to help users discover speech-language professionals and explore available assessment resources.

## 🧠 Artificial Intelligence & Machine Learning

Speechlytic incorporates audio feature extraction and machine-learning experimentation to investigate measurable patterns in children's speech.

The current research direction includes acoustic feature analysis, exploratory pattern comparison and experimentation with machine-learning techniques.

Future development aims to introduce supervised learning using clinically characterised datasets containing appropriate participant information and reliable reference labels.

The objective is to investigate whether combinations of acoustic and linguistic features can provide useful insights for research into developmental language difficulties.

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Backend | Python, FastAPI |
| Audio Processing | Librosa, SoundFile, NumPy |
| Machine Learning | Scikit-learn |
| API Communication | REST API |
| Development Environment | Node.js, Python |

## 🏗️ System Architecture

Speechlytic follows a frontend-backend architecture.

**Frontend Layer:** Provides the user interface for audio recording, file uploads, story-based activities, dataset management and analytical visualisation.

**Backend Layer:** Handles audio-processing requests, feature extraction, analysis operations and communication with the machine-learning components.

**Audio Processing Layer:** Processes uploaded recordings and extracts acoustic measurements for further analysis.

**Machine Learning Layer:** Provides the foundation for experimental pattern analysis and future supervised modelling.

**Research Output Layer:** Presents analytical measurements, comparative results and research-oriented reports.

## 🚀 Getting Started

### Prerequisites

Ensure the following tools are installed:

- Python 3.11 or later
- Node.js 22 or later
- npm
- Git

### Clone the Repository

```bash
git clone YOUR_REPOSITORY_URL
cd Speechlytic
```

### Backend Setup

Navigate to the backend directory:

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

**Windows PowerShell:**

```powershell
.\venv\Scripts\Activate.ps1
```

Install the required dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI development server:

```bash
python -m uvicorn app.main:app --reload
```

**Backend URL:** `http://127.0.0.1:8000`

**API Documentation:** `http://127.0.0.1:8000/docs`

### Frontend Setup

Open another terminal and navigate to the frontend directory:

```bash
cd frontend
npm install
npm run dev
```

**Frontend URL:** `http://localhost:3000`

Keep both the frontend and backend servers running while using the application.

## 🔬 Research Scope

The primary research focus of Speechlytic is the exploration of acoustic and linguistic characteristics associated with Developmental Language Disorder in children.

The research scope includes:

1. Audio signal processing and acoustic feature extraction.
2. Exploration of speech patterns across different age groups.
3. Story-based speech collection and narrative analysis.
4. Comparative analysis of acoustic measurements.
5. Organisation of appropriately characterised research datasets.
6. Investigation of machine-learning approaches for speech and language research.
7. Future integration of acoustic and linguistic analysis.

## 🗺️ Future Roadmap

- [ ] Improve acoustic feature extraction and analysis.
- [ ] Identify and integrate suitable DLD research datasets.
- [ ] Develop supervised machine-learning models using reliable reference labels.
- [ ] Introduce more comprehensive linguistic analysis.
- [ ] Enhance narrative and phonological analysis.
- [ ] Develop the AI-powered DLD information chatbot.
- [ ] Integrate the speech-language pathologist directory.
- [ ] Explore multilingual speech analysis.
- [ ] Improve research reporting and data visualisation.
- [ ] Evaluate model performance using independent test datasets.

## ⚠️ Research & Clinical Disclaimer

Speechlytic is an experimental research prototype developed for educational and research purposes.

Its outputs represent exploratory acoustic measurements and analytical observations. They must not be interpreted as a medical diagnosis, clinical risk score or definitive identification of Developmental Language Disorder.

The platform does not replace professional speech-language assessment, clinical evaluation or consultation with qualified healthcare professionals.

Research involving children's speech recordings must follow appropriate ethical approvals, informed-consent procedures, privacy safeguards and applicable data-protection requirements.

## 👥 Project Information

| Category | Details |
|---|---|
| Project Name | Speechlytic |
| Project Domain | Artificial Intelligence & Speech Analytics |
| Research Area | Developmental Language Disorder |
| Application Type | Web-Based Research Platform |
| Initial Language Focus | English |
| Primary Purpose | Speech and Language Research |

---

### Speechlytic

**Understand Every Voice. Unlock Every Potential.**

*Exploring the possibilities of AI for children's speech and language development.*


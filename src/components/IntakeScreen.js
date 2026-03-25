import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDIDAgent } from '../hooks/useDIDAgent';
import { useDeepgramTranscription } from '../hooks/useDeepgramTranscription';
import './IntakeScreen.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

const PHASE = {
  MIC_PERMISSION: 'mic_permission',
  CONNECTING: 'connecting',
  GREETING: 'greeting',
  WAITING_START: 'waiting_start',
  ASKING: 'asking',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  FINAL_COMMENTS: 'final_comments',
  COMPLETE: 'complete',
};

export default function IntakeScreen({ sessionId, onComplete }) {
  const [phase, setPhase] = useState(PHASE.CONNECTING);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [liveTranscript, setLiveTranscript] = useState('');
  const [summary, setSummary] = useState(null);
  const [patientVideoStream, setPatientVideoStream] = useState(null);

  // Dialog log: { role: 'avatar'|'patient', text, timestamp }
  const [dialogLog, setDialogLog] = useState([]);

  const videoRef = useRef(null);
  const patientVideoRef = useRef(null);
  const dialogEndRef = useRef(null);
  const isSubmittingRef = useRef(false);

  const { connectionState, isSpeaking, connect, speak, disconnect } = useDIDAgent(videoRef);

  // ─── Add message to dialog log ─────────────────────────────────────────────
  const addDialog = useCallback((role, text) => {
    setDialogLog(prev => [...prev, { role, text, id: Date.now() + Math.random() }]);
  }, []);

  // ─── Auto-scroll dialog ────────────────────────────────────────────────────
  useEffect(() => {
    dialogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dialogLog]);

  // ─── Transcription callbacks ───────────────────────────────────────────────
  const handleFinalTranscript = useCallback(async (text) => {
    if (!text.trim() || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    addDialog('patient', text);
    setLiveTranscript('');
    
    // Check if we're in final comments phase
    if (phase === PHASE.FINAL_COMMENTS) {
      await submitFinalComments(text);
    } else {
      setPhase(PHASE.PROCESSING);
      await submitAnswer(text);
    }
    
    isSubmittingRef.current = false;
  }, [phase]); // eslint-disable-line

  const handleInterimTranscript = useCallback((text) => {
    setLiveTranscript(text);
  }, []);

  const {
    isListening,
    isSpeechActive,
    transcript,
    micPermission,
    requestMicPermission,
    startListening,
    stopListening,
    resetTranscript,
  } = useDeepgramTranscription({
    onFinalTranscript: handleFinalTranscript,
    onInterimTranscript: handleInterimTranscript,
  });

  const handleRequestMic = async () => {
    const granted = await requestMicPermission();
    if (granted) {
      // Microphone access granted
    } else {
      // Microphone denied — avatar still starts, use toggle to enable later
    }
  };

  // ─── Step 2: connect D-ID + camera ────────────────────────────────────────
  const startConnect = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setPatientVideoStream(stream);
    } catch (err) {
      console.warn('Camera denied:', err);
    }
    await connect();
  };

  useEffect(() => {
    if (patientVideoRef.current && patientVideoStream) {
      patientVideoRef.current.srcObject = patientVideoStream;
    }
  }, [patientVideoStream]);

  // ─── When D-ID connects, load greeting ────────────────────────────────────
  useEffect(() => {
    if (phase === PHASE.CONNECTING) {
      startConnect();
    }
  }, [phase]);

  useEffect(() => {
    if (connectionState === 'connected' && phase === PHASE.CONNECTING) {
      loadGreeting();
    }
    if (connectionState === 'error') {
      // Connection issue. Please refresh.
    }
  }, [connectionState, phase]); // eslint-disable-line

  const loadGreeting = async () => {
    setPhase(PHASE.GREETING);
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/greeting`);
      const data = await res.json();
      addDialog('avatar', data.message);
      await speak(data.message);
      setPhase(PHASE.WAITING_START);
    } catch (err) {
      console.error('Greeting error:', err);
    }
  };

  const handleStartIntake = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/start`, { method: 'POST' });
      const data = await res.json();
      setCurrentQuestion(data.question);
      setProgress(data.progress);
      setPhase(PHASE.ASKING);
      addDialog('avatar', data.question);
      await speak(data.question);
      resetTranscript();
      setPhase(PHASE.LISTENING);
      startListening();
    } catch (err) {
      console.error('Start error:', err);
    }
  };

  // ─── Submit answer, get next question ─────────────────────────────────────
  const submitAnswer = async (answer) => {
    stopListening();
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, rawTranscript: answer }),
      });
      const data = await res.json();

      // Handle name retry
      if (data.requiresRetry) {
        setPhase(PHASE.ASKING);
        addDialog('avatar', data.question);
        await speak(data.question);
        resetTranscript();
        setPhase(PHASE.LISTENING);
        startListening();
        return;
      }

      // Handle final comments phase
      if (data.state === 'final_comments') {
        setPhase(PHASE.FINAL_COMMENTS);
        addDialog('avatar', data.question);
        await speak(data.question);
        resetTranscript();
        setPhase(PHASE.LISTENING);
        startListening();
        return;
      }

      // Handle completion
      if (data.state === 'complete') {
        setSummary(data.summary);
        setPhase(PHASE.COMPLETE);
        addDialog('avatar', data.message);
        await speak(data.message);
        if (onComplete) onComplete(data.summary);
        return;
      }

      // Handle follow-up questions
      if (data.isFollowUp) {
        setCurrentQuestion(data.question);
        setPhase(PHASE.ASKING);
        addDialog('avatar', data.question);
        await speak(data.question);
        resetTranscript();
        setPhase(PHASE.LISTENING);
        startListening();
        return;
      }

      // Normal next question flow
      setCurrentQuestion(data.question);
      setProgress(data.progress);
      setPhase(PHASE.ASKING);
      addDialog('avatar', data.question);
      await speak(data.question);
      resetTranscript();
      setPhase(PHASE.LISTENING);
      startListening();
    } catch (err) {
      console.error('Submit error:', err);
    }
  };

  // ─── Submit final comments and complete ────────────────────────────────────
  const submitFinalComments = async (comments) => {
    stopListening();
    try {
      setPhase(PHASE.PROCESSING);
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/final-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalComments: comments }),
      });
      const data = await res.json();

      setSummary(data.summary);
      setPhase(PHASE.COMPLETE);
      addDialog('avatar', data.message);
      await speak(data.message);
      if (onComplete) onComplete(data.summary);
    } catch (err) {
      console.error('Final comments error:', err);
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
      stopListening();
      patientVideoStream?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="intake-screen">

      {/* ── LEFT PANEL: Avatar ─────────────────────────────────── */}
      <div className="panel avatar-panel">
        <div className="panel-top-row">
          <div className="panel-label">Care Assistant</div>
          {progress.total > 0 && phase !== PHASE.COMPLETE && (
            <div className="progress-pill">{progress.current}/{progress.total}</div>
          )}
        </div>

        {/* Avatar video */}
        <div className="video-wrapper">
          <video ref={videoRef} autoPlay playsInline className="avatar-video" />
          {connectionState !== 'connected' && (
            <div className="video-overlay">
              <div className="connecting-pulse" />
              <span>{connectionState === 'error' ? 'Connection failed' : 'Connecting…'}</span>
            </div>
          )}
          {isSpeaking && (
            <div className="speaking-indicator">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          )}
        </div>

        {/* Dialog log */}
        <div className="dialog-log">
          <div className="dialog-log-label">Conversation</div>
          <div className="dialog-messages">
            {dialogLog.map((msg) => (
              <div key={msg.id} className={`dialog-bubble ${msg.role}`}>
                <div className="bubble-role">{msg.role === 'avatar' ? 'Assistant' : 'You'}</div>
                <div className="bubble-text">{msg.text}</div>
              </div>
            ))}
            {/* Live patient transcript as a ghost bubble */}
            {isListening && liveTranscript && (
              <div className="dialog-bubble patient live">
                <div className="bubble-role">You <span className="live-badge">live</span></div>
                <div className="bubble-text">{liveTranscript}</div>
              </div>
            )}
            <div ref={dialogEndRef} />
          </div>
        </div>

        {/* Status / controls */}
        <div className="controls-area">
          {phase === PHASE.WAITING_START && (
            <button className="action-btn primary" onClick={handleStartIntake} disabled={phase === PHASE.GREETING}>
              Begin Health Screening <span className="btn-arrow">→</span>
            </button>
          )}
          {phase === PHASE.LISTENING && (
            <div className="vad-status">
              <div className={`vad-ring ${isSpeechActive ? 'active' : ''}`}>
                {/* <svg viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor"/>
                  <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg> */}
              </div>
              <span className="vad-label">
                {isSpeechActive ? 'Listening…' : 'Waiting for your response'}
              </span>
            </div>
          )}
          {phase === PHASE.PROCESSING && (
            <div className="processing-indicator">
              <span className="processing-spinner" /> Processing…
            </div>
          )}
        </div>

        {/* Progress bar */}
        {progress.total > 0 && phase !== PHASE.COMPLETE && (
          <div className="progress-bar-wrap">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL: Patient camera ────────────────────────── */}
      <div className="panel patient-panel">
        <div className="panel-top-row">
          <div className="panel-label">Patient</div>
          {micPermission !== 'granted' && (
            <button
              className="mic-request-icon-btn"
              onClick={handleRequestMic}
              disabled={micPermission === 'requesting'}
              title={micPermission === 'requesting' ? 'Requesting microphone...' : 'Request microphone access'}
            >
              {micPermission === 'requesting' ? '⏳' : '🎤'}
            </button>
          )}
          {isListening && (
            <div className="mic-status-pill">
              <span className={`mic-status-dot ${isSpeechActive ? 'speaking' : ''}`} />
              {isSpeechActive ? 'Speaking' : 'Mic Active'}
            </div>
          )}
        </div>

        {/* Patient camera */}
        <div className="patient-video-wrapper">
          <video
            ref={patientVideoRef}
            autoPlay playsInline muted
            className="patient-video"
          />
          {!patientVideoStream && (
            <div className="no-camera">
              <span className="no-camera-icon">◉</span>
              <p>Camera not available</p>
            </div>
          )}
          {/* VAD voice activity overlay ring */}
          {isSpeechActive && <div className="vad-camera-ring" />}
        </div>

        {/* Completion */}
        {phase === PHASE.COMPLETE && summary && (
          <div className="completion-badge">
            <span className="completion-icon">✓</span>
            <div>
              <strong>Intake Complete</strong>
              <p>{summary.answeredQuestions} questions answered</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
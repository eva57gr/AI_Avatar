import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDIDAgent } from '../hooks/useDIDAgent';
import { useDeepgramTranscription } from '../hooks/useDeepgramTranscription';
import './IntakeScreen.css';

function getBackendUrl() {
  const raw = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return raw.replace(/^http:\/\//, 'https://');
  }
  return raw;
}
const BACKEND_URL = getBackendUrl();

const PHASE = {
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  PROCESSING: 'processing',
  COMPLETE: 'complete',
};

export default function IntakeScreen({ sessionId, onComplete }) {
  const [phase, setPhase] = useState(PHASE.CONNECTING);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [liveTranscript, setLiveTranscript] = useState('');
  const [summary, setSummary] = useState(null);
  const [patientVideoStream, setPatientVideoStream] = useState(null);
  const [dialogLog, setDialogLog] = useState([]);

  const videoRef = useRef(null);
  const patientVideoRef = useRef(null);
  const dialogEndRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const phaseRef = useRef(phase);
  const isSpeakingRef = useRef(false);

  const { connectionState, isSpeaking, connect, speak, interrupt, disconnect } = useDIDAgent(videoRef);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  const addDialog = useCallback((role, text) => {
    setDialogLog(prev => [...prev, { role, text, id: Date.now() + Math.random() }]);
  }, []);

  useEffect(() => {
    dialogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dialogLog]);

  // ─── Submit answer to backend, speak the response ───────────────────────────
  const submitAnswerRef = useRef(null);

  const submitAnswer = async (answer) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, rawTranscript: answer }),
      });
      const data = await res.json();

      resetTranscript();

      if (data.state === 'complete') {
        setSummary(data.summary);
        setPhase(PHASE.COMPLETE);
        addDialog('avatar', data.message);
        speak(data.message);
        stopListening();
        if (onComplete) onComplete(data.summary);
        return;
      }

      if (data.state === 'final_comments') {
        setPhase(PHASE.ACTIVE);
        addDialog('avatar', data.question);
        speak(data.question);
        return;
      }

      setCurrentQuestion(data.question);
      if (data.progress) setProgress(data.progress);
      setPhase(PHASE.ACTIVE);
      addDialog('avatar', data.question);
      speak(data.question);
    } catch (err) {
      console.error('Submit error:', err);
      setPhase(PHASE.ACTIVE);
    }
  };

  submitAnswerRef.current = submitAnswer;

  // ─── Transcription callbacks ────────────────────────────────────────────────
  const handleFinalTranscript = useCallback(async (text) => {
    if (!text.trim() || isSubmittingRef.current) return;
    if (phaseRef.current === PHASE.COMPLETE || phaseRef.current === PHASE.CONNECTING) return;

    isSubmittingRef.current = true;
    addDialog('patient', text);
    setLiveTranscript('');
    setPhase(PHASE.PROCESSING);

    await submitAnswerRef.current?.(text);

    isSubmittingRef.current = false;
  }, [addDialog]);

  const handleInterimTranscript = useCallback((text) => {
    setLiveTranscript(text);
  }, []);

  // Barge-in: interrupt avatar when user starts speaking
  const handleSpeechStart = useCallback(() => {
    if (isSpeakingRef.current && !isSubmittingRef.current) {
      interrupt();
    }
  }, [interrupt]);

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
    onVADSpeechStart: handleSpeechStart,
  });

  // ─── Connect D-ID + camera ─────────────────────────────────────────────────
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
    if (phase === PHASE.CONNECTING) {
      startConnect();
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (patientVideoRef.current && patientVideoStream) {
      patientVideoRef.current.srcObject = patientVideoStream;
    }
  }, [patientVideoStream]);

  // ─── When D-ID connects → auto-start session (greeting + first question) ──
  useEffect(() => {
    if (connectionState === 'connected' && phase === PHASE.CONNECTING) {
      initSession();
    }
  }, [connectionState, phase]); // eslint-disable-line

  const initSession = async () => {
    try {
      const [greetingRes, startRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/sessions/${sessionId}/greeting`),
        fetch(`${BACKEND_URL}/api/sessions/${sessionId}/start`, { method: 'POST' }),
      ]);
      const greetingData = await greetingRes.json();
      const startData = await startRes.json();

      const fullIntro = `${greetingData.message} ${startData.question}`;

      setCurrentQuestion(startData.question);
      setProgress(startData.progress);
      setPhase(PHASE.ACTIVE);

      addDialog('avatar', fullIntro);
      speak(fullIntro);

      resetTranscript();
      startListening();
    } catch (err) {
      console.error('Init session error:', err);
    }
  };

  // ─── Cleanup ────────────────────────────────────────────────────────────────
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

        <div className="dialog-log">
          <div className="dialog-log-label">Conversation</div>
          <div className="dialog-messages">
            {dialogLog.map((msg) => (
              <div key={msg.id} className={`dialog-bubble ${msg.role}`}>
                <div className="bubble-role">{msg.role === 'avatar' ? 'Laura' : 'You'}</div>
                <div className="bubble-text">{msg.text}</div>
              </div>
            ))}
            {isListening && liveTranscript && (
              <div className="dialog-bubble patient live">
                <div className="bubble-role">You <span className="live-badge">live</span></div>
                <div className="bubble-text">{liveTranscript}</div>
              </div>
            )}
            <div ref={dialogEndRef} />
          </div>
        </div>

        <div className="controls-area">
          {phase === PHASE.ACTIVE && !isSpeaking && (
            <div className="vad-status">
              <div className={`vad-ring ${isSpeechActive ? 'active' : ''}`} />
              <span className="vad-label">
                {isSpeechActive ? 'Listening…' : 'Waiting for your response'}
              </span>
            </div>
          )}
          {phase === PHASE.ACTIVE && isSpeaking && (
            <div className="vad-status">
              <span className="vad-label">Laura is speaking — you may interrupt at any time</span>
            </div>
          )}
          {phase === PHASE.PROCESSING && (
            <div className="processing-indicator">
              <span className="processing-spinner" /> Processing…
            </div>
          )}
        </div>

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
          {micPermission === 'denied' && (
            <button
              className="mic-request-icon-btn"
              onClick={requestMicPermission}
              title="Microphone access is required"
            >
              🎤
            </button>
          )}
          {isListening && (
            <div className="mic-status-pill">
              <span className={`mic-status-dot ${isSpeechActive ? 'speaking' : ''}`} />
              {isSpeechActive ? 'Speaking' : 'Mic Active'}
            </div>
          )}
        </div>

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
          {isSpeechActive && <div className="vad-camera-ring" />}
        </div>

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

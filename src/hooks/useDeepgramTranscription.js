import { useState, useRef, useCallback, useEffect } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';

export function useDeepgramTranscription({ onFinalTranscript, onInterimTranscript, onVADSpeechStart, onVADSpeechEnd }) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeechActive, setIsSpeechActive] = useState(false); // VAD: voice currently detected
  const [transcript, setTranscript] = useState('');
  const [micPermission, setMicPermission] = useState('idle'); // idle | requesting | granted | denied

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const finalRef = useRef('');
  const silenceTimerRef = useRef(null);

  // ─── Request mic permission explicitly ───────────────────────────────────
  const requestMicPermission = useCallback(async () => {
    setMicPermission('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setMicPermission('granted');
      return true;
    } catch (err) {
      console.error('Mic permission denied:', err);
      setMicPermission('denied');
      return false;
    }
  }, []);

  // ─── Start listening with VAD ─────────────────────────────────────────────
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicPermission('granted');

      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        wsRef.current.send(JSON.stringify({ type: 'start_transcription' }));
      };

      wsRef.current.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'transcription_ready') {
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : 'audio/webm',
          });

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(e.data);
            }
          };

          mediaRecorder.start(200);
          mediaRecorderRef.current = mediaRecorder;
          setIsListening(true);
        }

        // ── VAD: speech started ──────────────────────────────────────────
        if (msg.type === 'speech_started') {
          setIsSpeechActive(true);
          onVADSpeechStart?.();
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }

        // ── Real-time transcript (interim + final) ───────────────────────
        if (msg.type === 'transcript') {
          if (msg.transcript && msg.transcript.trim()) {
            if (msg.isFinal) {
              finalRef.current += (finalRef.current ? ' ' : '') + msg.transcript;
              setTranscript(finalRef.current);
              onInterimTranscript?.(finalRef.current);
            } else {
              const display = finalRef.current
                ? finalRef.current + ' ' + msg.transcript
                : msg.transcript;
              setTranscript(display);
              onInterimTranscript?.(display);
            }
          }
        }

        // ── VAD: utterance ended → auto-submit ───────────────────────────
        if (msg.type === 'utterance_end') {
          setIsSpeechActive(false);
          onVADSpeechEnd?.();
          const text = finalRef.current.trim();
          if (text) {
            onFinalTranscript?.(text);
          }
        }
      };

      wsRef.current.onerror = (err) => {
        console.error('WS error:', err);
        setIsListening(false);
        setIsSpeechActive(false);
      };

      wsRef.current.onclose = () => {
        setIsListening(false);
        setIsSpeechActive(false);
      };

    } catch (err) {
      console.error('Mic access error:', err);
      setMicPermission('denied');
    }
  }, [onFinalTranscript, onInterimTranscript, onVADSpeechStart, onVADSpeechEnd]);

  // ─── Stop listening ───────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    const finalText = finalRef.current.trim();

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'stop_transcription' }));
        wsRef.current.close();
      } catch (_) {}
      wsRef.current = null;
    }

    setIsListening(false);
    setIsSpeechActive(false);
    setTranscript('');
    finalRef.current = '';

    return finalText;
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    finalRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    isSpeechActive,
    transcript,
    micPermission,
    requestMicPermission,
    startListening,
    stopListening,
    resetTranscript,
  };
}
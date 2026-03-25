import { useState, useRef, useCallback, useEffect } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';

export function useDeepgramTranscription({ onFinalTranscript, onInterimTranscript, onVADSpeechStart, onVADSpeechEnd }) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [micPermission, setMicPermission] = useState('idle');

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const finalRef = useRef('');
  const silenceTimerRef = useRef(null);

  // Ref-stable callbacks so the WebSocket handler always calls the latest version
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onInterimTranscriptRef = useRef(onInterimTranscript);
  const onVADSpeechStartRef = useRef(onVADSpeechStart);
  const onVADSpeechEndRef = useRef(onVADSpeechEnd);

  useEffect(() => { onFinalTranscriptRef.current = onFinalTranscript; }, [onFinalTranscript]);
  useEffect(() => { onInterimTranscriptRef.current = onInterimTranscript; }, [onInterimTranscript]);
  useEffect(() => { onVADSpeechStartRef.current = onVADSpeechStart; }, [onVADSpeechStart]);
  useEffect(() => { onVADSpeechEndRef.current = onVADSpeechEnd; }, [onVADSpeechEnd]);

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

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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

        if (msg.type === 'speech_started') {
          setIsSpeechActive(true);
          onVADSpeechStartRef.current?.();
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }

        if (msg.type === 'transcript') {
          if (msg.transcript && msg.transcript.trim()) {
            if (msg.isFinal) {
              finalRef.current += (finalRef.current ? ' ' : '') + msg.transcript;
              setTranscript(finalRef.current);
              onInterimTranscriptRef.current?.(finalRef.current);
            } else {
              const display = finalRef.current
                ? finalRef.current + ' ' + msg.transcript
                : msg.transcript;
              setTranscript(display);
              onInterimTranscriptRef.current?.(display);
            }
          }
        }

        if (msg.type === 'utterance_end') {
          setIsSpeechActive(false);
          onVADSpeechEndRef.current?.();
          const text = finalRef.current.trim();
          if (text) {
            onFinalTranscriptRef.current?.(text);
            finalRef.current = '';
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
  }, []);

  const stopListening = useCallback(() => {
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

import { useState, useEffect, useRef, useCallback } from 'react';

const DID_AGENT_ID = process.env.REACT_APP_DID_AGENT_ID || 'v2_agt_paCRDY90';
const DID_CLIENT_KEY = process.env.REACT_APP_DID_CLIENT_KEY || 'ck_C2ffvusFevXccS3kSDDJY';

export function useDIDAgent(videoRef) {
  const [connectionState, setConnectionState] = useState('idle'); // idle | connecting | connected | disconnected | error
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState([]);
  const agentManagerRef = useRef(null);

  const connect = useCallback(async () => {
    setConnectionState('connecting');
    try {
      const didSDK = await import('@d-id/client-sdk');

      const callbacks = {
        onSrcObjectReady(value) {
          if (videoRef.current) {
            videoRef.current.srcObject = value;
          }
        },
        onConnectionStateChange(state) {
          console.log('D-ID connection state:', state);
          setConnectionState(state === 'connected' ? 'connected' : state === 'closed' ? 'disconnected' : state);
        },
        onNewMessage(msgs, type) {
          console.log('D-ID messages:', msgs, type);
          setMessages(prev => [...prev, ...msgs]);
        },
        onVideoStateChange(state) {
          const normalized = String(state).toUpperCase();
          setIsSpeaking(normalized === 'START' || normalized === 'TALKING');
        },
        onAgentActivityStateChange(state) {
          const normalized = String(state).toUpperCase();
          setIsSpeaking(normalized === 'TALKING' || normalized === 'START');
        },
      };

      const auth = { type: 'key', clientKey: DID_CLIENT_KEY };

      agentManagerRef.current = await didSDK.createAgentManager(DID_AGENT_ID, {
        auth,
        callbacks,
      });

      await agentManagerRef.current.connect();
      setConnectionState('connected');
    } catch (err) {
      console.error('D-ID connect error:', err);
      setConnectionState('error');
    }
  }, [videoRef]);

  const speak = useCallback(async (text) => {
    if (!agentManagerRef.current) return;
    try {
      // Use speak() for scripted text (questions/greeting/closing)
      await agentManagerRef.current.speak({ type: 'text', input: text });
      // rely on D-ID callbacks for isSpeaking toggles
    } catch (err) {
      console.error('D-ID speak error:', err);
      setIsSpeaking(false);
    }
  }, []);

  const interrupt = useCallback(async () => {
    if (!agentManagerRef.current) return;
    try {
      if (typeof agentManagerRef.current.interrupt === 'function') {
        await agentManagerRef.current.interrupt();
      } else if (typeof agentManagerRef.current.stopSpeaking === 'function') {
        await agentManagerRef.current.stopSpeaking();
      }
    } catch (err) {
      console.error('D-ID interrupt error:', err);
    }
    setIsSpeaking(false);
  }, []);

  const chat = useCallback(async (text) => {
    if (!agentManagerRef.current) return;
    try {
      await agentManagerRef.current.chat(text);
    } catch (err) {
      console.error('D-ID chat error:', err);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (agentManagerRef.current) {
      await agentManagerRef.current.disconnect();
      agentManagerRef.current = null;
    }
    setConnectionState('disconnected');
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connectionState, isSpeaking, messages, connect, speak, interrupt, chat, disconnect };
}

import React, { useState } from 'react';
import TreatmentSelection from './components/TreatmentSelection';
import IntakeScreen from './components/IntakeScreen';
import SummaryScreen from './components/SummaryScreen';

const SCREEN = {
  SELECTION: 'selection',
  INTAKE: 'intake',
  SUMMARY: 'summary',
};

export default function App() {
  const [screen, setScreen] = useState(SCREEN.SELECTION);
  const [sessionId, setSessionId] = useState(null);
  const [selectedTreatments, setSelectedTreatments] = useState([]);
  const [summary, setSummary] = useState(null);

  const handleStart = (sid, treatments) => {
    setSessionId(sid);
    setSelectedTreatments(treatments);
    setScreen(SCREEN.INTAKE);
  };

  const handleComplete = (summaryData) => {
    setSummary(summaryData);
    // Show summary after a short delay so closing speech can play
    setTimeout(() => setScreen(SCREEN.SUMMARY), 4000);
  };

  const handleNewSession = () => {
    setSessionId(null);
    setSelectedTreatments([]);
    setSummary(null);
    setScreen(SCREEN.SELECTION);
  };

  return (
    <>
      {screen === SCREEN.SELECTION && (
        <TreatmentSelection onStart={handleStart} />
      )}
      {screen === SCREEN.INTAKE && (
        <IntakeScreen
          sessionId={sessionId}
          onComplete={handleComplete}
        />
      )}
      {screen === SCREEN.SUMMARY && (
        <SummaryScreen
          summary={summary}
          onNewSession={handleNewSession}
        />
      )}
    </>
  );
}

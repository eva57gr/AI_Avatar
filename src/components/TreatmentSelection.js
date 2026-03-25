import React, { useState } from 'react';
import './TreatmentSelection.css';

const TREATMENTS = [
  {
    id: 'dysport',
    label: 'Dysport',
    description: 'Neurotoxin treatment for wrinkles and fine lines',
    icon: '✦',
  },
  {
    id: 'ablative_laser',
    label: 'Ablative Laser',
    description: 'Resurfacing treatment for skin texture and tone',
    icon: '◈',
  },
  {
    id: 'cryo_facial',
    label: 'CryoFacial',
    description: 'Cryotherapy facial for rejuvenation and glow',
    icon: '❄',
  },
  {
    id: 'stem_cell',
    label: 'Stem Cell Therapy',
    description: 'Advanced regenerative treatment',
    icon: '⬡',
  },
];

export default function TreatmentSelection({ onStart }) {
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  const toggle = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleStart = async () => {
    if (selected.length === 0) return;
    setLoading(true);
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ treatments: selected }),
      });
      const data = await res.json();
      onStart(data.sessionId, selected);
    } catch (err) {
      console.error('Session create error:', err);
      setLoading(false);
    }
  };

  return (
    <div className="selection-screen">
      <div className="selection-content">
        <div className="selection-header">
          <div className="logo-mark">⊕</div>
          <h1>Patient Intake</h1>
          <p className="selection-subtitle">
            Please select the treatment or treatments you're here for today.
            Your care team will use this to personalize your health screening.
          </p>
        </div>

        <div className="treatment-grid">
          {TREATMENTS.map(t => (
            <button
              key={t.id}
              className={`treatment-card ${selected.includes(t.id) ? 'selected' : ''}`}
              onClick={() => toggle(t.id)}
            >
              <div className="treatment-icon">{t.icon}</div>
              <div className="treatment-info">
                <span className="treatment-name">{t.label}</span>
                <span className="treatment-desc">{t.description}</span>
              </div>
              <div className="check-mark">
                {selected.includes(t.id) ? '✓' : ''}
              </div>
            </button>
          ))}
        </div>

        {selected.length > 0 && (
          <div className="selection-footer">
            <div className="selected-count">
              {selected.length} treatment{selected.length > 1 ? 's' : ''} selected
            </div>
            <button
              className="start-btn"
              onClick={handleStart}
              disabled={loading}
            >
              {loading ? (
                <span className="btn-spinner">Preparing your intake…</span>
              ) : (
                <>Begin Intake <span className="btn-arrow">→</span></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

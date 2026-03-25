import React from 'react';
import './SummaryScreen.css';

export default function SummaryScreen({ summary, onNewSession }) {
  if (!summary) return null;

  const formatDate = (d) => new Date(d).toLocaleString();

  return (
    <div className="summary-screen">
      <div className="summary-content">
        <div className="summary-header">
          <div className="summary-badge">
            <span>✓</span> Intake Complete
          </div>
          <h1>Provider Summary</h1>
          <div className="summary-meta">
            <span>Session: {summary.sessionId?.slice(0, 8)}…</span>
            <span>Generated: {formatDate(summary.generatedAt)}</span>
            <span>Treatments: {summary.treatments?.join(', ')}</span>
          </div>
        </div>

        <div className="summary-patient-info">
          <div className="info-row">
            <span className="info-label">Patient Name</span>
            <span className="info-value">{summary.patientInfo?.name}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Date of Birth</span>
            <span className="info-value">{summary.patientInfo?.dateOfBirth}</span>
          </div>
        </div>

        <div className="responses-section">
          <h2>Health Screening Responses</h2>
          <div className="responses-grid">
            {summary.responses?.map((r, i) => (
              <div key={r.key} className="response-item">
                <div className="response-num">{i + 1}</div>
                <div className="response-body">
                  <p className="response-question">{r.question}</p>
                  <p className="response-answer">{r.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="summary-footer">
          <div className="stats">
            <div className="stat">
              <span className="stat-val">{summary.answeredQuestions}</span>
              <span className="stat-lbl">Questions Answered</span>
            </div>
            <div className="stat">
              <span className="stat-val">{summary.treatments?.length}</span>
              <span className="stat-lbl">Treatments Selected</span>
            </div>
          </div>
          <button className="new-session-btn" onClick={onNewSession}>
            Start New Intake
          </button>
        </div>
      </div>
    </div>
  );
}

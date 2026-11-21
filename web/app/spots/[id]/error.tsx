"use client";
export default function SpotError({ reset }: { reset: () => void }) {
  return (
    <div className="b-container b-main">
      <div className="b-state">
        <div className="b-state-inner">
          <h1 className="b-section-title">Dieser Ort lädt gerade nicht</h1>
          <p>
            Bitte versuch es noch einmal. Deine Verbindung oder unsere Daten
            sind gerade nicht erreichbar.
          </p>
          <button className="b-button b-button-primary" onClick={reset}>
            Erneut versuchen
          </button>
        </div>
      </div>
    </div>
  );
}

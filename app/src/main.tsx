import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

function ShutdownPage() {
  return (
    <main className="shutdownPage" aria-labelledby="shutdown-title">
      <section className="shutdownPanel">
        <p className="shutdownEyebrow">VidasVE</p>
        <h1 id="shutdown-title">Gracias a todos.</h1>
        <p>
          Hemos recibido <strong>1.077 reportes</strong> y ubicado en el mapa a{" "}
          <strong>676 personas</strong>.
        </p>
        <p>
          Daremos de baja esta página y eliminaremos los datos por privacidad y por el cierre de esta etapa
          del proyecto.
        </p>
        <a href="https://build4venezuela.com/" target="_blank" rel="noreferrer">
          Apoyar otras iniciativas en Build4Venezuela
        </a>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ShutdownPage />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => registration.update()).catch(() => undefined);
  });
}

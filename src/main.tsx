import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { StudyProvider } from "./components/StudyContext";
import "./styles.css";
const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz não encontrado");
createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <StudyProvider>
        <App />
      </StudyProvider>
    </HashRouter>
  </StrictMode>,
);

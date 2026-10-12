import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AuthSessionProvider } from "./components/AuthSessionContext";
import { CloudSyncProvider } from "./components/CloudSyncContext";
import { StudyProvider } from "./components/StudyContext";
import { bootstrapAuthSession } from "./services/auth-bootstrap";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz não encontrado");

async function start() {
  const authBootstrap = await bootstrapAuthSession();
  createRoot(root!).render(
    <StrictMode>
      <AuthSessionProvider bootstrap={authBootstrap}>
        <CloudSyncProvider>
          <HashRouter>
            <StudyProvider>
              <App />
            </StudyProvider>
          </HashRouter>
        </CloudSyncProvider>
      </AuthSessionProvider>
    </StrictMode>,
  );
}

void start();

import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import Dashboard from "./pages/Dashboard";
import StudyActivity from './pages/StudyActivity';
import { Contests, ContestDetail, Library, Cycle } from "./pages/CatalogPages";
import LessonPage from "./pages/LessonPage";
import { Questions, Reviews, Errors } from "./pages/Practice";
import { Simulations, Discursives } from "./pages/Training";
import Settings from "./pages/Settings";
import { Empty } from "./components/Common";
import { useStudy } from "./components/StudyContext";
const navigation = [
  ["/", "Estudar", "◫"],
  ["/concursos", "Concursos", "⚑"],
  ["/biblioteca", "Biblioteca", "▤"],
  ["/questoes", "Questões", "◎"],
  ["/revisoes", "Revisões", "↻"],
  ["/erros", "Caderno de erros", "◇"],
  ["/simulados", "Simulados", "◷"],
  ["/discursivas", "Discursivas", "≡"],
  ["/ciclo", "Ciclo de estudos", "⌁"],
] as const;
function PwaNotice() {
  const [error, setError] = useState("");
  const {
    needRefresh: [refresh],
    offlineReady: [offline, setOffline],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration)
        window.setInterval(
          () => void registration.update().catch(() => {}),
          60 * 60 * 1000,
        );
    },
    onRegisterError() {
      setError("O modo offline não pôde ser ativado neste navegador.");
    },
  });
  if (error)
    return (
      <p className="notice" role="status">
        {error}
      </p>
    );
  if (refresh)
    return (
      <div className="pwa-notice" role="status">
        Novos conteúdos disponíveis. Salve seus textos antes de atualizar.
        <button onClick={() => void updateServiceWorker(true)}>
          Atualizar agora
        </button>
      </div>
    );
  if (offline)
    return (
      <div className="pwa-notice" role="status">
        Biblioteca pronta para acesso offline.
        <button onClick={() => setOffline(false)}>Entendi</button>
      </div>
    );
  return null;
}
function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>("h1")?.focus();
  }, [pathname]);
  return null;
}
export default function App() {
  const { error, ready } = useStudy();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <>
      <a className="skip" href="#main">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <NavLink className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            C<span>e</span>
          </span>
          <span>
            Central de Estudos<small>CONCURSOS CONTÍNUOS</small>
          </span>
        </NavLink>
        <p className="nav-label">ÁREA DE ESTUDOS</p>
        <nav aria-label="Menu principal">
          {navigation.map(([to, label, icon]) => (
            <NavLink key={to} end={to === "/"} to={to}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Uma biblioteca. Novas possibilidades.
          <NavLink to="/dados">Dados e privacidade ↗</NavLink>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>Seu próximo passo começa aqui.</span>
          <span className="connection">
            <i className={online ? "online" : "offline"} />
            {online ? "Disponível neste dispositivo" : "Modo offline"}
          </span>
        </header>
        <main id="main">
          <RouteFocus />
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {!ready && !error && <p role="status">Carregando seu progresso…</p>}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/estudar/:id" element={<StudyActivity />} />
            <Route path="/concursos" element={<Contests />} />
            <Route path="/concursos/:id" element={<ContestDetail />} />
            <Route path="/biblioteca" element={<Library />} />
            <Route path="/biblioteca/:id" element={<LessonPage />} />
            <Route path="/questoes" element={<Questions />} />
            <Route path="/revisoes" element={<Reviews />} />
            <Route path="/erros" element={<Errors />} />
            <Route path="/simulados" element={<Simulations />} />
            <Route path="/discursivas" element={<Discursives />} />
            <Route path="/ciclo" element={<Cycle />} />
            <Route path="/dados" element={<Settings />} />
            <Route
              path="*"
              element={
                <Empty title="Página não encontrada">
                  Use o menu para continuar seus estudos.
                </Empty>
              }
            />
          </Routes>
          <footer>
            Central de Estudos{" "}
            <span>Conhecimento permanente. Preparação contínua.</span>
          </footer>
        </main>
        <PwaNotice />
      </div>
    </>
  );
}

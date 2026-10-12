import { useState } from "react";
import { useCloudSync } from "../components/CloudSyncContext";
import { useStudy } from "../components/StudyContext";
import { importBackup } from "../services/storage";
import { PageHeading, formatDate } from "../components/Common";
import { catalog } from "../services/catalog";
export default function Settings() {
  const { state, run, ready } = useStudy();
  const cloud = useCloudSync();
  const [message, setMessage] = useState("");
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `central-estudos-progresso-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        eyebrow="SEUS DADOS, SEU CONTROLE"
        title="Dados e privacidade"
      >
        O progresso fica neste navegador. Exporte uma cópia para trocar de
        dispositivo.
      </PageHeading>
      {cloud.cloudAvailable && (
        <section className="card" aria-labelledby="cloud-status-title">
          <h2 id="cloud-status-title">Progresso na nuvem</h2>
          <p role="status" aria-live="polite">
            <strong>{cloud.view.label}</strong>
          </p>
          <p>{cloud.view.detail}</p>
          <p>
            A nuvem está em validação controlada. Entrar em uma conta não copia,
            substitui nem remove o progresso deste dispositivo. A adoção exige uma
            escolha explícita e um preview antes de qualquer cópia.
          </p>
        </section>
      )}
      <section className={`card${cloud.cloudAvailable ? " section-space" : ""}`}>
        <h2>Backup do progresso</h2>
        <p>
          A limpeza dos dados do navegador remove seus registros locais. O
          arquivo de backup inclui progresso, revisões, respostas, simulados e
          textos discursivos.
        </p>
        <button disabled={!ready} onClick={download}>
          Exportar meu progresso
        </button>
        <label className="section-space">
          Restaurar ou combinar backup
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 10_000_000) {
                setMessage("O arquivo excede o limite de 10 MB.");
                return;
              }
              void file
                .text()
                .then((text) => run(() => importBackup(JSON.parse(text))))
                .then(() =>
                  setMessage(
                    "Backup importado. Registros com o mesmo ID foram atualizados.",
                  ),
                )
                .catch(() =>
                  setMessage(
                    "Não foi possível importar. Verifique se é um backup válido da Central de Estudos.",
                  ),
                );
            }}
          />
        </label>
        <p role="status">{message}</p>
      </section>
      <section className="card section-space">
        <h2>Uma biblioteca independente</h2>
        <p>
          {cloud.cloudAvailable
            ? "O catálogo editorial continua independente do seu progresso. A sincronização de progresso ainda não é ativada automaticamente e exige adoção explícita."
            : "O site recebe uma cópia validada dos dados editoriais. Ele não acessa o Google Drive privado e não envia seu progresso para servidores."}
        </p>
        <p>Última sincronização editorial: {formatDate(catalog.syncedAt)}.</p>
        <p>
          Vídeos e editais abrem serviços externos. Miniaturas de vídeos são
          carregadas do YouTube apenas nas aulas que os utilizam.
        </p>
        <p>
          Para instalar, use a opção “Instalar aplicativo” ou “Adicionar à tela
          inicial” do seu navegador, quando disponível.
        </p>
      </section>
    </>
  );
}

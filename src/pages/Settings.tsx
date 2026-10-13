import { useState } from "react";
import { useCloudSync } from "../components/CloudSyncContext";
import { useStudy } from "../components/StudyContext";
import { importBackup } from "../services/storage";
import { PageHeading, formatDate } from "../components/Common";
import { catalog } from "../services/catalog";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Settings() {
  const { state, run, ready } = useStudy();
  const cloud = useCloudSync();
  const [message, setMessage] = useState("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  function download(markPreAdoption = false) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `central-estudos-progresso-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (markPreAdoption) setBackupConfirmed(true);
  }

  async function decide(action: () => Promise<void>, success: string) {
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível concluir a escolha.");
    }
  }

  return (
    <>
      <PageHeading eyebrow="SEUS DADOS, SEU CONTROLE" title="Dados e privacidade">
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
            Entrar em uma conta não copia, substitui nem remove o progresso deste
            dispositivo. A nuvem continua em validação controlada e nenhuma escolha
            abaixo envia dados ao servidor.
          </p>

          {cloud.candidateScope?.mode === "account" && !cloud.adoption && (
            <div className="section-space" aria-labelledby="adoption-title">
              <h3 id="adoption-title">Escolha como preparar esta conta</h3>
              {cloud.legacySummary ? (
                <div className="notice">
                  <strong>Resumo somente leitura do progresso deste dispositivo</strong>
                  <p>
                    {cloud.legacySummary.counts.progress} tópicos com progresso · {" "}
                    {cloud.legacySummary.counts.reviews} revisões · {" "}
                    {cloud.legacySummary.counts.attempts} respostas · {" "}
                    {cloud.legacySummary.counts.writings} textos · {" "}
                    {cloud.legacySummary.counts.results} simulados · {" "}
                    {cloud.legacySummary.counts.activities} atividades.
                  </p>
                  <p>
                    Último registro aproximado: {cloud.legacySummary.latestActivityDate ?? "sem data registrada"}. {" "}
                    Tamanho aproximado do backup: {formatBytes(cloud.legacySummary.approximateBytes)}.
                  </p>
                </div>
              ) : (
                <p role="status">Lendo o resumo local…</p>
              )}

              <p>
                Antes de copiar ou iniciar o espaço da conta, baixe um backup. O banco
                original <strong>será preservado</strong> em todas as opções.
              </p>
              <button disabled={!ready || cloud.adoptionBusy} onClick={() => download(true)}>
                Exportar backup antes de decidir
              </button>
              {backupConfirmed && <p role="status">Backup solicitado neste navegador. As opções de preparação foram liberadas.</p>}

              <div className="section-space">
                <button
                  disabled={cloud.adoptionBusy}
                  onClick={() => void decide(cloud.keepLocalOnly, "Escolha salva: continuar somente neste dispositivo.")}
                >
                  Continuar somente neste dispositivo
                </button>{" "}
                <button
                  disabled={!backupConfirmed || cloud.adoptionBusy || !cloud.legacySummary}
                  onClick={() => void decide(cloud.copyLegacy, "Cópia local preparada para esta conta. O progresso original foi preservado.")}
                >
                  Copiar meu progresso para a conta
                </button>{" "}
                <button
                  disabled={!backupConfirmed || cloud.adoptionBusy}
                  onClick={() => void decide(cloud.startEmpty, "Espaço local vazio preparado para esta conta. O progresso original foi preservado.")}
                >
                  Começar a conta sem importar este progresso
                </button>
              </div>
              <p className="muted">
                Nesta etapa, B e C apenas preparam o banco local escopado da conta. A
                troca do estudo ativo e qualquer sincronização remota permanecem
                desligadas até o próximo gate técnico.
              </p>
              {cloud.adoptionError && <div className="notice error" role="alert">{cloud.adoptionError}</div>}
            </div>
          )}

          {cloud.adoption && (
            <div className="section-space notice">
              <strong>Decisão registrada neste dispositivo</strong>
              <p>
                {cloud.adoption.choice === "local_only" && "Continuar somente no banco local legado."}
                {cloud.adoption.choice === "copy_legacy" && "Uma cópia do progresso foi preparada no banco local desta conta."}
                {cloud.adoption.choice === "empty_account" && "Um banco local vazio foi preparado para esta conta."}
              </p>
              <p>Nenhum progresso foi enviado à nuvem e o banco legado não foi apagado.</p>
            </div>
          )}
        </section>
      )}

      <section className={`card${cloud.cloudAvailable ? " section-space" : ""}`}>
        <h2>Backup do progresso</h2>
        <p>
          A limpeza dos dados do navegador remove seus registros locais. O
          arquivo de backup inclui progresso, revisões, respostas, simulados e
          textos discursivos.
        </p>
        <button disabled={!ready} onClick={() => download(false)}>
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
                  setMessage("Backup importado. Registros com o mesmo ID foram atualizados."),
                )
                .catch(() =>
                  setMessage("Não foi possível importar. Verifique se é um backup válido da Central de Estudos."),
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

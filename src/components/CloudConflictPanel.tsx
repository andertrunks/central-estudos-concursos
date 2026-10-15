export interface WritingConflictPresentation {
  id: string;
  baseText: string | null;
  localText: string;
  remoteText: string;
}

export interface IntegrityConflictPresentation {
  kind: string;
  id: string;
  message: string;
}

export interface CloudConflictPanelProps {
  writings: WritingConflictPresentation[];
  openActivityIds: string[];
  integrityConflicts: IntegrityConflictPresentation[];
  onResolveWriting: (
    id: string,
    choice: "local" | "remote" | "merged",
  ) => void;
  onSelectPrimaryActivity: (id: string) => void;
}

export function CloudConflictPanel({
  writings,
  openActivityIds,
  integrityConflicts,
  onResolveWriting,
  onSelectPrimaryActivity,
}: CloudConflictPanelProps) {
  const hasConflicts =
    writings.length > 0 || openActivityIds.length > 1 || integrityConflicts.length > 0;
  if (!hasConflicts) return null;

  return (
    <section className="card" aria-labelledby="cloud-conflicts-title">
      <h2 id="cloud-conflicts-title">Conflitos preservados</h2>
      <p role="status" aria-live="polite">
        Nenhuma versão foi descartada automaticamente. Revise somente os itens que exigem escolha.
      </p>

      {writings.map((conflict) => (
        <article key={conflict.id} className="section-space" aria-labelledby={`writing-conflict-${conflict.id}`}>
          <h3 id={`writing-conflict-${conflict.id}`}>Texto discursivo em conflito</h3>
          {conflict.baseText !== null && (
            <details>
              <summary>Base comum</summary>
              <pre>{conflict.baseText}</pre>
            </details>
          )}
          <div className="section-space">
            <h4>Neste dispositivo</h4>
            <pre>{conflict.localText}</pre>
            <h4>Na nuvem</h4>
            <pre>{conflict.remoteText}</pre>
          </div>
          <p>Escolha explicitamente como continuar. A decisão só deverá encerrar o conflito após CAS aplicado.</p>
          <button type="button" onClick={() => onResolveWriting(conflict.id, "local")}>
            Manter versão deste dispositivo
          </button>{" "}
          <button type="button" onClick={() => onResolveWriting(conflict.id, "remote")}>
            Manter versão da nuvem
          </button>{" "}
          <button type="button" onClick={() => onResolveWriting(conflict.id, "merged")}>
            Criar versão mesclada editável
          </button>
        </article>
      ))}

      {openActivityIds.length > 1 && (
        <section className="section-space" aria-labelledby="open-activities-title">
          <h3 id="open-activities-title">Atividades em andamento</h3>
          <p>
            As atividades abaixo continuam preservadas. Escolher uma como principal não conclui nem apaga as demais.
          </p>
          <ul>
            {openActivityIds.map((id) => (
              <li key={id}>
                <code>{id}</code>{" "}
                <button type="button" onClick={() => onSelectPrimaryActivity(id)}>
                  Retomar como principal
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {integrityConflicts.length > 0 && (
        <section className="section-space notice error" aria-labelledby="integrity-conflicts-title">
          <h3 id="integrity-conflicts-title">Reconciliação técnica necessária</h3>
          <p>
            Estes itens foram preservados e não oferecem escolha simplificada entre local e nuvem.
          </p>
          <ul>
            {integrityConflicts.map((conflict) => (
              <li key={`${conflict.kind}:${conflict.id}`}>
                <code>{conflict.id}</code>: {conflict.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

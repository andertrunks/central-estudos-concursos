import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Writing } from '../src/types/schema';

const fixture = vi.hoisted(() => ({ writings: [] as Writing[] }));
vi.mock('../src/components/StudyContext', () => ({
  useStudy: () => ({ state: fixture, ready: true, run: vi.fn() }),
}));
vi.mock('../src/services/catalog', () => ({ catalog: {} }));
import { WritingEditor } from '../src/pages/Training';

const proposal = {
  id: 'D-GATE-001', title: 'Treino', theme: 'SQL',
  contentIds: ['TI-BD-003'], contestId: 'CRBIO01-2026-ATI',
  source_ids: ['SRC-SQL-TEST'],
  instructions: 'Explique a consulta.', modelAnswer: 'CORRECAO_SENTINELA_9731',
};
function render(status?: Writing['status'], text = '') {
  fixture.writings = status ? [{ id: proposal.id, theme: proposal.theme,
    contentIds: proposal.contentIds, contestId: proposal.contestId,
    text, status, date: '2026-10-03', notes: '', evaluation: '' }] : [];
  return renderToStaticMarkup(<WritingEditor proposal={proposal} showContinue={false} />);
}
describe('Espelho exige resposta concluída e persistida', () => {
  it('não inclui o espelho no HTML inicial, rascunho ou conclusão vazia', () => {
    for (const html of [render(), render('rascunho', 'Minha resposta'), render('concluída', '  ')]) {
      expect(html).not.toContain(proposal.modelAnswer);
      expect(html).not.toContain('Espelho de correção');
      expect(html).toContain(proposal.instructions);
    }
  });
  it('restaura o espelho após resposta concluída sem gerar nova tentativa', () => {
    expect(render('concluída', 'Minha resposta gravada')).toContain(proposal.modelAnswer);
  });
});

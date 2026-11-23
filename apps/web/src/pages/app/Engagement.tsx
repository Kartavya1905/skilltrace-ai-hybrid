import { useState } from 'react';
import { touch, type EngagementCheckRecord } from '@skilltrace/shared';
import { useApp } from '../../lib/app-context';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, inputCls } from '../../components/ui';

export default function Engagement() {
  const { data, store } = useApp();
  const [disputing, setDisputing] = useState<EngagementCheckRecord | null>(null);
  const [note, setNote] = useState('');
  const checks = [...data.engagement_checks].sort((a, b) => b.issuedAt - a.issuedAt);
  const missed = checks.filter((c) => c.outcome === 'missed').length;
  const wrong = checks.filter((c) => c.answerCorrect === false).length;

  return (
    <div>
      <PageHeader
        title="Engagement checks"
        subtitle="Checks confirm presence; they are not tests. Incorrect answers never remove time. Only missed checks affect credit: the unverified video interval, or a page reset after five consecutive misses on the same page."
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Badge>{checks.length} checks</Badge>
        <Badge tone="amber">{missed} missed</Badge>
        <Badge>{wrong} incorrect answers (no penalty)</Badge>
      </div>
      {checks.length === 0 ? (
        <EmptyState title="No checks yet">Checks appear during Learning Lab or extension sessions. Turn on DEMO mode in Settings to see one within a minute.</EmptyState>
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-2">When</th>
                <th>Type</th>
                <th>Why</th>
                <th>Outcome</th>
                <th>Answer</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checks.map((c) => (
                <tr key={c.id}>
                  <td className="py-2">{new Date(c.issuedAt).toLocaleString()}</td>
                  <td>{c.kind === 'video_presence' ? 'Video presence' : 'Reading question'}</td>
                  <td>{c.trigger.replace('_', ' ')}</td>
                  <td>{c.outcome === 'responded' ? <Badge tone="green">Responded</Badge> : <Badge tone="amber">Missed</Badge>}</td>
                  <td>{c.answerCorrect === null ? '—' : c.answerCorrect ? 'Correct' : 'Incorrect (no penalty)'}</td>
                  <td className="text-right">
                    {c.outcome === 'missed' &&
                      (c.disputed ? (
                        <Badge tone="violet" title={c.disputeNote}>
                          Disputed
                        </Badge>
                      ) : (
                        <Button variant="ghost" onClick={() => setDisputing(c)}>
                          Dispute
                        </Button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={!!disputing} title="Dispute a missed check" onClose={() => setDisputing(null)}>
        <p className="text-sm text-slate-600">
          Tell us what happened (for example, you were following along but could not reach the prompt in time). The dispute is attached to the audit trail and shown
          with the affected interval. Credit is not silently restored, so the passport stays trustworthy; you can enable longer response windows in Settings.
        </p>
        <Field label="Note">
          <textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={async () => {
              if (store && disputing) await store.put('engagement_checks', touch({ ...disputing, disputed: true, disputeNote: note.slice(0, 500) }));
              setDisputing(null);
              setNote('');
            }}
          >
            Submit dispute
          </Button>
          <Button variant="secondary" onClick={() => setDisputing(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}

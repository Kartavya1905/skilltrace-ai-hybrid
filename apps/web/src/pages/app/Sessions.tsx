import { useState } from 'react';
import { formatDuration, touch, type LearningSession } from '@skilltrace/shared';
import { useApp } from '../../lib/app-context';
import { classifySession, correctSession } from '../../lib/actions';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  EvidenceBadge,
  Field,
  Modal,
  PageHeader,
  SourceBadge,
  inputCls,
} from '../../components/ui';

const STATUS: Record<
  LearningSession['classificationStatus'],
  { label: string; tone: 'green' | 'amber' | 'slate' | 'rose' | 'violet' }
> = {
  pending: { label: 'Awaiting AI', tone: 'amber' },
  queued_offline: { label: 'Queued (AI unavailable)', tone: 'amber' },
  classified: { label: 'AI classified', tone: 'violet' },
  corrected: { label: 'Corrected by you', tone: 'green' },
  failed: { label: 'Not classified', tone: 'rose' },
};

export default function Sessions() {
  const { data, store, ai } = useApp();
  const [editing, setEditing] = useState<LearningSession | null>(null);
  const [skills, setSkills] = useState('');
  const sessions = [...data.learning_sessions].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  const sourceOf = (s: LearningSession) => data.learning_sources.find((x) => x.id === s.sourceId);

  return (
    <div>
      <PageHeader
        title="Learning sessions"
        subtitle="Each session is reconstructed from its raw event log. Skill detection uses Firebase AI Logic; you can correct any classification and later inference will not overwrite it."
      />
      {sessions.length === 0 ? (
        <EmptyState title="No sessions yet">
          Open the Learning Lab or sync sessions from the extension.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const src = sourceOf(s);
            const st =
              s.provenance === 'sample_data'
                ? { label: 'Sample classification', tone: 'rose' as const }
                : STATUS[s.classificationStatus];
            return (
              <Card key={s.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">
                      {src?.title ?? 'Unknown source'}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <Badge>{s.contentType}</Badge>
                      <Badge>
                        {s.device === 'extension' ? 'Chrome extension' : 'Learning Lab'}
                      </Badge>
                      <EvidenceBadge type={s.provenance} />
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="text-slate-500">
                        {new Date(s.startedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {(s.classificationStatus === 'failed' ||
                      s.classificationStatus === 'queued_offline') &&
                      store && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            void store
                              .put(
                                'learning_sessions',
                                touch({ ...s, classificationStatus: 'pending' }),
                              )
                              .then(() =>
                                classifySession(store, data, ai, {
                                  ...s,
                                  classificationStatus: 'pending',
                                }),
                              )
                          }
                        >
                          Retry detection
                        </Button>
                      )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(s);
                        setSkills(s.attributions.map((a) => a.skill).join(', '));
                      }}
                    >
                      Correct skills
                    </Button>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <div>
                    <dt className="text-xs text-slate-500">Eligible</dt>
                    <dd className="font-medium">{formatDuration(s.eligibleMs)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Raw</dt>
                    <dd>{formatDuration(s.rawMs)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">
                      {s.contentType === 'reading' ? 'Progress' : 'Coverage'}
                    </dt>
                    <dd>{Math.round(s.coverageRatio * 100)}%</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Revision</dt>
                    <dd>{formatDuration(s.revisionMs)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Unverified / forfeited</dt>
                    <dd>{formatDuration(s.unverifiedMs)}</dd>
                  </div>
                </dl>
                {s.attributions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {s.attributions.map((a) => (
                      <Badge key={a.skill} tone="indigo">
                        {a.skill} · {Math.round(a.weight * 100)}%
                        {a.topics.length ? ` · ${a.topics.slice(0, 4).join(', ')}` : ''}
                      </Badge>
                    ))}
                    {s.classifiedBy && (
                      <span className="flex items-center gap-1 text-slate-500">
                        Classified <SourceBadge source={s.classifiedBy.source} /> in{' '}
                        {s.classifiedBy.durationMs} ms ({s.classifiedBy.mode})
                      </span>
                    )}
                  </div>
                )}
                {s.summary && <p className="mt-2 text-xs text-slate-500">{s.summary}</p>}
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!editing} title="Correct skill classification" onClose={() => setEditing(null)}>
        <Field
          label="Skills (comma separated)"
          hint="Time is split equally between the skills you list. Your correction is locked against later AI inference."
        >
          <input className={inputCls} value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Field>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={async () => {
              if (store && editing)
                await correctSession(
                  store,
                  data,
                  editing,
                  skills
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map((skill) => ({
                      skill,
                      topics: editing.attributions.find((a) => a.skill === skill)?.topics ?? [],
                    })),
                );
              setEditing(null);
            }}
          >
            Save correction
          </Button>
          <Button variant="secondary" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { ASSESSMENTS, gradeAssessment, type AssessmentDefinition } from '../../content/assessments';
import { useApp } from '../../lib/app-context';
import { saveAssessment } from '../../lib/actions';
import { Badge, Button, Card, PageHeader } from '../../components/ui';

function Runner({ def, onDone }: { def: AssessmentDefinition; onDone: () => void }) {
  const { store } = useApp();
  const [answers, setAnswers] = useState<Record<string, number | undefined>>({});
  const [result, setResult] = useState<ReturnType<typeof gradeAssessment> | null>(null);
  const [policy, setPolicy] = useState<'closed_book' | 'open_book' | 'ai_assisted_allowed'>('closed_book');

  async function submit() {
    const graded = gradeAssessment(def, answers);
    setResult(graded);
    if (store)
      await saveAssessment(store, {
        skill: def.skill,
        title: def.title,
        attemptedAt: new Date().toISOString(),
        questions: graded.results,
        score: graded.score,
        maxScore: graded.maxScore,
        assistancePolicy: policy,
        verificationLevel: 'self_attempted_unproctored',
        gradedBy: 'deterministic',
      });
  }

  return (
    <Card title={def.title} action={<Button variant="ghost" onClick={onDone}>Close</Button>}>
      <fieldset className="mb-4">
        <legend className="text-sm font-medium text-slate-800">Assistance policy (recorded with the result)</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          {(
            [
              ['closed_book', 'Closed book'],
              ['open_book', 'Open book / docs allowed'],
              ['ai_assisted_allowed', 'AI assistance allowed'],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="flex items-center gap-1">
              <input type="radio" name="policy" checked={policy === v} onChange={() => setPolicy(v)} disabled={!!result} /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <ol className="space-y-5">
        {def.questions.map((q, qi) => {
          const r = result?.results.find((x) => x.id === q.id);
          return (
            <li key={q.id}>
              <fieldset>
                <legend className="text-sm font-medium text-slate-900">
                  {qi + 1}. {q.prompt}
                </legend>
                {q.code && <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">{q.code}</pre>}
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {q.options.map((o, i) => (
                    <label key={o} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${result && i === q.correctIndex ? 'bg-emerald-50 ring-emerald-300' : 'ring-slate-200'}`}>
                      <input type="radio" name={q.id} disabled={!!result} checked={answers[q.id] === i} onChange={() => setAnswers({ ...answers, [q.id]: i })} />
                      {o}
                    </label>
                  ))}
                </div>
                {r && <p className={`mt-1 text-xs ${r.correct ? 'text-emerald-700' : 'text-rose-700'}`}>{r.correct ? 'Correct.' : 'Incorrect.'} {q.explanation}</p>}
              </fieldset>
            </li>
          );
        })}
      </ol>
      {result ? (
        <p className="mt-4 text-sm font-medium">
          Score: {result.score}/{result.maxScore}. Saved as an unproctored self-attempt, separate from learning time.
        </p>
      ) : (
        <Button className="mt-4" onClick={submit} disabled={Object.keys(answers).length < def.questions.length}>
          Submit for grading
        </Button>
      )}
    </Card>
  );
}

export default function Assessments() {
  const { data } = useApp();
  const [active, setActive] = useState<AssessmentDefinition | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="Assessments" subtitle="Objectively graded questions with deterministic scoring (no AI grading). Results are competency evidence, displayed separately from learning duration." />
      {active ? (
        <Runner key={active.id} def={active} onDone={() => setActive(null)} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {ASSESSMENTS.map((a) => {
            const attempts = data.assessments.filter((x) => x.title === a.title);
            const best = Math.max(0, ...attempts.map((x) => x.score));
            return (
              <Card key={a.id}>
                <Badge tone="indigo">{a.skill}</Badge>
                <h2 className="mt-2 font-semibold">{a.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{a.description}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {attempts.length} attempt(s){attempts.length ? ` · best ${best}/${a.questions.length}` : ''}
                </p>
                <Button className="mt-3" onClick={() => setActive(a)}>
                  Start
                </Button>
              </Card>
            );
          })}
        </div>
      )}
      {data.assessments.length > 0 && !active && (
        <Card title="History">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-2">Date</th>
                <th>Assessment</th>
                <th>Skill</th>
                <th>Score</th>
                <th>Policy</th>
                <th>Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...data.assessments]
                .sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt))
                .map((a) => (
                  <tr key={a.id}>
                    <td className="py-2">{new Date(a.attemptedAt).toLocaleString()}</td>
                    <td>{a.title}</td>
                    <td>{a.skill}</td>
                    <td>
                      {a.score}/{a.maxScore}
                    </td>
                    <td>{a.assistancePolicy.replace(/_/g, ' ')}</td>
                    <td>Unproctored self-attempt</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

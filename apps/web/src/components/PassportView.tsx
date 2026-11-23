import type { PublicPassport } from '@skilltrace/shared';
import { Badge, EvidenceBadge } from './ui';

/** Recruiter-facing rendering of a (public or preview) passport. */
export function PassportView({ p, preview = false }: { p: PublicPassport; preview?: boolean }) {
  const sample = p.skills.some((s) => s.evidence.includes('sample_data')) || p.projects.some((x) => x.evidence.includes('sample_data'));
  return (
    <article className="mx-auto max-w-4xl space-y-6">
      <header className="print-card rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">Skill Passport{preview ? ' · preview' : ''}</div>
        <h1 className="mt-1 text-3xl font-semibold text-slate-900">{p.displayName || 'Unnamed learner'}</h1>
        {p.headline && <p className="mt-1 text-lg text-slate-700">{p.headline}</p>}
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {p.githubUrl && (
            <a className="text-indigo-700 underline" href={p.githubUrl} rel="noreferrer noopener" target="_blank">
              GitHub
            </a>
          )}
          {p.portfolioUrl && (
            <a className="text-indigo-700 underline" href={p.portfolioUrl} rel="noreferrer noopener" target="_blank">
              Portfolio
            </a>
          )}
        </div>
        {p.summary && <p className="mt-3 text-sm text-slate-700">{p.summary}</p>}
        {sample && <p className="mt-3 rounded bg-rose-50 px-2 py-1 text-xs text-rose-800">Contains sample demonstration data.</p>}
      </header>

      <section aria-labelledby="skills-h">
        <h2 id="skills-h" className="mb-3 text-lg font-semibold text-slate-900">
          Skills and supporting evidence
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {p.skills.map((s) => (
            <div key={s.name} className="print-card rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold">{s.name}</h3>
                <div className="flex flex-wrap justify-end gap-1">
                  {s.evidence.map((e) => (
                    <EvidenceBadge key={e} type={e} />
                  ))}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Eligible learning</dt>
                  <dd className="font-medium">{s.eligibleHours} h</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Revision</dt>
                  <dd>{s.revisionHours} h</dd>
                </div>
                {s.learningStart && (
                  <div>
                    <dt className="text-xs text-slate-500">Learning since</dt>
                    <dd>{new Date(s.learningStart).toLocaleDateString()}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-500">Sources</dt>
                  <dd>{s.sourceCount}</dd>
                </div>
              </dl>
              {s.topics.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {s.topics.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
              {s.sources.length > 0 && (
                <ul className="mt-3 text-xs text-slate-600">
                  {s.sources.map((x) => (
                    <li key={x.title}>
                      • {x.title} ({x.contentType})
                    </li>
                  ))}
                </ul>
              )}
              {s.assessments.length > 0 && (
                <div className="mt-3 text-sm">
                  <div className="text-xs font-medium text-slate-500">Assessments</div>
                  {s.assessments.map((a) => (
                    <div key={`${a.title}-${a.date}`} className="flex justify-between">
                      <span>{a.title}</span>
                      <span>
                        {a.score}/{a.maxScore} <span className="text-xs text-slate-500">({a.verificationLevel === 'independently_proctored' ? 'proctored' : 'unproctored'})</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {s.linkedProjects.length > 0 && <p className="mt-2 text-xs text-slate-600">Projects: {s.linkedProjects.join(', ')}</p>}
            </div>
          ))}
        </div>
      </section>

      {p.projects.length > 0 && (
        <section aria-labelledby="projects-h">
          <h2 id="projects-h" className="mb-3 text-lg font-semibold text-slate-900">
            Projects
          </h2>
          <div className="space-y-4">
            {p.projects.map((x) => (
              <div key={x.title} className="print-card rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-base font-semibold">{x.title}</h3>
                  <div className="flex flex-wrap gap-1">
                    {x.evidence.map((e) => (
                      <EvidenceBadge key={e} type={e} />
                    ))}
                  </div>
                </div>
                {x.description && <p className="mt-1 text-sm text-slate-700">{x.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {[...x.skills, ...x.technologies.filter((t) => !x.skills.includes(t))].map((t) => (
                    <Badge key={t} tone="indigo">
                      {t}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-sm">
                  Self-reported work: <strong>{x.selfReportedHours} h</strong>
                  {x.githubUrl && (
                    <>
                      {' '}
                      ·{' '}
                      <a className="text-indigo-700 underline" href={x.githubUrl} rel="noreferrer noopener" target="_blank">
                        Repository
                      </a>
                    </>
                  )}
                </p>
                {x.milestones.length > 0 && (
                  <ul className="mt-2 text-xs text-slate-600">
                    {x.milestones.map((m) => (
                      <li key={`${m.title}-${m.date}`}>
                        • {m.title}
                        {m.date ? ` (${new Date(m.date).toLocaleDateString()})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="print-card rounded-xl bg-slate-50 p-5 text-xs text-slate-600 ring-1 ring-slate-200">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">How to read this passport</h2>
        <ul className="space-y-1">
          {p.limitations.map((l) => (
            <li key={l}>• {l}</li>
          ))}
        </ul>
        <p className="mt-2">Published {new Date(p.publishedAt).toLocaleDateString()} with SkillTrace AI. No certification is implied.</p>
      </section>
    </article>
  );
}

import { useMemo, useState } from 'react';
import { touch } from '@skilltrace/shared';
import { useApp } from '../../lib/app-context';
import { buildPublicPassport } from '../../lib/passport';
import { skillTimelines } from '../../lib/analytics';
import { Badge, Button, Card, Field, PageHeader, SourceBadge, Toggle, inputCls } from '../../components/ui';
import { PassportView } from '../../components/PassportView';

export default function PassportBuilder() {
  const { data, store, share, passport, profile, ai, user } = useApp();
  const timelines = skillTimelines(data);
  const projects = data.projects.filter((p) => p.confirmedByUser && p.status !== 'dismissed');
  const [form, setForm] = useState({
    displayName: passport.displayName || profile.displayName,
    headline: passport.headline || profile.headline,
    githubUrl: passport.githubUrl,
    portfolioUrl: passport.portfolioUrl,
    summary: passport.summary,
  });
  const [skills, setSkills] = useState<string[]>(share.publicSkills);
  const [projectIds, setProjectIds] = useState<string[]>(share.publicProjectIds);
  const [opts, setOpts] = useState({ showSources: share.showSources, showTimestamps: share.showTimestamps, showAssessments: share.showAssessments });
  const [status, setStatus] = useState('');
  const [aiSource, setAiSource] = useState<string | null>(null);

  const preview = useMemo(
    () => buildPublicPassport(data, store?.uid ?? '', share.shareId, form, { skills, projectIds, ...opts }),
    [data, store, share.shareId, form, skills, projectIds, opts],
  );
  const shareUrl = `${location.origin}/p/${share.shareId}`;

  async function persistSettings(enabled: boolean) {
    if (!store) return;
    await store.put('passport_profiles', touch({ ...passport, ...form, summarySource: aiSource && form.summary === passport.summary ? passport.summarySource : 'user' }));
    await store.put('public_share_settings', touch({ ...share, enabled, publicSkills: skills, publicProjectIds: projectIds, ...opts }));
  }

  async function publish() {
    if (!store) return;
    await persistSettings(true);
    await store.publishPassport(preview);
    setStatus(user?.isLocal ? 'Published locally (Local demo mode: the link only works in this browser).' : 'Published. Anyone with the link can view the selected evidence.');
  }

  async function revoke() {
    if (!store) return;
    await store.unpublishPassport(share.shareId);
    await persistSettings(false);
    setStatus('Public link revoked. The public copy was deleted.');
  }

  async function draftSummary() {
    if (!ai) return;
    const r = await ai.generatePassportSummary({
      name: form.displayName,
      skills: preview.skills.map((s) => `${s.name}: ${s.eligibleHours} h learning, topics ${s.topics.slice(0, 5).join(', ')}, ${s.assessments.length} assessments`).join('\n'),
      projects: preview.projects.map((p) => `${p.title} (${p.skills.join(', ')})`).join('\n'),
    });
    if (r.ok) {
      setForm((f) => ({ ...f, headline: f.headline || r.output.headline, summary: r.output.summary }));
      setAiSource(r.source);
    } else setStatus(`AI draft unavailable: ${r.error.message}`);
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skill Passport builder"
        subtitle="Nothing is public by default. Choose exactly which skills, projects and details appear. The public copy contains only aggregated, selected evidence."
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              Print / save PDF
            </Button>
            {share.enabled ? (
              <Button variant="danger" onClick={revoke}>
                Revoke public link
              </Button>
            ) : null}
            <Button onClick={publish} disabled={skills.length === 0 && projectIds.length === 0}>
              {share.enabled ? 'Update public passport' : 'Publish passport'}
            </Button>
          </>
        }
      />
      {status && <p className="no-print text-sm text-emerald-700">{status}</p>}
      {share.enabled && (
        <div className="no-print rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Public link:{' '}
          <a href={shareUrl} className="font-mono underline" target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        </div>
      )}
      <div className="no-print grid gap-6 lg:grid-cols-2">
        <Card title="Header">
          <div className="space-y-3">
            <Field label="Display name">
              <input className={inputCls} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </Field>
            <Field label="Professional headline">
              <input className={inputCls} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="GitHub URL">
                <input className={inputCls} value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} />
              </Field>
              <Field label="Portfolio URL">
                <input className={inputCls} value={form.portfolioUrl} onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })} />
              </Field>
            </div>
            <Field label="Summary" hint="Optional. You can ask the AI for a draft that uses only your recorded facts, then edit it.">
              <textarea className={inputCls} rows={4} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </Field>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={draftSummary} disabled={!ai || preview.skills.length === 0}>
                Draft with AI
              </Button>
              {aiSource && <SourceBadge source={aiSource} />}
            </div>
          </div>
        </Card>
        <Card title="What is public">
          <fieldset>
            <legend className="text-sm font-medium">Skills</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {timelines.map((t) => (
                <label key={t.skill} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={skills.includes(t.skill)} onChange={() => setSkills(toggle(skills, t.skill))} /> {t.skill}
                </label>
              ))}
              {timelines.length === 0 && <span className="text-sm text-slate-500">No skills yet.</span>}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Projects</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={projectIds.includes(p.id)} onChange={() => setProjectIds(toggle(projectIds, p.id))} /> {p.title}
                </label>
              ))}
              {projects.length === 0 && <span className="text-sm text-slate-500">No confirmed projects.</span>}
            </div>
          </fieldset>
          <div className="mt-4 divide-y divide-slate-100">
            <Toggle checked={opts.showSources} onChange={(v) => setOpts({ ...opts, showSources: v })} label="Show learning source titles" description="Off: only counts are shown." />
            <Toggle checked={opts.showTimestamps} onChange={(v) => setOpts({ ...opts, showTimestamps: v })} label="Show dates" description="Off: no individual timestamps are published." />
            <Toggle checked={opts.showAssessments} onChange={(v) => setOpts({ ...opts, showAssessments: v })} label="Show assessment results" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            <Badge>Never published</Badge> raw events, page URLs, excerpts, engagement checks, inference logs, or anything you did not select.
          </p>
        </Card>
      </div>
      <PassportView p={preview} preview />
    </div>
  );
}

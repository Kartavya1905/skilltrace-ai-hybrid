import { useState } from 'react';
import { Link } from 'react-router-dom';
import { msToHours, touch, type Project } from '@skilltrace/shared';
import { normalizeSkill } from '@skilltrace/skill-taxonomy';
import { useApp } from '../../lib/app-context';
import { confirmProject, newProject, setProjectSkills } from '../../lib/actions';
import { projectHours } from '../../lib/analytics';
import { Badge, Button, Card, EmptyState, EvidenceBadge, Field, Modal, PageHeader, inputCls } from '../../components/ui';

function ConfirmDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { data, store } = useApp();
  const links = data.project_skill_links.filter((l) => l.projectId === project.id);
  const [selected, setSelected] = useState<string[]>(links.filter((l) => l.suggestedBy === 'github_languages').map((l) => l.skill));
  const [start, setStart] = useState(project.startedAt.slice(0, 10));
  const [extra, setExtra] = useState('');
  return (
    <Modal open title={`Add "${project.title}" to your Skill Passport?`} onClose={onClose}>
      <p className="text-sm text-slate-600">Choose the skills this project demonstrates. Suggestions come from repository languages/README and, when available, Firebase AI Logic. Nothing is added until you confirm.</p>
      <fieldset className="mt-3 space-y-1">
        {links.map((l) => (
          <label key={l.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(l.skill)} onChange={() => setSelected((s) => (s.includes(l.skill) ? s.filter((x) => x !== l.skill) : [...s, l.skill]))} />
            {l.skill} <Badge tone={l.suggestedBy === 'ai_suggestion' ? 'violet' : 'slate'}>{l.suggestedBy === 'ai_suggestion' ? 'AI suggestion' : 'GitHub metadata'}</Badge>
          </label>
        ))}
      </fieldset>
      <Field label="Other skills (comma separated)">
        <input className={inputCls} value={extra} onChange={(e) => setExtra(e.target.value)} />
      </Field>
      <Field label="Project start date (you confirm)" hint="Defaults to the repository creation date.">
        <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <p className="mt-2 text-xs text-slate-500">Importing adds 0 learning hours and 0 project hours. Log your own work sessions on the project page.</p>
      <div className="mt-4 flex gap-2">
        <Button
          onClick={async () => {
            if (!store) return;
            const skills = [...new Set([...selected, ...extra.split(',').map((s) => normalizeSkill(s.trim()).name).filter(Boolean)])];
            await confirmProject(store, data, project, skills, new Date(`${start}T00:00:00Z`).toISOString());
            onClose();
          }}
        >
          Confirm project
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await store?.put('projects', touch({ ...project, status: 'dismissed' }));
            onClose();
          }}
        >
          Dismiss
        </Button>
      </div>
    </Modal>
  );
}

export default function Projects() {
  const { data, store } = useApp();
  const [confirming, setConfirming] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', skills: '', url: '' });
  const hours = projectHours(data);
  const suggested = data.projects.filter((p) => p.status === 'suggested' && !p.confirmedByUser);
  const confirmed = data.projects.filter((p) => p.confirmedByUser && p.status !== 'dismissed');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="One canonical record per project, linked to many skills. Project time is self-reported and never added to learning time."
        actions={<Button onClick={() => setCreating(true)}>New manual project</Button>}
      />
      {suggested.length > 0 && (
        <Card title="Detected projects awaiting your confirmation">
          <ul className="divide-y divide-slate-100">
            {suggested.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-slate-500">{p.description}</div>
                </div>
                <Button onClick={() => setConfirming(p)}>Review</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {confirmed.length === 0 ? (
        <EmptyState title="No confirmed projects" action={<Link className="text-sm font-medium text-indigo-700 underline" to="/app/github">Import from GitHub</Link>}>
          Create a manual project or import a public GitHub repository.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {confirmed.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2">
                <Link to={`/app/projects/${p.id}`} className="text-lg font-semibold text-slate-900 hover:underline">
                  {p.title}
                </Link>
                <Badge tone="amber">{msToHours(hours.get(p.id) ?? 0)} h self-reported</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">{p.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.skillNames.map((s) => (
                  <Badge key={s} tone="indigo">
                    {s}
                  </Badge>
                ))}
                <EvidenceBadge type={p.githubUrl ? 'github_metadata' : 'self_reported'} />
              </div>
            </Card>
          ))}
        </div>
      )}
      {confirming && <ConfirmDialog project={confirming} onClose={() => setConfirming(null)} />}
      <Modal open={creating} title="New manual project" onClose={() => setCreating(false)}>
        <div className="space-y-3">
          <Field label="Title">
            <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Skills (comma separated)">
            <input className={inputCls} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
          </Field>
          <Field label="Evidence or repository URL (optional)">
            <input className={inputCls} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </Field>
          <Button
            disabled={!form.title.trim()}
            onClick={async () => {
              if (!store) return;
              const skills = [...new Set(form.skills.split(',').map((s) => normalizeSkill(s.trim()).name).filter(Boolean))];
              const isGh = /github\.com\//.test(form.url);
              const p = newProject(store.uid, {
                title: form.title.trim(),
                description: form.description,
                skillNames: skills,
                githubUrl: isGh ? form.url : '',
                evidenceLinks: form.url && !isGh ? [{ label: 'Evidence', url: form.url }] : [],
              });
              await store.put('projects', p);
              await setProjectSkills(store, p, skills, 'user', true);
              setCreating(false);
              setForm({ title: '', description: '', skills: '', url: '' });
            }}
          >
            Create project
          </Button>
        </div>
      </Modal>
    </div>
  );
}

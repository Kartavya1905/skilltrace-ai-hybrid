import { useState } from 'react';
import { Link } from 'react-router-dom';
import { envelope, hash53 } from '@skilltrace/shared';
import { normalizeSkill, parseRepoUrl, repoRelevance, skillHintsFromRepo, type RepoMetadata } from '@skilltrace/skill-taxonomy';
import { useApp } from '../../lib/app-context';
import { fetchRepo, listUserRepos, recentCommits } from '../../lib/github';
import { addMilestone, newProject, setProjectSkills } from '../../lib/actions';
import { skillTimelines } from '../../lib/analytics';
import { Badge, Button, Card, Field, PageHeader, inputCls } from '../../components/ui';

/**
 * GitHub connection (public mode). A full GitHub App OAuth flow needs a server to hold the
 * client secret; until that is deployed, SkillTrace uses the public REST API only: no token is
 * requested, stored or sent, and only public repositories can be read.
 */
export default function Github() {
  const { data, store, ai } = useApp();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState(data.github_connections[0]?.username ?? '');
  const [repos, setRepos] = useState<{ full_name: string; description: string | null; pushed_at: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const learnerSkills = skillTimelines(data).map((t) => t.skill);
  const connection = data.github_connections[0];

  async function importRepo(owner: string, name: string) {
    if (!store) return;
    setBusy(`${owner}/${name}`);
    setError('');
    setMessage('');
    try {
      const meta: RepoMetadata = await fetchRepo(owner, name);
      const projectId = `gh_${hash53(meta.fullName.toLowerCase())}`;
      if (data.projects.some((p) => p.id === projectId)) {
        setMessage(`${meta.fullName} is already in your project registry.`);
        return;
      }
      const hints = skillHintsFromRepo(meta);
      let aiSkills: { skill: string; reason: string }[] = [];
      if (ai) {
        const r = await ai.suggestRepoSkills({
          name: meta.fullName,
          description: meta.description,
          languages: Object.keys(meta.languages).join(', '),
          readme: meta.readme.slice(0, 2500),
        });
        if (r.ok) aiSkills = r.output.skills.map((s) => ({ skill: normalizeSkill(s.skill, meta.description).name, reason: `AI (${r.source}): ${s.reason}` }));
      }
      const project = newProject(
        store.uid,
        {
          id: projectId,
          title: meta.name,
          description: meta.description,
          githubUrl: meta.htmlUrl,
          startedAt: meta.createdAt,
          status: 'suggested',
          technologies: Object.keys(meta.languages).slice(0, 8),
          skillNames: [],
          confirmedByUser: false,
        },
        'github_metadata',
      );
      await store.put('projects', project);
      await setProjectSkills(store, project, [...new Set(hints.map((h) => h.skill))], 'github_languages', false);
      const aiOnly = aiSkills.filter((s) => s.skill && !hints.some((h) => h.skill === s.skill));
      await setProjectSkills(store, project, aiOnly.map((s) => s.skill), 'ai_suggestion', false);
      // Milestones: evidence markers with zero duration. Never project hours.
      await addMilestone(store, { projectId, kind: 'repo_created', title: 'Repository created', occurredAt: meta.createdAt, url: meta.htmlUrl });
      await addMilestone(store, { projectId, kind: 'last_push', title: 'Most recent push', occurredAt: meta.pushedAt, url: meta.htmlUrl });
      for (const c of await recentCommits(owner, name)) {
        if (c.date) await addMilestone(store, { projectId, kind: 'commit', title: `${c.sha} ${c.message}`, occurredAt: c.date, url: c.url });
      }
      const relevance = repoRelevance(hints, learnerSkills);
      setMessage(`Imported ${meta.fullName}${relevance ? `: relevant to ${relevance} skill(s) you study` : ''}. Review it under Projects to confirm.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function discover() {
    if (!store || !username) return;
    setBusy('discover');
    setError('');
    try {
      const list = await listUserRepos(username.trim());
      setRepos(list);
      await store.put('github_connections', {
        ...envelope('github', store.uid, 'github_metadata'),
        username: username.trim(),
        mode: 'public_username_discovery',
        connectedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GitHub connection"
        subtitle="Repositories become evidence milestones, not hours. Importing never changes learning time, and commits never create project work time."
      />
      <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600 ring-1 ring-slate-200">
        <Badge tone="amber">Public mode (fallback)</Badge> Uses GitHub's public REST API without any token: read-only, public repositories only, 60 requests/hour.
        Full GitHub App authorisation requires a server-side token exchange and is documented as future work. Repository ownership does not prove every contribution
        was authored independently.
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Import a public repository URL">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const p = parseRepoUrl(url);
              if (!p) setError('Enter a URL like https://github.com/owner/repo');
              else void importRepo(p.owner, p.repo);
            }}
          >
            <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" aria-label="Repository URL" />
            <Button type="submit" disabled={!!busy}>
              Import
            </Button>
          </form>
        </Card>
        <Card title="Discover your public repositories">
          <div className="flex items-end gap-2">
            <Field label="GitHub username">
              <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Button onClick={discover} disabled={!!busy || !username}>
              Discover
            </Button>
          </div>
          {connection && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              Saved username: {connection.username}
              <button type="button" className="text-rose-700 hover:underline" onClick={() => store?.remove('github_connections', connection.id)}>
                Disconnect
              </button>
            </div>
          )}
        </Card>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm text-emerald-700">
          {message} <Link className="underline" to="/app/projects">Go to Projects</Link>
        </p>
      )}
      {repos.length > 0 && (
        <Card title={`Public repositories (${repos.length})`}>
          <ul className="divide-y divide-slate-100">
            {repos.map((r) => {
              const [owner, name] = r.full_name.split('/') as [string, string];
              const imported = data.projects.some((p) => p.id === `gh_${hash53(r.full_name.toLowerCase())}`);
              return (
                <li key={r.full_name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-xs text-slate-500">{r.description}</div>
                  </div>
                  <Button variant="secondary" disabled={imported || !!busy} onClick={() => importRepo(owner, name)}>
                    {imported ? 'Imported' : busy === r.full_name ? 'Importing…' : 'Import'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

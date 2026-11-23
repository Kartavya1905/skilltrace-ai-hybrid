/**
 * GitHub repository discovery using the PUBLIC REST API without authentication
 * (clearly labelled fallback: no OAuth token is requested or stored, read-only by construction).
 * Unauthenticated requests are limited to 60/hour per IP by GitHub.
 */
import type { RepoMetadata } from '@skilltrace/skill-taxonomy';

const API = 'https://api.github.com';

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function gh<T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    throw new GithubError(
      `GitHub rate limit reached${reset ? `; resets at ${new Date(Number(reset) * 1000).toLocaleTimeString()}` : ''}.`,
      res.status,
    );
  }
  if (res.status === 404)
    throw new GithubError('Not found (the repository or user may be private or misspelled).', 404);
  if (!res.ok) throw new GithubError(`GitHub API error ${res.status}`, res.status);
  return (await res.json()) as T;
}

interface ApiRepo {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  topics?: string[];
  created_at: string;
  pushed_at: string;
  fork: boolean;
  private: boolean;
}

interface ApiCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null };
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function fetchRepo(
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RepoMetadata> {
  const r = await gh<ApiRepo>(`/repos/${owner}/${repo}`, fetchImpl);
  if (r.private)
    throw new GithubError('Private repositories are not imported in public mode.', 403);
  const [languages, readme] = await Promise.all([
    gh<Record<string, number>>(`/repos/${owner}/${repo}/languages`, fetchImpl).catch(() => ({})),
    gh<{ content: string }>(`/repos/${owner}/${repo}/readme`, fetchImpl)
      .then((x) => decodeBase64Utf8(x.content).slice(0, 20_000))
      .catch(() => ''),
  ]);
  return {
    fullName: r.full_name,
    name: r.name,
    description: r.description ?? '',
    htmlUrl: r.html_url,
    languages,
    topics: r.topics ?? [],
    readme,
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
    fork: r.fork,
  };
}

export async function listUserRepos(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiRepo[]> {
  const repos = await gh<ApiRepo[]>(
    `/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=30&type=owner`,
    fetchImpl,
  );
  return repos.filter((r) => !r.private);
}

export async function recentCommits(
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
  limit = 10,
) {
  const commits = await gh<ApiCommit[]>(
    `/repos/${owner}/${repo}/commits?per_page=${limit}`,
    fetchImpl,
  ).catch(() => []);
  return commits.map((c) => ({
    sha: c.sha.slice(0, 7),
    url: c.html_url,
    message: c.commit.message.split('\n')[0]!.slice(0, 120),
    date: c.commit.author?.date ?? '',
  }));
}

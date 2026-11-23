import { matchPattern, originOf, type ExtensionSettings, type InternalMessage } from './protocol';

const send = <T>(msg: InternalMessage) => chrome.runtime.sendMessage(msg) as Promise<T>;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function render() {
  const s = await send<ExtensionSettings>({ type: 'getSettings' });
  $<HTMLInputElement>('enabled').checked = s.trackingEnabled;
  $<HTMLInputElement>('paused').checked = s.paused;
  $<HTMLInputElement>('demo').checked = s.demoMode;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origin = tab?.url ? originOf(tab.url) : null;
  $('site').textContent = origin ?? 'not trackable';
  const allow = $<HTMLButtonElement>('allow');
  allow.disabled = !origin || s.origins.includes(origin) || !s.trackingEnabled;
  allow.textContent = origin && s.origins.includes(origin) ? 'Tracking allowed on this site' : 'Allow tracking on this site';
  allow.onclick = async () => {
    if (!origin) return;
    // Chrome shows its own permission prompt for exactly this site.
    const granted = await chrome.permissions.request({ origins: [matchPattern(origin)] });
    if (granted) {
      await send({ type: 'addOrigin', origin });
      if (tab?.id) await chrome.tabs.reload(tab.id);
    }
    void render();
  };

  const list = $('origins');
  list.innerHTML = '';
  for (const o of s.origins) {
    const li = document.createElement('li');
    li.textContent = o;
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = 'Remove';
    btn.onclick = async () => {
      await send({ type: 'removeOrigin', origin: o });
      void render();
    };
    li.appendChild(btn);
    list.appendChild(li);
  }

  const { pending } = await send<{ pending: number }>({ type: 'pendingCount' });
  $('pending').textContent = String(pending);
  $('extid').textContent = chrome.runtime.id;
  const dashboards = (await (await fetch(chrome.runtime.getURL('dashboard-origins.json'))).json()) as string[];
  $('dashboards').innerHTML = '';
  for (const d of dashboards) {
    const a = document.createElement('a');
    a.href = `${d}/app/settings?ext=${chrome.runtime.id}`;
    a.target = '_blank';
    a.textContent = `Open dashboard (${new URL(d).host})`;
    $('dashboards').appendChild(a);
    $('dashboards').appendChild(document.createElement('br'));
  }
}

for (const [id, key] of [
  ['enabled', 'trackingEnabled'],
  ['paused', 'paused'],
  ['demo', 'demoMode'],
] as const) {
  $<HTMLInputElement>(id).addEventListener('change', async (e) => {
    await send({ type: 'updateSettings', patch: { [key]: (e.target as HTMLInputElement).checked } as Partial<ExtensionSettings> });
    void render();
  });
}

void render();

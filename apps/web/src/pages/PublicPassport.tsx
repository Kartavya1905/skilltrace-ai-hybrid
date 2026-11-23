import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicPassport } from '@skilltrace/shared';
import { getFirebase } from '../lib/firebase';
import { fetchPublicPassport } from '../lib/store';
import { PassportView } from '../components/PassportView';

export default function PublicPassportPage() {
  const { shareId = '' } = useParams();
  const [p, setP] = useState<PublicPassport | null | undefined>(undefined);
  useEffect(() => {
    void fetchPublicPassport(getFirebase()?.db ?? null, shareId)
      .then(setP)
      .catch(() => setP(null));
  }, [shareId]);
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="no-print mx-auto mb-6 flex max-w-4xl items-center justify-between text-sm">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="h-6 w-6" /> SkillTrace AI
        </Link>
        <button type="button" className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300 hover:bg-white" onClick={() => window.print()}>
          Print
        </button>
      </div>
      {p === undefined && <p className="text-center text-sm text-slate-500">Loading…</p>}
      {p === null && <p className="text-center text-sm text-slate-600">This passport does not exist or its owner revoked public sharing.</p>}
      {p && <PassportView p={p} />}
    </div>
  );
}

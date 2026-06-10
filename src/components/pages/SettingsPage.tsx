import { useState, useEffect } from 'react';
import { Card, CardHeader } from '../common/Card';
import { getNotionSyncStatus } from '../../services/notionSyncService.mock';
import type { SyncStatus } from '../../types';
import { Settings, RefreshCw } from 'lucide-react';

export function SettingsPage() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { getNotionSyncStatus().then(setSyncStatus); }, []);

  const handleSync = async () => {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 1000));
    const s = await getNotionSyncStatus();
    setSyncStatus(s);
    setSyncing(false);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <CardHeader title="데이터 소스 설정" icon={<Settings className="h-4 w-4 text-slate-400" />} />
        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-800">현재: 샘플 데이터 모드</p>
            <p className="mt-1 text-xs text-blue-600">
              실제 Notion API 또는 Supabase에 연결하려면 <code className="bg-blue-100 rounded px-1">src/services/dataSource.ts</code> 의
              <code className="bg-blue-100 rounded px-1 ml-1">activeDataSource</code>를 교체하세요.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Notion 연동 상태</p>
            {syncStatus ? (
              <div className="rounded-lg border border-slate-200 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${syncStatus.status === 'synced' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="text-slate-700">{syncStatus.status === 'synced' ? '동기화됨' : '대기중'}</span>
                  <span className="ml-auto text-xs text-slate-400">{syncStatus.message}</span>
                </div>
                <p className="text-xs text-slate-400">마지막 동기화: {syncStatus.lastSyncedAt ?? '-'} · {syncStatus.syncedCount}건</p>
              </div>
            ) : <p className="text-xs text-slate-400">불러오는 중…</p>}
            <button onClick={handleSync} disabled={syncing}
              className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '동기화 중…' : '지금 동기화'}
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">연동 방법</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-slate-600">
              <li><code className="bg-slate-100 rounded px-1">NotionDataSource</code> 클래스를 구현하여 <code className="bg-slate-100 rounded px-1">DataSource</code> 인터페이스를 만족시킵니다.</li>
              <li><code className="bg-slate-100 rounded px-1">dataSource.ts</code>의 마지막 줄 <code className="bg-slate-100 rounded px-1">export const dataSource</code>를 교체합니다.</li>
              <li>환경변수 <code className="bg-slate-100 rounded px-1">VITE_NOTION_TOKEN</code>, <code className="bg-slate-100 rounded px-1">VITE_NOTION_DB_ID</code>를 설정합니다.</li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}

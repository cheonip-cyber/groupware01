import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader } from '../common/Card';
import { dataSource } from '../../services/dataSource';
import type { NotionFieldMapping, NotionFieldDataType, NotionSyncDirection, Client } from '../../types';
import { Settings, RefreshCw, Plus, Trash2, TimerReset } from 'lucide-react';
import { useToast } from '../common/toast';

function ClientPaymentLagSection() {
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setClients(await dataSource.getClients());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const n = await dataSource.recomputeClientPaymentLag();
      toast.success(`${n}개 고객사 리드타임 분석 완료`);
      await load();
    } catch (e: any) {
      toast.error(`분석 실패: ${e?.message ?? e}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const withProfile = clients.filter((c) => c.avgPaymentLagDays != null).sort((a, b) => (a.avgPaymentLagDays! - b.avgPaymentLagDays!));
  const without = clients.filter((c) => c.avgPaymentLagDays == null).length;

  return (
    <Card>
      <CardHeader
        title="고객사별 입금 리드타임"
        icon={<TimerReset className="h-4 w-4 text-slate-400" />}
        action={
          <button onClick={runAnalysis} disabled={analyzing}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? '분석 중…' : '지금 재분석'}
          </button>
        }
      />
      <div className="p-4">
        <p className="mb-3 text-xs text-slate-500">
          완료된 프로젝트의 "세금계산서 발행일 → 실제 입금일" 간격을 고객사별로 계산해, 자금 캘린더의 입금예정일 예측에 사용합니다.
          과거 완료 이력이 2건 이상인 고객사만 반영되며(이상치·미완료건 자동 제외), 새로 등록되는 고객사도 향후 재분석 시 자동 포함됩니다.
          {without > 0 && ` 이력 부족(2건 미만)으로 분석 제외된 고객사 ${without}곳은 기본값(발행일+익월)이 적용됩니다.`}
        </p>
        {loading ? (
          <p className="py-6 text-center text-xs text-slate-400">불러오는 중…</p>
        ) : withProfile.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">분석된 고객사가 없습니다. "지금 재분석"을 눌러보세요.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="py-2 pr-2 font-medium">고객사</th>
                <th className="py-2 pr-2 text-right font-medium">평균 리드타임</th>
                <th className="py-2 pr-2 text-right font-medium">이력 건수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {withProfile.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-2 font-medium text-slate-700">{c.name}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-600">{c.avgPaymentLagDays}일</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-400">{c.paymentLagSampleCount}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

const DATA_TYPES: NotionFieldDataType[] = ['title', 'status', 'select', 'checkbox', 'date', 'number', 'rich_text'];
const DIRECTIONS: { value: NotionSyncDirection; label: string }[] = [
  { value: 'both', label: '양방향' },
  { value: 'to_notion_only', label: 'Supabase→Notion만' },
  { value: 'from_notion_only', label: 'Notion→Supabase만' },
  { value: 'disabled', label: '중지' },
];

function NotionMappingSection() {
  const [mappings, setMappings] = useState<NotionFieldMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ supabaseColumn: '', notionPropertyName: '', dataType: 'rich_text' as NotionFieldDataType });

  const load = useCallback(async () => {
    setLoading(true);
    const data = await dataSource.getNotionFieldMappings();
    setMappings(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = async (id: string, patch: Partial<NotionFieldMapping>) => {
    setSavingId(id);
    try {
      await dataSource.updateNotionFieldMapping(id, patch);
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 매핑을 삭제할까요? (동기화 대상에서 완전히 제외됩니다)')) return;
    await dataSource.deleteNotionFieldMapping(id);
    await load();
  };

  const handleAdd = async () => {
    if (!newRow.supabaseColumn || !newRow.notionPropertyName) return;
    await dataSource.addNotionFieldMapping({
      entityType: 'project',
      supabaseColumn: newRow.supabaseColumn,
      notionPropertyName: newRow.notionPropertyName,
      dataType: newRow.dataType,
      syncDirection: 'both',
      isActive: true,
    });
    setNewRow({ supabaseColumn: '', notionPropertyName: '', dataType: 'rich_text' });
    setAdding(false);
    await load();
  };

  const selectCls = 'rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-blue-400';

  return (
    <Card>
      <CardHeader
        title="Notion 필드 매핑 관리"
        icon={<Settings className="h-4 w-4 text-slate-400" />}
        action={
          <button onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> 매핑 추가
          </button>
        }
      />
      <div className="p-4">
        <p className="mb-3 text-xs text-slate-500">
          Notion 속성명이 바뀌거나 타입이 바뀌었을 때, 코드 수정 없이 여기서 바로 반영할 수 있습니다.
          속성을 못 찾거나 타입이 다르면 해당 필드만 건너뛰고 오류로 기록됩니다(다른 필드 동기화는 계속 진행).
        </p>

        {adding && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <input placeholder="Supabase 컬럼명 (예: session_1_date)" value={newRow.supabaseColumn}
              onChange={(e) => setNewRow((s) => ({ ...s, supabaseColumn: e.target.value }))}
              className="rounded border border-slate-200 px-2 py-1.5 text-xs" />
            <input placeholder="Notion 속성명" value={newRow.notionPropertyName}
              onChange={(e) => setNewRow((s) => ({ ...s, notionPropertyName: e.target.value }))}
              className="rounded border border-slate-200 px-2 py-1.5 text-xs" />
            <select value={newRow.dataType} onChange={(e) => setNewRow((s) => ({ ...s, dataType: e.target.value as NotionFieldDataType }))} className={selectCls}>
              {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={handleAdd} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">저장</button>
          </div>
        )}

        {loading ? (
          <p className="py-6 text-center text-xs text-slate-400">불러오는 중…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="py-2 pr-2 font-medium">Supabase 컬럼</th>
                <th className="py-2 pr-2 font-medium">Notion 속성명</th>
                <th className="py-2 pr-2 font-medium">타입</th>
                <th className="py-2 pr-2 font-medium">동기화 방향</th>
                <th className="py-2 pr-2 font-medium">사용</th>
                <th className="py-2 font-medium">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mappings.map((m) => (
                <tr key={m.id} className={savingId === m.id ? 'opacity-50' : ''}>
                  <td className="py-2 pr-2 font-mono text-xs text-slate-600">{m.supabaseColumn}</td>
                  <td className="py-2 pr-2">
                    <input
                      defaultValue={m.notionPropertyName}
                      onBlur={(e) => { if (e.target.value !== m.notionPropertyName) handleUpdate(m.id, { notionPropertyName: e.target.value }); }}
                      className="w-32 rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-blue-400"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select value={m.dataType} onChange={(e) => handleUpdate(m.id, { dataType: e.target.value as NotionFieldDataType })} className={selectCls}>
                      {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <select value={m.syncDirection} onChange={(e) => handleUpdate(m.id, { syncDirection: e.target.value as NotionSyncDirection })} className={selectCls}>
                      {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input type="checkbox" checked={m.isActive} onChange={(e) => handleUpdate(m.id, { isActive: e.target.checked })} />
                  </td>
                  <td className="py-2">
                    <button onClick={() => handleDelete(m.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const [syncStatus, setSyncStatus] = useState<{ status: string; lastSyncedAt?: string; syncedCount?: number; message?: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(async () => {
    const s = await dataSource.getSyncStatus();
    setSyncStatus(s);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleRefresh = async () => {
    setSyncing(true);
    await loadStatus();
    setSyncing(false);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Card>
        <CardHeader title="데이터 연동 상태" icon={<Settings className="h-4 w-4 text-slate-400" />} />
        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">Supabase 연동 모드 (groupware 스키마)</p>
            <p className="mt-1 text-xs text-emerald-600">
              Notion → Supabase 동기화는 약 2분 주기, 대시보드 → Notion 반영(실행결과 체크박스)은 약 1분 주기로 자동 실행됩니다.
            </p>
          </div>
          <div>
            {syncStatus ? (
              <div className="rounded-lg border border-slate-200 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-700">연결됨</span>
                  <span className="ml-auto text-xs text-slate-400">{syncStatus.message}</span>
                </div>
                <p className="text-xs text-slate-400">최근 동기화 로그: {syncStatus.lastSyncedAt ?? '-'} · 프로젝트 {syncStatus.syncedCount}건</p>
              </div>
            ) : <p className="text-xs text-slate-400">불러오는 중…</p>}
            <button onClick={handleRefresh} disabled={syncing}
              className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '새로고침 중…' : '상태 새로고침'}
            </button>
          </div>
        </div>
      </Card>

      <ClientPaymentLagSection />
      <NotionMappingSection />
    </div>
  );
}

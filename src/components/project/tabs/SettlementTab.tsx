import { profitRateLabel } from '../../../utils/formatters';
import type { ReactNode } from 'react';
import type { Project, PaymentRequest } from '../../../types';
import { Section, Field, ActionButton } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { MoneyText } from '../../common/MoneyText';
import { settlementStatusStyle } from '../../../utils/statusConfig';
import { CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';

// 확인 상태 배지 (완료/미완료/부분) — 클릭 시 토글 가능(onToggle 제공 시)
function CheckRow({ label, state, detail, onToggle, hint }: {
  label: string; state: 'done' | 'pending' | 'partial'; detail?: string; onToggle?: () => void; hint?: ReactNode;
}) {
  const cfg = {
    done: { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, text: '완료', cls: 'text-emerald-600' },
    partial: { icon: <Clock className="h-4 w-4 text-amber-500" />, text: '일부 완료', cls: 'text-amber-600' },
    pending: { icon: <XCircle className="h-4 w-4 text-slate-300" />, text: '미완료', cls: 'text-slate-400' },
  }[state];
  return (
    <div className="border-b border-slate-50 px-1 py-2.5 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        {onToggle ? (
          <button onClick={onToggle} className={`flex items-center gap-1.5 text-sm font-medium hover:underline ${cfg.cls}`}>
            {cfg.icon}{cfg.text}{detail && <span className="text-xs font-normal text-slate-400">({detail})</span>}
          </button>
        ) : (
          <span className={`flex items-center gap-1.5 text-sm font-medium ${cfg.cls}`}>
            {cfg.icon}{cfg.text}{detail && <span className="text-xs font-normal text-slate-400">({detail})</span>}
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function computeDueMonthInfo(sessionDate?: string): { dueLabel: string; isDueMonth: boolean } | null {
  if (!sessionDate) return null;
  const d = new Date(sessionDate);
  if (isNaN(d.getTime())) return null;
  const due = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  const now = new Date();
  const isDueMonth = now.getFullYear() === due.getFullYear() && now.getMonth() === due.getMonth();
  const dueLabel = `${due.getFullYear()}.${String(due.getMonth() + 1).padStart(2, '0')} 말일`;
  return { dueLabel, isDueMonth };
}

export function SettlementTab({ project, requests, onUpdate }:
  { project: Project; requests: PaymentRequest[]; onUpdate: (patch: Partial<Project>) => void }) {
  const profitTone = project.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600';

  const handleSettlementDone = () =>
    onUpdate({ settlementStatus: '결산완료', projectStatus: '완료' });
  const handleSettlementUndo = () =>
    onUpdate({ settlementStatus: '정산중', projectStatus: '보고/정산' });

  const vendorRows = requests.filter((r) => r.payeeType === '업체');
  const vendorAllDone = vendorRows.length > 0 && vendorRows.every((r) => r.vendorTaxInvoiceReceived);
  const vendorSomeDone = vendorRows.some((r) => r.vendorTaxInvoiceReceived);
  const vendorState: 'done' | 'pending' | 'partial' =
    vendorRows.length === 0 ? 'done' : vendorAllDone ? 'done' : vendorSomeDone ? 'partial' : 'pending';

  const dueInfo = computeDueMonthInfo(project.startDate);

  // Notion 연동 프로젝트: '제안서 제출'과 '진행 상태'는 Notion이 원천(from_notion_only 매핑).
  // 여기서 수정해도 다음 Notion pull 때 되돌아가므로 편집을 잠그고 Notion으로 유도한다.
  const notionLocked = !!project.notionPageId;
  const notionEditHint = (
    <span>
      Notion 원천 항목 — {project.notionUrl
        ? <a href={project.notionUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">Notion에서 수정</a>
        : 'Notion에서 수정'}
    </span>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="정산 확인 상태">
        <CheckRow
          label="제안서 제출"
          state={project.proposalSubmitted ? 'done' : 'pending'}
          onToggle={notionLocked ? undefined : () => onUpdate({ proposalSubmitted: !project.proposalSubmitted })}
          hint={notionLocked ? notionEditHint : undefined}
        />
        <CheckRow
          label="거래명세서 제출"
          state={project.statementSubmitted ? 'done' : 'pending'}
          onToggle={() => onUpdate({ statementSubmitted: !project.statementSubmitted })}
        />
        <CheckRow label="고객사 세금계산서 발행" state={project.taxInvoiceIssued ? 'done' : 'pending'} hint="※ 매출 탭에서 설정" />
        <CheckRow label="고객사 수금" state={project.collectionCompleted ? 'done' : 'pending'} hint="※ 매출 탭에서 설정" />
        <CheckRow
          label="지급업체 매입세금계산서 발행"
          state={vendorState}
          detail={vendorRows.length > 0 ? `${vendorRows.filter((r) => r.vendorTaxInvoiceReceived).length}/${vendorRows.length}건` : '해당없음'}
          hint={
            <span className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3" /> 지급 탭 &gt; 각 업체 항목 펼치기에서 설정
            </span>
          }
        />
        {dueInfo && (
          <CheckRow
            label="지급월 해당 여부"
            state={dueInfo.isDueMonth ? 'done' : 'pending'}
            detail={`지급기한 ${dueInfo.dueLabel}`}
          />
        )}
        <div className="pt-2">
          <Field label="결산 상태">
            <StatusBadge label={project.settlementStatus} style={settlementStatusStyle[project.settlementStatus]} />
          </Field>
        </div>
      </Section>

      <Section title="최종 손익 / 결산">
        <Field label="제안금액"><MoneyText value={project.initialEstimate} /></Field>
        <Field label="계약금액"><MoneyText value={project.contractAmount} /></Field>
        <Field label="실제 지출"><MoneyText value={project.actualCost > 0 ? project.actualCost : project.expectedCost} /></Field>
        <Field label="최종 이익">
          <MoneyText value={project.expectedProfit} className={`font-bold ${profitTone}`} />
        </Field>
        <Field label="이익률">
          <span className={`font-bold ${profitTone}`}>{profitRateLabel(project)}</span>
        </Field>
        <Field label="결산 완료">
          {notionLocked ? (
            <span className="text-xs text-slate-500">
              {project.settlementStatus === '결산완료' ? '✓ 완료됨 · ' : ''}
              진행 상태는 Notion 원천입니다. {project.notionUrl
                ? <a href={project.notionUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">Notion</a>
                : 'Notion'}
              에서 <span className="font-medium">종료(수익화 완료)</span>로 변경하면 자동 반영됩니다.
            </span>
          ) : (
            <ActionButton
              done={project.settlementStatus === '결산완료'}
              tone="emerald"
              onClick={handleSettlementDone}
              onUndo={handleSettlementUndo}
            >
              결산완료 처리
            </ActionButton>
          )}
        </Field>
      </Section>
    </div>
  );
}

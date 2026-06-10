import type { Project } from '../../../types';
import { Section, Field, ActionButton, YesNo } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { MoneyText } from '../../common/MoneyText';
import { settlementStatusStyle } from '../../../utils/statusConfig';

export function SettlementTab({ project, onUpdate }:
  { project: Project; onUpdate: (patch: Partial<Project>) => void }) {
  const profitTone = project.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600';

  const handleStatementDone = () =>
    onUpdate({ statementSubmitted: true });
  const handleReportDone = () =>
    onUpdate({ reportCompleted: true });
  const handleSettlementDone = () =>
    onUpdate({
      settlementStatus: '결산완료',
      projectStatus: '완료',
    });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="정산 진행 상태">
        <Field label="보고서 작성">
          <div className="flex items-center gap-2">
            <YesNo value={project.reportCompleted} />
            <ActionButton done={project.reportCompleted} tone="blue" onClick={handleReportDone}>
              보고서 작성완료 처리
            </ActionButton>
          </div>
        </Field>
        <Field label="거래명세서 제출">
          <div className="flex items-center gap-2">
            <YesNo value={project.statementSubmitted} />
            <ActionButton done={project.statementSubmitted} tone="blue" onClick={handleStatementDone}>
              거래명세서 제출완료 처리
            </ActionButton>
          </div>
        </Field>
        <Field label="세금계산서 발행"><YesNo value={project.taxInvoiceIssued} /></Field>
        <Field label="수금 상태"><YesNo value={project.collectionCompleted} /></Field>
        <Field label="지급 완료"><YesNo value={project.paymentCompleted} /></Field>
        <Field label="결산 상태">
          <StatusBadge label={project.settlementStatus} style={settlementStatusStyle[project.settlementStatus]} />
        </Field>
      </Section>

      <Section title="최종 손익 / 결산">
        <Field label="계약금액"><MoneyText value={project.contractAmount} /></Field>
        <Field label="실제 지출"><MoneyText value={project.actualCost > 0 ? project.actualCost : project.expectedCost} /></Field>
        <Field label="최종 이익">
          <MoneyText value={project.expectedProfit} className={`font-bold ${profitTone}`} />
        </Field>
        <Field label="이익률">
          <span className={`font-bold ${profitTone}`}>{project.profitRate}%</span>
        </Field>
        <Field label="결산 완료">
          <ActionButton
            done={project.settlementStatus === '결산완료'}
            tone="emerald"
            onClick={handleSettlementDone}
          >
            결산완료 처리
          </ActionButton>
        </Field>
      </Section>
    </div>
  );
}

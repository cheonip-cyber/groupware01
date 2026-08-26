-- 회차형(recurring) 마스터의 최종견적 자동합계 트리거를 VAT-안전 방식으로 보강.
-- 기존: 자식들의 final_estimate(세전)를 단순 합산해 마스터에 그대로 대입.
--       회차별로 VAT 모드(포함/별도)가 섞이면 마스터의 VAT 포함 합계가 부정확해질 위험.
-- 개선: 자식들의 total_amount(VAT 포함, 생성컬럼)를 합산한 뒤, 마스터 자신의 vat_type
--       기준으로 역산해서 final_estimate를 세팅. 결과적으로 마스터의 total_amount는
--       항상 정확히 "자식들의 VAT 포함 합계"와 일치한다.
-- 2026-08-26, 전체 재점검 후 반영. 실데이터 8건 전체 재계산 결과 값 변동 없음(기존에도
-- 우연히 회차별 VAT 모드가 전부 동일해서 문제가 없었음, 향후 혼용 대비 보강).

create or replace function groupware.sync_recurring_master_final_estimate()
returns trigger
language plpgsql
security definer
set search_path to 'groupware', 'pg_temp'
as $$
declare
  v_parent_id bigint;
  v_children_total_amount numeric;
  v_master_vat_type text;
  v_new_final_estimate numeric;
begin
  if TG_OP = 'DELETE' then
    v_parent_id := OLD.parent_id;
  else
    v_parent_id := NEW.parent_id;
  end if;

  if v_parent_id is null then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'UPDATE' and NEW.parent_id is not distinct from OLD.parent_id
     and NEW.final_estimate is not distinct from OLD.final_estimate
     and NEW.vat_type is not distinct from OLD.vat_type then
    return NEW;
  end if;

  select coalesce(sum(total_amount), 0) into v_children_total_amount
  from groupware.projects
  where parent_id = v_parent_id;

  select vat_type into v_master_vat_type from groupware.projects where id = v_parent_id;
  v_new_final_estimate := case
    when v_master_vat_type = '별도' then round(v_children_total_amount / 1.1)
    else v_children_total_amount
  end;

  update groupware.projects
  set final_estimate = v_new_final_estimate
  where id = v_parent_id and group_type = 'recurring' and final_estimate is distinct from v_new_final_estimate;

  if TG_OP = 'UPDATE' and OLD.parent_id is not null and OLD.parent_id is distinct from NEW.parent_id then
    select coalesce(sum(total_amount), 0) into v_children_total_amount
    from groupware.projects where parent_id = OLD.parent_id;
    select vat_type into v_master_vat_type from groupware.projects where id = OLD.parent_id;
    v_new_final_estimate := case
      when v_master_vat_type = '별도' then round(v_children_total_amount / 1.1)
      else v_children_total_amount
    end;
    update groupware.projects
    set final_estimate = v_new_final_estimate
    where id = OLD.parent_id and group_type = 'recurring' and final_estimate is distinct from v_new_final_estimate;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

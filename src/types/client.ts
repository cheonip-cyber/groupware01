export type ClientType = '대기업' | '공공기관' | '교육대행사' | '중견기업' | '기타';

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  memo?: string;
}

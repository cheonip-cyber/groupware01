export interface Instructor {
  id: string;
  name: string;
  expertise: string[];
  phone?: string;
  email?: string;
  defaultFee: number;
  accountInfo?: string;
  memo?: string;
  // 지급정보 확인 팝업용 세부정보
  bankName?: string;
  accountNumber?: string;
  residentNumber?: string;
  address?: string;
}

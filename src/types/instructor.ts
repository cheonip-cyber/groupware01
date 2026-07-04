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
  // 과거 강사DB에서 이관된 프로필 필드 (매핑 누락으로 화면에 표시되지 않던 것 복원)
  specialty?: string;      // 전문분야
  level?: string;          // 등급
  career?: string;         // 경력
  education?: string;      // 학력
  honorific?: string;      // 호칭
  remarks?: string;        // 비고
  specialNotes?: string;   // 특이사항
}

export interface Company {
  id: string;
  companyName: string;
  ceoName?: string;
  businessNumber?: string;
  bankName?: string;
  accountNumber?: string;
  taxType?: '과세' | '면세';
  managerContact?: string;
  email?: string;
}

export interface Instructor {
  id: string;
  name: string;
  expertise: string[];
  phone?: string;
  email?: string;
  defaultFee: number;
  accountInfo?: string;
  memo?: string;
}

import { dataSource } from './dataSource';
import type { PaymentRequest } from '../types';

export const paymentService = {
  list: () => dataSource.getPaymentRequests(),
  update: (id: string, patch: Partial<PaymentRequest>) => dataSource.updatePaymentRequest(id, patch),
};

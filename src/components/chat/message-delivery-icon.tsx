import { Check, CheckCheck, CircleAlert, Clock } from 'lucide-react';
import { deliveryLabels } from '@/services/message-sync';

export function MessageDeliveryIcon({ status }: { status: keyof typeof deliveryLabels }) {
  const Icon =
    status === 'PENDING'
      ? Clock
      : status === 'FAILED'
        ? CircleAlert
        : status === 'SENT'
          ? Check
          : CheckCheck;
  const color =
    status === 'READ' ? 'text-[#3b82f6]' : status === 'FAILED' ? 'text-red-600' : undefined;
  return (
    <span
      role="img"
      aria-label={deliveryLabels[status]}
      title={deliveryLabels[status]}
      className={color}
    >
      <Icon aria-hidden="true" size={15} strokeWidth={2} />
    </span>
  );
}

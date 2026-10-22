import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import type { ClipStatus, PayoutStatus } from '@/lib/types';

interface ClipStatusBadgeProps {
  status: ClipStatus;
}

export function ClipStatusBadge({ status }: ClipStatusBadgeProps) {
  switch (status) {
    case 'reviewing':
      return <Badge variant="warning" className="gap-1.5 py-1"><RefreshCw className="h-3.5 w-3.5" /> Reviewing — update metrics</Badge>;
    case 'approved':
      return (
        <Badge variant="success" className="gap-1.5 py-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="destructive" className="gap-1.5 py-1">
          <XCircle className="h-3.5 w-3.5 text-rose-400" />
          Rejected
        </Badge>
      );
    case 'pending':
    default:
      return (
        <Badge variant="warning" className="gap-1.5 py-1">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          Pending Review
        </Badge>
      );
  }
}

interface PayoutStatusBadgeProps {
  status: PayoutStatus;
}

export function PayoutStatusBadge({ status }: PayoutStatusBadgeProps) {
  switch (status) {
    case 'paid':
      return (
        <Badge variant="success" className="gap-1.5 py-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          Paid
        </Badge>
      );
    case 'approved':
      return (
        <Badge variant="info" className="gap-1.5 py-1">
          <Clock className="h-3.5 w-3.5 text-blue-400" />
          Approved for Payout
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="destructive" className="gap-1.5 py-1">
          <XCircle className="h-3.5 w-3.5 text-rose-400" />
          Rejected
        </Badge>
      );
    case 'pending':
    default:
      return (
        <Badge variant="warning" className="gap-1.5 py-1">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          Pending
        </Badge>
      );
  }
}

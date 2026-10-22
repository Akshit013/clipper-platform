'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { PayoutStatusBadge } from '@/components/ClipStatusBadge';
import {
  getAdminPayoutsAction,
  processPayoutAction,
  type AdminPayoutView,
} from '@/actions/payouts';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Wallet,
  CheckCircle2,
  XCircle,
  DollarSign,
  Loader2,
  FileCheck,
  User,
} from 'lucide-react';

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<AdminPayoutView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayout, setSelectedPayout] = useState<AdminPayoutView | null>(null);
  const [paymentRefInput, setPaymentRefInput] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  async function loadPayouts() {
    setLoading(true);
    const res = await getAdminPayoutsAction();
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      setPayouts(res.payouts);
    }
  }

  useEffect(() => {
    loadPayouts();
  }, []);

  function openPayModal(payout: AdminPayoutView) {
    setSelectedPayout(payout);
    setPaymentRefInput('');
    setDialogOpen(true);
  }

  async function handleConfirmPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPayout) return;
    if (!paymentRefInput.trim()) {
      toast.error('Payment reference is required (e.g., Bank Ref or Tx ID).');
      return;
    }

    setProcessing(true);
    const res = await processPayoutAction(
      selectedPayout.id,
      'paid',
      paymentRefInput.trim()
    );
    setProcessing(false);

    if (!res.success) {
      toast.error(res.error || 'Failed to record payment');
    } else {
      toast.success(
        `Disbursement recorded for ${formatCurrency(selectedPayout.amount)}!`
      );
      setDialogOpen(false);
      setSelectedPayout(null);
      loadPayouts();
    }
  }

  async function handleQuickAction(
    payoutId: string,
    status: 'approved' | 'rejected'
  ) {
    if (status === 'rejected') {
      const ok = confirm('Are you sure you want to reject this payout request?');
      if (!ok) return;
    }

    const res = await processPayoutAction(payoutId, status);
    if (!res.success) {
      toast.error(res.error || `Failed to update payout to ${status}`);
    } else {
      toast.success(`Payout marked as ${status}.`);
      loadPayouts();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Payout Disbursements
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review clipper balance requests, record payment transaction references, and settle obligations.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 flex justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : payouts.length === 0 ? (
            <div className="py-20 text-center space-y-2 text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto opacity-30 text-emerald-400" />
              <p className="text-base font-semibold text-foreground">
                No payout requests in the queue
              </p>
              <p className="text-xs">All clipper payout obligations are settled.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground uppercase tracking-wider bg-muted/20">
                    <th className="py-3 px-4 font-medium">Clipper</th>
                    <th className="py-3 px-4 font-medium">Requested Amount</th>
                    <th className="py-3 px-4 font-medium">Requested Date</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Payment Reference</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {payouts.map((req) => (
                    <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-4 px-4 font-medium">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-foreground">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{req.clipper.displayName}</span>
                          </div>
                          {req.clipper.instagramHandle && (
                            <p className="text-xs text-muted-foreground font-mono">
                              @{req.clipper.instagramHandle}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono font-bold text-foreground">
                        {formatCurrency(req.amount)}
                      </td>

                      <td className="py-4 px-4 text-xs text-muted-foreground">
                        {formatDateTime(req.requested_at)}
                      </td>

                      <td className="py-4 px-4">
                        <PayoutStatusBadge status={req.status} />
                      </td>

                      <td className="py-4 px-4 font-mono text-xs">
                        {req.payment_reference ? (
                          <span className="text-foreground bg-secondary/80 px-2 py-0.5 rounded border border-border/60">
                            {req.payment_reference}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">
                            None recorded
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-right">
                        {req.status === 'paid' ? (
                          <span className="text-xs text-emerald-400 font-medium flex items-center justify-end gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Settled
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {req.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleQuickAction(req.id, 'approved')}
                                className="h-8 text-xs"
                              >
                                Approve
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => openPayModal(req)}
                              className="h-8 text-xs gap-1"
                            >
                              <FileCheck className="h-3.5 w-3.5" />
                              Record Payment
                            </Button>

                            {req.status !== 'rejected' && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleQuickAction(req.id, 'rejected')}
                                className="h-8 text-xs"
                              >
                                Reject
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment Disbursement</DialogTitle>
            <DialogDescription>
              Confirm disbursement of {selectedPayout ? formatCurrency(selectedPayout.amount) : ''} to{' '}
              {selectedPayout?.clipper.displayName}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmPayment} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="paymentRef">Payment Reference / Transaction ID</Label>
              <Input
                id="paymentRef"
                required
                placeholder="e.g., PAYPAL-TX-987654 or WIRE-Ref-12345"
                value={paymentRefInput}
                onChange={(e) => setPaymentRefInput(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                This transaction reference will be permanently recorded in the clipper&apos;s ledger and audit trail.
              </p>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="success" disabled={processing}>
                {processing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  'Mark as Paid'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

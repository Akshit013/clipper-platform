'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAuditLogsAction } from '@/actions/admin';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import { FileText, ShieldAlert, Loader2, User, Clock, Terminal } from 'lucide-react';
import type { AuditLog } from '@/lib/types';

type AuditLogWithAdmin = AuditLog & { adminName: string };

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogWithAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadLogs() {
    setLoading(true);
    const res = await getAuditLogsAction();
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      setLogs(res.logs);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  function getActionBadge(action: string) {
    if (action.includes('approve')) {
      return <Badge variant="success">{action}</Badge>;
    }
    if (action.includes('reject')) {
      return <Badge variant="destructive">{action}</Badge>;
    }
    if (action.includes('payout')) {
      return <Badge variant="info">{action}</Badge>;
    }
    return <Badge variant="secondary">{action}</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            System Audit Trail
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Immutable log of all administrative interventions, clip reviews, and financial state transitions.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 flex justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-20 text-center space-y-2 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-base font-semibold text-foreground">
                No audit logs recorded yet
              </p>
              <p className="text-xs">Privileged actions performed by admins will be recorded here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground uppercase tracking-wider bg-muted/20">
                    <th className="py-3 px-4 font-medium">Timestamp</th>
                    <th className="py-3 px-4 font-medium">Admin</th>
                    <th className="py-3 px-4 font-medium">Action</th>
                    <th className="py-3 px-4 font-medium">Target Entity</th>
                    <th className="py-3 px-4 font-medium">Logged Changes & Payloads</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-sans">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatDateTime(log.created_at)}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-xs">
                        <div className="flex items-center gap-1.5 text-foreground">
                          <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                          <span>{log.adminName}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {getActionBadge(log.action)}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs">
                        <span className="text-foreground font-semibold">
                          {log.target_table}
                        </span>
                        {log.target_id && (
                          <div className="text-[10px] text-muted-foreground">
                            {log.target_id.slice(0, 8)}...
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs max-w-md">
                        <div className="p-2 rounded bg-secondary/60 border border-border/60 overflow-x-auto text-[11px] space-y-1">
                          {log.new_values && (
                            <div>
                              <span className="text-emerald-400 font-semibold font-sans">New: </span>
                              <span>{JSON.stringify(log.new_values)}</span>
                            </div>
                          )}
                          {log.old_values && (
                            <div className="text-muted-foreground">
                              <span className="text-amber-400 font-semibold font-sans">Old: </span>
                              <span>{JSON.stringify(log.old_values)}</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

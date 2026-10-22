import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  className?: string;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn('relative overflow-hidden transition-all hover:border-primary/50', className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            {icon}
          </div>
        </div>

        <div className="mt-3">
          <h4 className="text-2xl font-bold tracking-tight text-foreground">{value}</h4>
          {(subtitle || trend) && (
            <div className="mt-1 flex items-center text-xs">
              {trend && (
                <span
                  className={cn(
                    'mr-2 font-medium',
                    trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
                  )}
                >
                  {trend.value}
                </span>
              )}
              {subtitle && (
                <span className="text-muted-foreground">{subtitle}</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

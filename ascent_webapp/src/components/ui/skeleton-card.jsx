import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "./card";

// Loading skeleton for cards
export function SkeletonCard({ className }) {
  return (
    <Card className={cn("animate-pulse", className)}>
      <CardHeader className="pb-3">
        <div className="h-4 bg-slate-700/50 rounded w-1/3"></div>
      </CardHeader>
      <CardContent>
        <div className="h-8 bg-slate-700/50 rounded w-2/3 mb-2"></div>
        <div className="h-3 bg-slate-700/50 rounded w-1/2"></div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton for metrics row
export function SkeletonMetrics({ count = 5 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// Loading skeleton for table
export function SkeletonTable({ rows = 5 }) {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-5 bg-slate-700/50 rounded w-1/4"></div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 bg-slate-700/50 rounded w-1/6"></div>
              <div className="h-4 bg-slate-700/50 rounded w-1/4"></div>
              <div className="h-4 bg-slate-700/50 rounded w-1/6"></div>
              <div className="h-4 bg-slate-700/50 rounded flex-1"></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton for chart
export function SkeletonChart({ className }) {
  return (
    <Card className={cn("animate-pulse", className)}>
      <CardHeader>
        <div className="h-5 bg-slate-700/50 rounded w-1/4"></div>
      </CardHeader>
      <CardContent>
        <div className="h-64 bg-slate-700/30 rounded flex items-end justify-center gap-2 p-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div 
              key={i} 
              className="bg-slate-700/50 rounded-t flex-1"
              style={{ height: `${30 + Math.random() * 60}%` }}
            ></div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Full page loading skeleton
export function SkeletonPage() {
  return (
    <div className="min-h-screen p-4 md:p-8 bg-[#092635]">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="animate-pulse mb-8">
          <div className="h-8 bg-slate-700/50 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-slate-700/50 rounded w-1/3"></div>
        </div>
        
        {/* Metrics */}
        <SkeletonMetrics />
        
        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart />
          <SkeletonChart />
        </div>
        
        {/* Table */}
        <SkeletonTable />
      </div>
    </div>
  );
}


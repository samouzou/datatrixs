
"use client"

import * as React from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Search, Download, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SpreadsheetViewProps {
  headers: string[];
  data: string[][];
  title?: string;
  filename?: string;
  className?: string;
}

const formatCompactValue = (val: string) => {
  if (!val) return "";
  // Already formatted or is a percentage — return as-is
  if (/[KkMm$%]/.test(val)) return val;

  const stripped = val.replace(/[^0-9.-]+/g, "");
  // No digits at all (e.g. metric names like "Revenue") — plain text
  if (!stripped) return val;

  const num = Number(stripped);
  if (isNaN(num)) return val;

  const absNum = Math.abs(num);
  if (absNum >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (absNum >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
};

export function SpreadsheetView({ headers, data, title, filename, className }: SpreadsheetViewProps) {
  const [searchTerm, setSearchTerm] = React.useState("");

  function handleDownload() {
    const csv = [headers, ...data]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename ?? title ?? 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredData = React.useMemo(() => {
    if (!searchTerm) return data;
    return data.filter(row => 
      row.some(cell => cell?.toString().toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [data, searchTerm]);

  return (
    <div className={cn("flex flex-col h-full w-full bg-background border border-border rounded-xl overflow-hidden shadow-2xl", className)}>
      <div className="flex items-center justify-between p-4 bg-card/50 border-b border-border flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg">
            <FileSpreadsheet className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{title || "Data Explorer"}</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {data.length} Rows • Interactive Spreadsheet Mode
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input 
              placeholder="Filter locations, periods..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 w-[200px] bg-muted/30 border-border text-xs focus-visible:ring-primary"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 border-border text-xs hover:bg-accent hover:text-accent-foreground" onClick={handleDownload}>
            <Download className="size-3.5 mr-2" /> Download CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto max-h-[60vh] relative">
        <Table className="border-collapse min-w-full">
          <TableHeader className="sticky top-0 z-20 bg-background/95 backdrop-blur-md shadow-sm">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-12 text-center text-[10px] font-bold text-muted-foreground border-r border-border bg-muted/20">#</TableHead>
              {headers.map((header, i) => (
                <TableHead 
                  key={i} 
                  className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-foreground border-r border-border last:border-r-0 whitespace-nowrap"
                >
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((row, rowIndex) => (
              <TableRow key={rowIndex} className="group hover:bg-primary/5 transition-colors border-border">
                <TableCell className="text-center text-[10px] font-mono text-muted-foreground border-r border-border bg-muted/5">
                  {rowIndex + 1}
                </TableCell>
                {row.map((cell, cellIndex) => {
                  const formatted = formatCompactValue(cell);
                  const isNumeric = formatted !== cell || /^[0-9.-]+$/.test(cell);
                  
                  return (
                    <TableCell 
                      key={cellIndex} 
                      className={cn(
                        "px-6 py-3 text-sm text-foreground/80 border-r border-border last:border-r-0 font-medium group-hover:text-foreground whitespace-nowrap",
                        isNumeric && "text-right font-mono"
                      )}
                    >
                      {formatted}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Search className="size-10 mb-4 opacity-20" />
            <p className="text-sm italic">No records match your search query.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-3 bg-muted/10 border-t border-border text-[10px] text-muted-foreground font-medium uppercase tracking-widest flex-wrap gap-2">
        <div className="flex gap-4">
          <span>Format: Standard Ledger</span>
          <span>Status: Verified</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-accent animate-pulse" />
          Live Connection
        </div>
      </div>
    </div>
  );
}

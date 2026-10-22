"use client";
import { useState, useTransition } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { TEMPLATES, type ImportKind, type RowError } from "@/lib/import";
import { previewImport, runImport } from "@/server/actions/imports";
import { SelectField } from "@/components/app/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Preview = { total: number; valid: number; errors: RowError[]; headers: string[]; sample: Record<string, string>[] };
type Result = { created: number; updated: number; failed: RowError[]; failedCount: number };

const EXAMPLE: Record<ImportKind, string[]> = {
  products: ["Basmati Rice", "", "RICE-001", "8901234500016", "Groceries", "Royal", "kg", "1006", "5", "120", "95", "130", "10", "50"],
  customers: ["Ravi Kumar", "9876543210", "ravi@example.com", "", "27", "12 MG Road", "Pune", "5000", "0"],
  suppliers: ["Acme Distributors", "9123456780", "sales@acme.example", "27ABCDE1234F1Z5", "27", "Plot 4, MIDC", "Pune", "0"],
};

function templateHref(kind: ImportKind) {
  const csv = [TEMPLATES[kind].join(","), EXAMPLE[kind].join(",")].join("\r\n") + "\r\n";
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

export function ImportWizard({ kinds }: { kinds: { value: string; label: string }[] }) {
  const [kind, setKind] = useState<ImportKind>((kinds[0]?.value ?? "products") as ImportKind);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  const form = () => {
    const f = new FormData();
    f.set("kind", kind);
    f.set("file", file!);
    return f;
  };

  function choose(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    if (!f) return;
    start(async () => {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", f);
      const r = await previewImport(fd);
      if (!r.ok) return void toast.error(r.error);
      setPreview(r.data);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose what to import</CardTitle>
          <CardDescription>Download the template, fill it in Excel or Google Sheets, and upload it here. Column names are flexible (e.g. “Selling Price”, “GST %”, “HSN Code”).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="import-kind">Data type</Label>
            <SelectField id="import-kind" className="w-48" value={kind} onValueChange={(v) => { setKind(v as ImportKind); choose(null); }} options={kinds} />
          </div>
          <Button asChild variant="outline">
            <a href={templateHref(kind)} download={`stockpilot-${kind}-template.csv`}><Download /> Download template</a>
          </Button>
          <p className="w-full text-xs text-muted-foreground">Columns: {TEMPLATES[kind].join(", ")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Upload your file</CardTitle>
          <CardDescription>.xlsx or .csv, up to 5 MB and 5,000 rows.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition hover:bg-muted/50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
            {pending && !preview ? <Spinner className="size-6" /> : <FileSpreadsheet className="size-8 text-muted-foreground" />}
            <span className="font-medium">{file ? file.name : "Click to choose a file"}</span>
            <span className="text-xs text-muted-foreground">We&apos;ll check every row before anything is saved.</span>
            <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          </label>
        </CardContent>
      </Card>

      {preview && !result && (
        <Card>
          <CardHeader>
            <CardTitle>3. Review & import</CardTitle>
            <CardDescription>{preview.valid} of {preview.total} rows are ready. {preview.errors.length > 0 && `${preview.total - preview.valid} rows have problems and will be skipped.`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow>{preview.headers.slice(0, 8).map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{preview.sample.map((r, i) => <TableRow key={i}>{preview.headers.slice(0, 8).map((h) => <TableCell key={h} className="max-w-40 truncate">{r[h]}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            </div>
            {preview.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <ul className="max-h-40 list-inside list-disc overflow-y-auto text-sm">
                    {preview.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <Button
              size="lg"
              disabled={pending || preview.valid === 0}
              onClick={() => start(async () => {
                const r = await runImport(form());
                if (!r.ok) return void toast.error(r.error);
                setResult(r.data);
                toast.success("Import finished");
              })}
            >
              {pending ? <Spinner /> : <Upload />} Import {preview.valid} rows
            </Button>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="size-12 text-success" />
            <p className="text-lg font-semibold">{result.created} created · {result.updated} updated</p>
            {result.failedCount > 0 && (
              <div className="w-full max-w-lg text-left">
                <p className="mb-1 text-sm text-destructive">{result.failedCount} rows were not imported:</p>
                <ul className="max-h-40 list-inside list-disc overflow-y-auto text-sm text-muted-foreground">
                  {result.failed.map((e) => <li key={`${e.row}-${e.message}`}>Row {e.row}: {e.message}</li>)}
                </ul>
              </div>
            )}
            <Button variant="outline" onClick={() => choose(null)}>Import another file</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

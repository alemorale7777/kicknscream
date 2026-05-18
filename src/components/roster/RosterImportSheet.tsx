"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  Users,
} from "lucide-react";
import { importRosterAction } from "@/actions/rosterImport";

/**
 * CSV bulk roster import.
 *
 * Flow:
 *   1. User drops or picks a CSV file. Papa parses it in the browser into
 *      rows + headers.
 *   2. We auto-detect column → field mappings by header name (case-insensitive,
 *      with common aliases). User can override every mapping via dropdown.
 *   3. We send a dry-run import to the server. The server validates each row
 *      with Zod, dedupes against existing roster + within-file duplicates,
 *      and returns a per-row diagnosis.
 *   4. UI renders the preview with status pills. User flips "Invite parents"
 *      toggle and clicks Confirm to commit; the server runs the same
 *      validation and writes Players.
 */

const TARGET_FIELDS = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "dob", label: "Date of birth (YYYY-MM-DD)", required: false },
  { key: "position", label: "Position", required: false },
  { key: "jerseyNumber", label: "Jersey number", required: false },
  { key: "parentEmail", label: "Parent email", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

type TargetField = (typeof TARGET_FIELDS)[number]["key"];
const SKIP = "__skip__";

const HEADER_ALIASES: Record<string, TargetField> = {
  firstname: "firstName",
  "first name": "firstName",
  first: "firstName",
  given: "firstName",
  givenname: "firstName",
  lastname: "lastName",
  "last name": "lastName",
  last: "lastName",
  surname: "lastName",
  family: "lastName",
  dob: "dob",
  birthdate: "dob",
  "date of birth": "dob",
  birthday: "dob",
  position: "position",
  pos: "position",
  jersey: "jerseyNumber",
  "jersey number": "jerseyNumber",
  number: "jerseyNumber",
  "#": "jerseyNumber",
  parentemail: "parentEmail",
  "parent email": "parentEmail",
  "parent's email": "parentEmail",
  email: "parentEmail",
  guardianemail: "parentEmail",
  "guardian email": "parentEmail",
  notes: "notes",
  note: "notes",
  comments: "notes",
};

type ImportResult = Awaited<ReturnType<typeof importRosterAction>>;

type Step = "pick" | "map" | "preview" | "done";

export function RosterImportSheet({
  tenantId,
  open,
  onOpenChange,
}: {
  tenantId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetField | typeof SKIP>>({});
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [inviteParents, setInviteParents] = useState(false);
  const [pending, startTransition] = useTransition();
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function autoMap(parsedHeaders: string[]): Record<string, TargetField | typeof SKIP> {
    const used = new Set<string>();
    const m: Record<string, TargetField | typeof SKIP> = {};
    for (const h of parsedHeaders) {
      const key = h.trim().toLowerCase();
      const alias = HEADER_ALIASES[key];
      if (alias && !used.has(alias)) {
        m[h] = alias;
        used.add(alias);
      } else {
        m[h] = SKIP;
      }
    }
    return m;
  }

  function handleFile(file: File) {
    setParseError(null);
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (result) => {
        if (result.errors.length > 0) {
          setParseError(`Couldn't parse the file: ${result.errors[0].message}`);
          return;
        }
        const parsedHeaders = (result.meta.fields ?? []).filter(Boolean);
        if (parsedHeaders.length === 0) {
          setParseError("That file has no header row. Add one (firstName, lastName, …) and re-upload.");
          return;
        }
        if (result.data.length === 0) {
          setParseError("No data rows found in the file.");
          return;
        }
        if (result.data.length > 1000) {
          setParseError(`That's ${result.data.length} rows — we cap imports at 1,000 per file. Split and try again.`);
          return;
        }
        setHeaders(parsedHeaders);
        setRows(result.data);
        setMapping(autoMap(parsedHeaders));
        setStep("map");
      },
      error: (err: Error) => {
        setParseError(err.message ?? "Unknown parse error");
      },
    });
  }

  const mappedFields = useMemo(() => {
    return new Set(
      Object.values(mapping).filter((v): v is TargetField => v !== SKIP)
    );
  }, [mapping]);

  const missingRequired = useMemo(() => {
    return TARGET_FIELDS.filter((f) => f.required && !mappedFields.has(f.key));
  }, [mappedFields]);

  function buildPayloadRows() {
    const reverseMap = new Map<TargetField, string>();
    for (const [header, target] of Object.entries(mapping)) {
      if (target !== SKIP && !reverseMap.has(target)) {
        reverseMap.set(target, header);
      }
    }
    return rows.map((r, idx) => {
      const out: Record<string, unknown> = {};
      for (const [target, header] of reverseMap.entries()) {
        out[target] = r[header] ?? "";
      }
      return { rowNumber: idx + 2, data: out }; // +2 → +1 for header, +1 for human 1-index
    });
  }

  function runDryRun() {
    if (missingRequired.length > 0) {
      toast.error("Map First name and Last name before previewing.");
      return;
    }
    const payload = buildPayloadRows();
    startTransition(async () => {
      try {
        const result = await importRosterAction({
          tenantId,
          rows: payload,
          dryRun: true,
          inviteParents,
        });
        setPreview(result);
        setStep("preview");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function runImport() {
    const payload = buildPayloadRows();
    startTransition(async () => {
      try {
        const result = await importRosterAction({
          tenantId,
          rows: payload,
          dryRun: false,
          inviteParents,
        });
        setPreview(result);
        setStep("done");
        toast.success(
          `Imported ${result.ok} player${result.ok === 1 ? "" : "s"}` +
            (result.skipped > 0 ? ` · ${result.skipped} skipped` : "") +
            (result.errors > 0 ? ` · ${result.errors} errors` : "")
        );
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function downloadTemplate() {
    const csv = [
      "firstName,lastName,dob,position,jerseyNumber,parentEmail,notes",
      "Ada,Lovelace,2010-12-10,Forward,9,parent@example.com,Likes free kicks",
      "Linus,Torvalds,2011-05-22,Midfielder,11,,Captain potential",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kicknscream-roster-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Import roster from CSV</SheetTitle>
          <SheetDescription>
            {step === "pick" && "Upload a CSV with one player per row. We'll match columns and preview before saving."}
            {step === "map" && "Confirm which column maps to which field. We auto-matched based on header names."}
            {step === "preview" && "Here's how the import will land. Anything skipped or errored is shown row-by-row."}
            {step === "done" && "Import complete. Close this drawer when you're ready."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {step === "pick" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-line bg-pitch-700/30 hover:bg-pitch-700/60 rounded-lg p-8 text-center transition-colors"
              >
                <Upload className="h-7 w-7 text-ink-500 mx-auto mb-3" />
                <p className="font-medium text-ink-50">Click to choose a CSV file</p>
                <p className="text-xs text-ink-500 mt-1">Up to 1,000 rows. Header row required.</p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />

              {parseError && (
                <Card className="border-danger/30 bg-danger/10 p-3">
                  <p className="text-sm text-danger flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {parseError}
                  </p>
                </Card>
              )}

              <div className="rounded-md border border-line bg-pitch-900/30 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-ink-500 mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium text-ink-50">Expected columns</p>
                    <p className="text-xs text-ink-500 mt-1">
                      <span className="text-ink-300">firstName</span>, <span className="text-ink-300">lastName</span>
                      {" "}required; <span className="text-ink-500">dob</span>, <span className="text-ink-500">position</span>, <span className="text-ink-500">jerseyNumber</span>, <span className="text-ink-500">parentEmail</span>, <span className="text-ink-500">notes</span> optional. Date of birth must be YYYY-MM-DD.
                    </p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
                  <Download className="h-3.5 w-3.5" />
                  Download template
                </Button>
              </div>
            </div>
          )}

          {step === "map" && (
            <div className="space-y-4">
              <div className="rounded-md border border-line bg-pitch-900/30 p-3 text-sm">
                <p className="text-ink-50 font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-ink-500" />
                  {fileName}
                </p>
                <p className="text-xs text-ink-500 mt-1">
                  {rows.length} {rows.length === 1 ? "row" : "rows"} · {headers.length} columns
                </p>
              </div>

              <div className="space-y-2">
                {headers.map((h) => {
                  const sample = rows.find((r) => r[h])?.[h] ?? "";
                  return (
                    <div key={h} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-ink-50 truncate">{h}</p>
                        {sample && (
                          <p className="text-xs text-ink-500 truncate">e.g. {sample}</p>
                        )}
                      </div>
                      <span className="text-ink-700 text-xs">→</span>
                      <Select
                        value={mapping[h] ?? SKIP}
                        onValueChange={(v) =>
                          setMapping((m) => ({ ...m, [h]: v as TargetField | typeof SKIP }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP}>
                            <span className="text-ink-500">Don&apos;t import</span>
                          </SelectItem>
                          {TARGET_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}
                              {f.required && <span className="text-danger ml-1">*</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {missingRequired.length > 0 && (
                <Card className="border-warn/40 bg-warn/10 p-3">
                  <p className="text-sm text-warn flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Required field{missingRequired.length > 1 ? "s" : ""} not mapped: {missingRequired.map((f) => f.label).join(", ")}
                  </p>
                </Card>
              )}

              <div className="rounded-md border border-line bg-pitch-700/30 p-3">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={inviteParents}
                    onChange={(e) => setInviteParents(e.target.checked)}
                    className="mt-0.5 rounded border-line bg-pitch-700 text-turf-400 focus:ring-turf-400/30"
                  />
                  <span className="flex-1 text-sm">
                    <span className="font-medium text-ink-50">Invite new parents</span>
                    <span className="block text-xs text-ink-500 mt-0.5">
                      Create a parent account + tenant membership for any parent email not already on KickNScream.
                      Magic-link invites go out later from the parent&apos;s profile.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {(step === "preview" || step === "done") && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <ResultStat
                  label="Will import"
                  value={preview.ok}
                  tone="turf"
                  icon={CheckCircle2}
                />
                <ResultStat
                  label="Skipped"
                  value={preview.skipped}
                  tone="warn"
                  icon={AlertCircle}
                />
                <ResultStat
                  label="Errors"
                  value={preview.errors}
                  tone="danger"
                  icon={XCircle}
                />
              </div>

              <div className="rounded-md border border-line bg-pitch-900/30 max-h-[420px] overflow-y-auto divide-y divide-line">
                {preview.rows.map((row) => {
                  if (row.status === "ok") {
                    return (
                      <div key={row.rowNumber} className="px-3 py-2 flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-turf-300 shrink-0" />
                        <span className="text-xs text-ink-700 font-mono w-10 shrink-0">#{row.rowNumber}</span>
                        <span className="text-sm text-ink-50 truncate">
                          {row.firstName} {row.lastName}
                        </span>
                      </div>
                    );
                  }
                  if (row.status === "skipped") {
                    return (
                      <div key={row.rowNumber} className="px-3 py-2 flex items-start gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-warn shrink-0 mt-0.5" />
                        <span className="text-xs text-ink-700 font-mono w-10 shrink-0">#{row.rowNumber}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-ink-50 truncate">
                            {row.firstName} {row.lastName}
                          </span>
                          <p className="text-xs text-ink-500 mt-0.5">{row.reason}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={row.rowNumber} className="px-3 py-2 flex items-start gap-2">
                      <XCircle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
                      <span className="text-xs text-ink-700 font-mono w-10 shrink-0">#{row.rowNumber}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-danger">{row.errors.join(", ")}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {step === "preview" && (
                <Card className="border-turf-400/30 bg-turf-400/5 p-3">
                  <p className="text-sm text-ink-50 flex items-center gap-2">
                    <Users className="h-4 w-4 text-turf-300" />
                    Ready to add <strong className="text-turf-300">{preview.ok}</strong> player{preview.ok === 1 ? "" : "s"} to your roster.
                  </p>
                  {preview.errors > 0 && (
                    <p className="text-xs text-ink-500 mt-1">
                      Errored rows are skipped — fix them in your CSV and re-upload to catch them.
                    </p>
                  )}
                </Card>
              )}
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          {step === "pick" && (
            <>
              <span />
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </>
          )}
          {step === "map" && (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStep("pick");
                  setRows([]);
                  setHeaders([]);
                  setMapping({});
                  setFileName(null);
                }}
                disabled={pending}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={runDryRun}
                disabled={pending || missingRequired.length > 0}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Preview
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button type="button" variant="ghost" onClick={() => setStep("map")} disabled={pending}>
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={runImport}
                disabled={pending || preview?.ok === 0}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm import
                {preview && preview.ok > 0 && (
                  <Badge variant="outline" className="ml-2 border-pitch-950/30 text-pitch-950">
                    {preview.ok}
                  </Badge>
                )}
              </Button>
            </>
          )}
          {step === "done" && (
            <>
              <span />
              <Button type="button" variant="primary" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ResultStat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "turf" | "warn" | "danger";
  icon: typeof CheckCircle2;
}) {
  const toneClass = {
    turf: "border-turf-400/40 bg-turf-400/10 text-turf-300",
    warn: "border-warn/40 bg-warn/10 text-warn",
    danger: "border-danger/40 bg-danger/10 text-danger",
  }[tone];
  return (
    <div className={cn("rounded-md border px-3 py-2", toneClass)}>
      <div className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider opacity-80">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-2xl font-bold tracking-[-0.02em] mt-1">{value}</p>
    </div>
  );
}

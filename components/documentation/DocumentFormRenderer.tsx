"use client";

import { useRef } from "react";
import type {
  DocumentField,
  DocumentFormData,
  DocumentSection,
  DocumentTemplate,
} from "@/lib/documentation/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Value helpers ────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asBool(v: unknown): boolean {
  return v === true;
}
function asArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

// ─── Signature pad (canvas) ───────────────────────────────────────────────────

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const begin = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    canvas.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.stroke();
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const url = canvasRef.current?.toDataURL("image/png") ?? "";
    onChange(url);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    onChange("");
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-input bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="h-32 w-full touch-none"
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          aria-label="Signature pad"
        />
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Signature preview"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
      >
        <Eraser className="h-3.5 w-3.5" /> Clear signature
      </button>
    </div>
  );
}

// ─── Single field renderer ────────────────────────────────────────────────────

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: DocumentField;
  value: unknown;
  onChange: (v: string | string[] | boolean) => void;
}) {
  const inputId = `field-${field.id}`;

  switch (field.type) {
    case "textarea":
    case "address":
      return (
        <Textarea
          id={inputId}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={field.type === "address" ? 3 : 2}
        />
      );

    case "select": {
      const options = field.options ?? [];
      const current = asString(value);
      const valid = options.some((o) => o.value === current);
      return (
        <Select value={valid ? current : undefined} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={inputId}>
            <SelectValue placeholder={field.placeholder ?? "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "radio":
      return (
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1.5">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={field.id}
                value={o.value}
                checked={asString(value) === o.value}
                onChange={() => onChange(o.value)}
                className="h-4 w-4 accent-primary"
              />
              {o.label}
            </label>
          ))}
        </div>
      );

    case "checkbox":
      return (
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id={inputId}
            checked={asBool(value)}
            onCheckedChange={(c) => onChange(c === true)}
          />
          <Label htmlFor={inputId} className="font-normal">
            {field.label}
          </Label>
        </div>
      );

    case "multiselect":
      return (
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1.5">
          {(field.options ?? []).map((o) => {
            const selected = asArray(value).includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected}
                  onCheckedChange={(c) => {
                    const arr = asArray(value);
                    onChange(
                      c === true
                        ? [...arr, o.value]
                        : arr.filter((v) => v !== o.value)
                    );
                  }}
                />
                {o.label}
              </label>
            );
          })}
        </div>
      );

    case "signature":
      return <SignaturePad value={asString(value)} onChange={onChange} />;

    case "number":
      return (
        <Input
          id={inputId}
          type="number"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );

    case "date":
      return (
        <Input
          id={inputId}
          type="date"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "time":
      return (
        <Input
          id={inputId}
          type="time"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "email":
      return (
        <Input
          id={inputId}
          type="email"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );

    case "phone":
      return (
        <Input
          id={inputId}
          type="tel"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );

    case "text":
    default:
      return (
        <Input
          id={inputId}
          type="text"
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
  }
}

// ─── Section ──────────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  values,
  prefilled,
  errors,
  onChange,
}: {
  section: DocumentSection;
  values: DocumentFormData;
  prefilled: Record<string, boolean>;
  errors: Record<string, string>;
  onChange: (id: string, value: string | string[] | boolean) => void;
}) {
  return (
    <fieldset className="mb-6 last:mb-0">
      <legend className="mb-3 w-full border-b border-white/50 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {section.title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {section.fields.map((field) => {
          const err = errors[field.id];
          const isPrefilled = !!prefilled[field.id];
          const fullWidth = !field.colSpan || field.colSpan === "full";
          return (
            <div key={field.id} className={cn("flex flex-col gap-1.5", fullWidth && "sm:col-span-2")}>
              <div className="flex items-center justify-between">
                <Label htmlFor={`field-${field.id}`}>
                  {field.label}
                  {field.required && <span className="ml-0.5 text-destructive">*</span>}
                </Label>
                {isPrefilled && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Prefilled
                  </span>
                )}
              </div>

              <FieldControl
                field={field}
                value={values[field.id]}
                onChange={(v) => onChange(field.id, v)}
              />

              {field.help && !err && (
                <p className="text-xs text-muted-foreground">{field.help}</p>
              )}
              {err && (
                <p className="text-xs text-destructive" role="alert">
                  {err}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

// ─── Public renderer ──────────────────────────────────────────────────────────

export function DocumentFormRenderer({
  template,
  values,
  prefilled,
  errors,
  onChange,
}: {
  template: DocumentTemplate;
  values: DocumentFormData;
  prefilled?: Record<string, boolean>;
  errors?: Record<string, string>;
  onChange: (id: string, value: string | string[] | boolean) => void;
}) {
  return (
    <div>
      {template.sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          values={values}
          prefilled={prefilled ?? {}}
          errors={errors ?? {}}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

'use client';

import { cn } from 'cn';
import { FileTextIcon, UploadCloudIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export const MAX_RECEIPT_BYTES = 5_000_000;

function formatSize(bytes: number) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/** Drop or pick one receipt. The file is only checked here; the server checks its contents again. */
export function ReceiptDropzone({
  file,
  existingName,
  onFile,
  onClear,
  disabled,
}: {
  file: File | null;
  existingName?: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();

  const accept = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!ACCEPTED.includes(candidate.type)) return setError('Use a PNG, JPEG or WebP image, or a PDF.');
    if (candidate.size > MAX_RECEIPT_BYTES) return setError('The receipt must be 5 MB or smaller.');
    setError(undefined);
    onFile(candidate);
  };

  const name = file?.name ?? existingName;

  return (
    <div className="space-y-1.5">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload receipt"
        aria-disabled={disabled}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(event) => {
          if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) accept(event.dataTransfer.files[0]);
        }}
        className={cn(
          'flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          dragging ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/40',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <UploadCloudIcon className="size-7 text-muted-foreground" />
        <p className="font-medium">Drag your receipt here</p>
        <p className="text-xs text-muted-foreground">or click to choose a file · PNG, JPEG, WebP or PDF up to 5 MB</p>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        data-testid="receipt-input"
        onChange={(event) => {
          accept(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {name ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{name}</span>
            {file ? <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span> : null}
          </span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove receipt" onClick={onClear} disabled={disabled}>
            <XIcon />
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

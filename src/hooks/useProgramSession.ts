import { useRef, useState } from 'react';
import type { CodeFile } from '../db';
import { LanguageError } from '../language/lexer';
import { ProgramSession } from '../language/runtime';
import type { ProgramSnapshot } from '../language/program';
import type { ExportOverrides, ExportValue } from '../language/ast';

export function errorMessage(caught: unknown): string {
  if (caught instanceof LanguageError) return `Line ${caught.line}, column ${caught.column}\n${caught.message}`;
  return caught instanceof Error ? caught.message : 'Unknown runtime error.';
}

interface ActiveSession {
  fileId: string;
  source: string;
  exports: string;
  runtime: ProgramSession;
}

/** React only dispatches typed actions; parsing, metadata and state live in the runtime. */
export function useProgramSession(file: CodeFile | null) {
  const session = useRef<ActiveSession | null>(null);
  const [snapshot, setSnapshot] = useState<ProgramSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const exports = JSON.stringify(file?.exportOverrides ?? {});
  const sameFile = session.current?.fileId === file?.id;
  const stale = !!session.current && (!sameFile || session.current.source !== file?.content || session.current.exports !== exports);

  function run(inputOverrides: ExportOverrides = file?.inputOverrides ?? {}) {
    session.current = null;
    setSnapshot(null);
    setError(null);
    setGeneration((value) => value + 1);
    if (!file) return;
    try {
      const runtime = new ProgramSession(file.content, {
        exportOverrides: file.exportOverrides, inputOverrides
      });
      session.current = { fileId: file.id, source: file.content, exports, runtime };
      setSnapshot(runtime.snapshot());
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function currentRuntime() {
    if (!session.current || stale) throw new Error('Program changed. Press Run to restart before using controls.');
    return session.current.runtime;
  }

  function setInput(name: string, value: ExportValue) {
    const runtime = currentRuntime();
    runtime.setInput(name, value);
    setSnapshot(runtime.snapshot());
  }

  function pressButton(id: string) {
    setError(null);
    try {
      currentRuntime().pressButton(id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      if (session.current && !stale) setSnapshot(session.current.runtime.snapshot());
    }
  }

  function clearOutput() {
    session.current?.runtime.clearOutput();
    if (session.current) setSnapshot(session.current.runtime.snapshot());
    setError(null);
  }

  return {
    snapshot: sameFile ? snapshot : null,
    error, stale, generation, run, setInput, pressButton, clearOutput
  };
}

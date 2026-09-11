'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type RecordRow = { id: string; title: string; detail: string; href?: string };

/** Local display preferences only; gateway and onchain evidence are retained. */
export function ArchivedRecords({
  title,
  storageKey,
  records,
}: {
  title: string;
  storageKey: string;
  records: RecordRow[];
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? '[]',
      );
      setHidden(
        Array.isArray(saved)
          ? saved.filter((id): id is string => typeof id === 'string')
          : [],
      );
    } catch {
      setHidden([]);
    }
    setReady(true);
  }, [storageKey]);
  function save(ids: string[]) {
    setHidden(ids);
    try {
      localStorage.setItem(storageKey, JSON.stringify(ids));
      setNotice('');
    } catch {
      setNotice(
        'Browser storage is unavailable. Changes last until you leave this page.',
      );
    }
  }
  const visible = records.filter((row) => !hidden.includes(row.id));
  const hiddenCount = records.length - visible.length;
  if (!records.length) return null;
  return (
    <details className="archived-records">
      <summary>
        {title} <span>{ready ? visible.length : records.length}</span>
      </summary>
      <div className="archive-actions">
        <small>Hidden only for this wallet in this browser.</small>
        <button
          className="text-button"
          disabled={!ready || !visible.length}
          onClick={() =>
            save([...new Set([...hidden, ...records.map((row) => row.id)])])
          }
        >
          Hide all
        </button>
        {hiddenCount > 0 && (
          <button
            className="text-button"
            onClick={() =>
              save(hidden.filter((id) => !records.some((row) => row.id === id)))
            }
          >
            Restore hidden ({hiddenCount})
          </button>
        )}
      </div>
      {!visible.length && <p className="archive-empty">All entries hidden.</p>}
      {visible.map((row) => (
        <div className="archive-row" key={row.id}>
          <div>
            <strong>{row.title}</strong>
            <small>{row.detail}</small>
          </div>
          {row.href && (
            <Link href={row.href} className="text-button">
              View
            </Link>
          )}
          <button
            className="text-button"
            disabled={!ready}
            aria-label={`Hide ${row.title}`}
            onClick={() => save([...hidden, row.id])}
          >
            Hide
          </button>
        </div>
      ))}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}

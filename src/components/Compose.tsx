import { useState } from 'react';
import type { FormEvent } from 'react';

interface Props {
  placeholder: string;
  hint: string;
  onSend: (body: string) => Promise<void>;
}

export function Compose({ placeholder, hint, onSend }: Props) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (text === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(text);
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="compose" onSubmit={(e) => void submit(e)}>
      <textarea
        className="compose__field"
        aria-label={placeholder}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
      />
      <div className="compose__row">
        <span className={error ? 'compose__error' : 'compose__hint'}>{error ?? hint}</span>
        <button className="button" type="submit" disabled={busy || body.trim() === ''}>
          {busy ? 'Leaving note' : 'Leave note'}
        </button>
      </div>
    </form>
  );
}

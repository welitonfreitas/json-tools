import { useRef, useState } from 'react';
import { copyToClipboard } from '../lib/jsonUtils';

interface Props {
  text: string | (() => string);
  label?: string;
  small?: boolean;
  title?: string;
}

export default function CopyButton({ text, label = 'Copiar', small, title }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const onClick = async () => {
    const value = typeof text === 'function' ? text() : text;
    if (await copyToClipboard(value)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button className={`btn ${small ? 'btn-small' : ''} ${copied ? 'btn-success' : ''}`} onClick={onClick} title={title ?? label}>
      {copied ? '✓ Copiado' : label}
    </button>
  );
}

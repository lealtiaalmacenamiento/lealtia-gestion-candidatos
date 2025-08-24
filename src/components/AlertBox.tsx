import React from 'react';

export default function AlertBox({ type = 'info', message = '', show = false }: { type?: 'success' | 'danger' | 'info' | 'warning'; message?: string; show?: boolean }) {
  if (!show || !message) return null;
  return (
    <div className={`alert alert-${type}`} role="alert">
      {message}
    </div>
  );
}

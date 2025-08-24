"use client";
import React from 'react';

interface Props {
  username?: string | null;
  role?: string | null;
  className?: string;
}

export default function UserBadges({ username, role, className = '' }: Props) {
  return (
    <div className={`d-flex align-items-center flex-wrap ${className}`.trim()}>
      <span className="badge bg-light text-dark me-2 mb-2">Usuario: <strong>{username || '—'}</strong></span>
      <span className="badge bg-light text-dark me-2 mb-2">Rol: <strong>{role || '—'}</strong></span>
    </div>
  );
}

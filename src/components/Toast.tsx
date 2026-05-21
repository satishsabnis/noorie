import React from 'react'

interface ToastProps {
  id: string
  message: string
  onDismiss: () => void
}

export function Toast({ id, message, onDismiss }: ToastProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#034325',
        color: '#ffffff',
        padding: '12px 20px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        zIndex: 9999,
        maxWidth: '90vw',
      }}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: '#ffffff',
          cursor: 'pointer',
          fontSize: 18,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        ×
      </button>
    </div>
  )
}

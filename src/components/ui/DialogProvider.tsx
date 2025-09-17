"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import AppModal from './AppModal'

type DialogKind = 'alert' | 'confirm' | 'prompt'

type BaseOptions = {
  title?: string
  icon?: string
  confirmText?: string
  cancelText?: string
}

type PromptOptions = BaseOptions & {
  inputLabel?: string
  placeholder?: string
  defaultValue?: string
}

type DialogState =
  | { open: false }
  | {
      open: true
      kind: DialogKind
      message: string | React.ReactNode
      options: BaseOptions | PromptOptions
      // For prompt
      inputValue?: string
      // Resolvers
  resolve: (value: unknown) => void
    }

type DialogContextType = {
  alert: (message: string | React.ReactNode, options?: BaseOptions) => Promise<void>
  confirm: (message: string | React.ReactNode, options?: BaseOptions) => Promise<boolean>
  prompt: (message: string | React.ReactNode, options?: PromptOptions) => Promise<string | null>
}

const DialogContext = createContext<DialogContextType | null>(null)

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>({ open: false })

  const close = useCallback(() => setState({ open: false }), [])

  const alert = useCallback<DialogContextType['alert']>((message, options) => {
    return new Promise<void>((resolve) => {
      setState({
        open: true,
        kind: 'alert',
        message,
        options: options || {},
        resolve: () => {
          resolve()
          close()
        }
      })
    })
  }, [close])

  const confirm = useCallback<DialogContextType['confirm']>((message, options) => {
    return new Promise<boolean>((resolve) => {
      setState({
        open: true,
        kind: 'confirm',
        message,
        options: options || {},
        resolve: (val: unknown) => {
          resolve(!!val)
          close()
        }
      })
    })
  }, [close])

  const prompt = useCallback<DialogContextType['prompt']>((message, options) => {
    const opts: PromptOptions = options || {}
    return new Promise<string | null>((resolve) => {
      setState({
        open: true,
        kind: 'prompt',
        message,
        options: opts,
        inputValue: opts.defaultValue || '',
        resolve: (val: unknown) => {
          resolve((val as string) ?? '')
          close()
        }
      })
    })
  }, [close])

  const ctx = useMemo(() => ({ alert, confirm, prompt }), [alert, confirm, prompt])

  const renderModal = () => {
    if (!state.open) return null
    const { kind, message } = state
    const opts = state.options || {}
    const title = opts.title || (kind === 'alert' ? 'Aviso' : kind === 'confirm' ? 'Confirmar' : 'Entrada requerida')
    const icon = opts.icon || (kind === 'alert' ? 'info-circle-fill' : kind === 'confirm' ? 'question-circle-fill' : 'pencil-square')
    const confirmText = opts.confirmText || (kind === 'confirm' ? 'Confirmar' : kind === 'prompt' ? 'Aceptar' : 'Ok')
    const cancelText = opts.cancelText || 'Cancelar'

    const footer = (
      <div className="d-flex justify-content-end gap-2">
        {kind !== 'alert' && (
          <button className="btn btn-soft-secondary btn-sm" onClick={() => state.resolve(kind === 'confirm' ? false : null)}>
            {cancelText}
          </button>
        )}
        <button
          className={kind === 'confirm' ? 'btn btn-soft-primary btn-sm' : 'btn btn-primary btn-sm'}
          onClick={() => {
            if (kind === 'prompt') state.resolve(state.inputValue || '')
            else if (kind === 'confirm') state.resolve(true)
            else state.resolve(undefined)
          }}
        >
          {confirmText}
        </button>
      </div>
    )

    return (
  <AppModal title={title} icon={icon} onClose={() => state.resolve(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined)} footer={footer}>
        <div className="small">
          {typeof message === 'string' ? <p className="mb-2">{message}</p> : message}
          {kind === 'prompt' && (
            <div className="mt-2">
              <label className="form-label small mb-1">{(state.options as PromptOptions).inputLabel || 'Valor'}</label>
              <input
                className="form-control form-control-sm"
                placeholder={(state.options as PromptOptions).placeholder || ''}
                value={state.inputValue || ''}
                onChange={e => setState(prev => (prev.open ? { ...prev, inputValue: e.target.value } : prev))}
              />
            </div>
          )}
        </div>
      </AppModal>
    )
  }

  return (
    <DialogContext.Provider value={ctx}>
      {children}
      {renderModal()}
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used within DialogProvider')
  return ctx
}

export default DialogProvider

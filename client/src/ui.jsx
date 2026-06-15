import React, { useState } from 'react';

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" style={wide ? { width: 640 } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Confirm({ message, onYes, onClose }) {
  return (
    <Modal
      title="Please confirm"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn danger" onClick={() => { onYes(); onClose(); }}>Delete</button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

// small hook to manage a confirm-delete dialog
export function useConfirm() {
  const [state, setState] = useState(null);
  const node = state ? (
    <Confirm message={state.message} onYes={state.onYes} onClose={() => setState(null)} />
  ) : null;
  return [node, (message, onYes) => setState({ message, onYes })];
}

export function ErrorMsg({ children }) {
  if (!children) return null;
  return <div className="error">{children}</div>;
}

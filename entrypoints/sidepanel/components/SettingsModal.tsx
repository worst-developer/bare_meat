import React, { useState } from 'react';
import type { ChatTarget } from '../../../src/types';
import ChatTargetForm from './ChatTargetForm';
import { logoForProvider, providerLogoNeedsBackplate } from '../logos';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatTargets: ChatTarget[];
  onSaveChatTarget: (target: ChatTarget) => void;
  onDeleteChatTarget: (targetId: string) => void;
  onUpdateChatTarget: (target: ChatTarget) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  chatTargets,
  onSaveChatTarget,
  onDeleteChatTarget,
  onUpdateChatTarget,
}: SettingsModalProps) {
  const [editingTarget, setEditingTarget] = useState<ChatTarget | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);

  if (!isOpen) return null;

  const handleSaveChatTarget = (target: ChatTarget) => {
    if (editingTarget) {
      onUpdateChatTarget(target);
    } else {
      onSaveChatTarget(target);
    }
    setShowForm(false);
    setEditingTarget(undefined);
  };

  const handleEditTarget = (target: ChatTarget) => {
    setEditingTarget(target);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTarget(undefined);
  };

  const handleAddNewTarget = () => {
    setEditingTarget(undefined);
    setShowForm(true);
  };

  return (
    <div className="modal modal-open settings-modal">
      <div className="modal-box settings-modal__box">
        <div className="settings-modal__header">
          <div>
            <h2 className="settings-modal__title">Settings</h2>
          </div>
          <button className="btn btn-ghost btn-square btn-sm" type="button" aria-label="Close settings" onClick={onClose}>
            x
          </button>
        </div>

        <div className="settings-modal__content">
          {showForm ? (
            <ChatTargetForm
              initialData={editingTarget}
              onSave={handleSaveChatTarget}
              onCancel={handleCloseForm}
            />
          ) : (
            <div className="settings-section">
              <div className="settings-section__toolbar">
                <h3 className="settings-section__title">Chat targets</h3>
                <div className="settings-section__actions">
                  <button className="btn btn-sm" type="button" onClick={handleAddNewTarget}>
                    Add
                  </button>
                </div>
              </div>

              {chatTargets.length === 0 ? (
                <div className="empty-state settings-empty">
                  No chat targets configured.
                </div>
              ) : (
                <div className="settings-target-list">
                  {chatTargets.map((target) => (
                    <div key={target.id} className="settings-target">
                      <div className="settings-target__top">
                        <div className="settings-target__main">
                          <h4 className="settings-target__name settings-target__name--logo">
                            <img
                              className={`service-logo-image agent-logo-image${providerLogoNeedsBackplate(target.provider) ? ' service-logo-image--backplate' : ''}`}
                              src={logoForProvider(target.provider)}
                              alt=""
                              aria-hidden="true"
                            />
                            {target.name}
                          </h4>
                          <div className="settings-target__url">{target.chatUrl}</div>
                        </div>
                        <input
                          className="toggle toggle-sm"
                          type="checkbox"
                          aria-label={`${target.name} enabled`}
                          checked={target.enabled}
                          onChange={(event) => onUpdateChatTarget({ ...target, enabled: event.target.checked })}
                        />
                      </div>
                      <div className="settings-target__actions">
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleEditTarget(target)}>
                          Edit
                        </button>
                        <button className="btn btn-error btn-soft btn-sm" type="button" onClick={() => onDeleteChatTarget(target.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <button className="modal-backdrop" type="button" aria-label="Close settings" onClick={onClose}>close</button>
    </div>
  );
}

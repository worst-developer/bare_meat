import React, { useState } from 'react';
import type { ChatTarget, PromptSettings } from '../../../src/types';
import ChatTargetForm from './ChatTargetForm';
import BasePromptEditor from './BasePromptEditor';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatTargets: ChatTarget[];
  promptSettings: PromptSettings;
  onSaveChatTarget: (target: ChatTarget) => void;
  onDeleteChatTarget: (targetId: string) => void;
  onUpdateChatTarget: (target: ChatTarget) => void;
  onUpdatePromptSettings: (settings: PromptSettings) => void;
  onClearScreenshots: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  chatTargets,
  promptSettings,
  onSaveChatTarget,
  onDeleteChatTarget,
  onUpdateChatTarget,
  onUpdatePromptSettings,
  onClearScreenshots,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'chats' | 'prompt'>('chats');
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

  const renderChatsTab = () => (
    <div style={{ padding: '8px 0' }}>
      {showForm ? (
        <ChatTargetForm
          initialData={editingTarget}
          onSave={handleSaveChatTarget}
          onCancel={handleCloseForm}
        />
      ) : (
        <>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            padding: '16px 8px',
            background: '#1a1a2e',
            borderRadius: '8px',
          }}>
            <h3 style={{ fontSize: '16px', margin: 0, color: '#4fc3f7' }}>
              Configured Chat Targets
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleAddNewTarget}
                style={{
                  padding: '8px 12px',
                  background: '#4caf50',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                }}
              >
                + Add
              </button>
              <button
                onClick={onClearScreenshots}
                style={{
                  padding: '8px 12px',
                  background: '#333',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                }}
              >
                Clear shots
              </button>
            </div>
          </div>

          {/* List */}
          {chatTargets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>
              <p style={{ fontSize: '14px', marginBottom: '8px' }}>No chat targets configured</p>
              <p style={{ fontSize: '12px' }}>Click "Add Target" to configure AI conversations</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {chatTargets.map((target) => (
                <div
                  key={target.id}
                  style={{
                    padding: '16px',
                    background: editingTarget?.id === target.id ? '#2a2a4e' : '#1a1a2e',
                    border: editingTarget?.id === target.id ? '2px solid #4fc3f7' : '1px solid #333',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <h4 style={{ fontSize: '14px', margin: 0, color: '#fff' }}>{target.name}</h4>
                        <span
                          style={{
                            padding: '2px 8px',
                            background: target.enabled ? '#4caf50' : '#f44336',
                            color: '#fff',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: '600',
                          }}
                        >
                          {target.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '12px', color: '#aaa' }}>
                        <span>🤖 {target.provider.toUpperCase()}</span>
                        <span>📊 Sends selected screenshots</span>
                      </div>

                      <div style={{ fontSize: '11px', color: '#666', wordBreak: 'break-all' }}>
                                📍 {target.chatUrl}
                              </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                      <button
                        onClick={() => handleEditTarget(target)}
                        style={{
                          padding: '6px 12px',
                          background: '#4fc3f7',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#1a1a2e',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDeleteChatTarget(target.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#f44336',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Enable/Disable Toggle */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #333' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={target.enabled}
                        onChange={(e) => {
                          onUpdateChatTarget({ ...target, enabled: e.target.checked });
                        }}
                        style={{ marginRight: '8px', width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '12px', color: '#ccc' }}>
                        {target.enabled ? 'This target will receive analyses' : 'This target is disabled'}
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderPromptTab = () => (
    <BasePromptEditor
      basePrompt={promptSettings.basePrompt}
      onSave={(newPrompt) => onUpdatePromptSettings({ basePrompt: newPrompt })}
    />
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        width: '90%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'hidden',
        background: '#16213e',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{ fontSize: '18px', margin: 0, color: '#4fc3f7' }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: '24px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #333',
          backgroundColor: '#1a1a2e',
        }}>
          <button
            onClick={() => setActiveTab('chats')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'chats' ? '#2a2a4e' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'chats' ? '2px solid #4fc3f7' : 'none',
              color: activeTab === 'chats' ? '#4fc3f7' : '#888',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
          >
            Chats ({chatTargets.filter(t => t.enabled).length} active)
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'prompt' ? '#2a2a4e' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'prompt' ? '2px solid #4fc3f7' : 'none',
              color: activeTab === 'prompt' ? '#4fc3f7' : '#888',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
          >
            Base Prompt
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: '300px' }}>
          {activeTab === 'chats' && renderChatsTab()}
          {activeTab === 'prompt' && renderPromptTab()}
        </div>
      </div>
    </div>
  );
}

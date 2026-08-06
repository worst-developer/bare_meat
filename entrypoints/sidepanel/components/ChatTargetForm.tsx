import React, { useState } from 'react';
import type { ChatTarget, Provider } from '../../../src/types';

interface ChatTargetFormProps {
  initialData?: ChatTarget;
  onSave: (target: ChatTarget) => void;
  onCancel: () => void;
}

type FormErrors = {
  name?: string;
  provider?: string;
  url?: string;
};

export default function ChatTargetForm({ initialData, onSave, onCancel }: ChatTargetFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [provider, setProvider] = useState<Provider>(initialData?.provider || 'chatgpt');
  const [url, setUrl] = useState(initialData?.chatUrl || '');
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);
  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.length > 50) {
      newErrors.name = 'Name must be less than 50 characters';
    }

    // Validate provider
    if (!provider) {
      newErrors.provider = 'Please select a provider';
    }

    // Validate URL
    if (!url.trim()) {
      newErrors.url = 'Conversation URL is required';
    } else {
      try {
        new URL(url.trim());
      } catch {
        newErrors.url = 'Please enter a valid URL (include https://)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const target: ChatTarget = {
      id: initialData?.id || `target_${Date.now()}`,
      name: name.trim(),
      provider,
      symbols: ['*'],
      chatUrl: url.trim(),
      enabled,
    };

    onSave(target);
  };

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel? Unsaved changes will be lost.')) {
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bp-chat-target-form">
      <h2 style={{ fontSize: '18px', marginBottom: '20px', color: '#4fc3f7' }}>
        {initialData ? 'Edit Chat Target' : 'Add New Chat Target'}
      </h2>

      {/* Name Field */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#ccc' }}>
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., BTC Analysis, SOL Trading"
          style={{
            width: '100%',
            padding: '10px',
            background: '#2a2a4e',
            border: errors.name ? '2px solid #f44336' : '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px',
          }}
        />
        {errors.name && (
          <span style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>
            {errors.name}
          </span>
        )}
      </div>

      {/* Provider Field */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#ccc' }}>
          Provider *
        </label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          style={{
            width: '100%',
            padding: '10px',
            background: '#2a2a4e',
            border: errors.provider ? '2px solid #f44336' : '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px',
          }}
        >
          <option value="chatgpt">ChatGPT</option>
          <option value="grok">Grok</option>
          <option value="deepseek">DeepSeek</option>
          <option value="kimi">Kimi</option>
        </select>
        {errors.provider && (
          <span style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>
            {errors.provider}
          </span>
        )}
      </div>

      {/* URL Field */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#ccc' }}>
          Conversation URL *
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://chatgpt.com/c/xxxxxx"
          style={{
            width: '100%',
            padding: '10px',
            background: '#2a2a4e',
            border: errors.url ? '2px solid #f44336' : '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px',
          }}
        />
        {errors.url && (
          <span style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>
            {errors.url}
          </span>
        )}
        <p style={{ fontSize: '11px', color: '#888', margin: '8px 0 0 0' }}>
          Paste the URL of an existing conversation or leave blank for new one
        </p>
      </div>

      {/* Enabled Toggle */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ marginRight: '8px', width: '18px', height: '18px' }}
          />
          <span style={{ fontSize: '14px', color: '#ccc' }}>Enabled</span>
        </label>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleCancel}
          style={{
            padding: '10px 20px',
            background: '#333',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            background: '#4caf50',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          {initialData ? 'Save Changes' : 'Create Target'}
        </button>
      </div>
    </form>
  );
}

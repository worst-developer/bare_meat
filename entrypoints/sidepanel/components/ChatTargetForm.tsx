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

const PROVIDER_OPTIONS: Array<{ value: Provider; label: string }> = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'grok', label: 'Grok' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'kimi', label: 'Kimi' },
];

export default function ChatTargetForm({ initialData, onSave, onCancel }: ChatTargetFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [provider, setProvider] = useState<Provider>(initialData?.provider || 'chatgpt');
  const [url, setUrl] = useState(initialData?.chatUrl || '');
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);
  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.length > 50) {
      newErrors.name = 'Name must be less than 50 characters';
    }

    if (!provider) {
      newErrors.provider = 'Please select a provider';
    }

    if (!url.trim()) {
      newErrors.url = 'Conversation URL is required';
    } else {
      try {
        new URL(url.trim());
      } catch {
        newErrors.url = 'Please enter a valid URL with https://';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    onSave({
      id: initialData?.id || `target_${Date.now()}`,
      name: name.trim(),
      provider,
      symbols: ['*'],
      chatUrl: url.trim(),
      enabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="chat-target-form">
      <h2 className="settings-section__title">
        {initialData ? 'Edit chat target' : 'Add chat target'}
      </h2>

      <label className="form-control">
        <span className="label-text">Name</span>
        <input
          className={`input input-bordered${errors.name ? ' input-error' : ''}`}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="BTC analysis"
        />
        {errors.name && <span className="form-error">{errors.name}</span>}
      </label>

      <label className="form-control">
        <span className="label-text">Provider</span>
        <div className={`provider-picker${errors.provider ? ' provider-picker--error' : ''}`}>
          {PROVIDER_OPTIONS.map((option) => (
            <label key={option.value} className={`provider-option${provider === option.value ? ' provider-option--selected' : ''}`}>
              <input
                type="radio"
                name="provider"
                value={option.value}
                checked={provider === option.value}
                onChange={() => setProvider(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {errors.provider && <span className="form-error">{errors.provider}</span>}
      </label>

      <label className="form-control">
        <span className="label-text">Conversation URL</span>
        <input
          className={`input input-bordered${errors.url ? ' input-error' : ''}`}
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://chatgpt.com/c/xxxxxx"
        />
        {errors.url && <span className="form-error">{errors.url}</span>}
      </label>

      <label className="chat-target-form__enabled" aria-label="Enabled">
        <input
          className="toggle toggle-sm"
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
      </label>

      <div className="chat-target-form__actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" type="submit">
          {initialData ? 'Save changes' : 'Create target'}
        </button>
      </div>
    </form>
  );
}

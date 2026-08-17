import React, { useState } from 'react';

interface BasePromptEditorProps {
  basePrompt: string;
  onSave: (newPrompt: string) => void;
}

const DEFAULT_PROMPTS = [
  'You are an expert multi-timeframe market analyst. Analyze the attached TradingView charts professionally and identify key support/resistance levels, trend direction, potential entries, exits, and risk management recommendations.',
  'Act as a professional trading analyst. Examine the provided Technical Analysis screenshots from TradingView. Discuss momentum indicators, volume patterns, key price levels, and actionable trade setups with precise entry/exit/risk parameters.',
  'You are a quantitative trading expert. Evaluate the displayed chart data across multiple timeframes. Identify confluence zones, divergence patterns, and formulate high-probability trade thesis with clear validation criteria.',
];

export default function BasePromptEditor({ basePrompt, onSave }: BasePromptEditorProps) {
  const [prompt, setPrompt] = useState(basePrompt);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!prompt.trim()) return;

    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    onSave(prompt);
    setIsSaving(false);
    setSaved(true);

    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="prompt-editor">
      <label className="form-control">
        <span className="label-text">Base analysis prompt</span>
        <textarea
          className={`textarea textarea-bordered prompt-editor__textarea${saved ? ' textarea-success' : ''}`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Enter your base prompt here..."
          rows={8}
        />
      </label>

      {saved && (
        <div className="alert alert-success alert-soft prompt-editor__saved">
          Saved successfully.
        </div>
      )}

      <div className="prompt-editor__templates">
        <h4 className="settings-section__title">Quick templates</h4>
        {DEFAULT_PROMPTS.map((template, index) => (
          <div key={template} className="prompt-template">
            <div className="prompt-template__label">Template {index + 1}</div>
            <p className="prompt-template__text">{template.substring(0, 150)}...</p>
            <button className="btn btn-ghost btn-xs" type="button" onClick={() => setPrompt(template)}>
              Use template
            </button>
          </div>
        ))}
      </div>

      <div className="prompt-editor__actions">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => void handleSave()}
          disabled={!prompt.trim() || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save prompt'}
        </button>
      </div>
    </div>
  );
}

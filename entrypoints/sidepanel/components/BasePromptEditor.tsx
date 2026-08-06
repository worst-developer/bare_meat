import React, { useState } from 'react';

interface BasePromptEditorProps {
  basePrompt: string;
  onSave: (newPrompt: string) => void;
}

const DEFAULT_PROMPTS = [
  `You are an expert multi-timeframe market analyst. Analyze the attached TradingView charts professionally and identify key support/resistance levels, trend direction, potential entries, exits, and risk management recommendations.`,
  
  `Act as a professional trading analyst. Examine the provided Technical Analysis screenshots from TradingView. Discuss momentum indicators, volume patterns, key price levels, and actionable trade setups with precise entry/exit/risk parameters.`,
  
  `You are a quantitative trading expert. Evaluate the displayed chart data across multiple timeframes. Identify confluence zones, divergence patterns, and formulate high-probability trade thesis with clear validation criteria.`
];

export default function BasePromptEditor({ basePrompt, onSave }: BasePromptEditorProps) {
  const [prompt, setPrompt] = useState(basePrompt);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!prompt.trim()) return;
    
    setIsSaving(true);
    // Simulate save delay for UX
    await new Promise(resolve => setTimeout(resolve, 300));
    
    onSave(prompt);
    setIsSaving(false);
    setSaved(true);
    
    setTimeout(() => setSaved(false), 2000);
  };

  const loadTemplate = (template: string) => {
    setPrompt(template);
  };

  return (
    <div style={{ padding: '16px 8px' }}>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', color: '#ccc' }}>
          Base Analysis Prompt
        </label>
        
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your base prompt here..."
          rows={8}
          style={{
            width: '100%',
            padding: '12px',
            background: '#2a2a4e',
            border: saved ? '2px solid #4caf50' : isSaving ? '2px solid #4fc3f7' : '1px solid #444',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            lineHeight: 1.6,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        
        {/* Save Status */}
        {saved && (
          <div style={{
            marginTop: '8px',
            padding: '8px 12px',
            background: '#4caf50',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '600',
          }}>
            ✓ Saved successfully!
          </div>
        )}
      </div>

      {/* Templates Section */}
      <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #333' }}>
        <h4 style={{ fontSize: '13px', marginBottom: '16px', color: '#4fc3f7' }}>
          Quick Templates
        </h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {DEFAULT_PROMPTS.map((template, index) => (
            <div
              key={index}
              style={{
                padding: '12px',
                background: '#1a1a2e',
                borderRadius: '8px',
                border: '1px solid #333',
              }}
            >
              <p style={{ 
                fontSize: '11px', 
                color: '#888', 
                marginBottom: '8px',
                fontWeight: '600',
              }}>
                Template {index + 1}
              </p>
              <p style={{ 
                fontSize: '12px', 
                color: '#ccc',
                lineHeight: 1.5,
                margin: '0 0 8px 0',
              }}>
                {template.substring(0, 150)}...
              </p>
              <button
                onClick={() => loadTemplate(template)}
                style={{
                  padding: '6px 12px',
                  background: '#4fc3f7',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#1a1a2e',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                }}
              >
                Use This Template
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div style={{
        marginTop: '24px',
        paddingTop: '16px',
        borderTop: '1px solid #333',
        display: 'flex',
        justifyContent: 'flex-end',
      }}>
        <button
          onClick={handleSave}
          disabled={!prompt.trim() || isSaving}
          style={{
            padding: '10px 24px',
            background: !prompt.trim() ? '#333' : '#4caf50',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: !prompt.trim() ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            opacity: !prompt.trim() ? 0.5 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isSaving ? 'Saving...' : 'Save Prompt'}
        </button>
      </div>
    </div>
  );
}

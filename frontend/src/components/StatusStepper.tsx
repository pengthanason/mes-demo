import React from 'react';
import { StepItem } from '../lib/woLifecycle';
import './StatusStepper.css';

type StatusStepperProps = {
  steps: StepItem[];
  size?: 'normal' | 'mini';
};

export function StatusStepper({ steps, size = 'normal' }: StatusStepperProps) {
  const isMini = size === 'mini';

  return (
    <div className={`status-stepper-container ${isMini ? 'mini' : ''}`}>
      <ul className="stepper-list">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`stepper-item ${step.state}`}
            title={isMini ? step.label : ''}
            style={{ '--step-color': step.color } as React.CSSProperties}
          >
            <div className="step-marker">
              {!isMini && step.state === 'done' ? '✓' : !isMini ? (index + 1) : ''}
            </div>
            <div className="step-label">{step.label}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

import React from 'react';
import { StepItem } from '../lib/woLifecycle';

type StatusStepperProps = {
  steps: StepItem[];
  size?: 'normal' | 'mini';
};

export function StatusStepper({ steps, size = 'normal' }: StatusStepperProps) {
  const isMini = size === 'mini';

  return (
    <div className={`status-stepper-container ${isMini ? 'mini' : ''}`}>
      <style>{`
        .status-stepper-container {
          width: 100%;
          padding: ${isMini ? '0' : '1rem 0'};
        }
        
        .stepper-list {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: flex-start;
          list-style: none;
          padding: 0;
          margin: 0;
          position: relative;
        }

        .stepper-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          z-index: 1;
        }

        .stepper-item:not(:last-child)::after {
          content: '';
          position: absolute;
          top: ${isMini ? '6px' : '14px'};
          left: 50%;
          width: 100%;
          height: ${isMini ? '2px' : '3px'};
          background-color: var(--border-color, #e2e8f0);
          z-index: -1;
        }
        .stepper-item.done:not(:last-child)::after {
          background-color: var(--step-color);
        }

        .step-marker {
          width: ${isMini ? '12px' : '28px'};
          height: ${isMini ? '12px' : '28px'};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isMini ? '0px' : '14px'};
          font-weight: bold;
          background-color: white;
          border: ${isMini ? '2px' : '3px'} solid var(--step-color);
          color: var(--step-color);
          transition: all 0.3s ease;
        }

        .stepper-item.done .step-marker {
          background-color: var(--step-color);
          color: white;
        }

        .stepper-item.current .step-marker {
          background-color: var(--step-color);
          color: white;
          box-shadow: 0 0 0 3px var(--bg-panel, #ffffff), 0 0 0 5px var(--step-color);
          transform: scale(1.1);
        }

        .step-label {
          margin-top: ${isMini ? '0' : '0.75rem'};
          font-size: ${isMini ? '0' : '0.85rem'};
          font-weight: 600;
          color: var(--step-color);
          text-align: center;
          display: ${isMini ? 'none' : 'block'};
        }

        .stepper-item.current .step-label {
          font-weight: 800;
        }

        @media (max-width: 640px) {
          .status-stepper-container:not(.mini) .stepper-list {
            flex-direction: column;
            align-items: flex-start;
            gap: 1.5rem;
          }
          .status-stepper-container:not(.mini) .stepper-item {
            flex-direction: row;
            width: 100%;
          }
          .status-stepper-container:not(.mini) .stepper-item:not(:last-child)::after {
            width: 3px;
            height: calc(100% + 1.5rem);
            top: 28px;
            left: 12.5px;
          }
          .status-stepper-container:not(.mini) .step-label {
            margin-top: 0;
            margin-left: 1.5rem;
            text-align: left;
          }
        }
      `}</style>

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
import React, { useState } from 'react';
import { X, CheckCircle, Circle, ChevronRight, ChevronLeft, Upload, Plus, Zap, MessageSquare, Navigation, Check } from 'lucide-react';

const STEPS = [
  {
    id: 'import',
    title: 'Import Test Drivers',
    icon: Upload,
    description: 'Start by importing the 11 pre-loaded test drivers into your fleet.',
    instructions: [
      'Click the "CSV" button at the top of the Fleet panel on the left',
      'Select "Load Test Drivers" (already selected by default)',
      'Click "Import 11 Test Drivers"',
      'Wait for the import complete screen — all 11 should show green checkmarks',
      'Click Done to close the modal',
    ],
    hint: 'After import, you will see driver cards appear in the left Fleet panel.',
    action: 'Open CSV Import',
    actionKey: 'csv',
  },
  {
    id: 'verify_fleet',
    title: 'Verify Fleet Loaded',
    icon: CheckCircle,
    description: 'Confirm all test drivers appear in the Fleet panel.',
    instructions: [
      'Look at the Fleet panel on the left side',
      'You should see at least 11 driver cards',
      'Each card shows the driver name, TLC number, and "Offline" status',
      'The "NO PHOTO" badge is normal — photos can be added later',
      'The Fleet header shows "Fleet — 11" (or however many were imported)',
    ],
    hint: 'Driver status will be Offline until they log in to the Driver App.',
    action: 'Mark Step Complete',
    actionKey: 'verify',
  },
  {
    id: 'select_driver',
    title: 'Select a Driver',
    icon: Navigation,
    description: 'Click a driver card to select them. The Trips panel will re-rank available trips by proximity to that driver.',
    instructions: [
      'Click any driver card in the Fleet panel',
      'The selected card highlights with a gold border',
      'Look at the Trips panel on the right — trips are now sorted by score',
      'Trips closer to the selected driver\'s home address rank higher',
      'The score is based on delivery price + distance bonus',
    ],
    hint: 'Trip scoring only works when the driver has a start address saved in their app.',
    action: 'Mark Step Complete',
    actionKey: 'select',
  },
  {
    id: 'assign_trip',
    title: 'Assign a Trip',
    icon: Zap,
    description: 'With a driver selected, assign them a trip from the right panel.',
    instructions: [
      'Make sure a driver is selected (gold border on their card)',
      'Click any trip card in the Trips panel on the right',
      'An "Assign" button appears on the trip card',
      'Click Assign — the trip changes to "Assigned" status immediately',
      'The trip counter on the driver card increments by 1',
    ],
    hint: 'If no trips are showing, click the Refresh button in the Trips panel header.',
    action: 'Mark Step Complete',
    actionKey: 'assign',
  },
  {
    id: 'take5',
    title: 'Test Take 5 Feature',
    icon: Zap,
    description: 'The Take 5 button lets you quickly view and assign the top 5 trips to a specific driver.',
    instructions: [
      'Find any driver card in the Fleet panel',
      'Click the "Take 5" button (gold button at the bottom of the card)',
      'A modal opens showing the top 5 scored trips for that driver',
      'Click any trip in the modal to assign it to that driver',
      'The modal closes and the assignment is confirmed',
    ],
    hint: 'Take 5 is designed for fast dispatching — one click to see best trips, one click to assign.',
    action: 'Mark Step Complete',
    actionKey: 'take5',
  },
  {
    id: 'chat',
    title: 'Test Chat System',
    icon: MessageSquare,
    description: 'The chat panel lets your dispatch team communicate with drivers in real time.',
    instructions: [
      'Look for the chat bubble icon in the bottom-right corner of the screen',
      'Click it to open the Chat Panel',
      'Select a driver from the thread list (or start a new thread)',
      'Type a test message and press Enter or click Send',
      'The message appears in the thread immediately',
    ],
    hint: 'Drivers receive messages in the Driver App. Replies appear here in real time via Firebase.',
    action: 'Mark Step Complete',
    actionKey: 'chat',
  },
  {
    id: 'done',
    title: 'Dispatch Test Complete',
    icon: CheckCircle,
    description: 'You have successfully tested all core dispatch features.',
    instructions: [
      'Fleet import works — drivers load from CSV correctly',
      'Trip assignment works — trips link to drivers instantly',
      'Take 5 works — quick dispatch flow confirmed',
      'Chat works — messages send and display correctly',
      'The system is ready for live dispatch operations',
    ],
    hint: 'For a full end-to-end test, use the Testing Center in the Admin dashboard.',
    action: null,
    actionKey: 'done',
  },
];

export default function DispatchWalkthrough({ onClose, onTriggerAction }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const step = STEPS[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === STEPS.length - 1;
  const isFirst = currentStep === 0;

  function markComplete() {
    setCompletedSteps(prev => new Set([...prev, step.id]));
    if (!isLast) setCurrentStep(prev => prev + 1);
  }

  function handleAction() {
    if (step.actionKey === 'csv') {
      onTriggerAction('csv');
      markComplete();
    } else {
      markComplete();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(201,168,76,0.04)' }}
        >
          <div>
            <p className="text-sm font-700" style={{ fontWeight: 700, color: '#c9a84c' }}>Dispatch Test Walkthrough</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Step {currentStep + 1} of {STEPS.length}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-4">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className="flex-1 h-1 rounded-full transition-all"
              style={{
                background: completedSteps.has(s.id)
                  ? '#00e5a0'
                  : i === currentStep
                  ? '#c9a84c'
                  : 'rgba(255,255,255,0.08)',
              }}
            />
          ))}
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)' }}
            >
              <Icon className="w-5 h-5" style={{ color: '#c9a84c' }} />
            </div>
            <div>
              <p className="text-base font-700" style={{ fontWeight: 700, color: '#e5e7eb' }}>{step.title}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{step.description}</p>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            {step.instructions.map((inst, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3"
                style={{ borderBottom: i < step.instructions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-700"
                  style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c', fontWeight: 700, minWidth: 20 }}
                >
                  {i + 1}
                </div>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{inst}</p>
              </div>
            ))}
          </div>

          {step.hint && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}
            >
              <span className="text-xs" style={{ color: '#0ea5e9' }}>Tip:</span>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{step.hint}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
              disabled={isFirst}
              className="w-9 h-9 flex items-center justify-center rounded-xl btn-ghost"
              style={{ opacity: isFirst ? 0.3 : 1 }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex-1">
              {isLast ? (
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl text-sm font-700 flex items-center justify-center gap-2"
                  style={{ background: '#00e5a0', color: '#07090d', fontWeight: 700, border: 'none' }}
                >
                  <Check className="w-4 h-4" />
                  Done — Close Walkthrough
                </button>
              ) : (
                <button
                  onClick={handleAction}
                  className="w-full py-2.5 rounded-xl text-sm font-700 flex items-center justify-center gap-2"
                  style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', fontWeight: 700 }}
                >
                  {completedSteps.has(step.id) ? (
                    <>
                      <CheckCircle className="w-4 h-4" style={{ color: '#00e5a0' }} />
                      <span style={{ color: '#00e5a0' }}>Step Done — Next</span>
                    </>
                  ) : (
                    <>
                      {step.action}
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>

            {!isLast && (
              <button
                onClick={() => setCurrentStep(prev => Math.min(STEPS.length - 1, prev + 1))}
                className="w-9 h-9 flex items-center justify-center rounded-xl btn-ghost"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 pt-1">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrentStep(i)}
                className="transition-all"
                style={{
                  width: i === currentStep ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: completedSteps.has(s.id)
                    ? '#00e5a0'
                    : i === currentStep
                    ? '#c9a84c'
                    : 'rgba(255,255,255,0.15)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

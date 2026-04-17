import React, { useMemo, useState } from 'react';
import { X, ChevronRight, ChevronDown, AlertTriangle, MessageCircle, Coffee, DollarSign, Navigation, CheckCircle, Zap, Clock, Volume2, Pause, Square } from 'lucide-react';
import { useDriverVoiceGuide } from '../../lib/driverVoiceGuide';
import { getGuideAudioSrc, useGuideAudioPlayback } from '../../lib/guideAudio';

const SECTIONS = [
  {
    icon: <Zap className="w-5 h-5" />,
    color: '#c9a84c',
    title: 'How Trips Work',
    items: [
      { q: 'How do I get trips?', a: 'Tap "Request Rides Near Me" to signal to dispatch that you\'re available. When a new trip is assigned, your phone will vibrate and a trip card will appear.' },
      { q: 'How long do I have to accept?', a: 'You have 15 seconds to accept or reject a trip. A countdown timer shows on screen. If you don\'t respond, the trip is automatically rejected.' },
      { q: 'What do the colors mean?', a: 'Green dot = Pickup location. Red dot = Dropoff location. Gold = earnings and confirmations. Blue = navigation actions.' },
      { q: 'How do I report a trip issue?', a: 'While on a trip, tap the three-dot menu (⋮) in the top-right of the trip card, then tap "Report an Issue" to send a note to dispatch.' },
    ],
  },
  {
    icon: <Navigation className="w-5 h-5" />,
    color: '#0ea5e9',
    title: 'Navigation',
    items: [
      { q: 'How do I navigate to pickup?', a: 'After accepting a trip, tap the three-dot menu (⋮) and select Google Maps, Apple Maps, or Waze. The destination is pre-filled automatically.' },
      { q: 'How do I confirm pickup?', a: 'When you arrive at the pickup location, tap the green "Arrived — Confirm Pickup" button. This notifies the rider that you\'re there.' },
      { q: 'How do I complete a trip?', a: 'After dropping off the passenger, tap "Trip Complete", then confirm in the dialog. This logs the trip and updates your earnings.' },
      { q: 'Is GPS required?', a: 'Yes. The app uses your GPS automatically — no address entry needed. Make sure location permissions are set to "Always" or "While Using".' },
    ],
  },
  {
    icon: <AlertTriangle className="w-5 h-5" />,
    color: '#ff4757',
    title: 'SOS Emergency',
    items: [
      { q: 'How do I use SOS?', a: 'Press and hold the red SOS button (bottom-right corner) for 2 seconds. A progress ring fills up — hold until it completes to activate.' },
      { q: 'What happens when SOS activates?', a: 'Dispatch is immediately alerted with your GPS location and driver name. Your phone vibrates in an emergency pattern. A red overlay appears on screen.' },
      { q: 'How do I cancel a false alarm?', a: 'Tap "Cancel — False Alarm" in the red overlay that appears. This cancels the alert with dispatch.' },
      { q: 'When should I use SOS?', a: 'Use SOS only in genuine emergencies: dangerous passenger behavior, medical emergencies, accidents, or if you feel unsafe. Dispatch will respond immediately.' },
    ],
  },
  {
    icon: <MessageCircle className="w-5 h-5" />,
    color: '#00e5a0',
    title: 'Chat with Dispatch',
    items: [
      { q: 'Where is the chat button?', a: 'The gold chat bubble button is at the bottom-left corner of the screen. Tap it to open chat. An unread badge shows if you have new messages.' },
      { q: 'Can I use quick replies?', a: 'Yes. Common phrases like "On my way", "Arrived", "Running late", and "Need help" appear as quick-tap buttons inside the chat.' },
      { q: 'Will I see old messages?', a: 'Yes. Your chat history with dispatch is always saved and loads automatically each time you open the chat.' },
    ],
  },
  {
    icon: <Coffee className="w-5 h-5" />,
    color: '#f59e0b',
    title: 'Break Timer',
    items: [
      { q: 'How do I take a break?', a: 'Tap the Coffee icon in the top-right header. A 15-minute break timer starts. You won\'t receive new trips while on break.' },
      { q: 'How do I end my break early?', a: 'Tap "End Break Early" on the break overlay screen. You\'ll return to the waiting state immediately.' },
      { q: 'Does break time affect my pay?', a: 'For hourly pay: break time is included in your shift hours. For per-trip pay: breaks have no effect on earnings.' },
    ],
  },
  {
    icon: <DollarSign className="w-5 h-5" />,
    color: '#c9a84c',
    title: 'Earnings & Pay',
    items: [
      { q: 'Where do I see my earnings?', a: 'Your today\'s earnings show in the gold badge at the top of the screen. Trip count is shown below it.' },
      { q: 'How is hourly pay calculated?', a: 'Your hourly rate × hours worked since your shift started. The shift timer begins when you log in.' },
      { q: 'How is per-trip pay calculated?', a: 'Your per-trip rate × number of completed trips. Each completed trip adds to your total.' },
      { q: 'How do I set up payment?', a: 'Tap the card icon in the top-right header to open Payment Setup. Add your bank account details for direct deposit.' },
    ],
  },
  {
    icon: <CheckCircle className="w-5 h-5" />,
    color: '#00e5a0',
    title: 'Schedule & Incentives',
    items: [
      { q: 'Where is my daily schedule?', a: 'Tap the checkmark icon in the top-right header to open your schedule. Pre-scheduled trips for the day are shown here.' },
      { q: 'What are incentive bonuses?', a: 'Dispatch may set goals like "Complete 10 trips = $50 bonus". Progress toasts appear automatically as you get closer to a goal.' },
      { q: 'What is the Penthouse AI message?', a: 'The AI sends motivational tips and earnings insights during your shift. These appear as gold notification cards at the top of the screen.' },
    ],
  },
];

function Section({ section }) {
  const [open, setOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-4"
        style={{ background: 'rgba(255,255,255,0.04)', border: 'none' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${section.color}18`, color: section.color }}>
            {section.icon}
          </div>
          <span className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{section.title}</span>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
          : <ChevronRight className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
        }
      </button>

      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {section.items.map((item, i) => (
            <div key={i} style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
              <button
                onClick={() => setExpandedItem(expandedItem === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                style={{ background: 'none', border: 'none' }}
              >
                <span className="text-sm pr-3" style={{ color: expandedItem === i ? section.color : 'rgba(255,255,255,0.7)' }}>
                  {item.q}
                </span>
                {expandedItem === i
                  ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: section.color }} />
                  : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
                }
              </button>
              {expandedItem === i && (
                <div className="px-4 pb-4">
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DriverGuide({ onClose }) {
  const [search, setSearch] = useState('');
  const guideNarration = useMemo(() => {
    return SECTIONS.map(section => {
      const qas = section.items.map(item => `${item.q}. ${item.a}`).join(' ');
      return `${section.title}. ${qas}`;
    }).join(' ');
  }, []);
  const voice = useDriverVoiceGuide(guideNarration, { rate: 0.96 });
  const uploadedAudio = useGuideAudioPlayback(getGuideAudioSrc('driver_guide'));
  const usingUploadedAudio = uploadedAudio.available;
  const audioControl = usingUploadedAudio ? uploadedAudio : voice;

  const filtered = search.trim().length > 1
    ? SECTIONS.map(s => ({
        ...s,
        items: s.items.filter(
          it => it.q.toLowerCase().includes(search.toLowerCase()) || it.a.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(s => s.items.length > 0)
    : SECTIONS;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#07090d' }}>
      <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <p className="font-700 text-base" style={{ color: '#e5e7eb', fontWeight: 700 }}>Driver Guide</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>How to use the Penthouse app</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>
        </div>
      </div>

      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {(usingUploadedAudio || voice.supported) && (
          <div className="mb-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.16)' }}>
            <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {usingUploadedAudio
                ? 'Guide audio is available here so drivers can listen along if reading English is difficult.'
                : 'Perry voice helper can read the guide aloud from here while drivers follow along.'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={audioControl.toggle}
                className="px-3 py-2 rounded-full text-xs flex items-center gap-1.5"
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c' }}
              >
                {audioControl.playing && !audioControl.paused ? <Pause className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {audioControl.playing || audioControl.paused
                  ? (audioControl.paused ? 'Resume guide' : 'Pause guide')
                  : (usingUploadedAudio ? 'Play guide audio' : 'Listen to guide')}
              </button>
              {(audioControl.playing || audioControl.paused) && (
                <button
                  onClick={audioControl.stop}
                  className="px-3 py-2 rounded-full text-xs flex items-center gap-1.5"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.72)' }}
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
              )}
            </div>
          </div>
        )}
        <input
          type="text"
          placeholder="Search the guide..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-sm"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No results for "{search}"</p>
          </div>
        ) : (
          filtered.map((section, i) => <Section key={i} section={section} />)
        )}

        <div className="pt-2 pb-6 text-center">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Still need help? Use the chat button to message dispatch directly.
          </p>
        </div>
      </div>
    </div>
  );
}

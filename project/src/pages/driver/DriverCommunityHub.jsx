import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, MessageSquare, StickyNote, X, Send, Crown, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const FORUM_CATEGORIES = [
  { id: 'tip', label: 'Tip' },
  { id: 'motivation', label: 'Motivation' },
  { id: 'warning', label: 'Heads Up' },
];

const NOTE_TYPES = [
  { id: 'tip', label: 'Helpful Tip' },
  { id: 'vip', label: 'VIP Rider' },
  { id: 'warning', label: 'Watch Out' },
];

function DriverOfMonthCard({ leaders }) {
  const top = leaders[0];
  if (!top) return null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.05))',
        border: '1px solid rgba(201,168,76,0.28)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Crown className="w-4 h-4" style={{ color: '#c9a84c' }} />
        <p className="text-xs font-700 uppercase tracking-wider" style={{ color: '#c9a84c', fontWeight: 700 }}>
          Driver of the Month
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{top.driver_name}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Leading the monthly trip board
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{top.completed_trips}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>completed trips</p>
        </div>
      </div>
    </div>
  );
}

export default function DriverCommunityHub({ orgId, driver, currentTrip, onClose }) {
  const [leaders, setLeaders] = useState([]);
  const [forumPosts, setForumPosts] = useState([]);
  const [riderNotes, setRiderNotes] = useState([]);
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [savingPost, setSavingPost] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [postForm, setPostForm] = useState({ title: '', body: '', category: 'tip' });
  const [noteForm, setNoteForm] = useState({
    trip_id: currentTrip?.tripId || '',
    rider_name: currentTrip?.riderName || '',
    pickup_address: currentTrip?.puAddress || currentTrip?.pu_address || '',
    dropoff_address: currentTrip?.doAddress || currentTrip?.do_address || '',
    note_type: 'tip',
    note: '',
  });

  useEffect(() => {
    setNoteForm(prev => ({
      ...prev,
      trip_id: currentTrip?.tripId || prev.trip_id || '',
      rider_name: currentTrip?.riderName || prev.rider_name || '',
      pickup_address: currentTrip?.puAddress || currentTrip?.pu_address || prev.pickup_address || '',
      dropoff_address: currentTrip?.doAddress || currentTrip?.do_address || prev.dropoff_address || '',
    }));
  }, [currentTrip]);

  useEffect(() => {
    if (!orgId) return;
    loadCommunity();
  }, [orgId]);

  async function loadCommunity() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [{ data: assignments }, { data: posts }, { data: notes }] = await Promise.all([
      supabase
        .from('trip_assignments')
        .select('driver_id, driver_name, delivery_price, completed_at, status')
        .eq('status', 'completed')
        .gte('completed_at', monthStart.toISOString()),
      supabase
        .from('driver_forum_posts')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('driver_rider_notes')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    const leaderboardMap = {};
    (assignments || []).forEach(assignment => {
      const key = assignment.driver_id || assignment.driver_name || 'unknown';
      if (!leaderboardMap[key]) {
        leaderboardMap[key] = {
          driver_id: assignment.driver_id,
          driver_name: assignment.driver_name || 'Driver',
          completed_trips: 0,
          revenue: 0,
        };
      }
      leaderboardMap[key].completed_trips += 1;
      leaderboardMap[key].revenue += parseFloat(assignment.delivery_price || 0);
    });

    setLeaders(
      Object.values(leaderboardMap)
        .sort((a, b) => b.completed_trips - a.completed_trips || b.revenue - a.revenue)
        .slice(0, 12)
    );
    setForumPosts(posts || []);
    setRiderNotes(notes || []);
  }

  async function handleCreatePost() {
    if (!postForm.title.trim() || !postForm.body.trim() || !orgId || !driver?.id) return;
    setSavingPost(true);
    await supabase.from('driver_forum_posts').insert({
      org_id: orgId,
      author_driver_id: driver.id,
      author_name: driver.full_name || driver.name || 'Driver',
      title: postForm.title.trim(),
      body: postForm.body.trim(),
      category: postForm.category,
    });
    setPostForm({ title: '', body: '', category: 'tip' });
    setSavingPost(false);
    loadCommunity();
    setActiveTab('forum');
  }

  async function handleCreateRiderNote() {
    if (!noteForm.note.trim() || !orgId || !driver?.id) return;
    setSavingNote(true);
    await supabase.from('driver_rider_notes').insert({
      org_id: orgId,
      author_driver_id: driver.id,
      author_name: driver.full_name || driver.name || 'Driver',
      trip_id: noteForm.trip_id || '',
      rider_name: noteForm.rider_name || '',
      pickup_address: noteForm.pickup_address || '',
      dropoff_address: noteForm.dropoff_address || '',
      note_type: noteForm.note_type,
      note: noteForm.note.trim(),
    });
    setNoteForm(prev => ({ ...prev, note: '', note_type: 'tip' }));
    setSavingNote(false);
    loadCommunity();
    setActiveTab('riders');
  }

  const myRank = useMemo(() => {
    if (!driver?.id) return null;
    const index = leaders.findIndex(entry => entry.driver_id === driver.id);
    return index === -1 ? null : { ...leaders[index], rank: index + 1 };
  }, [leaders, driver?.id]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#07090d', paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)', paddingTop: 'calc(var(--safe-top) + 12px)' }}>
        <div>
          <p className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Driver Community</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Monthly competition, driver tips, and rider memory
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
        </button>
      </div>

      <div className="px-4 py-3 flex gap-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {[
          { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
          { id: 'forum', label: 'Forum', icon: MessageSquare },
          { id: 'riders', label: 'Rider Notes', icon: StickyNote },
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm"
              style={{
                background: active ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? 'rgba(201,168,76,0.28)' : 'rgba(255,255,255,0.08)'}`,
                color: active ? '#c9a84c' : 'rgba(255,255,255,0.55)',
                fontWeight: active ? 600 : 500,
              }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <DriverOfMonthCard leaders={leaders} />

        {myRank && (
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Your Monthly Rank</p>
              <p className="text-lg font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>#{myRank.rank}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{myRank.completed_trips} trips</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>${myRank.revenue.toFixed(2)} revenue</p>
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Sparkles className="w-4 h-4" style={{ color: '#c9a84c' }} />
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>
                Driver of the Month Trip Race
              </p>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {leaders.map((entry, index) => (
                <div key={entry.driver_id || entry.driver_name} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700"
                      style={{
                        background: index === 0 ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.06)',
                        color: index === 0 ? '#c9a84c' : '#e5e7eb',
                        fontWeight: 700,
                      }}
                    >
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{entry.driver_name}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>${entry.revenue.toFixed(2)} booked</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{entry.completed_trips}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>trips</p>
                  </div>
                </div>
              ))}
              {leaders.length === 0 && (
                <div className="px-4 py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  The monthly board will light up as completed trips start coming in.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'forum' && (
          <>
            <div className="rounded-2xl p-4 space-y-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Post a driver tip or win</p>
              <input
                type="text"
                placeholder="Post title"
                value={postForm.title}
                onChange={e => setPostForm(prev => ({ ...prev, title: e.target.value }))}
                className="w-full rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
              />
              <select
                value={postForm.category}
                onChange={e => setPostForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
              >
                {FORUM_CATEGORIES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <textarea
                rows={4}
                placeholder="Share what helped on a route, how you handled a tough pickup, or motivation for the team..."
                value={postForm.body}
                onChange={e => setPostForm(prev => ({ ...prev, body: e.target.value }))}
                className="w-full rounded-xl px-4 py-3 text-sm resize-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
              />
              <button
                onClick={handleCreatePost}
                disabled={savingPost || !postForm.title.trim() || !postForm.body.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600, opacity: savingPost ? 0.6 : 1 }}
              >
                <Send className="w-4 h-4" />
                {savingPost ? 'Posting...' : 'Post to Driver Forum'}
              </button>
            </div>

            <div className="space-y-3">
              {forumPosts.map(post => (
                <div key={post.id} className="rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c' }}>{post.category}</span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{post.author_name}</span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{new Date(post.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm font-700 mb-1" style={{ color: '#e5e7eb', fontWeight: 700 }}>{post.title}</p>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>{post.body}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'riders' && (
          <>
            <div className="rounded-2xl p-4 space-y-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Leave a rider note for the next driver</p>
              <input
                type="text"
                placeholder="Trip ID"
                value={noteForm.trip_id}
                onChange={e => setNoteForm(prev => ({ ...prev, trip_id: e.target.value }))}
                className="w-full rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
              />
              <input
                type="text"
                placeholder="Rider name (optional)"
                value={noteForm.rider_name}
                onChange={e => setNoteForm(prev => ({ ...prev, rider_name: e.target.value }))}
                className="w-full rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
              />
              <select
                value={noteForm.note_type}
                onChange={e => setNoteForm(prev => ({ ...prev, note_type: e.target.value }))}
                className="w-full rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
              >
                {NOTE_TYPES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <textarea
                rows={3}
                placeholder="What should the next driver know about this rider or trip?"
                value={noteForm.note}
                onChange={e => setNoteForm(prev => ({ ...prev, note: e.target.value }))}
                className="w-full rounded-xl px-4 py-3 text-sm resize-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', outline: 'none' }}
              />
              <button
                onClick={handleCreateRiderNote}
                disabled={savingNote || !noteForm.note.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#0ea5e9', fontWeight: 600, opacity: savingNote ? 0.6 : 1 }}
              >
                <Send className="w-4 h-4" />
                {savingNote ? 'Saving...' : 'Save Rider Note'}
              </button>
            </div>

            <div className="space-y-3">
              {riderNotes.map(note => (
                <div key={note.id} className="rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(14,165,233,0.12)', color: '#0ea5e9' }}>{note.note_type}</span>
                    {note.rider_name && <span className="text-xs" style={{ color: '#e5e7eb' }}>{note.rider_name}</span>}
                    {note.trip_id && <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>Trip {note.trip_id}</span>}
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{new Date(note.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{note.note}</p>
                  {(note.pickup_address || note.dropoff_address) && (
                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {note.pickup_address && <div>Pickup: {note.pickup_address}</div>}
                      {note.dropoff_address && <div>Dropoff: {note.dropoff_address}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

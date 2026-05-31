import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface LoyaltyAdminProps {
  salonId: string;
}

interface LoyaltyConfig {
  salon_id: string;
  is_active: boolean;
  pro_threshold: number;
  max_threshold: number;
  regular_service_pct: number;
  regular_retail_pct: number;
  pro_service_pct: number;
  pro_retail_pct: number;
  max_service_pct: number;
  max_retail_pct: number;
  min_redemption_balance: number;
  expiry_months: number;
  regular_birthday_perk: string;
  pro_birthday_perk: string;
  max_birthday_perk: string;
  max_birthday_value: number;
  bp_app_booking: number;
  bp_pre_book: number;
  bp_off_peak: number;
  bp_review: number;
  bp_monthly_streak: number;
  bp_referral: number;
  off_peak_days: string[];
  off_peak_from: string;
  off_peak_to: string;
}

interface BlindBoxCampaign {
  id: string;
  salon_id: string;
  name: string;
  is_active: boolean;
  price: number;
  trigger_at_service: number;
  eligible_tiers: string;
  reward_type: string;
  discount_value: number;
  prize_validity_days: number;
  one_per_visit: boolean;
  max_price_cap: number | null;
  starts_at: string;
  ends_at: string;
  prize_pool?: string[];
}

interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
}

const defaultConfig: LoyaltyConfig = {
  salon_id: '',
  is_active: false,
  pro_threshold: 500,
  max_threshold: 2000,
  regular_service_pct: 8.94532,
  regular_retail_pct: 11.05492,
  pro_service_pct: 11.23847,
  pro_retail_pct: 13.76254,
  max_service_pct: 14.58139,
  max_retail_pct: 17.32965,
  min_redemption_balance: 200,
  expiry_months: 12,
  regular_birthday_perk: 'Double reward rate all month',
  pro_birthday_perk: 'Free add-on (threading, eyebrow, nail polish)',
  max_birthday_perk: 'Free service up to AED 150',
  max_birthday_value: 150,
  bp_app_booking: 10,
  bp_pre_book: 20,
  bp_off_peak: 15,
  bp_review: 25,
  bp_monthly_streak: 50,
  bp_referral: 50,
  off_peak_days: ['monday', 'tuesday', 'wednesday'],
  off_peak_from: '10:00',
  off_peak_to: '14:00',
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const sectionHeading: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#034325',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e0e0e0',
  paddingBottom: 8,
  margin: '0 0 16px',
};

const tileGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
};

const tileStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: 16,
};

const wideTile: React.CSSProperties = {
  ...tileStyle,
  gridColumn: '1 / -1',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#666',
  marginBottom: 6,
};

const subText: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  marginTop: 6,
};

const inputWrap: React.CSSProperties = {
  position: 'relative',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: 13,
  padding: '7px 36px 7px 10px',
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  background: '#fff',
  color: '#111',
  outline: 'none',
};

const suffixStyle: React.CSSProperties = {
  position: 'absolute',
  right: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: 13,
  color: '#888',
  pointerEvents: 'none',
};

const saveBtn: React.CSSProperties = {
  marginTop: 12,
  background: '#034325',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 20px',
  fontSize: 13,
  cursor: 'pointer',
};

const badges: Record<string, React.CSSProperties> = {
  regular: { display: 'inline-block', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, marginBottom: 8, background: '#e8f4ec', color: '#034325' },
  pro: { display: 'inline-block', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, marginBottom: 8, background: '#e6f1fb', color: '#185FA5' },
  max: { display: 'inline-block', fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, marginBottom: 8, background: '#faeeda', color: '#854F0B' },
};

function TileInput({ label, value, onChange, suffix, subtext, step, badge, wide }: {
  label: string; value: number | string; onChange: (v: string) => void;
  suffix?: string; subtext?: string; step?: string; badge?: 'regular' | 'pro' | 'max'; wide?: boolean;
}) {
  return (
    <div style={wide ? wideTile : tileStyle}>
      {badge && <span style={badges[badge]}>{badge.charAt(0).toUpperCase() + badge.slice(1)}</span>}
      <label style={labelStyle}>{label}</label>
      <div style={inputWrap}>
        <input
          type={typeof value === 'number' ? 'number' : 'text'}
          value={value}
          step={step}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
        {suffix && <span style={suffixStyle}>{suffix}</span>}
      </div>
      {subtext && <div style={subText}>{subtext}</div>}
    </div>
  );
}

export default function LoyaltyAdmin({ salonId }: LoyaltyAdminProps) {
  const [config, setConfig] = useState<LoyaltyConfig>({ ...defaultConfig, salon_id: salonId });
  const [campaigns, setCampaigns] = useState<BlindBoxCampaign[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadConfig();
    loadCampaigns();
    loadServices();
  }, [salonId]);

  async function loadConfig() {
    const { data } = await supabase.from('loyalty_config').select('*').eq('salon_id', salonId).maybeSingle();
    if (data) setConfig(data);
    else setConfig({ ...defaultConfig, salon_id: salonId });
  }

  async function loadCampaigns() {
    const { data } = await supabase.from('blind_box_campaigns').select('*').eq('salon_id', salonId).order('created_at', { ascending: false });
    if (data) {
      const withPools = await Promise.all(data.map(async c => {
        const { data: pool } = await supabase.from('blind_box_prize_pool').select('service_id').eq('campaign_id', c.id);
        return { ...c, prize_pool: pool?.map(p => p.service_id) || [] };
      }));
      setCampaigns(withPools);
    }
  }

  async function loadServices() {
    const { data } = await supabase.from('services').select('id, name, category, price').eq('salon_id', salonId).eq('is_active', true).order('category').order('name');
    if (data) setServices(data);
  }

  function showSaved(key: string) {
    setSaved(s => ({ ...s, [key]: true }));
    setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000);
  }

  async function upsertConfig(extra?: Partial<LoyaltyConfig>) {
    const payload = { ...config, ...extra, salon_id: salonId };
    await supabase.from('loyalty_config').upsert(payload, { onConflict: 'salon_id' });
    if (extra) setConfig(c => ({ ...c, ...extra }));
  }

  async function saveSection(key: string) {
    setSaving(s => ({ ...s, [key]: true }));
    await upsertConfig();
    setSaving(s => ({ ...s, [key]: false }));
    showSaved(key);
  }

  async function saveCampaign(campaign: BlindBoxCampaign) {
    setSaving(s => ({ ...s, [campaign.id]: true }));
    const { prize_pool, ...rest } = campaign;
    const { data, error } = await supabase.from('blind_box_campaigns').upsert({ ...rest, salon_id: salonId }, { onConflict: 'id' }).select().single();
    if (!error && data) {
      await supabase.from('blind_box_prize_pool').delete().eq('campaign_id', data.id);
      if (prize_pool && prize_pool.length > 0) {
        await supabase.from('blind_box_prize_pool').insert(prize_pool.map(sid => ({ campaign_id: data.id, salon_id: salonId, service_id: sid })));
      }
      showSaved(campaign.id);
      loadCampaigns();
    }
    setSaving(s => ({ ...s, [campaign.id]: false }));
  }

  function updateCampaign(id: string, field: string, value: unknown) {
    setCampaigns(cs => cs.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  function addCampaign() {
    const newCampaign: BlindBoxCampaign = {
      id: 'new_' + Date.now(),
      salon_id: salonId,
      name: 'New Campaign',
      is_active: false,
      price: 30,
      trigger_at_service: 3,
      eligible_tiers: 'all',
      reward_type: 'percentage',
      discount_value: 40,
      prize_validity_days: 30,
      one_per_visit: true,
      max_price_cap: null,
      starts_at: '',
      ends_at: '',
      prize_pool: [],
    };
    setCampaigns(cs => [newCampaign, ...cs]);
  }

  function set(field: keyof LoyaltyConfig) {
    return (v: string) => setConfig(c => ({ ...c, [field]: typeof c[field] === 'number' ? parseFloat(v) || 0 : v }));
  }

  const hasOverlap = campaigns.filter(c => c.is_active).length > 1;

  return (
    <div style={{ marginTop: 32 }}>

      {/* ── LOYALTY PROGRAM ── */}
      <div style={{ fontSize: 16, fontWeight: 500, color: '#034325', marginBottom: 20 }}>Loyalty Program</div>

      {/* Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '14px 16px', border: '0.5px solid #e0e0e0', borderRadius: 8, background: '#fff' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Loyalty program active</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Clients earn and redeem points when this is on</div>
        </div>
        <div
          onClick={async () => {
            const next = !config.is_active;
            setConfig(c => ({ ...c, is_active: next }));
            await supabase.from('loyalty_config').upsert({ ...config, is_active: next, salon_id: salonId }, { onConflict: 'salon_id' });
          }}
          style={{ marginLeft: 'auto', width: 40, height: 22, background: config.is_active ? '#034325' : '#ccc', borderRadius: 11, position: 'relative', cursor: 'pointer', flexShrink: 0 }}
        >
          <div style={{ position: 'absolute', top: 3, left: config.is_active ? 20 : 3, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.15s' }} />
        </div>
      </div>

      {/* Tiers and Reward Rates */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionHeading}>Tiers and reward rates</div>
        <div style={tileGrid}>
          <TileInput label="Pro tier entry" value={config.pro_threshold} onChange={set('pro_threshold')} suffix="pts" subtext="Client reaches Pro when combined points hit this" />
          <TileInput label="Max tier entry" value={config.max_threshold} onChange={set('max_threshold')} suffix="pts" subtext="Client reaches Max when combined points hit this" />
          <TileInput label="Reward value — services" value={config.regular_service_pct} onChange={set('regular_service_pct')} suffix="%" step="0.00001" badge="regular" />
          <TileInput label="Reward value — retail" value={config.regular_retail_pct} onChange={set('regular_retail_pct')} suffix="%" step="0.00001" badge="regular" />
          <TileInput label="Reward value — services" value={config.pro_service_pct} onChange={set('pro_service_pct')} suffix="%" step="0.00001" badge="pro" />
          <TileInput label="Reward value — retail" value={config.pro_retail_pct} onChange={set('pro_retail_pct')} suffix="%" step="0.00001" badge="pro" />
          <TileInput label="Reward value — services" value={config.max_service_pct} onChange={set('max_service_pct')} suffix="%" step="0.00001" badge="max" />
          <TileInput label="Reward value — retail" value={config.max_retail_pct} onChange={set('max_retail_pct')} suffix="%" step="0.00001" badge="max" />
          <TileInput label="Min balance before redemption" value={config.min_redemption_balance} onChange={set('min_redemption_balance')} suffix="pts" />
          <TileInput label="Points expiry" value={config.expiry_months} onChange={set('expiry_months')} suffix="mo" />
        </div>
        <button style={saveBtn} onClick={() => saveSection('tiers')} disabled={saving['tiers']}>
          {saving['tiers'] ? 'Saving...' : 'Save'}
        </button>
        {saved['tiers'] && <span style={{ marginLeft: 12, fontSize: 12, color: '#034325' }}>Saved</span>}
      </div>

      {/* Birthday Perks */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionHeading}>Birthday perks</div>
        <div style={tileGrid}>
          <TileInput label="Birthday perk" value={config.regular_birthday_perk} onChange={set('regular_birthday_perk')} badge="regular" />
          <TileInput label="Birthday perk" value={config.pro_birthday_perk} onChange={set('pro_birthday_perk')} badge="pro" />
          <TileInput label="Birthday perk" value={config.max_birthday_perk} onChange={set('max_birthday_perk')} badge="max" />
          <TileInput label="Max perk value" value={config.max_birthday_value} onChange={set('max_birthday_value')} suffix="AED" badge="max" />
        </div>
        <button style={saveBtn} onClick={() => saveSection('birthday')} disabled={saving['birthday']}>
          {saving['birthday'] ? 'Saving...' : 'Save'}
        </button>
        {saved['birthday'] && <span style={{ marginLeft: 12, fontSize: 12, color: '#034325' }}>Saved</span>}
      </div>

      {/* Behaviour Bonuses */}
      <div style={{ marginBottom: 32 }}>
        <div style={sectionHeading}>Behaviour bonuses</div>
        <div style={tileGrid}>
          <TileInput label="App booking" value={config.bp_app_booking} onChange={set('bp_app_booking')} suffix="pts" />
          <TileInput label="Pre-book next visit" value={config.bp_pre_book} onChange={set('bp_pre_book')} suffix="pts" />
          <TileInput label="Off-peak booking" value={config.bp_off_peak} onChange={set('bp_off_peak')} suffix="pts" />
          <TileInput label="Leave a review" value={config.bp_review} onChange={set('bp_review')} suffix="pts" />
          <TileInput label="Monthly streak (3 visits)" value={config.bp_monthly_streak} onChange={set('bp_monthly_streak')} suffix="pts" />
          <TileInput label="Referral — both parties" value={config.bp_referral} onChange={set('bp_referral')} suffix="pts" />
          <div style={wideTile}>
            <label style={labelStyle}>Off-peak days</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {DAYS.map(d => (
                <label key={d} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={config.off_peak_days.includes(d)}
                    onChange={e => {
                      const days = e.target.checked ? [...config.off_peak_days, d] : config.off_peak_days.filter(x => x !== d);
                      setConfig(c => ({ ...c, off_peak_days: days }));
                    }}
                    style={{ accentColor: '#034325' }}
                  />
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </label>
              ))}
            </div>
          </div>
          <div style={wideTile}>
            <label style={labelStyle}>Off-peak hours</label>
            <div style={{ display: 'flex', gap: 12, maxWidth: 280 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#888' }}>From</label>
                <input type="time" value={config.off_peak_from} onChange={e => setConfig(c => ({ ...c, off_peak_from: e.target.value }))} style={{ ...inputStyle, padding: '7px 10px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#888' }}>To</label>
                <input type="time" value={config.off_peak_to} onChange={e => setConfig(c => ({ ...c, off_peak_to: e.target.value }))} style={{ ...inputStyle, padding: '7px 10px' }} />
              </div>
            </div>
          </div>
        </div>
        <button style={saveBtn} onClick={() => saveSection('behaviour')} disabled={saving['behaviour']}>
          {saving['behaviour'] ? 'Saving...' : 'Save'}
        </button>
        {saved['behaviour'] && <span style={{ marginLeft: 12, fontSize: 12, color: '#034325' }}>Saved</span>}
      </div>

      {/* ── BLIND BOX ── */}
      <div style={{ fontSize: 16, fontWeight: 500, color: '#034325', marginBottom: 20 }}>Blind Box</div>

      {hasOverlap && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fefce8', border: '1px solid #C9A227', borderRadius: 8, fontSize: 12, color: '#854F0B' }}>
          Two active campaigns overlap in dates. Only one campaign will fire per appointment.
        </div>
      )}

      {campaigns.map(campaign => (
        <div key={campaign.id} style={{ marginBottom: 16, border: `1.5px solid ${campaign.is_active ? '#C9A227' : '#e0e0e0'}`, borderRadius: 8, padding: 16, opacity: campaign.is_active ? 1 : 0.75 }}>

          {/* Campaign header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <input
              value={campaign.name}
              onChange={e => updateCampaign(campaign.id, 'name', e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px', fontWeight: 500, fontSize: 14, flex: 1 }}
              placeholder="Campaign name"
            />
            {campaign.is_active && <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: '#faeeda', color: '#854F0B', flexShrink: 0 }}>Active</span>}
            <div
              onClick={() => updateCampaign(campaign.id, 'is_active', !campaign.is_active)}
              style={{ width: 36, height: 20, background: campaign.is_active ? '#034325' : '#ccc', borderRadius: 10, position: 'relative', cursor: 'pointer', flexShrink: 0 }}
            >
              <div style={{ position: 'absolute', top: 2, left: campaign.is_active ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.15s' }} />
            </div>
          </div>

          {/* Campaign fields */}
          <div style={tileGrid}>
            <div style={tileStyle}>
              <label style={labelStyle}>Blind Box price</label>
              <div style={inputWrap}>
                <input type="number" value={campaign.price} onChange={e => updateCampaign(campaign.id, 'price', parseFloat(e.target.value) || 0)} style={inputStyle} />
                <span style={suffixStyle}>AED</span>
              </div>
              <div style={subText}>Client pays this to open the scratch card</div>
            </div>

            <div style={tileStyle}>
              <label style={labelStyle}>Triggers after service number</label>
              <div style={inputWrap}>
                <input type="number" value={campaign.trigger_at_service} onChange={e => updateCampaign(campaign.id, 'trigger_at_service', parseInt(e.target.value) || 1)} style={inputStyle} />
                <span style={suffixStyle}>th</span>
              </div>
              <div style={subText}>Auto-appears when appointment hits this service count</div>
            </div>

            <div style={tileStyle}>
              <label style={labelStyle}>Eligible tiers</label>
              <select value={campaign.eligible_tiers} onChange={e => updateCampaign(campaign.id, 'eligible_tiers', e.target.value)} style={{ ...inputStyle, padding: '7px 10px' }}>
                <option value="all">All tiers</option>
                <option value="pro_and_max">Pro and Max only</option>
                <option value="max_only">Max only</option>
              </select>
            </div>

            <div style={tileStyle}>
              <label style={labelStyle}>Reward type</label>
              <select value={campaign.reward_type} onChange={e => updateCampaign(campaign.id, 'reward_type', e.target.value)} style={{ ...inputStyle, padding: '7px 10px' }}>
                <option value="percentage">Percentage discount</option>
                <option value="fixed_aed">Fixed AED off</option>
                <option value="bogo">BOGO</option>
                <option value="free">Free service</option>
              </select>
            </div>

            {campaign.reward_type !== 'free' && campaign.reward_type !== 'bogo' && (
              <div style={tileStyle}>
                <label style={labelStyle}>Discount value</label>
                <div style={inputWrap}>
                  <input type="number" value={campaign.discount_value} onChange={e => updateCampaign(campaign.id, 'discount_value', parseFloat(e.target.value) || 0)} style={inputStyle} />
                  <span style={suffixStyle}>{campaign.reward_type === 'percentage' ? '%' : 'AED'}</span>
                </div>
              </div>
            )}

            <div style={tileStyle}>
              <label style={labelStyle}>Prize valid for</label>
              <div style={inputWrap}>
                <input type="number" value={campaign.prize_validity_days} onChange={e => updateCampaign(campaign.id, 'prize_validity_days', parseInt(e.target.value) || 1)} style={inputStyle} />
                <span style={suffixStyle}>days</span>
              </div>
              <div style={subText}>Days client has to use the revealed service</div>
            </div>

            <div style={tileStyle}>
              <label style={labelStyle}>One per visit</label>
              <select value={String(campaign.one_per_visit)} onChange={e => updateCampaign(campaign.id, 'one_per_visit', e.target.value === 'true')} style={{ ...inputStyle, padding: '7px 10px' }}>
                <option value="true">Yes — one per appointment</option>
                <option value="false">No — one per every N services</option>
              </select>
            </div>

            <div style={tileStyle}>
              <label style={labelStyle}>Max price cap</label>
              <div style={inputWrap}>
                <input type="number" value={campaign.max_price_cap ?? ''} onChange={e => updateCampaign(campaign.id, 'max_price_cap', e.target.value ? parseFloat(e.target.value) : null)} style={inputStyle} placeholder="No cap" />
                <span style={suffixStyle}>AED</span>
              </div>
              <div style={subText}>Services above this excluded from draw. Leave blank for no cap.</div>
            </div>

            <div style={wideTile}>
              <label style={labelStyle}>Campaign dates</label>
              <div style={{ display: 'flex', gap: 12, maxWidth: 360 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#888' }}>From</label>
                  <input type="date" value={campaign.starts_at} onChange={e => updateCampaign(campaign.id, 'starts_at', e.target.value)} style={{ ...inputStyle, padding: '7px 10px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#888' }}>To</label>
                  <input type="date" value={campaign.ends_at} onChange={e => updateCampaign(campaign.id, 'ends_at', e.target.value)} style={{ ...inputStyle, padding: '7px 10px' }} />
                </div>
              </div>
            </div>

            <div style={wideTile}>
              <label style={labelStyle}>Prize pool — eligible services</label>
              <div style={subText}>Only these services can appear on the scratch card</div>
              <select
                style={{ ...inputStyle, padding: '7px 10px', marginTop: 8 }}
                onChange={e => {
                  const sid = e.target.value;
                  if (sid && !campaign.prize_pool?.includes(sid)) {
                    updateCampaign(campaign.id, 'prize_pool', [...(campaign.prize_pool || []), sid]);
                  }
                  e.target.value = '';
                }}
                defaultValue=""
              >
                <option value="" disabled>Add a service to the prize pool</option>
                {services.filter(s => !campaign.prize_pool?.includes(s.id)).map(s => (
                  <option key={s.id} value={s.id}>{s.category} — {s.name} (AED {s.price})</option>
                ))}
              </select>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {campaign.prize_pool?.map(sid => {
                  const svc = services.find(s => s.id === sid);
                  return svc ? (
                    <span key={sid} style={{ fontSize: 11, padding: '3px 10px', background: '#e8f4ec', color: '#034325', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {svc.name}
                      <span onClick={() => updateCampaign(campaign.id, 'prize_pool', campaign.prize_pool?.filter(x => x !== sid))} style={{ cursor: 'pointer', color: '#034325', fontWeight: 500 }}>x</span>
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          </div>

          <button style={saveBtn} onClick={() => saveCampaign(campaign)} disabled={saving[campaign.id]}>
            {saving[campaign.id] ? 'Saving...' : 'Save campaign'}
          </button>
          {saved[campaign.id] && <span style={{ marginLeft: 12, fontSize: 12, color: '#034325' }}>Saved</span>}
        </div>
      ))}

      <button
        onClick={addCampaign}
        style={{ width: '100%', padding: 10, border: '1px dashed #C9A227', borderRadius: 8, background: 'transparent', color: '#854F0B', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
      >
        + New Blind Box campaign
      </button>

    </div>
  );
}

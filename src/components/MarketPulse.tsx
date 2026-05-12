import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

interface CompetitorReport {
  competitors: Record<string, unknown>[]
  trends: unknown[]
  offers: unknown[]
  pricing_insights: string
  loyalty_programs: unknown[]
  recommendations: unknown[]
}

function stripCiteTags(s: string): string {
  return s.replace(/<cite[^>]*>/g, '').replace(/<\/cite>/g, '')
}

function renderTrendItem(item: unknown): React.ReactNode {
  if (typeof item === 'string') return stripCiteTags(item)
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    const name = o.trend ?? o.name ?? o.title
    const desc = o.description ?? o.details ?? o.detail
    if (name && desc) return <><strong>{stripCiteTags(String(name))}</strong> — {stripCiteTags(String(desc))}</>
    return stripCiteTags(Object.values(o).map(String).join(' — '))
  }
  return stripCiteTags(String(item))
}

function renderGenericItem(item: unknown): React.ReactNode {
  if (typeof item === 'string') return stripCiteTags(item)
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    return stripCiteTags(Object.values(o).map(String).join(' — '))
  }
  return stripCiteTags(String(item))
}

export default function MarketPulse() {
  const { staffRecord } = useAuthStore()
  const [report, setReport] = useState<CompetitorReport | null>(null)
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedSection, setCopiedSection] = useState<string | null>(null)

  useEffect(() => {
    if (!staffRecord?.salon_id) return
    supabase
      .from('competitor_reports')
      .select('report, created_at')
      .eq('salon_id', staffRecord.salon_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.report) {
          setReport(data.report as CompetitorReport)
          setLastScan(data.created_at as string)
        }
        setLoading(false)
      })
  }, [staffRecord?.salon_id])

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#f9fafb',
    border: '0.5px solid #e0e0e0',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  }

  const subHeading: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: '#034325',
    margin: '0 0 10px',
  }

  const TH: React.CSSProperties = {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: '#6b7280',
    padding: '6px 10px',
    borderBottom: '0.5px solid #e0e0e0',
  }

  const TD: React.CSSProperties = {
    fontSize: 12,
    color: '#111',
    padding: '6px 10px',
    borderBottom: '0.5px solid #f0f0f0',
    verticalAlign: 'top',
  }

  const copyBtnStyle: React.CSSProperties = {
    fontSize: 11,
    border: '0.5px solid #034325',
    color: '#034325',
    backgroundColor: 'transparent',
    borderRadius: 4,
    padding: '3px 10px',
    cursor: 'pointer',
  }

  function copySection(key: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopiedSection(key)
    setTimeout(() => setCopiedSection(k => k === key ? null : k), 2000)
  }

  if (loading) {
    return (
      <div style={{ margin: '0 16px 16px', backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '14px 16px' }}>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Loading market data...</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div style={{ margin: '0 16px 16px', backgroundColor: '#ffffff', border: '0.5px solid #e0e0e0', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#034325', margin: '0 0 3px' }}>Market Pulse</p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No competitor data yet. Run a scan from Admin — Noorie AI.</p>
          </div>
          <span style={{ backgroundColor: '#C9A227', color: '#ffffff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>Premium</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ margin: '0 16px 16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#034325', margin: '0 0 2px' }}>Market Pulse</p>
          {lastScan && (
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
              Last scan: {new Date(lastScan).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
        <span style={{ backgroundColor: '#C9A227', color: '#ffffff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>Premium</span>
      </div>

      {/* Competitors table */}
      {(report.competitors ?? []).length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...subHeading, margin: 0 }}>Competitors</p>
            <button style={copyBtnStyle} onClick={() => copySection('competitors', (report.competitors ?? []).map(comp => {
              const n = comp.name ?? comp.salon_name ?? comp.business_name ?? ''
              const l = comp.location ?? comp.address ?? comp.area ?? ''
              const s = comp.services ?? comp.service_offerings ?? comp.specialties ?? ''
              const pr = comp.price_range ?? comp.pricing ?? comp.price ?? ''
              const ra = comp.rating ?? comp.score ?? comp.stars ?? ''
              const rv = comp.reviews_summary ?? comp.reviews ?? comp.review_summary ?? ''
              return `${n} | ${l} | ${Array.isArray(s) ? (s as unknown[]).map(String).join(', ') : String(s)} | ${pr} | ${ra} | ${rv}`
            }).join('\n'))}>
              {copiedSection === 'competitors' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Name</th>
                  <th style={TH}>Location</th>
                  <th style={TH}>Services</th>
                  <th style={TH}>Price range</th>
                  <th style={TH}>Rating</th>
                  <th style={TH}>Reviews</th>
                </tr>
              </thead>
              <tbody>
                {(report.competitors ?? []).map((comp, i) => {
                  const name = comp.name ?? comp.salon_name ?? comp.business_name ?? ''
                  const location = comp.location ?? comp.address ?? comp.area ?? ''
                  const services = comp.services ?? comp.service_offerings ?? comp.specialties ?? ''
                  const price = comp.price_range ?? comp.pricing ?? comp.price ?? ''
                  const rating = comp.rating ?? comp.score ?? comp.stars ?? ''
                  const reviews = comp.reviews_summary ?? comp.reviews ?? comp.review_summary ?? ''
                  return (
                    <tr key={i}>
                      <td style={{ ...TD, fontWeight: 500 }}>{stripCiteTags(String(name))}</td>
                      <td style={TD}>{stripCiteTags(String(location))}</td>
                      <td style={TD}>{stripCiteTags(Array.isArray(services) ? (services as unknown[]).map(String).join(', ') : String(services))}</td>
                      <td style={TD}>{stripCiteTags(String(price))}</td>
                      <td style={TD}>{stripCiteTags(String(rating))}</td>
                      <td style={TD}>{stripCiteTags(String(reviews))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trends */}
      {(report.trends ?? []).length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...subHeading, margin: 0 }}>Market trends</p>
            <button style={copyBtnStyle} onClick={() => copySection('trends', (report.trends ?? []).map(t => `- ${typeof t === 'string' ? t : Object.values(t as Record<string, unknown>).map(String).join(' — ')}`).join('\n'))}>
              {copiedSection === 'trends' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(report.trends ?? []).map((t, i) => (
              <li key={i} style={{ fontSize: 12, color: '#374151' }}>{renderTrendItem(t)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Offers */}
      {(report.offers ?? []).length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...subHeading, margin: 0 }}>Competitor promotions</p>
            <button style={copyBtnStyle} onClick={() => copySection('offers', (report.offers ?? []).map(o => `- ${typeof o === 'string' ? o : Object.values(o as Record<string, unknown>).map(String).join(' — ')}`).join('\n'))}>
              {copiedSection === 'offers' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(report.offers ?? []).map((o, i) => (
              <li key={i} style={{ fontSize: 12, color: '#374151' }}>{renderGenericItem(o)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Pricing insights */}
      {report.pricing_insights && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...subHeading, margin: 0 }}>Pricing landscape</p>
            <button style={copyBtnStyle} onClick={() => copySection('pricing', report.pricing_insights)}>
              {copiedSection === 'pricing' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.6 }}>{stripCiteTags(report.pricing_insights)}</p>
        </div>
      )}

      {/* Loyalty programs */}
      {(report.loyalty_programs ?? []).length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...subHeading, margin: 0 }}>Loyalty programs</p>
            <button style={copyBtnStyle} onClick={() => copySection('loyalty', (report.loyalty_programs ?? []).map(l => `- ${typeof l === 'string' ? l : Object.values(l as Record<string, unknown>).map(String).join(' — ')}`).join('\n'))}>
              {copiedSection === 'loyalty' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(report.loyalty_programs ?? []).map((l, i) => (
              <li key={i} style={{ fontSize: 12, color: '#374151' }}>{renderGenericItem(l)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {(report.recommendations ?? []).length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ ...subHeading, margin: 0 }}>Recommendations</p>
            <button style={copyBtnStyle} onClick={() => copySection('recommendations', (report.recommendations ?? []).map(r => `- ${typeof r === 'string' ? r : Object.values(r as Record<string, unknown>).map(String).join(' — ')}`).join('\n'))}>
              {copiedSection === 'recommendations' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(report.recommendations ?? []).map((r, i) => (
              <li key={i} style={{ fontSize: 12, color: '#374151' }}>{renderGenericItem(r)}</li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}

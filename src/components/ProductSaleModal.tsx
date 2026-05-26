import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  salonId: string
  staffList: { id: string; name: string }[]
  onClose: () => void
  onSuccess: () => void
}

export default function ProductSaleModal({ salonId, staffList, onClose, onSuccess }: Props) {
  const [psStep,            setPsStep]            = useState<1 | 2>(1)
  const [psClientSearch,    setPsClientSearch]    = useState('')
  const [psShowDropdown,    setPsShowDropdown]    = useState(false)
  const [psAllClients,      setPsAllClients]      = useState<{ id: string; name: string }[]>([])
  const [psSelectedClient,  setPsSelectedClient]  = useState<{ id: string; name: string } | null>(null)
  const [psSelectedStaff,   setPsSelectedStaff]   = useState<{ id: string; name: string } | null>(null)
  const [psProducts,        setPsProducts]        = useState<{ id: string; name: string; price: number; stockCount: number }[]>([])
  const [psProductsLoading, setPsProductsLoading] = useState(false)
  const [psCart,            setPsCart]            = useState<Record<string, number>>({})
  const [psPaymentMethod,   setPsPaymentMethod]   = useState<'Cash' | 'Card' | 'Other'>('Cash')
  const [psSaving,          setPsSaving]          = useState(false)
  const [psError,           setPsError]           = useState<string | null>(null)

  useEffect(() => {
    setPsProductsLoading(true)
    Promise.all([
      supabase.from('clients').select('id, name').eq('salon_id', salonId).order('name'),
      supabase.from('inventory_items').select('id, name, price, stock_count')
        .eq('salon_id', salonId).eq('type', 'product').eq('is_active', true).order('name'),
    ]).then(([{ data: clients }, { data: products }]) => {
      setPsAllClients((clients ?? []) as { id: string; name: string }[])
      setPsProducts(((products ?? []) as { id: string; name: string; price: number | null; stock_count: number }[])
        .map(p => ({ id: p.id, name: p.name, price: p.price ?? 0, stockCount: p.stock_count })))
      setPsProductsLoading(false)
    })
  }, [salonId])

  const psFilteredClients = psClientSearch.trim()
    ? psAllClients.filter(c => c.name.toLowerCase().includes(psClientSearch.toLowerCase()))
    : psAllClients.slice(0, 8)

  const psCartTotal = Object.entries(psCart).reduce((sum, [id, qty]) => {
    const p = psProducts.find(p => p.id === id)
    return sum + (p ? p.price * qty : 0)
  }, 0)
  const psCartItems = Object.entries(psCart).filter(([, qty]) => qty > 0)
  const psCanNext = psSelectedClient !== null && psSelectedStaff !== null && psCartItems.length > 0

  async function handleProductSale() {
    setPsSaving(true); setPsError(null)
    try {
      const clientId = psSelectedClient?.id === 'no-name' ? null : (psSelectedClient?.id ?? null)
      const { error: payErr } = await supabase.from('payments').insert({
        salon_id: salonId, client_id: clientId,
        amount: psCartTotal, method: psPaymentMethod.toLowerCase(),
        status: 'completed', reference: 'product_sale',
        staff_id: psSelectedStaff?.id ?? null,
      })
      if (payErr) throw new Error(payErr.message)

      const now = new Date().toISOString()
      for (const [itemId, qty] of psCartItems) {
        const { error: txErr } = await supabase.from('inventory_transactions').insert({
          salon_id: salonId, item_id: itemId, type: 'sale', quantity: qty, created_at: now,
        })
        if (txErr) throw new Error(txErr.message)
        const item = psProducts.find(p => p.id === itemId)
        if (item) {
          const { error: updErr } = await supabase
            .from('inventory_items')
            .update({ stock_count: item.stockCount - qty })
            .eq('id', itemId)
          if (updErr) throw new Error(updErr.message)
        }
      }
      onSuccess()
      onClose()
    } catch (err) {
      setPsError(err instanceof Error ? err.message : 'Failed to record sale')
    } finally {
      setPsSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, maxWidth: 440, width: '94%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

        {/* Modal header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '0.5px solid #f0f0f0', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111' }}>
            {psStep === 1 ? 'Product Sales — Select items' : 'Product Sales — Payment'}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: '0.5px solid #034325', color: '#034325', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>Close</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 20px 0', flexShrink: 0 }}>
          {([1, 2] as const).map(s => (
            <div key={s} style={{ height: 3, flex: 1, borderRadius: 2, backgroundColor: psStep >= s ? '#034325' : '#e0e0e0' }} />
          ))}
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>

          {psStep === 1 && (
            <>
              {/* Client */}
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Client</p>
              {psSelectedClient ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ backgroundColor: '#f0fdf4', color: '#034325', border: '0.5px solid #034325', fontSize: 12, padding: '4px 10px', borderRadius: 20 }}>
                    {psSelectedClient.name}
                  </span>
                  <button onClick={() => setPsSelectedClient(null)} style={{ background: 'none', border: 'none', color: '#991b1b', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <div style={{ position: 'relative', marginBottom: 14 }}>
                  <input
                    value={psClientSearch}
                    onChange={e => { setPsClientSearch(e.target.value); setPsShowDropdown(true) }}
                    onFocus={() => setPsShowDropdown(true)}
                    placeholder="Search client by name…"
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, border: '0.5px solid #d1d5db', borderRadius: 6, padding: '8px 10px', outline: 'none' }}
                  />
                  {psShowDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                      <div
                        onMouseDown={() => { setPsSelectedClient({ id: 'no-name', name: 'No Name' }); setPsShowDropdown(false); setPsClientSearch('') }}
                        style={{ padding: '8px 12px', fontSize: 13, color: '#6b7280', cursor: 'pointer', borderBottom: '0.5px solid #f0f0f0', fontStyle: 'italic' }}
                      >No Name</div>
                      {psFilteredClients.map(c => (
                        <div
                          key={c.id}
                          onMouseDown={() => { setPsSelectedClient(c); setPsShowDropdown(false); setPsClientSearch('') }}
                          style={{ padding: '8px 12px', fontSize: 13, color: '#111', cursor: 'pointer', borderBottom: '0.5px solid #f0f0f0' }}
                        >{c.name}</div>
                      ))}
                      {psFilteredClients.length === 0 && <div style={{ padding: '8px 12px', fontSize: 12, color: '#9ca3af' }}>No matches</div>}
                    </div>
                  )}
                </div>
              )}

              {/* Staff */}
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Staff</p>
              <div style={{ marginBottom: 14 }}>
                <select
                  value={psSelectedStaff?.id ?? ''}
                  onChange={e => {
                    const found = staffList.find(s => s.id === e.target.value)
                    setPsSelectedStaff(found ?? null)
                  }}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, border: '0.5px solid #d1d5db', borderRadius: 6, padding: '8px 10px', outline: 'none', backgroundColor: '#fff' }}
                >
                  <option value="">Select staff…</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Products */}
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Products</p>
              {psProductsLoading ? (
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 14px' }}>Loading…</p>
              ) : psProducts.length === 0 ? (
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 14px' }}>No products in catalogue.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14 }}>
                  {psProducts.map(p => {
                    const outOfStock = p.stockCount === 0
                    const qty = psCart[p.id] ?? 0
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', borderBottom: '0.5px solid #f0f0f0', opacity: outOfStock ? 0.45 : 1 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, color: '#111', fontWeight: 500 }}>{p.name}</p>
                          <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>AED {p.price.toFixed(2)} · stock: {p.stockCount}</p>
                        </div>
                        {qty > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <button onClick={() => setPsCart(prev => { const n = { ...prev }; n[p.id] = Math.max(0, (n[p.id] ?? 0) - 1); if (n[p.id] === 0) delete n[p.id]; return n })} style={{ backgroundColor: 'transparent', border: '0.5px solid #d1d5db', borderRadius: 4, width: 24, height: 24, fontSize: 14, cursor: 'pointer', color: '#111' }}>−</button>
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#111', minWidth: 20, textAlign: 'center' }}>{qty}</span>
                            <button disabled={outOfStock} onClick={() => !outOfStock && setPsCart(prev => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }))} style={{ backgroundColor: 'transparent', border: '0.5px solid #d1d5db', borderRadius: 4, width: 24, height: 24, fontSize: 14, cursor: outOfStock ? 'not-allowed' : 'pointer', color: '#111' }}>+</button>
                          </div>
                        ) : (
                          <button
                            disabled={outOfStock}
                            onClick={() => !outOfStock && setPsCart(prev => ({ ...prev, [p.id]: 1 }))}
                            style={{ backgroundColor: outOfStock ? '#e0e0e0' : '#034325', color: '#fff', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 18, lineHeight: 1, cursor: outOfStock ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                          >+</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {psCartItems.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Total</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#034325' }}>AED {psCartTotal.toFixed(2)}</span>
                </div>
              )}
            </>
          )}

          {psStep === 2 && (
            <>
              {/* Cart summary — editable */}
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Order summary</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                {psCartItems.map(([id, qty]) => {
                  const p = psProducts.find(p => p.id === id)!
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '0.5px solid #f0f0f0' }}>
                      <span style={{ flex: 1, fontSize: 13, color: '#111' }}>{p.name}</span>
                      <button
                        onClick={() => setPsCart(prev => {
                          const n = { ...prev }
                          n[id] = Math.max(0, (n[id] ?? 0) - 1)
                          if (n[id] === 0) delete n[id]
                          if (Object.keys(n).filter(k => n[k] > 0).length === 0) setPsStep(1)
                          return n
                        })}
                        style={{ backgroundColor: 'transparent', border: '0.5px solid #d1d5db', borderRadius: 4, width: 24, height: 24, fontSize: 14, cursor: 'pointer', color: '#111', flexShrink: 0 }}
                      >−</button>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#111', minWidth: 20, textAlign: 'center' }}>{qty}</span>
                      <button
                        onClick={() => setPsCart(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))}
                        style={{ backgroundColor: 'transparent', border: '0.5px solid #d1d5db', borderRadius: 4, width: 24, height: 24, fontSize: 14, cursor: 'pointer', color: '#111', flexShrink: 0 }}
                      >+</button>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#034325', minWidth: 64, textAlign: 'right' }}>AED {(p.price * qty).toFixed(2)}</span>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>Total</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#034325' }}>AED {psCartTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment method */}
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment method</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {(['Cash', 'Card', 'Other'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setPsPaymentMethod(m)}
                    style={{
                      flex: 1, padding: '8px 0', fontSize: 13, borderRadius: 6, cursor: 'pointer', fontWeight: 500,
                      backgroundColor: psPaymentMethod === m ? '#034325' : '#fff',
                      color: psPaymentMethod === m ? '#fff' : '#034325',
                      border: '0.5px solid #034325',
                    }}
                  >{m}</button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '0.5px solid #f0f0f0', flexShrink: 0 }}>
          {psError && <p style={{ fontSize: 12, color: '#991b1b', margin: '0 0 8px' }}>{psError}</p>}
        </div>
        <div style={{ padding: '0 20px 12px', flexShrink: 0, display: 'flex', gap: 10 }}>
          {psStep === 1 ? (
            <>
              <button onClick={onClose} style={{ flex: 1, padding: '9px 0', fontSize: 13, borderRadius: 6, cursor: 'pointer', backgroundColor: 'transparent', color: '#034325', border: '0.5px solid #034325' }}>Cancel</button>
              <button
                disabled={!psCanNext}
                onClick={() => setPsStep(2)}
                style={{ flex: 2, padding: '9px 0', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: psCanNext ? 'pointer' : 'not-allowed', backgroundColor: psCanNext ? '#034325' : '#e0e0e0', color: psCanNext ? '#fff' : '#9ca3af', border: 'none' }}
              >Next</button>
            </>
          ) : (
            <>
              <button onClick={() => setPsStep(1)} disabled={psSaving} style={{ flex: 1, padding: '9px 0', fontSize: 13, borderRadius: 6, cursor: 'pointer', backgroundColor: 'transparent', color: '#034325', border: '0.5px solid #034325' }}>Back</button>
              <button
                onClick={handleProductSale}
                disabled={psSaving}
                style={{ flex: 2, padding: '9px 0', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: psSaving ? 'not-allowed' : 'pointer', backgroundColor: psSaving ? '#6b9e87' : '#034325', color: '#fff', border: 'none' }}
              >{psSaving ? 'Saving…' : 'Confirm sale'}</button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}

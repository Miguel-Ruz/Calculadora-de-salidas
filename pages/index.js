import Head from 'next/head';
import Script from 'next/script';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';

const CURRENCIES = {
  COP: { code: 'COP', name: 'Peso colombiano', symbol: '$', decimals: 0, locale: 'es-CO' },
  USD: { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', decimals: 2, locale: 'en-US' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, locale: 'de-DE' }
};

function getCurrencyInfo(code) {
  return CURRENCIES[code] || CURRENCIES.COP;
}

function formatAmount(value, currencyCode, includeSymbol = true) {
  const curr = getCurrencyInfo(currencyCode);
  const formatted = value.toLocaleString(curr.locale, {
    minimumFractionDigits: curr.decimals,
    maximumFractionDigits: curr.decimals
  });
  if (!includeSymbol) return formatted;
  return curr.code === 'COP' ? `${curr.symbol} ${formatted}` : `${formatted} ${curr.symbol}`;
}

function normalizeName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function calculateSettlementsForParticipants(participants, expenses) {
  if (participants.length < 2 || expenses.length === 0) {
    return { total: 0, share: 0, balances: {}, settlements: [] };
  }
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const share = total / participants.length;
  const paid = {};
  participants.forEach((p) => {
    paid[p] = 0;
  });
  expenses.forEach((e) => {
    paid[e.payer] = (paid[e.payer] || 0) + e.amount;
  });
  const balances = {};
  participants.forEach((p) => {
    balances[p] = Math.round((paid[p] - share) * 100) / 100;
  });
  const creditors = participants
    .filter((p) => balances[p] > 0.01)
    .map((p) => ({ name: p, amount: balances[p] }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = participants
    .filter((p) => balances[p] < -0.01)
    .map((p) => ({ name: p, amount: -balances[p] }))
    .sort((a, b) => b.amount - a.amount);
  const settlements = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i];
    const deb = debtors[j];
    const amount = Math.min(cred.amount, deb.amount);
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.01) settlements.push({ from: deb.name, to: cred.name, amount: rounded });
    cred.amount -= amount;
    deb.amount -= amount;
    if (cred.amount < 0.01) i++;
    if (deb.amount < 0.01) j++;
  }
  return { total, share, balances, settlements };
}

function calculateTripSummary(trip) {
  if (!trip || trip.people.length < 2) return null;
  const aggregatedBalances = {};
  trip.people.forEach((p) => {
    aggregatedBalances[p.name] = 0;
  });
  let totalSpent = 0;
  trip.outings.forEach((outing) => {
    const result = calculateSettlementsForParticipants(
      outing.participants.map((p) => p.name),
      outing.expenses
    );
    totalSpent += result.total;
    Object.keys(result.balances).forEach((p) => {
      aggregatedBalances[p] = (aggregatedBalances[p] || 0) + result.balances[p];
    });
  });
  Object.keys(aggregatedBalances).forEach((p) => {
    aggregatedBalances[p] = Math.round(aggregatedBalances[p] * 100) / 100;
  });
  const peopleWithActivity = trip.people.filter(
    (p) => Math.abs(aggregatedBalances[p.name] || 0) > 0.01
  );
  if (peopleWithActivity.length < 2) {
    return { total: totalSpent, balances: aggregatedBalances, settlements: [], trip };
  }
  const creditors = trip.people
    .filter((p) => aggregatedBalances[p.name] > 0.01)
    .map((p) => ({ name: p.name, amount: aggregatedBalances[p.name] }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = trip.people
    .filter((p) => aggregatedBalances[p.name] < -0.01)
    .map((p) => ({ name: p.name, amount: -aggregatedBalances[p.name] }))
    .sort((a, b) => b.amount - a.amount);
  const settlements = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i];
    const deb = debtors[j];
    const amount = Math.min(cred.amount, deb.amount);
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.01) settlements.push({ from: deb.name, to: cred.name, amount: rounded });
    cred.amount -= amount;
    deb.amount -= amount;
    if (cred.amount < 0.01) i++;
    if (deb.amount < 0.01) j++;
  }
  return { total: totalSpent, balances: aggregatedBalances, settlements, trip };
}

export default function Home() {
  const supabase = useSupabaseClient();
  const session = useSession();
  const [currency, setCurrency] = useState('COP');
  const [trips, setTrips] = useState([]);
  const [currentTripId, setCurrentTripId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [outingModalOpen, setOutingModalOpen] = useState(false);
  const comprobanteRef = useRef(null);

  const currentTrip = useMemo(
    () => trips.find((t) => t.id === currentTripId) || null,
    [trips, currentTripId]
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem('divide-currency');
      if (stored) setCurrency(stored);
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('divide-currency', currency);
    } catch (e) {}
  }, [currency]);

  useEffect(() => {
    if (!session) return;
    refreshTrips();
  }, [session]);

  async function refreshTrips() {
    setError('');
    const { data, error: loadError } = await supabase
      .from('trips')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });
    if (loadError) {
      setError('No se pudieron cargar los viajes.');
      return;
    }
    setTrips(
      (data || []).map((t) => ({
        id: t.id,
        name: t.name,
        people: [],
        outings: []
      }))
    );
    setCurrentTripId(null);
  }

  async function fetchTripData(tripId) {
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, name, created_at')
      .eq('id', tripId)
      .single();
    if (tripError) throw tripError;

    const { data: people, error: peopleError } = await supabase
      .from('trip_people')
      .select('id, name')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });
    if (peopleError) throw peopleError;

    const { data: outings, error: outingsError } = await supabase
      .from('outings')
      .select('id, name, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });
    if (outingsError) throw outingsError;

    const outingIds = (outings || []).map((o) => o.id);
    let participants = [];
    let expenses = [];
    if (outingIds.length > 0) {
      const { data: participantRows, error: participantsError } = await supabase
        .from('outing_participants')
        .select('outing_id, person_id')
        .in('outing_id', outingIds);
      if (participantsError) throw participantsError;
      participants = participantRows || [];

      const { data: expenseRows, error: expensesError } = await supabase
        .from('expenses')
        .select('id, outing_id, description, amount, payer_id, created_at')
        .in('outing_id', outingIds)
        .order('created_at', { ascending: true });
      if (expensesError) throw expensesError;
      expenses = expenseRows || [];
    }

    const peopleMap = new Map((people || []).map((p) => [p.id, p.name]));
    const outingParticipants = new Map();
    participants.forEach((p) => {
      if (!outingParticipants.has(p.outing_id)) outingParticipants.set(p.outing_id, []);
      const name = peopleMap.get(p.person_id);
      if (name) outingParticipants.get(p.outing_id).push({ id: p.person_id, name });
    });
    const outingExpenses = new Map();
    expenses.forEach((e) => {
      if (!outingExpenses.has(e.outing_id)) outingExpenses.set(e.outing_id, []);
      outingExpenses.get(e.outing_id).push({
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        payerId: e.payer_id,
        payer: peopleMap.get(e.payer_id) || ''
      });
    });

    return {
      id: trip.id,
      name: trip.name,
      people: (people || []).map((p) => ({ id: p.id, name: p.name })),
      outings: (outings || []).map((outing) => ({
        id: outing.id,
        name: outing.name,
        participants: outingParticipants.get(outing.id) || [],
        expenses: outingExpenses.get(outing.id) || []
      }))
    };
  }

  async function openTrip(tripId) {
    setError('');
    try {
      const trip = await fetchTripData(tripId);
      setTrips((prev) => {
        const next = prev.filter((t) => t.id !== tripId);
        return [trip, ...next];
      });
      setCurrentTripId(tripId);
    } catch (e) {
      setError('No se pudo cargar el viaje.');
    }
  }

  async function createTrip(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    const { data, error: createError } = await supabase
      .from('trips')
      .insert({ name: trimmed, user_id: session.user.id })
      .select('id, name')
      .single();
    if (createError) {
      setError(createError.message || 'No se pudo crear el viaje.');
      return;
    }
    setTrips((prev) => [
      { id: data.id, name: data.name, people: [], outings: [] },
      ...prev
    ]);
    setCurrentTripId(data.id);
  }

  async function deleteTrip(tripId) {
    if (!confirm('¿Eliminar este viaje?')) return;
    const { error: deleteError } = await supabase.from('trips').delete().eq('id', tripId);
    if (deleteError) {
      setError('No se pudo eliminar el viaje.');
      return;
    }
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
    if (currentTripId === tripId) setCurrentTripId(null);
  }

  async function addTripPerson(name) {
    const trip = currentTrip;
    if (!trip) return;
    const normalized = normalizeName(name);
    if (!normalized || trip.people.some((p) => p.name === normalized)) return;
    const { data, error: createError } = await supabase
      .from('trip_people')
      .insert({ trip_id: trip.id, name: normalized })
      .select('id, name')
      .single();
    if (createError) {
      setError('No se pudo añadir la persona.');
      return;
    }
    setTrips((prev) =>
      prev.map((t) =>
        t.id === trip.id ? { ...t, people: [...t.people, { id: data.id, name: data.name }] } : t
      )
    );
  }

  async function removeTripPerson(person) {
    const trip = currentTrip;
    if (!trip) return;
    const { error: deleteError } = await supabase
      .from('trip_people')
      .delete()
      .eq('id', person.id);
    if (deleteError) {
      setError('No se pudo eliminar la persona.');
      return;
    }
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== trip.id) return t;
        return {
          ...t,
          people: t.people.filter((p) => p.id !== person.id),
          outings: t.outings.map((o) => ({
            ...o,
            participants: o.participants.filter((p) => p.id !== person.id),
            expenses: o.expenses.filter((e) => e.payerId !== person.id)
          }))
        };
      })
    );
  }

  async function addOuting(name) {
    const trip = currentTrip;
    if (!trip) return;
    const trimmed = name.trim() || 'Salida';
    const { data, error: createError } = await supabase
      .from('outings')
      .insert({ trip_id: trip.id, name: trimmed })
      .select('id, name')
      .single();
    if (createError) {
      setError('No se pudo crear la salida.');
      return;
    }
    const outing = {
      id: data.id,
      name: data.name,
      participants: [...trip.people],
      expenses: []
    };
    if (outing.participants.length > 0) {
      const rows = outing.participants.map((p) => ({ outing_id: outing.id, person_id: p.id }));
      const { error: partError } = await supabase.from('outing_participants').insert(rows);
      if (partError) {
        setError('No se pudo añadir participantes.');
        return;
      }
    }
    setTrips((prev) =>
      prev.map((t) => (t.id === trip.id ? { ...t, outings: [...t.outings, outing] } : t))
    );
  }

  async function removeOuting(outingId) {
    const trip = currentTrip;
    if (!trip) return;
    if (!confirm('¿Eliminar esta salida?')) return;
    const { error: deleteError } = await supabase.from('outings').delete().eq('id', outingId);
    if (deleteError) {
      setError('No se pudo eliminar la salida.');
      return;
    }
    setTrips((prev) =>
      prev.map((t) =>
        t.id === trip.id ? { ...t, outings: t.outings.filter((o) => o.id !== outingId) } : t
      )
    );
  }

  async function toggleOutingParticipant(outingId, person) {
    const trip = currentTrip;
    if (!trip) return;
    const outing = trip.outings.find((o) => o.id === outingId);
    if (!outing) return;
    const isIn = outing.participants.some((p) => p.id === person.id);
    if (isIn && outing.participants.length <= 1) return;
    if (isIn) {
      const { error: delError } = await supabase
        .from('outing_participants')
        .delete()
        .eq('outing_id', outingId)
        .eq('person_id', person.id);
      if (delError) {
        setError('No se pudo actualizar participantes.');
        return;
      }
    } else {
      const { error: addError } = await supabase
        .from('outing_participants')
        .insert({ outing_id: outingId, person_id: person.id });
      if (addError) {
        setError('No se pudo actualizar participantes.');
        return;
      }
    }
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== trip.id) return t;
        return {
          ...t,
          outings: t.outings.map((o) => {
            if (o.id !== outingId) return o;
            const nextParticipants = isIn
              ? o.participants.filter((p) => p.id !== person.id)
              : [...o.participants, person];
            const nextExpenses = isIn
              ? o.expenses.filter((e) => e.payerId !== person.id)
              : o.expenses;
            return { ...o, participants: nextParticipants, expenses: nextExpenses };
          })
        };
      })
    );
  }

  async function addExpense(outingId, description, amount, payerName) {
    const trip = currentTrip;
    if (!trip || !description || !payerName || isNaN(amount) || amount <= 0) return;
    const outing = trip.outings.find((o) => o.id === outingId);
    if (!outing) return;
    const payer = outing.participants.find((p) => p.name === payerName);
    if (!payer) return;
    const { data, error: createError } = await supabase
      .from('expenses')
      .insert({
        outing_id: outingId,
        description: description.trim(),
        amount: Math.round(amount * 100) / 100,
        payer_id: payer.id
      })
      .select('id, description, amount, payer_id')
      .single();
    if (createError) {
      setError('No se pudo añadir el gasto.');
      return;
    }
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== trip.id) return t;
        return {
          ...t,
          outings: t.outings.map((o) => {
            if (o.id !== outingId) return o;
            return {
              ...o,
              expenses: [
                ...o.expenses,
                {
                  id: data.id,
                  description: data.description,
                  amount: Number(data.amount),
                  payerId: data.payer_id,
                  payer: payer.name
                }
              ]
            };
          })
        };
      })
    );
  }

  async function removeExpense(outingId, expenseId) {
    const trip = currentTrip;
    if (!trip) return;
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId);
    if (deleteError) {
      setError('No se pudo eliminar el gasto.');
      return;
    }
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== trip.id) return t;
        return {
          ...t,
          outings: t.outings.map((o) =>
            o.id === outingId ? { ...o, expenses: o.expenses.filter((e) => e.id !== expenseId) } : o
          )
        };
      })
    );
  }

  async function exportAsImage(summary) {
    if (!comprobanteRef.current || !summary) return;
    const html2canvas = window.html2canvas;
    if (!html2canvas) return;
    const element = comprobanteRef.current;
    element.classList.add('comprobante-visible');
    const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
    const link = document.createElement('a');
    link.download = `resumen-viaje-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    element.classList.remove('comprobante-visible');
  }

  async function exportAsPdf(summary) {
    if (!comprobanteRef.current || !summary) return;
    const JsPDF = window.jspdf?.jsPDF || window.jspdf || window.jsPDF;
    const html2canvas = window.html2canvas;
    if (!JsPDF || !html2canvas) return;
    const element = comprobanteRef.current;
    element.classList.add('comprobante-visible');
    const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const iw = pw - 20;
    const ih = (canvas.height * iw) / canvas.width;
    pdf.addImage(imgData, 'PNG', 10, 10, iw, Math.min(ih, ph - 20));
    pdf.save(`resumen-viaje-${Date.now()}.pdf`);
    element.classList.remove('comprobante-visible');
  }

  const summary = currentTrip ? calculateTripSummary(currentTrip) : null;

  return (
    <>
      <Head>
        <title>Divide — Gastos compartidos</title>
        <meta name="description" content="Calculadora de gastos compartidos para viajes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>

      <Script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" />

      <main className="app">
        <header className="header">
          <div className="header-top">
            <div>
              <h1 className="logo">Divide</h1>
              <p className="tagline">Gastos compartidos</p>
            </div>
            <div className="user-controls">
              <span className="user-email">{session?.user?.email}</span>
              <a href="/auth/login" className="btn btn-ghost btn-sm">Salir</a>
            </div>
            <div className="currency-selector-wrapper">
              <label htmlFor="currencySelect" className="currency-label">Moneda</label>
              <select
                id="currencySelect"
                className="currency-select"
                aria-label="Seleccionar moneda"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="COP">🇨🇴 Peso colombiano- COP</option>
                <option value="USD">🇺🇸 Dólar - USD</option>
                <option value="EUR">🇪🇺 Euro - EUR</option>
              </select>
            </div>
          </div>
          {error ? <p className="app-message is-error">{error}</p> : null}
          {message ? <p className="app-message">{message}</p> : null}
        </header>

        {!currentTrip ? (
          <section className="trips-list-section">
            <div className="card card-accent">
              <h2>Mis viajes</h2>
              <p className="section-desc">Crea un viaje para gestionar salidas y gastos compartidos.</p>
              <div className="trip-create-form">
                <input type="text" id="tripNameInput" placeholder="Nombre del viaje" />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const input = document.getElementById('tripNameInput');
                    const name = input?.value || '';
                    createTrip(name);
                    if (input) input.value = '';
                  }}
                >
                  Crear viaje
                </button>
              </div>
              <ul className="trips-list">
                {trips.map((trip) => (
                  <li className="trip-item" key={trip.id}>
                    <div className="trip-item-main">
                      <strong>{trip.name}</strong>
                      <span className="trip-item-meta">
                        {trip.people.length} personas · {trip.outings.length} salidas
                      </span>
                    </div>
                    <div className="trip-item-actions">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openTrip(trip.id)}>
                        Abrir
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteTrip(trip.id)}>
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {trips.length === 0 ? <p className="hint">No tienes viajes. Crea uno para empezar.</p> : null}
            </div>
          </section>
        ) : (
          <section className="trip-detail-section">
            <nav className="breadcrumb">
              <button type="button" className="breadcrumb-link" onClick={() => setCurrentTripId(null)}>
                ← Viajes
              </button>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{currentTrip.name}</span>
            </nav>

            <div className="app-grid">
              <section className="participants-section card card-accent">
                <div className="section-badge">Paso 1</div>
                <h2>Personas del viaje</h2>
                <p className="section-desc">Añade a todas las personas que participan en el viaje.</p>
                <div className="participant-input">
                  <input type="text" id="participantName" placeholder="Nombre" />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const input = document.getElementById('participantName');
                      addTripPerson(input?.value || '');
                      if (input) input.value = '';
                    }}
                  >
                    Añadir
                  </button>
                </div>
                <ul className="participants-tags">
                  {currentTrip.people.map((person) => (
                    <li className="participant-tag" key={person.id}>
                      <span>{person.name}</span>
                      <button type="button" aria-label="Eliminar" onClick={() => removeTripPerson(person)}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="hint">
                  {currentTrip.people.length < 2
                    ? 'Añade al menos 2 personas'
                    : `${currentTrip.people.length} personas`}
                </p>
              </section>

              <section className="outings-section card">
                <div className="section-badge">Paso 2</div>
                <div className="outings-header">
                  <h2>Salidas</h2>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => currentTrip.people.length >= 2 && setOutingModalOpen(true)}
                    disabled={currentTrip.people.length < 2}
                  >
                    + Nueva salida
                  </button>
                </div>
                <p className="section-desc">
                  Cada salida puede tener distintas personas. Solo participan en los gastos quienes estén en esa salida.
                </p>
                <div className="outings-list">
                  {currentTrip.outings.map((outing) => {
                    const result = calculateSettlementsForParticipants(
                      outing.participants.map((p) => p.name),
                      outing.expenses
                    );
                    return (
                      <div className="outing-card card" key={outing.id}>
                        <div className="outing-header">
                          <h3 className="outing-name">{outing.name}</h3>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeOuting(outing.id)}>
                            ×
                          </button>
                        </div>
                        <div className="outing-participants">
                          <span className="outing-label">Participan en esta salida:</span>
                          <div className="participants-checkboxes">
                            {currentTrip.people.map((person) => {
                              const checked = outing.participants.some((p) => p.id === person.id);
                              return (
                                <label className="checkbox-label" key={person.id}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleOutingParticipant(outing.id, person)}
                                  />
                                  <span>{person.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="outing-expenses">
                          <div className="expense-form-mini">
                            <input type="text" className="expense-desc" placeholder="Concepto" id={`desc-${outing.id}`} />
                            <input type="number" className="expense-amt" placeholder="0" min="0" step="0.01" id={`amt-${outing.id}`} />
                            <select className="expense-payer" id={`payer-${outing.id}`}>
                              <option value="">Quién pagó</option>
                              {outing.participants.map((p) => (
                                <option value={p.name} key={p.id}>{p.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                const desc = document.getElementById(`desc-${outing.id}`)?.value || '';
                                const amt = parseFloat(document.getElementById(`amt-${outing.id}`)?.value || '0');
                                const payer = document.getElementById(`payer-${outing.id}`)?.value || '';
                                addExpense(outing.id, desc, amt, payer);
                                const d = document.getElementById(`desc-${outing.id}`);
                                const a = document.getElementById(`amt-${outing.id}`);
                                const p = document.getElementById(`payer-${outing.id}`);
                                if (d) d.value = '';
                                if (a) a.value = '';
                                if (p) p.value = '';
                              }}
                            >
                              Añadir
                            </button>
                          </div>
                          <ul className="expenses-list-mini">
                            {outing.expenses.map((exp) => (
                              <li className="expense-item-mini" key={exp.id}>
                                <span>{exp.description} · {exp.payer}</span>
                                <span>{formatAmount(exp.amount, currency)}</span>
                                <button type="button" aria-label="Eliminar" onClick={() => removeExpense(outing.id, exp.id)}>
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="outing-summary">
                          <span>Total: <strong>{formatAmount(result.total, currency)}</strong></span>
                          {result.settlements.length > 0 ? (
                            <span className="outing-settlements-preview">
                              {result.settlements.map((s) => `${s.from}→${s.to}`).join(', ')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {currentTrip.outings.length === 0 ? (
                  <p className="hint">Añade salidas (cena, taxi, entradas...) y selecciona quién participó en cada una.</p>
                ) : null}
              </section>

              <section className="results-section card card-results">
                <div className="section-badge">Resumen del viaje</div>
                <h2>¿Quién paga a quién?</h2>
                <div className="results-content">
                  {!summary || summary.total < 0.01 ? (
                    <p className="empty-state">Añade personas, salidas y gastos para ver el resumen.</p>
                  ) : (
                    <div className="settlement-details">
                      <div className="results-preview">
                        <div className="total-summary">
                          <p><strong>Total del viaje:</strong> <span>{formatAmount(summary.total, currency)}</span></p>
                        </div>
                        <div className="balances">
                          {currentTrip.people.map((person) => {
                            const bal = summary.balances[person.name] || 0;
                            let cls = 'balance-zero';
                            if (bal > 0.01) cls = 'balance-positive';
                            else if (bal < -0.01) cls = 'balance-negative';
                            return (
                              <div className="balance-item" key={person.id}>
                                <span>{person.name}</span>
                                <span className={cls}>
                                  {bal > 0.01 ? '+' : ''}{formatAmount(bal, currency)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <h3>Transferencias a realizar</h3>
                        <ul className="settlements">
                          {summary.settlements.length === 0 ? (
                            <li className="settlement-item">¡Todo el mundo está a mano!</li>
                          ) : (
                            summary.settlements.map((s, idx) => (
                              <li className="settlement-item" key={`${s.from}-${s.to}-${idx}`}>
                                <span>{s.from}</span> <span className="settlement-arrow">→</span> <span>{s.to}</span>
                                <span className="settlement-amount">{formatAmount(s.amount, currency)}</span>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
                {summary && summary.total > 0.01 ? (
                  <div className="export-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => exportAsImage(summary)}>
                      Descargar imagen
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => exportAsPdf(summary)}>
                      Descargar PDF
                    </button>
                  </div>
                ) : null}
              </section>
            </div>
          </section>
        )}
      </main>

      <div className="modal-overlay" aria-hidden={!outingModalOpen} style={{ display: outingModalOpen ? 'flex' : 'none' }}>
        <div className="modal" role="dialog" aria-labelledby="outingModalTitle">
          <h3 id="outingModalTitle">Nueva salida</h3>
          <input type="text" id="outingNameInput" placeholder="Ej: Cena, Taxi, Entradas..." />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setOutingModalOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const input = document.getElementById('outingNameInput');
                const name = input?.value || '';
                addOuting(name);
                if (input) input.value = '';
                setOutingModalOpen(false);
              }}
            >
              Crear
            </button>
          </div>
        </div>
      </div>

      <div className="comprobante" id="comprobante" ref={comprobanteRef}>
        {summary ? (
          <div className="comprobante-inner">
            <div className="comprobante-header">
              <span className="comprobante-logo">Divide</span>
              <span className="comprobante-subtitle">Resumen: {summary.trip.name}</span>
            </div>
            <div className="comprobante-divider"></div>
            <div className="comprobante-totals">
              <div className="comprobante-total-row">
                <span>Total del viaje</span>
                <span>{formatAmount(summary.total, currency)}</span>
              </div>
            </div>
            <div className="comprobante-divider"></div>
            <div className="comprobante-balances">
              {summary.trip.people.map((person) => {
                const bal = summary.balances[person.name] || 0;
                let cls = '';
                if (bal > 0.01) cls = 'comprobante-balance-positive';
                else if (bal < -0.01) cls = 'comprobante-balance-negative';
                return (
                  <div className="comprobante-balance-row" key={person.id}>
                    <span>{person.name}</span>
                    <span className={cls}>{bal > 0.01 ? '+' : ''}{formatAmount(bal, currency)}</span>
                  </div>
                );
              })}
            </div>
            <div className="comprobante-divider"></div>
            <div className="comprobante-settlements">
              <h4 className="comprobante-section-title">Transferencias a realizar</h4>
              <ul className="comprobante-settlements-list">
                {summary.settlements.length === 0 ? (
                  <li className="comprobante-settlement-item comprobante-settlement-empty">Todo el mundo está a mano</li>
                ) : (
                  summary.settlements.map((s, idx) => (
                    <li className="comprobante-settlement-item" key={`${s.from}-${s.to}-c-${idx}`}>
                      <span className="comprobante-from">{s.from}</span>
                      <span className="comprobante-arrow">→</span>
                      <span className="comprobante-to">{s.to}</span>
                      <span className="comprobante-amount">{formatAmount(s.amount, currency)}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="comprobante-footer">
              <span className="comprobante-date">
                {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

export const getServerSideProps = async (ctx) => {
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: '/auth/login',
        permanent: false
      }
    };
  }

  return {
    props: {
      initialSession: session
    }
  };
};

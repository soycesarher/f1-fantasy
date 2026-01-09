// src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { logout, auth, db } from '../firebase';
import { drivers2026 } from '../data/drivers'; // Asegúrate de que este array esté ordenado por Standings
import { getCurrentRace } from '../data/races';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  getDocs,
  collectionGroup,
} from 'firebase/firestore';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('current');
  const [currentRace, setCurrentRace] = useState(getCurrentRace());

  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [saving, setSaving] = useState(false);

  const [leaderboard, setLeaderboard] = useState([]);
  const [myHistory, setMyHistory] = useState([]);

  // DATOS GLOBALES
  const [rivalsData, setRivalsData] = useState([]);
  const [selectedRivalRaceId, setSelectedRivalRaceId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  // CONTROL DE SELECCIÓN
  const [isSelectionOpen, setIsSelectionOpen] = useState(true);

  const [modal, setModal] = useState({
    show: false,
    title: '',
    message: '',
    type: 'alert',
    onConfirm: null,
  });

  // --- LÓGICA DE TIERS (REGLAS DE SELECCIÓN) ---
  // Asumimos que drivers2026 viene ordenado por ranking actual.
  // Si no, deberías ordenarlo aquí: drivers2026.sort((a,b) => a.rank - b.rank)

  const tierGroups = {
    banned: drivers2026.slice(0, 2), // Top 1 y 2 (Prohibidos)
    tier1: drivers2026.slice(2, 6), // Pos 3, 4, 5, 6
    tier2: drivers2026.slice(6, 10), // Pos 7, 8, 9, 10
    tier3: drivers2026.slice(10), // Pos 11 en adelante
  };

  // Función para saber a qué tier pertenece un piloto
  const getDriverTier = (driverId) => {
    if (tierGroups.banned.find((d) => d.id === driverId)) return 'banned';
    if (tierGroups.tier1.find((d) => d.id === driverId)) return 'tier1';
    if (tierGroups.tier2.find((d) => d.id === driverId)) return 'tier2';
    if (tierGroups.tier3.find((d) => d.id === driverId)) return 'tier3';
    return 'unknown';
  };

  // 1. AUTO-REGISTRO
  useEffect(() => {
    async function ensureUserInDB() {
      if (!auth.currentUser) return;
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: auth.currentUser.displayName || 'Nuevo Piloto',
          totalPoints: 0,
          isAdmin: false,
        });
      }
      if (userSnap.exists() && userSnap.data().isAdmin === true)
        setIsAdmin(true);
    }
    ensureUserInDB();
  }, []);

  // 2. ESCUCHAR SWITCH
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'raceControl'), (docSnap) => {
      if (docSnap.exists()) {
        setIsSelectionOpen(docSnap.data().isOpen);
      } else {
        setDoc(doc(db, 'config', 'raceControl'), { isOpen: true });
        setIsSelectionOpen(true);
      }
    });
    return () => unsub();
  }, []);

  // 3. CARGAR USUARIOS
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      usersData.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
      setLeaderboard(usersData);
    });
    return () => unsubscribe();
  }, []);

  // 4. CARGAR DATOS GLOBALES
  useEffect(() => {
    async function fetchAllRaces() {
      const q = query(collectionGroup(db, 'races'));
      const snapshot = await getDocs(q);
      const allRaces = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const pathSegments = docSnap.ref.path.split('/');
        const userId = pathSegments[1];
        allRaces.push({ ...data, userId: userId });
      });
      setRivalsData(allRaces);

      if (allRaces.length > 0) {
        const maxId = Math.max(...allRaces.map((r) => r.raceId));
        setSelectedRivalRaceId(maxId.toString());
      } else {
        setSelectedRivalRaceId(currentRace.id.toString());
      }
    }
    fetchAllRaces();
  }, [hasPlayed, currentRace]);

  // 5. CHECK STATUS
  useEffect(() => {
    async function checkStatus() {
      if (!auth.currentUser) return;
      const userId = auth.currentUser.uid;
      const raceRef = doc(
        db,
        'users',
        userId,
        'races',
        currentRace.id.toString()
      );
      const raceSnap = await getDoc(raceRef);

      if (raceSnap.exists()) {
        setHasPlayed(true);
        setSelectedDrivers(raceSnap.data().drivers);
      }
    }
    checkStatus();
  }, [currentRace]);

  // 6. HISTORIAL
  const loadHistory = async () => {
    setActiveTab('history');
    if (!auth.currentUser) return;
    const q = collection(db, 'users', auth.currentUser.uid, 'races');
    const snapshot = await getDocs(q);
    const historyData = snapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => b.raceId - a.raceId);
    setMyHistory(historyData);
  };

  // --- LÓGICA FALTANTES ---
  const currentRaceEntries = rivalsData.filter(
    (r) => r.raceId.toString() === currentRace.id.toString()
  );
  const playersReadyIds = currentRaceEntries.map((r) => r.userId);
  if (
    hasPlayed &&
    auth.currentUser &&
    !playersReadyIds.includes(auth.currentUser.uid)
  ) {
    playersReadyIds.push(auth.currentUser.uid);
  }
  const pendingUsers = leaderboard.filter(
    (u) => !playersReadyIds.includes(u.id)
  );
  const readyUsers = leaderboard.filter((u) => playersReadyIds.includes(u.id));

  // --- ACCIONES ---
  const toggleRaceLock = async () => {
    const newState = !isSelectionOpen;
    try {
      await setDoc(
        doc(db, 'config', 'raceControl'),
        { isOpen: newState },
        { merge: true }
      );
      showModal(
        'Configuración Actualizada',
        newState ? 'Selección ABIERTA.' : 'Selección CERRADA.',
        'alert'
      );
    } catch (e) {
      console.error(e);
    }
  };

  const sendWhatsAppReminder = () => {
    if (pendingUsers.length === 0) {
      showModal('¡Todo listo!', 'Nadie falta.', 'alert');
      return;
    }
    const names = pendingUsers.map((u) => u.name).join(', ');
    const message = `🏎️ *F1 FANTASY ALERT* 🚨\n\nFaltan por seleccionar pilotos para el *${currentRace.name}*:\n\n⏳ ${names}\n\n¡Apúrense antes de que cierre la pista! 🏁`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const sendGeneralAlert = () => {
    const message = `🏎️ *F1 FANTASY* \n\n¡Este fin de semana hay carrera! 🏁\n\n*${currentRace.name}*\n\nNo olviden armar su estrategia y elegir pilotos antes de la Qualy.\n\n¡Nos vemos en la pista! 🏆`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  // --- MODAL & JUEGO ---
  const showModal = (title, message, type = 'alert', onConfirm = null) => {
    setModal({ show: true, title, message, type, onConfirm });
  };
  const closeModal = () => setModal({ ...modal, show: false });
  const handleModalConfirm = () => {
    if (modal.onConfirm) modal.onConfirm();
    closeModal();
  };

  // --- NUEVA LÓGICA DE SELECCIÓN POR TIERS ---
  const toggleDriver = (driver) => {
    if (hasPlayed) return;
    if (!isSelectionOpen) {
      showModal(
        'Selección Bloqueada',
        'Las selecciones están cerradas.',
        'alert'
      );
      return;
    }

    const tier = getDriverTier(driver.id);

    // 1. REGLA: Top 2 prohibidos
    if (tier === 'banned') {
      showModal(
        'Piloto Bloqueado',
        'Los 2 primeros lugares de la tabla no se pueden elegir.',
        'alert'
      );
      return;
    }

    // 2. REGLA: Solo 1 por Tier
    // Verificamos si ya hay alguien seleccionado de este mismo tier
    const existingDriverInTier = selectedDrivers.find(
      (d) => getDriverTier(d.id) === tier
    );

    if (existingDriverInTier) {
      // Si es el mismo, lo quitamos (deselect)
      if (existingDriverInTier.id === driver.id) {
        setSelectedDrivers(selectedDrivers.filter((d) => d.id !== driver.id));
      } else {
        // Si es otro del mismo tier, LO REEMPLAZAMOS (Auto-swap)
        const newSelection = selectedDrivers.filter(
          (d) => d.id !== existingDriverInTier.id
        );
        setSelectedDrivers([...newSelection, driver]);
      }
    } else {
      // Si no hay nadie de este tier, lo agregamos (si no excedemos 3 total, aunque por lógica de tiers es difícil excederse si respetamos 1 por tier)
      if (selectedDrivers.length < 3) {
        setSelectedDrivers([...selectedDrivers, driver]);
      } else {
        // Caso raro de seguridad
        showModal(
          'Equipo Completo',
          'Ya tienes 3 pilotos. Cambia uno de su respectivo grupo.',
          'alert'
        );
      }
    }
  };

  const handleSaveClick = () => {
    if (!isSelectionOpen) {
      showModal('Bloqueado', 'No se puede guardar.', 'alert');
      return;
    }

    // Validar que tenga 1 de cada Tier
    const t1 = selectedDrivers.find((d) => getDriverTier(d.id) === 'tier1');
    const t2 = selectedDrivers.find((d) => getDriverTier(d.id) === 'tier2');
    const t3 = selectedDrivers.find((d) => getDriverTier(d.id) === 'tier3');

    if (!t1 || !t2 || !t3) {
      showModal(
        'Selección Incompleta',
        'Debes elegir exactamente:\n\n1 Piloto del Tier 1\n1 Piloto del Tier 2\n1 Piloto del Tier 3',
        'alert'
      );
      return;
    }

    showModal(
      '¿Confirmar Equipo?',
      'No podrás hacer cambios después.',
      'confirm',
      executeSave
    );
  };

  const executeSave = async () => {
    setSaving(true);
    try {
      const userId = auth.currentUser.uid;
      const driversWithPlaceholder = selectedDrivers.map((d) => ({
        ...d,
        position: null,
        pointsEarned: 0,
      }));
      await setDoc(
        doc(db, 'users', userId, 'races', currentRace.id.toString()),
        {
          raceId: currentRace.id,
          raceName: currentRace.name,
          drivers: driversWithPlaceholder,
          points: 0,
          status: 'pending',
          timestamp: new Date(),
        }
      );
      await setDoc(
        doc(db, 'users', userId),
        { name: auth.currentUser.displayName },
        { merge: true }
      );
      setHasPlayed(true);
      setTimeout(
        () => showModal('¡Éxito!', 'Equipo confirmado.', 'alert'),
        500
      );
    } catch (error) {
      console.error(error);
      showModal('Error', 'Problema al guardar.', 'alert');
    }
    setSaving(false);
  };

  const calculateTotalHistoryPoints = () =>
    myHistory.reduce((acc, race) => acc + (race.points || 0), 0);
  const getUserName = (uid) => {
    const user = leaderboard.find((u) => u.id === uid);
    return user ? user.name : 'Usuario';
  };

  // --- FILTROS Y TABLAS ---
  const getPublicRivals = () =>
    rivalsData.filter(
      (r) =>
        r.raceId.toString() === selectedRivalRaceId.toString() &&
        r.raceId < currentRace.id
    );
  const getAdminData = () => {
    if (leaderboard.length > 0) {
      return leaderboard.map((user) => {
        const raceEntry = rivalsData.find(
          (r) =>
            r.userId === user.id &&
            r.raceId.toString() === selectedRivalRaceId.toString()
        );
        if (raceEntry)
          return { ...raceEntry, userName: user.name, hasPlayed: true };
        else
          return {
            userId: user.id,
            userName: user.name,
            drivers: [],
            points: 0,
            hasPlayed: false,
          };
      });
    }
    const activePlayers = rivalsData.filter(
      (r) => r.raceId.toString() === selectedRivalRaceId.toString()
    );
    return activePlayers.map((r) => ({
      ...r,
      userName: r.userName || 'Jugador',
      hasPlayed: true,
    }));
  };
  const availableRacesPublic = [
    ...new Set(
      rivalsData
        .filter((r) => r.raceId < currentRace.id)
        .map((item) => JSON.stringify({ id: item.raceId, name: item.raceName }))
    ),
  ]
    .map((s) => JSON.parse(s))
    .sort((a, b) => b.id - a.id);
  const allRacesOptions = [currentRace, ...rivalsData].map((r) => ({
    id: r.id || r.raceId,
    name: r.name || r.raceName,
  }));
  const uniqueAdminRaces = Array.from(
    new Map(allRacesOptions.map((item) => [item.id, item])).values()
  ).sort((a, b) => b.id - a.id);

  const ResultsTable = ({ data }) => (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        backgroundColor: 'white',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
      }}
    >
      <thead>
        <tr
          style={{
            backgroundColor: '#1a1a1a',
            color: 'white',
            fontSize: '0.9rem',
            textAlign: 'left',
          }}
        >
          <th style={{ padding: '15px' }}>Jugador</th>
          <th style={{ padding: '15px' }}>Pilotos Elegidos</th>
          <th style={{ padding: '15px', textAlign: 'center' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td
              colSpan="3"
              style={{ padding: '20px', textAlign: 'center', color: '#999' }}
            >
              No hay datos disponibles.
            </td>
          </tr>
        ) : (
          data.map((entry, index) => (
            <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
              <td
                style={{ padding: '15px', fontWeight: 'bold', color: '#333' }}
              >
                {entry.userName || getUserName(entry.userId)}
              </td>
              <td style={{ padding: '15px' }}>
                {!entry.drivers || entry.drivers.length === 0 ? (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      backgroundColor: '#f0f0f0',
                      color: '#999',
                      fontSize: '0.8rem',
                      fontStyle: 'italic',
                    }}
                  >
                    Sin selección
                  </span>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {entry.drivers.map((d, i) => (
                      <div
                        key={i}
                        style={{ fontSize: '0.9rem', color: '#555' }}
                      >
                        <span style={{ fontWeight: '600', color: '#000' }}>
                          {d.name.split(' ').pop()}
                        </span>
                        <span
                          style={{
                            marginLeft: '5px',
                            color: d.pointsEarned > 0 ? '#006d58' : '#888',
                            fontSize: '0.85rem',
                          }}
                        >
                          {d.pointsEarned !== undefined
                            ? `(${d.pointsEarned} pts)`
                            : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </td>
              <td
                style={{
                  padding: '15px',
                  textAlign: 'center',
                  fontWeight: '800',
                  fontSize: '1.2rem',
                  color: entry.points > 0 ? '#e10600' : '#ccc',
                }}
              >
                {entry.points}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  // --- COMPONENTE PARA RENDERIZAR GRUPOS DE PILOTOS ---
  const DriverGroup = ({ title, drivers, tierName, isBlocked, color }) => (
    <div style={{ marginBottom: '30px' }}>
      <h4
        style={{
          margin: '0 0 15px 0',
          color: color,
          borderBottom: `2px solid ${color}`,
          paddingBottom: '5px',
          display: 'inline-block',
          textTransform: 'uppercase',
          fontSize: '0.9rem',
          letterSpacing: '1px',
        }}
      >
        {title}
      </h4>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '15px',
        }}
      >
        {drivers.map((driver) => {
          const isSelected = selectedDrivers.find((d) => d.id === driver.id);
          // Si ya jugaste, solo mostramos los seleccionados en su grupo (o todos si quieres ver el grid completo, aqui mostramos todos pero bloqueados)
          // El prop 'isBlocked' viene del padre (si es Top 2 o si el juego está cerrado)

          const effectiveBlocked =
            hasPlayed || isBlocked || (!isSelectionOpen && !hasPlayed);

          return (
            <div
              key={driver.id}
              onClick={() => !effectiveBlocked && toggleDriver(driver)}
              style={{
                border: isSelected
                  ? `3px solid ${driver.color}`
                  : `1px solid ${effectiveBlocked ? '#eee' : '#ddd'}`,
                borderRadius: '12px',
                padding: '10px',
                textAlign: 'center',
                backgroundColor: effectiveBlocked ? '#f9f9f9' : 'white',
                opacity: effectiveBlocked && !isSelected ? 0.5 : 1,
                cursor: effectiveBlocked ? 'default' : 'pointer',
                transform: isSelected ? 'translateY(-4px)' : 'none',
                boxShadow: isSelected
                  ? '0 8px 20px rgba(0,0,0,0.1)'
                  : '0 2px 5px rgba(0,0,0,0.02)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ position: 'relative' }}>
                <img
                  src={driver.image}
                  alt={driver.name}
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    filter:
                      effectiveBlocked && !isSelected
                        ? 'grayscale(100%)'
                        : 'none',
                  }}
                />
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 5,
                      right: 5,
                      background: driver.color,
                      color: 'white',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                    }}
                  >
                    ✓
                  </div>
                )}
                {effectiveBlocked && !isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: '1.5rem',
                    }}
                  >
                    🔒
                  </div>
                )}
              </div>
              <div
                style={{ fontSize: '0.9rem', fontWeight: '700', color: '#333' }}
              >
                {driver.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#666' }}>
                {driver.team}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      style={{
        padding: '20px',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        maxWidth: '900px',
        margin: '0 auto',
        paddingBottom: '100px',
        backgroundColor: '#f8f9fa',
        minHeight: '100vh',
      }}
    >
      {/* HEADER */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '12px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          🏁{' '}
          <span
            style={{ color: '#e10600', fontWeight: '900', fontStyle: 'italic' }}
          >
            F1
          </span>{' '}
          FANTASY
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isAdmin && (
            <button
              onClick={toggleRaceLock}
              style={{
                padding: '8px 16px',
                marginRight: '10px',
                backgroundColor: isSelectionOpen ? '#28a745' : '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '30px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isSelectionOpen
                ? '🔓 Selección ABIERTA'
                : '🔒 Selección CERRADA'}
            </button>
          )}
          <span style={{ fontWeight: '600', color: '#333' }}>
            {auth.currentUser?.displayName}
          </span>
          <button
            onClick={logout}
            style={{
              padding: '6px 14px',
              background: '#1f1f1f',
              color: '#fff',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 'bold',
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {/* PESTAÑAS */}
      <div
        style={{
          display: 'flex',
          gap: '5px',
          marginBottom: '25px',
          overflowX: 'auto',
        }}
      >
        <button
          onClick={() => setActiveTab('current')}
          style={tabStyle(activeTab === 'current')}
        >
          🏎️ Jugar
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          style={tabStyle(activeTab === 'leaderboard')}
        >
          🏆 Fantasy
        </button>
        <button
          onClick={() => setActiveTab('standings')}
          style={tabStyle(activeTab === 'standings')}
        >
          📊 Pilotos
        </button>
        <button
          onClick={() => setActiveTab('rivals')}
          style={tabStyle(activeTab === 'rivals')}
        >
          👀 Contrincantes
        </button>
        <button onClick={loadHistory} style={tabStyle(activeTab === 'history')}>
          📜 Historial
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('admin')}
            style={tabStyle(activeTab === 'admin', true)}
          >
            🔒 Admin
          </button>
        )}
      </div>

      {/* --- VISTA 1: JUGAR --- */}
      {activeTab === 'current' && (
        <>
          <div
            style={{
              display: 'flex',
              gap: '20px',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              marginBottom: '30px',
            }}
          >
            {/* PANEL IZQUIERDO */}
            <div
              style={{
                flex: '2 1 400px',
                backgroundColor: 'white',
                borderRadius: '16px',
                overflow: 'hidden',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                border: '1px solid #eee',
              }}
            >
              <div
                style={{
                  backgroundColor: '#e10600',
                  color: 'white',
                  padding: '12px',
                  fontSize: '0.9rem',
                  fontWeight: '800',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                }}
              >
                Próximo Grand Prix
              </div>
              <div style={{ padding: '30px 20px' }}>
                <h2
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '2.2rem',
                    color: '#1a1a1a',
                    fontWeight: '700',
                  }}
                >
                  {currentRace.name}
                </h2>
                <p
                  style={{
                    color: '#666',
                    margin: 0,
                    fontWeight: '500',
                    fontSize: '1.1rem',
                  }}
                >
                  {currentRace.circuit} • {currentRace.date}
                </p>
                <div
                  style={{
                    margin: '20px auto',
                    maxWidth: '300px',
                    padding: '10px',
                  }}
                >
                  <img
                    src={currentRace.image}
                    alt="Circuit"
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      opacity: 0.9,
                    }}
                  />
                </div>
                {hasPlayed ? (
                  <div
                    style={{
                      display: 'inline-block',
                      marginTop: '10px',
                      padding: '12px 25px',
                      backgroundColor: '#e6fffa',
                      color: '#006d58',
                      borderRadius: '50px',
                      fontWeight: 'bold',
                      border: '1px solid #b7ebdf',
                    }}
                  >
                    ✅ EQUIPO CONFIRMADO
                  </div>
                ) : !isSelectionOpen ? (
                  <div
                    style={{
                      display: 'inline-block',
                      marginTop: '10px',
                      padding: '12px 25px',
                      backgroundColor: '#f8d7da',
                      color: '#721c24',
                      borderRadius: '50px',
                      fontWeight: 'bold',
                      border: '1px solid #f5c6cb',
                    }}
                  >
                    🔒 SELECCIÓN CERRADA
                  </div>
                ) : (
                  <p style={{ color: '#e10600', fontWeight: '600' }}>
                    Selecciona tus 3 pilotos para competir
                  </p>
                )}
              </div>
            </div>

            {/* PANEL DERECHO: ESTADO */}
            <div
              style={{
                flex: '1 1 250px',
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                border: '1px solid #eee',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: '0 0 15px 0',
                    color: '#1a1a1a',
                    fontSize: '1.1rem',
                    borderBottom: '1px solid #eee',
                    paddingBottom: '10px',
                  }}
                >
                  🚦 Estado de la Parrilla
                </h3>
                <div style={{ marginBottom: '20px' }}>
                  <h4
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: '0.9rem',
                      color: '#e10600',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>🚨 Faltan</span>
                    <span
                      style={{
                        backgroundColor: '#e10600',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                      }}
                    >
                      {pendingUsers.length}
                    </span>
                  </h4>
                  {pendingUsers.length > 0 ? (
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        fontSize: '0.9rem',
                      }}
                    >
                      {pendingUsers.map((u) => (
                        <li
                          key={u.id}
                          style={{
                            padding: '6px 0',
                            borderBottom: '1px solid #f9f9f9',
                            color: '#666',
                          }}
                        >
                          {u.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: '#999',
                        fontStyle: 'italic',
                      }}
                    >
                      Nadie falta.
                    </p>
                  )}
                  {pendingUsers.length > 0 && (
                    <button
                      onClick={sendWhatsAppReminder}
                      style={{
                        width: '100%',
                        marginTop: '10px',
                        padding: '8px',
                        backgroundColor: 'white',
                        color: '#e10600',
                        border: '1px solid #e10600',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                      }}
                    >
                      <span>📲</span> Enviar Recordatorio
                    </button>
                  )}
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <h4
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: '0.9rem',
                      color: '#006d58',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>✅ Listos</span>
                    <span
                      style={{
                        backgroundColor: '#006d58',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                      }}
                    >
                      {readyUsers.length}
                    </span>
                  </h4>
                  {readyUsers.length > 0 ? (
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        fontSize: '0.9rem',
                      }}
                    >
                      {readyUsers.map((u) => (
                        <li
                          key={u.id}
                          style={{
                            padding: '6px 0',
                            borderBottom: '1px solid #f9f9f9',
                            color: '#333',
                            fontWeight: '500',
                          }}
                        >
                          {u.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: '#999',
                        fontStyle: 'italic',
                      }}
                    >
                      Esperando...
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={sendGeneralAlert}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 10px rgba(0, 123, 255, 0.2)',
                  fontSize: '0.9rem',
                }}
              >
                <span>📢</span> Aviso General
              </button>
            </div>
          </div>

          <h3
            style={{
              margin: '0 0 15px 0',
              color: '#333',
              fontSize: '1.4rem',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            🏎️ Selecciona tus Pilotos
            {!isSelectionOpen && (
              <span
                style={{
                  fontSize: '0.9rem',
                  color: '#e10600',
                  border: '1px solid #e10600',
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}
              >
                BLOQUEADO
              </span>
            )}
          </h3>

          {/* GRID DE SELECCIÓN POR TIERS */}
          <DriverGroup
            title="🚫 Top 2 (Bloqueados)"
            drivers={tierGroups.banned}
            tierName="banned"
            isBlocked={true}
            color="#999"
          />
          <DriverGroup
            title="🥇 Tier 1 (Elige 1)"
            drivers={tierGroups.tier1}
            tierName="tier1"
            isBlocked={false}
            color="#d4af37"
          />
          <DriverGroup
            title="🥈 Tier 2 (Elige 1)"
            drivers={tierGroups.tier2}
            tierName="tier2"
            isBlocked={false}
            color="#C0C0C0"
          />
          <DriverGroup
            title="🥉 Tier 3 (Elige 1)"
            drivers={tierGroups.tier3}
            tierName="tier3"
            isBlocked={false}
            color="#cd7f32"
          />

          {!hasPlayed && (
            <div
              style={{
                position: 'fixed',
                bottom: 30,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100,
              }}
            >
              <button
                onClick={handleSaveClick}
                disabled={
                  selectedDrivers.length !== 3 || saving || !isSelectionOpen
                }
                style={{
                  padding: '16px 45px',
                  backgroundColor: !isSelectionOpen
                    ? '#999'
                    : selectedDrivers.length === 3
                    ? '#e10600'
                    : '#333',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50px',
                  fontWeight: '800',
                  fontSize: '1.1rem',
                  cursor:
                    !isSelectionOpen || selectedDrivers.length !== 3
                      ? 'not-allowed'
                      : 'pointer',
                  boxShadow: '0 10px 30px rgba(0,0,0, 0.2)',
                  transition: 'transform 0.1s',
                }}
              >
                {saving
                  ? 'Guardando...'
                  : !isSelectionOpen
                  ? '🔒 SELECCIÓN CERRADA'
                  : `CONFIRMAR (${selectedDrivers.length}/3)`}
              </button>
            </div>
          )}
        </>
      )}

      {/* --- VISTAS 2 a 6 (Igual que antes) --- */}
      {activeTab === 'leaderboard' && (
        <div
          style={{
            backgroundColor: 'white',
            padding: '0',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '25px',
              borderBottom: '1px solid #eee',
              textAlign: 'center',
            }}
          >
            <h2 style={{ margin: 0, color: '#1a1a1a' }}>🏆 Fantasy League</h2>
            <p style={{ color: '#888', margin: '5px 0 0 0' }}>
              Ranking de Amigos
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {leaderboard.map((user, index) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td
                    style={{
                      padding: '20px',
                      width: '50px',
                      textAlign: 'center',
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      color: index === 0 ? '#d4af37' : '#999',
                    }}
                  >
                    {index + 1}
                  </td>
                  <td
                    style={{
                      padding: '20px',
                      fontWeight: '600',
                      color: '#333',
                      fontSize: '1.1rem',
                    }}
                  >
                    {user.name}{' '}
                    {user.id === auth.currentUser.uid && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          marginLeft: '10px',
                          background: '#e10600',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          verticalAlign: 'middle',
                        }}
                      >
                        TÚ
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '20px',
                      textAlign: 'right',
                      fontWeight: '800',
                      color: '#e10600',
                      fontSize: '1.2rem',
                    }}
                  >
                    {user.totalPoints || 0}{' '}
                    <span
                      style={{
                        fontSize: '0.8rem',
                        color: '#999',
                        fontWeight: 'normal',
                      }}
                    >
                      pts
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'standings' && (
        <div
          style={{
            backgroundColor: 'white',
            padding: '0',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '25px',
              borderBottom: '1px solid #eee',
              textAlign: 'center',
              backgroundColor: '#15151e',
            }}
          >
            <h2 style={{ margin: 0, color: 'white' }}>📊 F1 Standings</h2>
            <p style={{ color: '#aaa', margin: '5px 0 0 0' }}>
              Campeonato de Pilotos 2026
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  borderBottom: '1px solid #eee',
                  fontSize: '0.8rem',
                  color: '#999',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ padding: '15px' }}>Pos</th>
                <th style={{ padding: '15px' }}>Piloto</th>
                <th style={{ padding: '15px', textAlign: 'right' }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {drivers2026.map((driver, index) => (
                <tr
                  key={driver.id}
                  style={{ borderBottom: '1px solid #f9f9f9' }}
                >
                  <td
                    style={{
                      padding: '15px',
                      fontWeight: 'bold',
                      color: '#333',
                    }}
                  >
                    {index + 1}
                  </td>
                  <td style={{ padding: '10px 15px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '15px',
                      }}
                    >
                      <img
                        src={driver.image}
                        alt={driver.name}
                        style={{
                          width: '45px',
                          height: '45px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: `2px solid ${driver.color}`,
                          padding: '2px',
                          backgroundColor: 'white',
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#1a1a1a' }}>
                          {driver.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>
                          {driver.team}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: '15px',
                      textAlign: 'right',
                      fontWeight: 'bold',
                    }}
                  >
                    0
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'rivals' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#444' }}>
              👀 Espiar Rivales
            </h3>
            {availableRacesPublic.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  background: 'white',
                  borderRadius: '12px',
                  textAlign: 'center',
                  color: '#888',
                }}
              >
                <p>Aún no hay carreras finalizadas para mostrar.</p>
              </div>
            ) : (
              <div>
                <select
                  value={selectedRivalRaceId}
                  onChange={(e) => setSelectedRivalRaceId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '1rem',
                    backgroundColor: 'white',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                  }}
                >
                  {availableRacesPublic.map((race) => (
                    <option key={race.id} value={race.id}>
                      {race.name}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: '20px' }}>
                  <ResultsTable data={getPublicRivals()} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isAdmin && activeTab === 'admin' && (
        <div>
          <div
            style={{
              marginBottom: '20px',
              border: '2px dashed #e10600',
              padding: '15px',
              borderRadius: '12px',
            }}
          >
            <h3 style={{ margin: '0 0 15px 0', color: '#e10600' }}>
              🔒 Panel de Admin (God Mode)
            </h3>
            <select
              value={selectedRivalRaceId}
              onChange={(e) => setSelectedRivalRaceId(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                fontSize: '1rem',
                backgroundColor: 'white',
              }}
            >
              {uniqueAdminRaces.map((race) => (
                <option key={race.id} value={race.id}>
                  {race.name} {race.id === currentRace.id ? '(ACTUAL)' : ''}
                </option>
              ))}
            </select>
            <div style={{ marginTop: '20px' }}>
              <ResultsTable data={getAdminData()} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              padding: '0 5px',
            }}
          >
            <h3 style={{ margin: 0, color: '#444' }}>📜 Tus Resultados</h3>
            <div
              style={{
                backgroundColor: '#1a1a1a',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '30px',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
              }}
            >
              TOTAL:{' '}
              <span
                style={{
                  color: '#d4af37',
                  fontSize: '1.1rem',
                  marginLeft: '5px',
                }}
              >
                {calculateTotalHistoryPoints()}
              </span>{' '}
              PTS
            </div>
          </div>
          {myHistory.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px',
                color: '#999',
                backgroundColor: 'white',
                borderRadius: '16px',
              }}
            >
              <p>Aún no has participado en ninguna carrera.</p>
            </div>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
            >
              {myHistory.map((race, index) => (
                <div
                  key={index}
                  style={{
                    borderRadius: '16px',
                    padding: '25px',
                    backgroundColor: 'white',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                    borderLeft: '6px solid #e10600',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '25px',
                      borderBottom: '1px solid #f0f0f0',
                      paddingBottom: '15px',
                    }}
                  >
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '1.3rem',
                        color: '#1a1a1a',
                      }}
                    >
                      {race.raceName}
                    </h2>
                    <div
                      style={{
                        backgroundColor:
                          race.points > 0 ? '#e6fffa' : '#f5f5f5',
                        color: race.points > 0 ? '#006d58' : '#888',
                        padding: '8px 16px',
                        borderRadius: '30px',
                        fontWeight: 'bold',
                        fontSize: '0.95rem',
                      }}
                    >
                      {race.points > 0 ? `+${race.points} PTS` : 'Pendiente'}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '15px',
                      justifyContent: 'space-around',
                    }}
                  >
                    {race.drivers.map((d) => (
                      <div
                        key={d.id}
                        style={{ textAlign: 'center', width: '33%' }}
                      >
                        <div
                          style={{
                            position: 'relative',
                            display: 'inline-block',
                          }}
                        >
                          <img
                            src={d.image}
                            style={{
                              width: '60px',
                              height: '60px',
                              borderRadius: '50%',
                              border: `3px solid ${d.color}`,
                              objectFit: 'cover',
                              padding: '2px',
                              backgroundColor: 'white',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: -5,
                              background: '#222',
                              color: 'white',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '2px solid white',
                            }}
                          >
                            {d.position ? `P${d.position}` : '?'}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: '0.95rem',
                            marginTop: '8px',
                            fontWeight: '700',
                            color: '#333',
                          }}
                        >
                          {d.name.split(' ').pop()}
                        </div>
                        <div
                          style={{
                            marginTop: '2px',
                            fontSize: '0.85rem',
                            color: '#666',
                          }}
                        >
                          {d.pointsEarned ? `+${d.pointsEarned} pts` : '-- pts'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL */}
      {modal.show && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '20px',
              maxWidth: '350px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
              animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: '1.5rem', color: '#1a1a1a' }}>
              {modal.title}
            </h3>
            <p
              style={{
                color: '#666',
                fontSize: '1rem',
                lineHeight: '1.5',
                marginBottom: '25px',
              }}
            >
              {modal.message}
            </p>
            <div
              style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}
            >
              {modal.type === 'confirm' && (
                <button
                  onClick={closeModal}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '50px',
                    border: 'none',
                    backgroundColor: '#f0f0f0',
                    color: '#333',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={handleModalConfirm}
                style={{
                  padding: '10px 25px',
                  borderRadius: '50px',
                  border: 'none',
                  backgroundColor: '#e10600',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(225, 6, 0, 0.3)',
                }}
              >
                {modal.type === 'confirm' ? 'Confirmar' : 'Entendido'}
              </button>
            </div>
          </div>
          <style>{`@keyframes popIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }`}</style>
        </div>
      )}
    </div>
  );
}

const tabStyle = (isActive, isAdmin = false) => ({
  flex: 1,
  padding: '12px 5px',
  cursor: 'pointer',
  border: 'none',
  background: isActive ? 'white' : 'transparent',
  borderBottom: isActive
    ? isAdmin
      ? '3px solid #000'
      : '3px solid #e10600'
    : '3px solid transparent',
  fontWeight: isActive ? '800' : '600',
  color: isActive ? (isAdmin ? '#000' : '#e10600') : '#888',
  borderRadius: '12px 12px 0 0',
  transition: 'all 0.2s',
  fontSize: '0.9rem',
  minWidth: '80px',
});

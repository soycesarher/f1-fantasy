// src/pages/Login.jsx
import React from 'react';
import { loginWithGoogle } from '../firebase';

export default function Login() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Icono decorativo */}
        <div style={styles.iconContainer}>🏎️</div>

        {/* Título con F1 en ROJO */}
        <h1 style={styles.title}>
          <span style={{ color: '#e10600' }}>F1</span> FANTASY 2026
        </h1>

        <p style={styles.subtitle}>Ingresa para seleccionar a tus pilotos.</p>

        <button onClick={loginWithGoogle} style={styles.button}>
          {/* URL OFICIAL DE GOOGLE (Más estable) */}
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google Logo"
            style={styles.googleIcon}
          />
          Ingresar con Google
        </button>

        <div style={styles.footer}>Temporada Oficial 2026</div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Fondo degradado elegante (Rojo F1 a Oscuro)
    background:
      'linear-gradient(135deg, #101010 0%, #1a1a1a 50%, #e10600 100%)',
    fontFamily: "'Segoe UI', Roboto, sans-serif",
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Blanco casi puro
    padding: '40px',
    borderRadius: '24px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
    textAlign: 'center',
    maxWidth: '400px',
    width: '90%',
    backdropFilter: 'blur(10px)',
  },
  iconContainer: {
    fontSize: '3rem',
    marginBottom: '10px',
  },
  title: {
    margin: '0 0 10px 0',
    color: '#111', // El resto del texto en negro/gris oscuro
    fontSize: '2rem',
    fontWeight: '900', // Más grueso
    letterSpacing: '-1px',
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  subtitle: {
    color: '#666',
    margin: '0 0 30px 0',
    lineHeight: '1.5',
    fontSize: '1rem',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    padding: '14px',
    backgroundColor: '#fff',
    border: '2px solid #e1e1e1',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: '600',
    color: '#333',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
  },
  googleIcon: {
    width: '24px', // Un poquito más grande para que se vea bien
    height: '24px',
  },
  footer: {
    marginTop: '25px',
    fontSize: '0.75rem',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
};

// src/data/races.js

export const races2026 = [
  {
    id: 1,
    name: "Gran Premio de Bahrein",
    circuit: "Bahrain International Circuit",
    date: "2026-03-02", 
    // Nueva imagen: Trazado limpio negro (Wikipedia)
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Bahrain_International_Circuit--Grand_Prix_Layout.svg/1280px-Bahrain_International_Circuit--Grand_Prix_Layout.svg.png",
    isOpen: true 
  },
  {
    id: 2,
    name: "Gran Premio de Arabia Saudita",
    circuit: "Jeddah Corniche Circuit",
    date: "2026-03-09",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Jeddah_Corniche_Circuit_2021.svg/1024px-Jeddah_Corniche_Circuit_2021.svg.png",
    isOpen: false
  },
  {
    id: 3,
    name: "Gran Premio de Australia",
    circuit: "Albert Park Circuit",
    date: "2026-03-23",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Albert_Park_Circuit_2021.svg/1024px-Albert_Park_Circuit_2021.svg.png",
    isOpen: false
  }
];

export function getCurrentRace() {
  return races2026[0]; 
}

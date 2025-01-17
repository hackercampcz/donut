export default {
  meta: {
    lang: "cs"
  },
  year: 2024,
  get currentYear() {
    return new Date().getFullYear();
  },
  event: {
    name: "Hacker Camp",
    startDate: new Date("2024-08-29T17:00:00+02:00"),
    endDate: new Date("2024-09-01T12:00:00+02:00"),
    get willStartSoon() {
      const today = new Date();
      const threeDaysBefore = this.startDate;
      threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
      threeDaysBefore.setHours(0, 0, 0, 0);
      return threeDaysBefore <= today && today <= this.endDate;
    },
    isRegistrationOpen: false,
    location: "Sobeňák, Starý Rožmitál 148, Rožmitál pod Třemšínem",
    details: "Zažijte netradiční třídenní festival pro lidi z české tech scény."
  },
  ticket: {
    nonprofit: { name: "Táborník z neziskovky", price: 3000 },
    hacker: { name: "Hacker", price: 7000 },
    "hacker-plus": { name: "Hacker filantrop", price: 12000 },
    "hacker-patron": { name: "Patron Campu", price: 12000 }
  }
};

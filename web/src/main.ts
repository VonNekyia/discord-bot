// Blendet jeden Abschnitt mit .reveal einmal ein, sobald er ins Bild kommt.
// Ohne Skript und bei reduzierter Bewegung ist alles sofort sichtbar.
// Siehe docs/frontend/design.md, „Bewegung“.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const beobachter = new IntersectionObserver(
    (eintraege) => {
      for (const eintrag of eintraege) {
        if (!eintrag.isIntersecting) continue;
        eintrag.target.classList.add('is-visible');
        beobachter.unobserve(eintrag.target);
      }
    },
    { threshold: 0.12 },
  );
  document.documentElement.classList.add('js');
  for (const abschnitt of document.querySelectorAll('.reveal')) beobachter.observe(abschnitt);
}

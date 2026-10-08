import { C, initShell, isAddr } from "./core.js";

initShell();
document.querySelectorAll("[data-fee-recipient]").forEach((el) => {
  if (isAddr(C.feeRecipient)) el.innerHTML = `<a target="_blank" rel="noopener" href="${C.explorer}/address/${C.feeRecipient}">${C.feeRecipient}</a>`;
});
// Highlight the section in view, for whichever language is showing.
function spy() {
  const box = document.querySelector(`.docs[data-lang-only="${document.documentElement.lang}"]`);
  if (!box) return;
  const links = [...box.querySelectorAll("aside a")];
  let cur = 0;
  links.forEach((a, i) => {
    const h = document.querySelector(a.getAttribute("href"));
    if (h && h.getBoundingClientRect().top < 120) cur = i;
  });
  links.forEach((a, i) => a.classList.toggle("on", i === cur));
}
addEventListener("scroll", spy, { passive: true });
addEventListener("langchange", spy);
spy();

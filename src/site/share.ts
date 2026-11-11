/**
 * Share page (/s/:id) enhancements: copy the link, and report a track. The page itself is
 * rendered by the server, so listening and reading work without this script.
 */
import './main';

const status = document.querySelector<HTMLElement>('[data-share-status]');
const say = (text: string) => {
  if (status) status.textContent = text;
};

document.querySelector<HTMLButtonElement>('[data-copy-link]')?.addEventListener('click', async () => {
  const url = window.location.href.split('#')[0];
  try {
    await navigator.clipboard.writeText(url);
    say('Link copied. Paste it anywhere to share this.');
  } catch {
    // Clipboard access can be blocked; show the address so it can be copied by hand.
    say(`Copy this link: ${url}`);
  }
});

const reportForm = document.querySelector<HTMLFormElement>('[data-report]');
if (reportForm) {
  const result = reportForm.querySelector<HTMLElement>('[data-report-status]');
  reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = reportForm.dataset.report ?? '';
    const data = new FormData(reportForm);
    const submit = reportForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const response = await fetch(`/api/creations/${encodeURIComponent(id)}/reports`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: String(data.get('reason') ?? 'other'),
          details: String(data.get('details') ?? '').trim() || undefined,
        }),
      });
      if (response.ok) {
        if (result) result.textContent = 'Thanks. Your report was received and will be reviewed.';
        reportForm.querySelectorAll<HTMLElement>('label, button').forEach((el) => (el.hidden = true));
        return;
      }
      if (result) {
        result.textContent =
          response.status === 429
            ? 'Too many reports from this device. Please try again later.'
            : 'The report could not be sent. Please try again.';
      }
    } catch {
      if (result) result.textContent = 'The report could not be sent. Check your connection and try again.';
    }
    if (submit) submit.disabled = false;
  });
}

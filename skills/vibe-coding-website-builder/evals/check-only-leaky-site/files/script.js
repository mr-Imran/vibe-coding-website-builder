// Contact form
const form = document.getElementById('contact-form');
form.addEventListener('submit', function (e) {
  e.preventDefault();
  alert('Thank you! Your message has been sent. We will get back to you soon.');
  form.reset();
});

// Deposit payment
const STRIPE_KEY = '__STRIPE_SECRET_KEY__';

document.getElementById('pay-deposit').addEventListener('click', async function () {
  const body = new URLSearchParams({
    'mode': 'payment',
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][product_data][name]': 'Grooming deposit',
    'line_items[0][price_data][unit_amount]': '1000',
    'line_items[0][quantity]': '1',
    'success_url': 'http://localhost:5500/index.html?paid=1',
    'cancel_url': 'http://localhost:5500/index.html'
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + STRIPE_KEY },
    body: body
  });
  const session = await res.json();
  window.location.href = session.url;
});

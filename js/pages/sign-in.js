// Signing in. Two panels, one at a time, and no state worth keeping between them.

import { signIn, resetPassword, currentSession } from '../db.js?v=640d633f2090';

const $ = selector => document.querySelector(selector);

// Somebody who is already signed in has no business looking at a sign-in form.
const session = await currentSession();
if (session) location.replace('app/dashboard.html');

function show(panel) {
  $('#sign-in-panel').hidden = panel !== 'sign-in';
  $('#forgot-panel').hidden = panel !== 'forgot';
  $(panel === 'sign-in' ? '#email' : '#reset-email').focus();
}

function say(target, text, tone = 'bad') {
  const element = $(target);
  element.textContent = text;
  element.className = `form-message${text ? ` form-message--${tone}` : ''}`;
}

function busy(button, on, restingLabel) {
  button.disabled = on;
  button.textContent = on ? 'Working…' : restingLabel;
}

$('#sign-in-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) return say('#sign-in-message', 'Enter your email and password.');

  const button = $('#sign-in-submit');
  say('#sign-in-message', '');
  busy(button, true, 'Sign in');
  try {
    await signIn(email, password);
    location.replace('app/dashboard.html');
  } catch (error) {
    say('#sign-in-message', error.message);
    busy(button, false, 'Sign in');
  }
});

$('#forgot-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('#reset-email').value.trim();
  if (!email) return say('#forgot-message', 'Enter the email on your account.');

  const button = $('#forgot-submit');
  busy(button, true, 'Send reset link');
  try {
    await resetPassword(email);
  } catch {
    // Whether an address has an account is not something a sign-in page should be
    // willing to tell a stranger, so the answer is the same either way.
  }
  say('#forgot-message', 'If that email has an account, a reset link is on its way.', 'good');
  busy(button, false, 'Send reset link');
});

$('#forgot-link').addEventListener('click', () => {
  $('#reset-email').value = $('#email').value.trim();
  show('forgot');
});
$('#back-link').addEventListener('click', () => show('sign-in'));

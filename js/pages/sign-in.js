// Signing in. Two panels, one at a time, and no state worth keeping between them.

import { signIn, resetPassword, currentSession,
         mustChangePassword, chooseOwnPassword } from '../db.js';

const $ = selector => document.querySelector(selector);

// Somebody who is already signed in has no business looking at a sign-in form — unless they
// are still carrying the password an administrator handed them, in which case this is
// exactly where they belong until they have chosen their own.
const session = await currentSession();
if (session) {
  if (await mustChangePassword()) showChoose();
  else location.replace('app/dashboard.html');
}

function show(panel) {
  $('#sign-in-panel').hidden = panel !== 'sign-in';
  $('#forgot-panel').hidden = panel !== 'forgot';
  $('#choose-panel').hidden = panel !== 'choose';
  $(panel === 'sign-in' ? '#email' : panel === 'forgot' ? '#reset-email' : '#new-password').focus();
}

function showChoose() { show('choose'); }

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
  const identifier = $('#email').value.trim();
  const password = $('#password').value;
  if (!identifier || !password) {
    return say('#sign-in-message', 'Enter your username and password.');
  }

  const button = $('#sign-in-submit');
  say('#sign-in-message', '');
  busy(button, true, 'Sign in');
  try {
    await signIn(identifier, password);
    // A temporary password gets you exactly this far.
    if (await mustChangePassword()) { busy(button, false, 'Sign in'); return showChoose(); }
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
  // A username account has no mailbox behind it, and telling somebody a link is on its way
  // to an address that cannot exist is a dead end they will sit in front of for ten minutes.
  if (!email.includes('@')) {
    return say('#forgot-message', 'That is a username, and a username has no email address '
      + 'to send a link to. Ask an administrator to issue you a new password.');
  }

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

// Choosing your own. There is no way past this panel except through it: the only other
// thing on the screen is the browser's back button, and going back lands on a session that
// still has to choose a password.
$('#choose-form').addEventListener('submit', async event => {
  event.preventDefault();
  const password = $('#new-password').value;
  const again = $('#new-password-again').value;
  if (password.length < 8) return say('#choose-message', 'Use at least eight characters.');
  if (password !== again) return say('#choose-message', 'Those two do not match.');

  const button = $('#choose-submit');
  say('#choose-message', '');
  busy(button, true, 'Save and continue');
  try {
    await chooseOwnPassword(password);
    location.replace('app/dashboard.html');
  } catch (error) {
    say('#choose-message', error.message);
    busy(button, false, 'Save and continue');
  }
});

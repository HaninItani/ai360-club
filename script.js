// ========================================
// LOGIN
// ========================================

let instructorSignup = false;

$('#studentTab').onclick = () => toggleLogin(false);
$('#adminTab').onclick = () => toggleLogin(true);

function toggleLogin(admin) {
  state.adminLogin = admin;

  $('#studentFields').hidden = admin;
  $('#adminFields').hidden = !admin;

  $('#studentTab').classList.toggle('selected', !admin);
  $('#adminTab').classList.toggle('selected', admin);

  if (!admin) {
    instructorSignup = false;
  }

  updateInstructorMode();

  $('#authError').textContent = '';
  $('#authSuccess').textContent = '';
  $('#authSuccess').hidden = true;
}

function updateInstructorMode() {
  const loginButton = $('#instructorLoginMode');
  const signupButton = $('#instructorSignupMode');
  const nameField = $('#signupNameField');
  const hint = $('#signupHint');
  const submit = $('#authSubmit');
  const password = $('#password');

  if (!loginButton || !signupButton) return;

  loginButton.classList.toggle('selected', !instructorSignup);
  signupButton.classList.toggle('selected', instructorSignup);

  nameField.hidden = !instructorSignup;
  hint.hidden = !instructorSignup;

  submit.textContent =
    state.adminLogin && instructorSignup
      ? 'Request instructor access'
      : 'Continue';

  password.autocomplete =
    instructorSignup
      ? 'new-password'
      : 'current-password';

  $('#authError').textContent = '';
  $('#authSuccess').textContent = '';
  $('#authSuccess').hidden = true;
}

$('#instructorLoginMode').onclick = () => {
  instructorSignup = false;
  updateInstructorMode();
};

$('#instructorSignupMode').onclick = () => {
  instructorSignup = true;
  updateInstructorMode();
};

$('#loginForm').onsubmit = async e => {
  e.preventDefault();

  $('#authError').textContent = '';
  $('#authSuccess').textContent = '';
  $('#authSuccess').hidden = true;

  try {
    // INSTRUCTOR SIGNUP
    if (state.adminLogin && instructorSignup) {
      const name = $('#signupName').value.trim();
      const email = $('#email').value.trim();
      const password = $('#password').value;

      if (!name) {
        throw Error('Please enter your name.');
      }

      const data = await api('/api/session', {
        method: 'POST',
        body: JSON.stringify({
          action: 'instructor-signup',
          name,
          email,
          password
        })
      });

      $('#authSuccess').textContent =
        data.message ||
        'Your instructor account was created and is waiting for approval.';

      $('#authSuccess').hidden = false;

      $('#signupName').value = '';
      $('#password').value = '';

      return;
    }

    // INSTRUCTOR LOGIN
    if (state.adminLogin) {
      const data = await api('/api/session', {
        method: 'POST',
        body: JSON.stringify({
          action: 'admin',
          email: $('#email').value.trim(),
          password: $('#password').value
        })
      });

      state.user = data.user;
      start();
      return;
    }

    // STUDENT LOGIN
    const data = await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({
        action: 'student',
        code: $('#code').value.trim()
      })
    });

    state.user = data.user;
    start();

  } catch (err) {
    $('#authError').textContent = err.message;
  }
};

$('#logout').onclick = async () => {
  await api('/api/session', {
    method: 'POST',
    body: JSON.stringify({
      action: 'logout'
    })
  });

  state.user = null;
  state.conversations = [];
  state.messages = [];
  state.instructors = [];

  $('#app').hidden = true;
  $('#auth').hidden = false;

  instructorSignup = false;
  toggleLogin(false);
};

async function boot() {
  try {
    const { user } = await api('/api/session');

    if (user) {
      state.user = user;
      start();
    } else {
      $('#auth').hidden = false;
    }
  } catch (err) {
    $('#auth').hidden = false;
    $('#authError').textContent = err.message;
  }
}

boot();

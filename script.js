const $ = s => document.querySelector(s);

const state = {
  user: null,
  view: 'dashboard',
  conversations: [],
  active: null,
  messages: [],
  students: [],
  groups: [],
  instructors: [],
  classroom: null,
  busy: false,
  image: false,
  adminLogin: false
};


// ========================================
// HELPERS
// ========================================

const escape = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      })[c]
  );


async function api(path, options = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  let data;

  try {
    data = await r.json();
  } catch {
    data = {};
  }

  if (!r.ok) {
    throw Error(data.error || 'Request failed');
  }

  return data;
}


const get = (action, params = {}) =>
  api(
    '/api/app?' +
      new URLSearchParams({
        action,
        ...params
      })
  );


const post = (action, data = {}) =>
  api('/api/app', {
    method: 'POST',
    body: JSON.stringify({
      action,
      ...data
    })
  });


function notice(message) {
  const el = $('#notice');

  if (el) {
    el.textContent = message;
  } else {
    alert(message);
  }
}


function openMenu(on) {
  $('#sidebar')?.classList.toggle('open', on);
  $('#scrim')?.classList.toggle('show', on);
}


$('#menu').onclick = () => openMenu(true);
$('#scrim').onclick = () => openMenu(false);
$('#dashboardShortcut').onclick = () => navigate('dashboard');


// ========================================
// LOGIN / SIGNUP
// ========================================

let instructorSignup = false;
let studentRegistrationPending = false;

$('#studentTab').onclick = () => toggleLogin(false);
$('#adminTab').onclick = () => toggleLogin(true);

function resetStudentRegistration() {
  studentRegistrationPending = false;
  $('#studentGroupField').hidden = true;
  $('#studentGroup').innerHTML = '';
}

function toggleLogin(admin) {
  state.adminLogin = admin;
  $('#studentFields').hidden = admin;
  $('#adminFields').hidden = !admin;
  $('#studentTab').classList.toggle('selected', !admin);
  $('#adminTab').classList.toggle('selected', admin);
  $('#instructorAuthSwitch').hidden = !admin;

  if (!admin) instructorSignup = false;
  resetStudentRegistration();
  updateInstructorMode();
  $('#authError').textContent = '';
  $('#authSuccess').textContent = '';
  $('#authSuccess').hidden = true;
}

function updateInstructorMode() {
  const title = $('#instructorAuthTitle');
  const nameField = $('#signupNameField');
  const hint = $('#signupHint');
  const submit = $('#authSubmit');
  const switchText = $('#authSwitchText');
  const switchButton = $('#authSwitchButton');
  const password = $('#password');

  if (!state.adminLogin) {
    submit.textContent = studentRegistrationPending ? 'Join AI360' : 'Continue';
    return;
  }

  if (instructorSignup) {
    title.textContent = 'Create Instructor Account';
    nameField.hidden = false;
    hint.hidden = false;
    submit.textContent = 'Request access';
    switchText.textContent = 'Already have an account?';
    switchButton.textContent = 'Log in';
    password.autocomplete = 'new-password';
  } else {
    title.textContent = 'Instructor Login';
    nameField.hidden = true;
    hint.hidden = true;
    submit.textContent = 'Log in';
    switchText.textContent = "Don't have an account?";
    switchButton.textContent = 'Sign up';
    password.autocomplete = 'current-password';
  }

  $('#authError').textContent = '';
  $('#authSuccess').textContent = '';
  $('#authSuccess').hidden = true;
}

$('#authSwitchButton').onclick = () => {
  instructorSignup = !instructorSignup;
  updateInstructorMode();
  $('#password').value = '';
  (instructorSignup ? $('#signupName') : $('#email')).focus();
};

$('#studentFullName').addEventListener('input', () => {
  if (studentRegistrationPending) {
    resetStudentRegistration();
    updateInstructorMode();
  }
});

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  $('#authError').textContent = '';
  $('#authSuccess').textContent = '';
  $('#authSuccess').hidden = true;

  try {
    if (state.adminLogin && instructorSignup) {
      const name = $('#signupName').value.trim();
      const email = $('#email').value.trim();
      const password = $('#password').value;
      if (!name) throw Error('Please enter your name.');
      if (!email) throw Error('Please enter your email.');
      if (!password) throw Error('Please enter a password.');

      const data = await api('/api/session', {
        method: 'POST',
        body: JSON.stringify({ action: 'instructor-signup', name, email, password })
      });

      $('#authSuccess').textContent = data.message || 'Your account has been created and is waiting for approval.';
      $('#authSuccess').hidden = false;
      $('#signupName').value = '';
      $('#email').value = '';
      $('#password').value = '';
      return;
    }

    if (state.adminLogin) {
      const email = $('#email').value.trim();
      const password = $('#password').value;
      if (!email || !password) throw Error('Please enter your email and password.');

      const data = await api('/api/session', {
        method: 'POST',
        body: JSON.stringify({ action: 'admin', email, password })
      });
      state.user = data.user;
      start();
      return;
    }

    const fullName = $('#studentFullName').value.trim();
    if (!fullName || !fullName.includes(' ')) throw Error('Please enter your full name (first and last name).');

    const data = await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({
        action: 'student',
        fullName,
        groupId: studentRegistrationPending ? $('#studentGroup').value : undefined
      })
    });

    if (data.registrationRequired) {
      studentRegistrationPending = true;
      $('#studentGroup').innerHTML = (data.groups || [])
        .map(g => `<option value="${g.id}">${escape(g.name)}</option>`)
        .join('');
      $('#studentGroupField').hidden = false;
      $('#authSubmit').textContent = 'Join AI360';
      $('#authSuccess').textContent = `Welcome, ${data.fullName}! Choose your group to join AI360.`;
      $('#authSuccess').hidden = false;
      return;
    }

    state.user = data.user;
    start();
  } catch (err) {
    $('#authError').textContent = err.message;
  }
};

$('#logout').onclick = async () => {
  try {
    await api('/api/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'logout' })
    });
  } catch (err) {
    console.error(err);
  }

  state.user = null;
  state.conversations = [];
  state.messages = [];
  state.instructors = [];
  state.active = null;
  $('#app').hidden = true;
  $('#auth').hidden = false;
  $('#studentFullName').value = '';
  $('#email').value = '';
  $('#password').value = '';
  $('#signupName').value = '';
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
      toggleLogin(false);
    }
  } catch (err) {
    $('#auth').hidden = false;
    $('#authError').textContent = err.message;
  }
}

boot();


// ========================================
// APP START
// ========================================

async function start() {
  $('#auth').hidden = true;
  $('#app').hidden = false;

  $('#userName').textContent =
    state.user.name;

  if (state.user.role === 'admin') {
    $('#userRole').textContent =
      state.user.instructorRole === 'owner'
        ? 'Owner'
        : 'Instructor';
  } else {
    $('#userRole').textContent =
      state.user.group === 'grades12'
        ? 'Grades 1–2'
        : 'Grades 3–5';
  }

  $('#avatar').textContent =
    state.user.name?.[0]?.toUpperCase() ||
    'A';

  navigate(
    state.user.role === 'admin'
      ? 'dashboard'
      : 'chat'
  );
}


// ========================================
// NAVIGATION
// ========================================

const items = () => {
  if (state.user.role !== 'admin') {
    return [
      ['chat', '✦', 'AI Chat'],
      ['history', '◷', 'Conversations']
    ];
  }

  const nav = [
    ['dashboard', '▦', 'Dashboard'],
    ['chat', '✦', 'AI Chat'],
    ['students', '♙', 'Students'],
    ['groups', '◫', 'Groups']
  ];

  if (
    state.user.instructorRole ===
    'owner'
  ) {
    nav.push([
      'instructors',
      '♚',
      'Instructors'
    ]);
  }

  nav.push(
    ['activity', '◷', 'Conversations'],
    ['classroom', '▣', 'Classroom'],
    ['settings', '⚙', 'Settings']
  );

  return nav;
};


function navigation() {
  const nav = $('#navigation');

  nav.innerHTML = items()
    .map(
      ([id, icon, label]) => `
        <button
          class="nav-item ${
            state.view === id
              ? 'active'
              : ''
          }"
          data-view="${id}"
        >
          <span>${icon}</span>
          ${label}
        </button>
      `
    )
    .join('');

  nav
    .querySelectorAll('[data-view]')
    .forEach(
      b =>
        (b.onclick = () =>
          navigate(b.dataset.view))
    );
}


async function navigate(view) {
  state.view = view;

  openMenu(false);
  navigation();

  $('#pageTitle').textContent =
    items().find(
      i => i[0] === view
    )?.[2] || 'AI360';

  $('#dashboardShortcut').hidden =
    state.user.role !== 'admin' ||
    view === 'dashboard';

  $('#content').innerHTML =
    '<div class="loading">Loading…</div>';

  try {
    if (view === 'dashboard') {
      await dashboard();
    }

    if (view === 'chat') {
      await chat();
    }

    if (
      view === 'history' ||
      view === 'activity'
    ) {
      await activity();
    }

    if (view === 'students') {
      await students();
    }

    if (view === 'groups') {
      await groups();
    }

    if (view === 'instructors') {
      await instructors();
    }

    if (view === 'classroom') {
      await classroom();
    }

    if (view === 'settings') {
      settings();
    }

  } catch (err) {
    $('#content').innerHTML = `
      <div class="page">
        <div class="panel error">
          ${escape(err.message)}
        </div>
      </div>
    `;
  }
}


// ========================================
// DASHBOARD
// ========================================

async function dashboard() {
  const [s, g, c] =
    await Promise.all([
      get('students'),
      get('groups'),
      get('conversations')
    ]);

  state.students = s.students;
  state.groups = g.groups;
  state.conversations =
    c.conversations;

  let pendingCount = 0;

  if (
    state.user.instructorRole ===
    'owner'
  ) {
    try {
      const result =
        await get('instructors');

      state.instructors =
        result.instructors;

      pendingCount =
        state.instructors.filter(
          x =>
            x.status === 'pending'
        ).length;

    } catch {
      pendingCount = 0;
    }
  }

  $('#content').innerHTML = `
    <div class="page">

      <div class="hero">

        <div class="eyebrow">
          INSTRUCTOR WORKSPACE
        </div>

        <h1>
          Welcome back,
          ${escape(state.user.name)}.
        </h1>

        <p>
          Keep your club organized and your
          students' ideas moving.
        </p>

        <button
          class="primary"
          data-go="chat"
        >
          Open your AI assistant →
        </button>

      </div>


      <div class="stats">

        <div class="stat">
          <strong>
            ${
              state.students.filter(
                x => x.active
              ).length
            }
          </strong>

          <span>
            Active students
          </span>
        </div>


        <div class="stat">
          <strong>
            ${state.groups.length}
          </strong>

          <span>
            Groups
          </span>
        </div>


        <div class="stat">
          <strong>
            ${
              state.conversations.filter(
                x =>
                  x.owner_role ===
                  'student'
              ).length
            }
          </strong>

          <span>
            Student conversations
          </span>
        </div>


        ${
          state.user.instructorRole ===
          'owner'
            ? `
              <div class="stat">
                <strong>
                  ${pendingCount}
                </strong>

                <span>
                  Pending instructors
                </span>
              </div>
            `
            : ''
        }

      </div>


      <h2>Workspace</h2>


      <div class="cards">

        <button
          class="feature"
          data-go="students"
        >
          <b>Students ↗</b>

          <span>
            Add students and manage access
          </span>
        </button>


        <button
          class="feature"
          data-go="activity"
        >
          <b>Conversations ↗</b>

          <span>
            Review questions and AI responses
          </span>
        </button>


        <button
          class="feature"
          data-go="classroom"
        >
          <b>Classroom ↗</b>

          <span>
            Share a live prompt on the projector
          </span>
        </button>


        <button
          class="feature"
          data-go="groups"
        >
          <b>Groups ↗</b>

          <span>
            Organize by grade level
          </span>
        </button>


        ${
          state.user.instructorRole ===
          'owner'
            ? `
              <button
                class="feature"
                data-go="instructors"
              >
                <b>Instructors ↗</b>

                <span>
                  Review and approve
                  instructor access
                </span>
              </button>
            `
            : ''
        }

      </div>

    </div>
  `;

  bindGo();
}


function bindGo() {
  document
    .querySelectorAll('[data-go]')
    .forEach(
      b =>
        (b.onclick = () =>
          navigate(
            b.dataset.go
          ))
    );
}


// ========================================
// INSTRUCTOR MANAGEMENT
// ========================================

async function instructors() {
  if (
    state.user.role !== 'admin' ||
    state.user.instructorRole !==
      'owner'
  ) {
    throw Error(
      'Only the AI360 owner can manage instructors.'
    );
  }

  const result =
    await get('instructors');

  state.instructors =
    result.instructors;

  const pending =
    state.instructors.filter(
      x => x.status === 'pending'
    );

  const approved =
    state.instructors.filter(
      x => x.status === 'approved'
    );

  const rejected =
    state.instructors.filter(
      x => x.status === 'rejected'
    );


  const instructorRow = x => `
    <tr>

      <td>
        <strong>
          ${escape(x.name)}
        </strong>

        ${
          x.role === 'owner'
            ? '<br><small>AI360 Owner</small>'
            : ''
        }
      </td>

      <td>
        ${escape(x.email)}
      </td>

      <td>
        ${
          x.role === 'owner'
            ? 'Owner'
            : 'Instructor'
        }
      </td>

      <td>
        <strong>
          ${
            x.status === 'pending'
              ? 'Pending'
              : x.status === 'approved'
              ? 'Approved'
              : 'Rejected'
          }
        </strong>
      </td>

      <td>

        ${
          x.role === 'owner'
            ? `
              <span class="muted">
                Protected
              </span>
            `

            : x.status === 'pending'
            ? `
              <button
                class="text-button"
                data-instructor="${x.user_id}"
                data-status="approved"
              >
                Approve
              </button>

              &nbsp;

              <button
                class="text-button"
                data-instructor="${x.user_id}"
                data-status="rejected"
              >
                Reject
              </button>
            `

            : x.status === 'rejected'
            ? `
              <button
                class="text-button"
                data-instructor="${x.user_id}"
                data-status="approved"
              >
                Approve
              </button>
            `

            : `
              <button
                class="text-button"
                data-instructor="${x.user_id}"
                data-status="rejected"
              >
                Revoke access
              </button>
            `
        }

      </td>

    </tr>
  `;


  $('#content').innerHTML = `
    <div class="page">

      <div class="page-head">

        <div>
          <h1>Instructors</h1>

          <p>
            Review instructor signup requests
            and control access to the
            AI360 workspace.
          </p>
        </div>

      </div>


      ${
        pending.length
          ? `
            <div class="panel">

              <h2>
                Pending approval
                (${pending.length})
              </h2>

              <p>
                These instructors cannot access
                the workspace until you
                approve them.
              </p>

              <div class="table-wrap">

                <table>

                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      pending
                        .map(
                          instructorRow
                        )
                        .join('')
                    }
                  </tbody>

                </table>

              </div>

            </div>
          `
          : `
            <div class="panel">

              <h2>
                Pending approval
              </h2>

              <p class="muted">
                No instructor requests are
                waiting for approval.
              </p>

            </div>
          `
      }


      <div class="panel">

        <h2>
          Approved instructors
        </h2>

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
              </tr>
            </thead>

            <tbody>

              ${
                approved.length
                  ? approved
                      .map(
                        instructorRow
                      )
                      .join('')
                  : `
                    <tr>
                      <td
                        colspan="5"
                        class="muted"
                      >
                        No approved instructors.
                      </td>
                    </tr>
                  `
              }

            </tbody>

          </table>

        </div>

      </div>


      ${
        rejected.length
          ? `
            <div class="panel">

              <h2>
                Rejected / revoked
              </h2>

              <div class="table-wrap">

                <table>

                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Access</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      rejected
                        .map(
                          instructorRow
                        )
                        .join('')
                    }
                  </tbody>

                </table>

              </div>

            </div>
          `
          : ''
      }


      <p
        id="notice"
        class="error"
        role="status"
      ></p>

    </div>
  `;


  document
    .querySelectorAll(
      '[data-instructor][data-status]'
    )
    .forEach(button => {

      button.onclick =
        async () => {

          const userId =
            button.dataset.instructor;

          const status =
            button.dataset.status;

          const label =
            status === 'approved'
              ? 'approve'
              : 'reject';

          const target =
            state.instructors.find(
              x =>
                x.user_id ===
                userId
            );

          if (!target) return;

          const confirmed =
            window.confirm(
              `Are you sure you want to ${label} ${target.name}?`
            );

          if (!confirmed) return;

          button.disabled = true;

          try {
            await post(
              'updateInstructor',
              {
                userId,
                status
              }
            );

            await instructors();

          } catch (err) {
            button.disabled = false;

            notice(err.message);
          }
        };
    });
}


// ========================================
// CONVERSATIONS / CHAT
// ========================================

async function loadConversations() {
  state.conversations = (
    await get('conversations')
  ).conversations;
}


function listConversations() {
  return state.conversations.filter(
    c =>
      c.owner_role ===
        state.user.role &&
      c.owner_id ===
        state.user.id
  );
}


async function chat() {
  await loadConversations();

  state.active = null;
  state.messages = [];

  renderChat();
}


function renderChat() {
  const own =
    listConversations();

  $('#content').innerHTML = `
    <div class="chat-layout">

      <div class="chat-rail">

        <button
          id="newChat"
          class="primary wide"
        >
          ＋ New chat
        </button>

        <div class="section-label">
          YOUR CONVERSATIONS
        </div>

        <div id="chatList">

          ${
            own
              .map(
                c => `
                  <button
                    class="chat-link ${
                      c.id === state.active
                        ? 'active'
                        : ''
                    }"
                    data-id="${c.id}"
                  >
                    ${escape(c.title)}
                  </button>
                `
              )
              .join('') ||
            `
              <p class="muted">
                No chats yet.
              </p>
            `
          }

        </div>

      </div>


      <div class="chat-main">

        <div
          id="chatMessages"
          class="chat-messages"
        >

          ${
            state.messages.length
              ? state.messages
                  .map(messageHtml)
                  .join('')
              : `
                <div class="chat-welcome">

                  <div class="spark">
                    ✦
                  </div>

                  <h1>
                    What can I help with?
                  </h1>

                  <p>
                    Ask a question, work through
                    an idea, or create an image.
                  </p>

                </div>
              `
          }

        </div>


        <div class="composer-area">

          <form
            id="composer"
            class="composer"
          >

            <textarea
              id="prompt"
              rows="1"
              placeholder="Message AI360"
              aria-label="Message AI360"
            ></textarea>


            <div class="compose-actions">

              <button
                id="imageToggle"
                type="button"
                class="chip ${
                  state.image
                    ? 'on'
                    : ''
                }"
              >
                ◉ &nbsp;${
                  state.image
                    ? 'Create image on'
                    : 'Create image'
                }
              </button>


              <button
                id="send"
                class="send"
                type="submit"
                aria-label="Send"
              >
                ↑
              </button>

            </div>

          </form>


          <small>
            AI can make mistakes. Check important
            information and keep personal
            details private.
          </small>


          <div
            id="notice"
            role="status"
          ></div>

        </div>

      </div>

    </div>
  `;


  $('#newChat').onclick = () => {
    state.active = null;
    state.messages = [];
    state.image = false;

    renderChat();
  };


  document
    .querySelectorAll('.chat-link')
    .forEach(
      b =>
        (b.onclick = async () => {

          state.active =
            b.dataset.id;

          state.messages = (
            await get(
              'messages',
              {
                conversationId:
                  state.active
              }
            )
          ).messages;

          renderChat();
        })
    );


  $('#imageToggle').onclick = () => {
    state.image =
      !state.image;

    $('#imageToggle')
      .classList.toggle(
        'on',
        state.image
      );

    $('#imageToggle').textContent =
      state.image
        ? '◉  Create image on'
        : '◉  Create image';
  };


  $('#composer').onsubmit =
    sendMessage;


  $('#prompt').onkeydown = e => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey
    ) {
      e.preventDefault();

      $('#composer')
        .requestSubmit();
    }
  };


  paintMessages();
}


function formatAssistantText(value) {
  // Normalize escaped Markdown punctuation, especially numbered lists like `1\.`.
  let normalized = String(value || '');

  // Remove one or more literal backslashes before Markdown punctuation.
  normalized = normalized.replace(/\\+([`*_[\]{}()#+\-.!>])/g, '$1');

  // Extra protection for escaped periods in numbered lists.
  normalized = normalized.replace(/(^|\n)(\s*\d+)\\+\.\s+/g, '$1$2. ');

  let html = escape(normalized);

  // Lightweight, safe Markdown rendering for normal assistant replies.
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^[-*] (.+)$/gm, '<span class="md-list">• $1</span>')
    .replace(/^(\d+)\.\s+(.+)$/gm, '<span class="md-list">$1. $2</span>')
    .replace(/\n/g, '<br>');

  return html;
}

function messageHtml(m) {
  return `
    <div class="message ${m.role}">

      ${
        m.role === 'assistant'
          ? `
            <div class="ai-mark">
              ✦
            </div>
          `
          : ''
      }

      <div class="bubble">

        <div class="text"></div>

        ${
          m.image_url
            ? `
              <img
                alt="AI generated image"
                class="generated"
                src="/api/image?path=${encodeURIComponent(
                  m.image_url
                )}"
              >
              <a
                class="image-download"
                href="/api/image?path=${encodeURIComponent(m.image_url)}&download=1"
                download="AI360-image.png"
              >⬇ Download image</a>
            `
            : ''
        }

      </div>

    </div>
  `;
}


function paintMessages() {
  const container =
    $('#chatMessages');

  if (!container) return;

  const rows =
    container.querySelectorAll(
      '.message'
    );

  rows.forEach((row, i) => {
    const text =
      row.querySelector('.text');

    if (
      text &&
      state.messages[i]
    ) {
      if (state.messages[i].role === 'assistant') {
        text.innerHTML = formatAssistantText(state.messages[i].content);
      } else {
        text.textContent = state.messages[i].content;
      }
    }
  });

  scrollMessages();
}


function scrollMessages() {
  const el =
    $('#chatMessages');

  if (el) {
    requestAnimationFrame(
      () => {
        el.scrollTop =
          el.scrollHeight;
      }
    );
  }
}


async function sendMessage(e) {
  e.preventDefault();
  if (state.busy) return;

  const prompt = $('#prompt').value.trim();
  if (!prompt) return;

  state.busy = true;
  const image = state.image;

  state.messages.push({ role: 'user', content: prompt });
  state.messages.push({ role: 'assistant', content: '' });

  $('#chatMessages').innerHTML = state.messages.map(messageHtml).join('');
  paintMessages();

  $('#prompt').value = '';
  $('#send').disabled = true;

  const assistantIndex = state.messages.length - 1;
  const assistantRow = $('#chatMessages')?.querySelectorAll('.message')[assistantIndex];
  const assistantText = assistantRow?.querySelector('.text');
  if (assistantText) assistantText.innerHTML = '<span class="typing-dots">● ● ●</span>';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        conversationId: state.active,
        wantsImage: image
      })
    });

    if (!response.ok) {
      let data = {};
      try { data = await response.json(); } catch {}
      throw Error(data.error || 'Request failed');
    }

    const type = response.headers.get('content-type') || '';

    // Image requests still return a normal JSON response.
    if (type.includes('application/json')) {
      const data = await response.json();
      state.active = data.conversationId;
      state.messages[assistantIndex] = {
        role: 'assistant',
        content: data.text,
        image_url: data.imagePath
      };
    } else {
      // Text responses arrive incrementally and are painted as they stream.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedText = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.type === 'start') {
            state.active = event.conversationId;
          } else if (event.type === 'delta') {
            if (!receivedText) {
              state.messages[assistantIndex].content = '';
              receivedText = true;
            }
            state.messages[assistantIndex].content += event.delta;
            if (assistantText) {
              assistantText.innerHTML = formatAssistantText(state.messages[assistantIndex].content);
            }
            scrollMessages();
          } else if (event.type === 'error') {
            throw Error(event.error || 'The assistant could not complete that request.');
          }
        }
      }
    }

    await loadConversations();
    state.image = false;
    renderChat();
    paintMessages();
  } catch (err) {
    state.messages.splice(-2, 2);
    renderChat();
    paintMessages();
    $('#prompt').value = prompt;
    notice(err.message);
  } finally {
    state.busy = false;
    if ($('#send')) $('#send').disabled = false;
    $('#prompt')?.focus();
  }
}


// ========================================
// ACTIVITY / CONVERSATIONS
// ========================================

async function activity() {
  await loadConversations();

  const admin =
    state.user.role === 'admin';

  if (admin) {
    const s =
      await get('students');

    state.students =
      s.students;
  }

  const rows =
    admin
      ? state.conversations.filter(
          c =>
            c.owner_role ===
            'student'
        )
      : listConversations();


  $('#content').innerHTML = `
    <div class="page">

      <div class="page-head">

        <div>

          <h1>
            ${
              admin
                ? 'Student activity'
                : 'Your conversations'
            }
          </h1>

          <p>
            ${
              admin
                ? 'Review student questions and assistant replies.'
                : 'Return to earlier ideas and questions.'
            }
          </p>

        </div>

      </div>


      <div class="panel">

        <div class="table-wrap">

          <table>

            <thead>

              <tr>

                ${
                  admin
                    ? '<th>Student</th>'
                    : ''
                }

                <th>
                  Conversation
                </th>

                <th>
                  Updated
                </th>

                <th></th>

              </tr>

            </thead>


            <tbody>

              ${
                rows
                  .map(
                    c => `
                      <tr>

                        ${
                          admin
                            ? `
                              <td>
                                ${escape(
                                  state.students.find(
                                    s =>
                                      s.id ===
                                      c.owner_id
                                  )?.name ||
                                    'Former student'
                                )}
                              </td>
                            `
                            : ''
                        }

                        <td>
                          ${escape(
                            c.title
                          )}
                        </td>

                        <td>
                          ${new Date(
                            c.updated_at
                          ).toLocaleString()}
                        </td>

                        <td>
                          <button
                            class="text-button"
                            data-review="${c.id}"
                          >
                            View →
                          </button>
                        </td>

                      </tr>
                    `
                  )
                  .join('') ||
                `
                  <tr>
                    <td
                      colspan="4"
                      class="muted"
                    >
                      No conversations yet.
                    </td>
                  </tr>
                `
              }

            </tbody>

          </table>

        </div>

      </div>


      <div id="review"></div>

    </div>
  `;


  document
    .querySelectorAll(
      '[data-review]'
    )
    .forEach(
      b =>
        (b.onclick = async () => {

          const { messages } =
            await get(
              'messages',
              {
                conversationId:
                  b.dataset.review
              }
            );

          const panel =
            $('#review');

          panel.innerHTML = `
            <div class="panel review">

              <div class="page-head">

                <h2>
                  Conversation
                </h2>

                <button
                  class="subtle"
                  id="closeReview"
                >
                  Close
                </button>

              </div>


              <div id="reviewMessages">

                ${
                  messages
                    .map(
                      m => `
                        <div class="review-message">

                          <b>
                            ${
                              m.role ===
                              'user'
                                ? 'Student'
                                : 'AI360'
                            }
                          </b>

                          <p></p>

                          ${
                            m.image_url
                              ? `
                                <img
                                  class="generated"
                                  src="/api/image?path=${encodeURIComponent(
                                    m.image_url
                                  )}"
                                  alt="Generated image"
                                >
                              `
                              : ''
                          }

                        </div>
                      `
                    )
                    .join('')
                }

              </div>

            </div>
          `;


          panel
            .querySelectorAll(
              '.review-message p'
            )
            .forEach(
              (p, i) => {
                p.textContent =
                  messages[i].content;
              }
            );


          $('#closeReview').onclick =
            () => {
              panel.innerHTML = '';
            };


          panel.scrollIntoView({
            behavior: 'smooth'
          });
        })
    );
}


// ========================================
// STUDENTS
// ========================================

async function students() {
  const [s, g, settings] = await Promise.all([
    get('students'),
    get('groups'),
    get('registrationSettings')
  ]);

  state.students = s.students;
  state.groups = g.groups;
  const registrationOpen = settings.studentRegistrationOpen === true;

  $('#content').innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Students</h1>
          <p>Students normally join by entering their full name. You can also add a student manually.</p>
        </div>
      </div>

      <div class="panel registration-control">
        <div>
          <h2>New student registration</h2>
          <p>${registrationOpen
            ? 'Open — new students can enter their full name, choose their group, and join AI360.'
            : 'Closed — existing students can still log in by full name, but new students cannot create a profile.'}</p>
        </div>
        <button id="registrationToggle" class="${registrationOpen ? 'primary' : 'subtle registration-closed'}" type="button">
          ${registrationOpen ? 'Registration is ON' : 'Turn registration ON'}
        </button>
      </div>

      <div class="panel">
        <h2>Add student manually</h2>
        <form id="studentForm" class="inline-form">
          <label>
            Full name
            <input id="studentName" required maxlength="80" placeholder="First name + last name">
          </label>
          <label>
            Group
            <select id="studentAdminGroup">
              ${g.groups.map(x => `<option value="${x.id}">${escape(x.name)}</option>`).join('')}
            </select>
          </label>
          <button class="primary">Add student</button>
        </form>
        <p id="notice" role="status" class="error"></p>
      </div>

      <div class="panel">
        <h2>Student roster</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Group</th><th>Status</th><th>Access</th></tr></thead>
            <tbody>
              ${s.students.map(x => `
                <tr>
                  <td>${escape(x.name)}</td>
                  <td>
                    <select data-group="${x.id}">
                      ${g.groups.map(y => `<option value="${y.id}" ${y.id === x.group_id ? 'selected' : ''}>${escape(y.name)}</option>`).join('')}
                    </select>
                  </td>
                  <td>${x.active ? 'Active' : 'Paused'}</td>
                  <td><button class="text-button" data-toggle="${x.id}">${x.active ? 'Pause' : 'Restore'}</button></td>
                </tr>
              `).join('') || '<tr><td colspan="4" class="muted">No students yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  $('#registrationToggle').onclick = async () => {
    try {
      await post('setStudentRegistration', { open: !registrationOpen });
      await students();
    } catch (err) {
      notice(err.message);
    }
  };

  $('#studentForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await post('addStudent', {
        name: $('#studentName').value,
        groupId: $('#studentAdminGroup').value
      });
      await students();
    } catch (err) {
      notice(err.message);
    }
  };

  document.querySelectorAll('[data-toggle]').forEach(b => {
    b.onclick = async () => {
      const x = state.students.find(s => s.id === b.dataset.toggle);
      try {
        await post('updateStudent', { id: x.id, groupId: x.group_id, active: !x.active });
        await students();
      } catch (err) {
        notice(err.message);
      }
    };
  });

  document.querySelectorAll('[data-group]').forEach(select => {
    select.onchange = async () => {
      const x = state.students.find(x => x.id === select.dataset.group);
      try {
        await post('updateStudent', { id: x.id, groupId: select.value, active: x.active });
        await students();
      } catch (err) {
        notice(err.message);
      }
    };
  });
}


// ========================================
// GROUPS
// ========================================

async function groups() {
  state.groups = (
    await get('groups')
  ).groups;


  $('#content').innerHTML = `
    <div class="page">

      <div class="page-head">

        <div>

          <h1>
            Groups
          </h1>

          <p>
            Explanation complexity follows
            each student's assigned grade level.
          </p>

        </div>

      </div>


      <div class="cards">

        ${
          state.groups
            .map(
              g => `
                <div class="panel">

                  <h2>
                    ${escape(g.name)}
                  </h2>

                  <p>
                    ${
                      g.grade_level ===
                      'grades12'
                        ? 'Grades 1–2'
                        : 'Grades 3–5'
                    }
                  </p>

                </div>
              `
            )
            .join('')
        }

      </div>


      <div class="panel">

        <h2>
          Create a group
        </h2>

        <form
          id="groupForm"
          class="inline-form"
        >

          <label>
            Name

            <input
              id="groupName"
              required
              maxlength="80"
              placeholder="Group name"
            >
          </label>


          <label>
            Grade level

            <select id="grade">

              <option value="grades12">
                Grades 1–2
              </option>

              <option value="grades35">
                Grades 3–5
              </option>

            </select>

          </label>


          <button class="primary">
            Add group
          </button>

        </form>


        <p
          id="notice"
          class="error"
        ></p>

      </div>

    </div>
  `;


  $('#groupForm').onsubmit =
    async e => {
      e.preventDefault();

      try {
        await post(
          'addGroup',
          {
            name:
              $('#groupName').value,

            gradeLevel:
              $('#grade').value
          }
        );

        groups();

      } catch (err) {
        notice(err.message);
      }
    };
}


// ========================================
// CLASSROOM
// ========================================

async function classroom() {
  const [classroomData, presentationData] = await Promise.all([
    get('classroom'),
    get('presentations')
  ]);

  state.classroom = classroomData.classroom;
  const c = state.classroom;
  const presentations = presentationData.presentations || [];

  const presentationCards = presentations.length
    ? presentations.map(p => `
        <article class="presentation-card">
          <div class="presentation-icon">P</div>
          <div class="presentation-info">
            <span class="eyebrow">POWERPOINT</span>
            <h3>${escape(p.title)}</h3>
            <p>${escape(p.file_name)}${p.file_size ? ` · ${formatFileSize(p.file_size)}` : ''}</p>
            <div class="presentation-actions">
              <button class="primary present-btn" data-presentation-id="${p.id}">▶ Present</button>
              <button class="secondary download-presentation" data-presentation-id="${p.id}">Download PPTX</button>
              <button class="danger-text delete-presentation" data-presentation-id="${p.id}">Delete</button>
            </div>
          </div>
        </article>
      `).join('')
    : `<div class="presentation-empty">
        <div class="presentation-empty-icon">▣</div>
        <h3>No presentations yet</h3>
        <p>Upload your first PowerPoint and it will stay here ready for class.</p>
      </div>`;

  $('#content').innerHTML = `
    <div class="page">
      <div class="page-head classroom-head">
        <div>
          <h1>Classroom</h1>
          <p>Keep your sessions ready to present, then use Live Display whenever you need a quick classroom message.</p>
        </div>
        <button id="uploadPresentation" class="primary">＋ Upload presentation</button>
      </div>

      <section class="classroom-section">
        <div class="section-heading">
          <div>
            <span class="eyebrow">SESSIONS &amp; PRESENTATIONS</span>
            <h2>Ready to teach</h2>
          </div>
        </div>
        <div id="presentationList" class="presentation-list">${presentationCards}</div>
      </section>

      <section class="panel classroom-live-panel">
        <div class="section-heading live-heading">
          <div>
            <span class="eyebrow">LIVE DISPLAY</span>
            <h2>Send something to the projector</h2>
            <p>Use this for a quick instruction, timer message, question, or activity.</p>
          </div>
          <button id="project" class="secondary">Open projector ↗</button>
        </div>

        <form id="classForm">
          <label>Title
            <input id="classTitle" maxlength="120" value="${escape(c.title)}">
          </label>
          <label>Prompt or instructions
            <textarea id="classPrompt" rows="5" maxlength="2000"></textarea>
          </label>
          <button class="primary">Publish to projector</button>
          <p id="notice" role="status"></p>
        </form>
      </section>

      <div id="presentationModal" class="modal-backdrop" hidden>
        <div class="upload-modal" role="dialog" aria-modal="true" aria-labelledby="uploadTitle">
          <button id="closePresentationModal" class="modal-close" aria-label="Close">×</button>
          <span class="eyebrow">NEW PRESENTATION</span>
          <h2 id="uploadTitle">Upload PowerPoint</h2>
          <p class="modal-copy">Add the original .pptx file. You won't need to upload slides or images separately.</p>
          <form id="presentationUploadForm">
            <label>Presentation title
              <input id="presentationTitle" maxlength="120" placeholder="Session 1 — AI Explorer" required>
            </label>
            <label class="file-drop" for="presentationFile">
              <span class="file-drop-icon">↑</span>
              <strong>Choose a PowerPoint</strong>
              <span id="presentationFileName">.pptx · up to 100 MB</span>
              <input id="presentationFile" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" required>
            </label>
            <div id="uploadProgressWrap" class="upload-progress-wrap" hidden>
              <div class="upload-progress"><span id="uploadProgressBar"></span></div>
              <span id="uploadProgressText">Uploading…</span>
            </div>
            <div class="upload-button-row">
              <button id="presentationUploadButton" class="primary wide" type="submit">Upload presentation</button>
              <button id="cancelPresentationUpload" class="secondary wide" type="button" hidden>Cancel upload</button>
            </div>
            <p id="uploadNotice" class="form-notice" role="status"></p>
          </form>
        </div>
      </div>
    </div>`;

  $('#classPrompt').value = c.prompt;

  $('#classForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await post('classroom', { title: $('#classTitle').value, prompt: $('#classPrompt').value });
      notice('Projector updated.');
    } catch (err) { notice(err.message); }
  };

  $('#project').onclick = () => window.open('/projector.html', 'ai360-projector');

  const modal = $('#presentationModal');
  $('#uploadPresentation').onclick = () => { modal.hidden = false; $('#presentationTitle').focus(); };
  $('#closePresentationModal').onclick = () => { modal.hidden = true; };
  modal.onclick = e => { if (e.target === modal) modal.hidden = true; };

  $('#presentationFile').onchange = () => {
    const file = $('#presentationFile').files[0];
    $('#presentationFileName').textContent = file ? `${file.name} · ${formatFileSize(file.size)}` : '.pptx · up to 100 MB';
    if (file && !$('#presentationTitle').value.trim()) {
      $('#presentationTitle').value = file.name.replace(/\.pptx$/i, '').replace(/[-_]+/g, ' ');
    }
  };

  let activePresentationUpload = null;

  const uploadPptxDirectly = (signedUrl, file, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activePresentationUpload = xhr;
    xhr.open('PUT', signedUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      activePresentationUpload = null;
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('The PowerPoint upload failed. Please try again.'));
    };
    xhr.onerror = () => { activePresentationUpload = null; reject(new Error('The upload connection failed. Please try again.')); };
    xhr.onabort = () => { activePresentationUpload = null; reject(new DOMException('Upload cancelled', 'AbortError')); };
    xhr.send(file);
  });

  $('#cancelPresentationUpload').onclick = () => {
    if (activePresentationUpload) activePresentationUpload.abort();
  };

  $('#presentationUploadForm').onsubmit = async e => {
    e.preventDefault();
    const file = $('#presentationFile').files[0];
    const title = $('#presentationTitle').value.trim();
    const msg = $('#uploadNotice');
    const button = $('#presentationUploadButton');
    const cancelButton = $('#cancelPresentationUpload');
    if (!file || !/\.pptx$/i.test(file.name)) { msg.textContent = 'Choose a .pptx PowerPoint file.'; return; }
    if (file.size > 100 * 1024 * 1024) { msg.textContent = 'The PowerPoint must be 100 MB or smaller.'; return; }

    button.disabled = true;
    cancelButton.hidden = false;
    msg.textContent = 'Preparing secure upload…';
    $('#uploadProgressWrap').hidden = false;
    $('#uploadProgressBar').style.width = '2%';
    $('#uploadProgressText').textContent = 'Preparing…';

    try {
      const prepared = await post('createPresentationUpload', { title, fileName: file.name, fileSize: file.size });
      msg.textContent = 'Uploading directly to presentation storage…';
      $('#uploadProgressText').textContent = '0%';

      await uploadPptxDirectly(prepared.upload.signedUrl, file, ratio => {
        const pct = Math.max(1, Math.min(100, Math.round(ratio * 100)));
        $('#uploadProgressBar').style.width = `${pct}%`;
        $('#uploadProgressText').textContent = `${pct}%`;
      });

      cancelButton.hidden = true;
      $('#uploadProgressBar').style.width = '100%';
      $('#uploadProgressText').textContent = '100%';
      msg.textContent = 'Saving presentation…';
      await post('finishPresentationUpload', {
        title, fileName: file.name, fileSize: file.size, storagePath: prepared.upload.path
      });
      msg.textContent = 'Presentation uploaded.';
      setTimeout(() => classroom(), 350);
    } catch (err) {
      if (err?.name === 'AbortError') msg.textContent = 'Upload cancelled.';
      else msg.textContent = err.message || 'The upload failed. Please try again.';
      button.disabled = false;
      cancelButton.hidden = true;
      $('#uploadProgressBar').style.width = '0%';
      $('#uploadProgressText').textContent = err?.name === 'AbortError' ? 'Cancelled' : 'Upload failed';
    }
  };

  document.querySelectorAll('.present-btn').forEach(btn => {
    btn.onclick = () => window.open(`/presentation.html?id=${encodeURIComponent(btn.dataset.presentationId)}`, 'ai360-presentation');
  });

  document.querySelectorAll('.download-presentation').forEach(btn => {
    btn.onclick = async () => {
      try {
        const data = await get('presentation', { id: btn.dataset.presentationId });
        window.open(data.presentation.publicUrl, '_blank');
      } catch (err) { alert(err.message); }
    };
  });

  document.querySelectorAll('.delete-presentation').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this presentation from AI360?')) return;
      try { await post('deletePresentation', { id: btn.dataset.presentationId }); await classroom(); }
      catch (err) { alert(err.message); }
    };
  });
}

function formatFileSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}


// ========================================
// SETTINGS
// ========================================

function settings() {
  const isOwner =
    state.user.instructorRole ===
    'owner';


  $('#content').innerHTML = `
    <div class="page">

      <div class="page-head">
        <h1>
          Settings
        </h1>
      </div>


      <div class="panel">

        <h2>
          Instructor account
        </h2>

        <p>
          Signed in as
          <strong>
            ${escape(
              state.user.name
            )}
          </strong>.
        </p>

        <p>
          Role:
          <strong>
            ${
              isOwner
                ? 'AI360 Owner'
                : 'Instructor'
            }
          </strong>
        </p>

        ${
          isOwner
            ? `
              <p>
                You can review and approve
                instructor signup requests from
                the Instructors section.
              </p>
            `
            : ''
        }

        <p>
          Student codes are shown only when
          created. Pause a student to revoke
          their access.
        </p>

      </div>


      <div class="panel">

        <h2>
          Privacy
        </h2>

        <p>
          Conversations and generated images
          are stored privately. Students see
          only their own conversations;
          approved instructors can review
          student activity.
        </p>

      </div>

    </div>
  `;
}

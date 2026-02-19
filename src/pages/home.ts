import { html } from '../lib/view'
import { shell } from './shell'

type Props = {
  profile?: { displayName?: string }
}

export function home(props: Props) {
  return shell({
    title: 'Polls',
    content: content(props),
  })
}

function content({ profile }: Props) {
  const script = html`<script>
    function addOption() {
      const div = document.createElement('div');
      div.innerHTML = '<input type="text" name="options[]" placeholder="Option" required>' +
        '<button type="button" class="remove-btn" onclick="this.parentElement.remove()">&times;</button>';
      document.getElementById('options').appendChild(div);
    }
  </script>`

  return html`<div id="root">
    <div id="header">
      <h1>Polls</h1>
      <p>Create a poll in the atmosphere.</p>
    </div>

    ${profile
      ? html`<form action="/logout" method="post" class="session-form">
            <div>Hi, <strong>${profile.displayName || 'friend'}</strong></div>
            <button type="submit">Log out</button>
          </form>`
      : html`<div class="session-form">
            <div><a href="/login">Log in</a> to create a poll or vote.</div>
          </div>`}

    <form class="new-poll-form" action="/new-poll" method="post">
      <div class="field">
        <label for="question">Question</label>
        <input type="text" id="question" name="question" required placeholder="What's the best cuisine in the world?">
      </div>

      <div class="field">
        <label>Options</label>
        <div id="options">
          <div>
            <input type="text" name="options[]" placeholder="Italian ofc" required>
          </div>
          <div>
            <input type="text" name="options[]" placeholder="Nothing else matters" required>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Create Poll</button>
        <button type="button" class="btn btn-secondary" onclick="addOption()">+ Add Option</button>
      </div>
    </form>
    ${script}
  </div>`
}

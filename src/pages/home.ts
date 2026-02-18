import type { Status } from '#/db'
import { html } from '../lib/view'
import { shell } from './shell'

type Props = {
  profile?: { displayName?: string }
}

export function home(props: Props) {
  return shell({
    title: 'Home',
    content: content(props),
  })
}

function content({ profile }: Props) {
  const script = html`<script>
    function addOption() {
      const div = document.createElement('div');
      div.innerHTML = \`<input type="text" name="options[]" placeholder="..." required>
        <button type="button" onclick="this.parentElement.remove()">✕</button>\`;
      document.getElementById('options').appendChild(div);
    }
  </script>`

  return html`<div id="root">
    <div class="error"></div>
    <div id="header">
      <h1>Polls</h1>
      <p>Create a poll in the atmosphere.</p>
    </div>
    <div class="container">
      <div class="card">
        ${profile
      ? html`<form action="/logout" method="post" class="session-form">
              <div>
                Hi, <strong>${profile.displayName || 'friend'}</strong>
              </div>
              <div>
                <button type="submit">Log out</button>
              </div>
            </form>`
      : html`<div class="session-form">
              <div><a href="/login">Log in</a> to create a poll or vote!</div>
            </div>`}
      </div>

      <form class="new-poll-form" action="/new-poll" method="post">
        <label for="question">Question</label><br>
        <input type="text" id="question" name="question" required placeholder="What's the best cuisine in the world?">
        <br><br>

        <div id="options">
          <div>
            <input type="text" name="options[]" placeholder="Italian ofc" required>
          </div>
          <div>
            <input type="text" name="options[]" placeholder="Nothing else matter" required>
          </div>
        </div>
        <br>
        <button type="button" onclick="addOption()">+ Add Option</button>
        <br><br>
        <button type="submit">Create Poll</button>
      </form>
      ${script}
    </div>
  </div>`
}

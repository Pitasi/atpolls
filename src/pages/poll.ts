import { Poll, Vote } from "#/db"
import { html } from "../lib/view"
import { shell } from "./shell"

type Props = {
        poll: Poll
        votes: Vote[]
        vote?: Vote
        profile?: { displayName?: string }
}

export function poll(props: Props) {
        return shell({
                title: `${props.poll.question} - polls`,
                content: content(props),
        })
}

function content({ poll, vote, votes, profile }: Props) {
        const opts = (JSON.parse(poll.options) as string[]).map(opt => ({
                opt,
                nVotes: 0,
        }));
        votes.forEach(v => opts[v.optionIndex].nVotes++);

        const percentage = (optIndex: number) => {
                if (votes.length === 0) return 0;
                return 100 * opts[optIndex].nVotes / votes.length;
        }

        const isSelected = (optIndex: number) => vote?.optionIndex === optIndex;

        return html`<div id="root">
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
                      <div><a href=${`/login?${new URLSearchParams({ 'returnTo': `/polls/${poll.uri}` })}`}>Log in</a> to vote</div>
                    </div>`}
              </div>

                <div class="poll">
                        <h1>${poll.question}</h1>
                        <form action=${`/new-vote/${poll.uri}`} method="post">
                                ${opts.map((o, i) => html`
                                <button type="submit" name="option" class=${isSelected(i)} value=${i}>
                                        <div class="vote-bar" style=${`width: ${percentage(i)}%`}></div>
                                        <span>${o.opt}</span>
                                        <span class="percentage">
                                                ${percentage(i).toFixed(2)}%
                                        </span>
                                </button>
                                `)}
                        </form>
                </div>
	</div>`;
}

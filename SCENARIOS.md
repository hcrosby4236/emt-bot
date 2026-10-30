# Written trauma scenarios and separate quizzes

## Run

Add your OpenAI API key to `openaiApiKey` in your local `config.json`, then run `npm start` (or restart `node index.js`). Leave your existing Discord token and guild ID in place. `config.example.json` shows the field names without secrets. Do not put the key in Discord or chat.

`openaiModel` defaults to `gpt-4o-mini`. You can also set `OPENAI_API_KEY` and `OPENAI_MODEL` environment variables, which override config values. OpenAI API access/credit is required. The bot uses Node 22 or newer and built-in fetch; no new dependency is needed.

- /quiz continues to post one multiple-choice primary-assessment or trauma question.
- /scenario starts a separate trauma situation. Choose an optional case from the autocomplete list.
- The initiating member clicks Respond, types their next action(s), and submits the form.
- The patient findings and care state follow the authored rules for those actions.
- Help lists example actions. AI understands natural phrasing and typos. Finish case or "provide handoff" produces a learning-goal summary.

Messages and outcomes are public. Other members cannot control someone else's case.

## No approval requirement

There is no approval, preview, or server-manager restriction. Every correctly formatted source-linked question or scenario is available immediately.

- data/questions.json contains only single quiz questions.
- data/scenarios.json contains only written-response cases.
- Adding or correcting JSON records takes effect on the next quiz/case.
- A running case keeps its initial snapshot; start a new case to use corrections.
- Existing approved/review fields are no longer required or consulted.
- Source URLs are references, not automated verification of clinical correctness.

Keep the existing four-choice format for quiz questions and an HTTPS source link. Topic values primary and trauma are available through /quiz. Other saved quiz topics are retained but not offered by this command.

## Written actions

Use one to three short actions in the intended order, separated by commas, "and", "then", or new lines.

Examples:
- check responsiveness
- check airway, check breathing, check circulation
- perform primary assessment
- get vitals
- obtain SAMPLE history
- apply direct pressure
- apply a tourniquet
- support airway
- assist ventilation
- give oxygen per protocol
- maintain spinal precautions
- request ALS
- initiate transport
- reassess
- provide handoff

OpenAI interprets the response into up to three supported case actions. You do not need to match keywords. For example, "is he breathing and can I feel a pulse?" can become breathing and circulation assessments. Negated actions are not executed. Unsupported or unclear actions ask for clarification without applying partial actions. Interpretation can still be imperfect; the response displays the actions recorded.

The learner's written response, fictional current findings, and recent action IDs are sent to OpenAI with `store: false`. Discord IDs, tokens, and other channel messages are not included. Respond uses a Discord form, so no Message Content intent or channel-reading permission is needed. API timeouts, refusals, invalid outputs, and service errors leave the case unchanged and allow a retry.

The integration follows the official [OpenAI structured outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). AI interprets actions; patient outcomes and scoring still use the authored cases below.

## How branches work

Each case has named findings, treatment effects, a delay branch, and learning goals.

- Assessment actions reveal the corresponding findings.
- Case-specific treatment effects update only the findings defined for that treatment.
- For example, in the arm case pressure slows persistent bleeding; the tourniquet branch controls external bleeding.
- In the head case, a deliberate wait introduces worse breathing; that opens an assisted-ventilation branch.
- Transport switches the narrative to the transport phase; care and reassessment can continue.
- Reassessment goals require reassessment after the latest relevant care/transport action.
- Unknown actions never advance time or change the patient.

These are fictional authored patient outcomes. The engine does not calculate real physiology, guarantee a treatment result, verify hands-on technique, or grade medication doses. Primary-assessment and trauma concepts have linked references in the case bank.

## Editing a scenario

Copy one existing object, then edit:
- id: a unique identifier
- title, dispatch, presentation, review
- findings: responsiveness, airway, breathing, circulation, vitals, history, secondary
- goals: labels and anyOf action identifiers; optional afterAny for ordering
- effects: action identifiers with text and optional setFindings
- delay: text, optional setFindings and additionalGoals
- sources: one to three HTTPS links

The case-name dropdown reads this file dynamically, so new cases do not need to be added to the command code.

Action identifiers are listed in lib/actionParser.js. AI interpretation is in lib/aiActions.js; the old keyword parser is no longer used by scenario responses. Add general behavior in lib/scenarioEngine.js or case-specific outcomes in data/scenarios.json. Code changes require a restart.

A case lasts up to 12 minutes or 20 successful submissions. Inactivity does not trigger medical deterioration; only the explicit wait action enters the delay branch. Sessions are separate from /quiz and reset if the bot restarts.

## Checks

Run `npm test` for mocked API and Discord interaction checks, including invalid output, service errors, duplicate submissions, stale forms, and retries. These tests make no paid API calls. Live AI interpretation and a Discord server check require your key and a restart.


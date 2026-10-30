# Written trauma scenarios and separate quizzes

## Run

Run `npm start` (or restart `node index.js`). Only your existing Discord token and guild ID in `config.json` are needed. No AI service, API key, or extra dependency is required. `config.example.json` shows the configuration fields without secrets.

- /quiz continues to post one multiple-choice primary-assessment or trauma question.
- /scenario starts a separate trauma situation. Choose an optional case from the autocomplete list.
- The initiating member clicks Respond, types their next action(s), and submits the form.
- The patient findings and care state follow the authored rules for those actions.
- Help lists example actions. The local parser recognizes expanded wording and common typos. Finish case or "provide handoff" produces a learning-goal summary.

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

The local parser recognizes complete phrases, everyday questions, assessment lists, partner instructions, and a fixed list of common misspellings. Examples:

- "Is he awake?" or "Does she respond to voice?"
- "Is his airway clear?" or "Look in the mouth"
- "Is he breathing?" or "Listen to her lungs"
- "Does she have a pulse?" or "Feel for a radial pulse"
- "What are their vitals?" or "Check blood pressure"
- "What happened?" or "Ask about medications"
- "I would check his airway and breathing, then feel for a pulse"
- "Please check airway, breathing and circulation"
- "Ask my partner to request ALS"
- "Hold pressure on the wound" or "Apply a pressure dressing"
- "Apply a turniquet" (common spelling correction)
- "Bag him", "Give oxygen via NRB", or "Hold c spine"
- "Take him to the hospital", "Recheck the patient", or "Give report to the nurse"

The parser supports specific phrases rather than arbitrary conversation. Unknown phrases, unsupported treatments, conditional plans, past actions, and negations reject the entire response without changing the case. For example, "check breathing and give aspirin" applies neither action. State actions to take now; use Help or split a rejected response into single actions. Assessment questions reveal the existing finding category, so a question about allergies returns the saved history rather than a newly generated answer.

All interpretation happens locally; responses are not sent to an AI service. Respond uses a Discord form, so no Message Content intent or channel-reading permission is needed. Discord messages and outcomes remain public.

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

Action identifiers, phrase rules, and spelling corrections are in lib/actionParser.js. Add phrasing there to support more responses. Add general behavior in lib/scenarioEngine.js or case-specific outcomes in data/scenarios.json. Code changes require a restart.

A case lasts up to 12 minutes or 20 successful submissions. Inactivity does not trigger medical deterioration; only the explicit wait action enters the delay branch. Sessions are separate from /quiz and reset if the bot restarts.

## Checks

Run `npm test` for phrase coverage across every action, question/list/typo parsing, rejected-input checks, and mocked Discord interactions (retry, stale forms, and ownership). Tests make no network calls. A live server check requires restarting the bot.


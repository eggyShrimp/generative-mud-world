## ADDED Requirements

### Requirement: Player can request follow-up options from selected NPC text

The TUI MUST let the player select NPC dialogue text and press `F` to request follow-up options.

#### Scenario: Press F with selected text

- **GIVEN** a dialogue panel is open
- **AND** the user has selected non-empty NPC text
- **WHEN** the user presses `F`
- **THEN** `KeyboardController` stashes the selected text on the client
- **AND** the dialogue key handler pops that stashed text
- **AND** the client sends `request_follow_up_options`
- **AND** the message includes the current NPC id and selected text
- **TEST** `src/__tests__/game-client.test.ts`: request sends the correct protocol message
- **TEST** `src/__tests__/keyboard-controller.test.tsx`: selected text is stashed before key dispatch

#### Scenario: Press F without selected text

- **GIVEN** a dialogue panel is open
- **AND** no text is selected
- **WHEN** the user presses `F`
- **THEN** the client does not send `request_follow_up_options`
- **AND** no follow-up mode is entered
- **AND** existing dialogue options remain unchanged
- **AND** the event log shows `"请先选中一句 NPC 的话。"`
- **TEST** `src/__tests__/game-client.test.ts`: no websocket send and no option replacement

#### Scenario: Press F while another request is active

- **GIVEN** a dialogue panel is open
- **AND** another request is active
- **WHEN** the user presses `F` with selected text
- **THEN** no follow-up request is sent
- **AND** existing dialogue options remain unchanged
- **AND** the event log shows the existing active-request feedback
- **TEST** `src/__tests__/game-client.test.ts`: active request blocks follow-up request and records feedback

### Requirement: Follow-up options reuse the existing dialogue option UI

The TUI MUST display returned follow-up options in the existing dialogue option area using existing numbered option controls.

#### Scenario: Follow-up request enters loading state

- **GIVEN** the user requests follow-up options
- **WHEN** the request is sent
- **THEN** the chat tab enters loading state
- **AND** the existing loading hint is shown
- **TEST** `src/__tests__/dialogue-panel.test.tsx`: loading hint appears

#### Scenario: Returned options render as normal numbered options

- **GIVEN** the server returns `follow_up_options`
- **WHEN** the client handles the message
- **THEN** the chat tab loading state clears
- **AND** the returned options replace current chat options
- **AND** the panel shows `追问："{context}"` above the returned options
- **AND** the panel renders the options through existing numbered `KeyHint` UI
- **TEST** `src/__tests__/dialogue-panel.test.tsx`: returned labels appear with numeric hints

#### Scenario: Empty returned options restore previous choices

- **GIVEN** the user requests follow-up options from selected text
- **AND** the previous chat options are captured
- **WHEN** the server returns `follow_up_options` with no options
- **THEN** chat loading clears
- **AND** previous chat options are restored
- **AND** the event log shows `"没有合适的追问方向。"`
- **TEST** `src/__tests__/game-client.test.ts`: empty follow-up response restores previous options

#### Scenario: Stale returned options are ignored

- **GIVEN** a follow-up request is pending
- **WHEN** the user closes dialogue or switches to a different NPC before the response arrives
- **THEN** the returned `follow_up_options` are ignored
- **AND** no options are applied to the current dialogue
- **TEST** `src/__tests__/game-client.test.ts`: stale response does not replace current options

#### Scenario: Choosing a follow-up option uses existing number keys

- **GIVEN** follow-up options are visible
- **WHEN** the user presses `1`
- **THEN** the client calls existing `chooseDialogueOption()` for the first option
- **AND** no follow-up-specific choose path is used
- **TEST** `src/__tests__/key-layer.test.ts`: dialogue `1-9` behavior is unchanged

### Requirement: The TUI does not add follow-up selection mode

The follow-up interaction MUST NOT add a separate mode for selecting historical messages by number.

#### Scenario: History remains normal text

- **GIVEN** the dialogue panel contains prior messages
- **WHEN** the panel renders before, during, or after a follow-up request
- **THEN** history messages do not show `[1]`, `[2]`, or other selection numbers
- **AND** numeric keys continue to select current dialogue options
- **TEST** `src/__tests__/dialogue-panel.test.tsx`: history has no selection markers

#### Scenario: F never toggles a persistent mode

- **GIVEN** a dialogue panel is open
- **WHEN** the user presses `F`
- **THEN** the client either sends a follow-up request from selected text or shows no-selection feedback
- **AND** it does not store persistent `followUpMode`
- **TEST** `src/__tests__/game-client.test.ts`: dialogue state has no follow-up mode transition

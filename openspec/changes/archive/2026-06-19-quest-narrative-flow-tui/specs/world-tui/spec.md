## ADDED Requirements

### Requirement: Dialogue option area supports long quest negotiation menus

The TUI MUST keep all server-provided dialogue choices reachable when a quest negotiation returns more options than fit the visible interaction area.

#### Scenario: Long option list is scrollable

- **GIVEN** the dialogue panel is open on the chat tab
- **AND** the server-provided chat options exceed the visible option area
- **WHEN** the panel renders
- **THEN** the options are contained in a scrollable option area
- **AND** later options are not dropped
- **AND** the tab bar remains visible
- **TEST** `src/__tests__/dialogue-panel.test.ts`: long option list renders in scrollable area with visible tab bar

#### Scenario: Existing short option behavior is preserved

- **GIVEN** the dialogue panel has a short list of chat options
- **WHEN** the panel renders
- **THEN** the existing numbered option controls are shown
- **AND** loading and empty-option states still render as before
- **TEST** `src/__tests__/dialogue-panel.test.ts`: short option list, loading, and empty states remain unchanged

### Requirement: Quest defer closes through close behavior

The TUI MUST close the dialogue popup when the selected option carries `{ kind: "close" }` behavior, regardless of the option's business type. Quest defer options close because the server marks them with close behavior, not because the TUI recognizes the `quest_defer` type name.

#### Scenario: Selecting quest defer sends talk and closes through behavior

- **GIVEN** a dialogue popup is open
- **AND** one visible option has `behavior: { kind: "close" }` and `type: "quest_defer"`
- **WHEN** the player selects that option
- **THEN** `getDialogueOptionBehavior(option)` returns `{ kind: "close" }`
- **AND** the client sends a `talk` request with that option id, label, and type
- **AND** the dialogue popup closes locally
- **TEST** `src/__tests__/game-client.test.ts`: quest defer sends talk request and closes popup

### Requirement: Direct dialogue dismissal sends a server-provided close option when available

When the player dismisses a dialogue locally while quest negotiation options are visible, the TUI MUST find a close-behavior option from the current chat options and send that as a talk request. If the menu includes `chat:goodbye` with close behavior, that option is preferred. If no close option is available, the TUI closes locally without sending a talk request.

#### Scenario: Escape sends a close-behavior option from the current menu

- **GIVEN** a dialogue popup is showing quest negotiation options
- **AND** at least one option has close behavior
- **WHEN** the player dismisses the popup with Esc
- **THEN** the client sends the close-behavior option as a `talk` request
- **AND** the client does not fabricate an option id, label, or type not present in the current menu
- **AND** the local popup closes
- **TEST** `src/__tests__/game-client.test.ts`: direct close during quest negotiation sends cleanup talk

#### Scenario: Normal dialogue close remains lightweight

- **GIVEN** a dialogue popup is open without quest negotiation options
- **WHEN** the player dismisses the popup locally
- **THEN** existing local close behavior is preserved
- **AND** no talk request is sent
- **TEST** `src/__tests__/game-client.test.ts`: normal dialogue close does not create quest UI state

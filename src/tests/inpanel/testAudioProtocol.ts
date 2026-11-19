// What the in-panel test runner and the DEV-only tone page (test-audio.html,
// testAudioPage.ts) agree on. Kept free of imports so the page loads nothing
// of the sidebar app.

/** Extension-relative path of the tone page; turn it into a URL with chrome.runtime.getURL. */
export const TEST_AUDIO_PAGE_PATH = 'test-audio.html';

export const TEST_AUDIO_CONTROL_ACTION = 'test-audio-control';

export type TestAudioCommand = 'play' | 'stop';

/**
 * Sent with chrome.runtime.sendMessage, which reaches every extension page,
 * so it names the tab it is for and only the tone page in that tab answers.
 */
export interface TestAudioControlMessage
{
  action: typeof TEST_AUDIO_CONTROL_ACTION;
  tabId: number;
  command: TestAudioCommand;
}

export type TestAudioControlReply = { ok: true } | { ok: false; error: string };

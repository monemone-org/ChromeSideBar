// DEV-only tone page for the in-panel test runner (see test-audio.html and
// docs/test/test-runner-automation-plan.md, Phase 2). The audio cases need a
// tab Chrome marks `audible`, which only real, unmuted playback does. Every
// audio case opens this page, and the runner tells it to play and stop
// (actions.ts, playTestAudio and stopTestAudio). Its Play and Stop buttons
// are there for someone trying the page by hand.
//
// Starting an AudioContext without a user gesture is subject to Chrome's
// autoplay policy. tools/start-test-chrome.sh launches the test profile with
// --autoplay-policy=no-user-gesture-required so that is never in question; a
// context that stays suspended is reported back as an error rather than
// ignored, so the runner can say playback never started.

import { TEST_AUDIO_CONTROL_ACTION, TestAudioCommand, TestAudioControlMessage, TestAudioControlReply } from './testAudioProtocol';

// A plain 440 Hz sine, kept as quiet as Chrome allows. Chrome marks a tab
// audible only when its output is above a level threshold: a gain of 0.001
// (-60 dB) passed, and 0.0001 (-80 dB) never made the tab audible. 0.001
// keeps a margin above that threshold, so the audio cases do not fail at
// random.
const TONE_FREQUENCY_HZ = 440;
const TONE_GAIN = 0.001;
const RESUME_WAIT_MS = 1000;

/** Plays and stops one continuous tone through Web Audio. */
class TonePlayer
{
  #context: AudioContext | undefined;
  // A play() still waiting on resume(), so a second Play in that window joins
  // it instead of starting a second AudioContext
  #starting: Promise<void> | undefined;

  get isPlaying(): boolean
  {
    return this.#context !== undefined;
  }

  play(): Promise<void>
  {
    if (this.#context) return Promise.resolve();
    this.#starting ??= this.#start().finally(() => { this.#starting = undefined; });
    return this.#starting;
  }

  async #start(): Promise<void>
  {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = TONE_FREQUENCY_HZ;
    gain.gain.value = TONE_GAIN;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();

    // When autoplay is blocked, resume() can stay pending until a user
    // gesture that never comes, so give it a bounded wait and then look at
    // the state either way
    await Promise.race([context.resume(), new Promise(resolve => setTimeout(resolve, RESUME_WAIT_MS))]);

    // Autoplay blocked: the context never leaves 'suspended', and the tab
    // would never turn audible
    const state = context.state;
    if (state !== 'running')
    {
      await context.close();
      throw new Error(`the AudioContext stayed "${state}" - Chrome's autoplay policy blocked playback without a user gesture`);
    }

    this.#context = context;
  }

  /** Closing the context, not just suspending it, guarantees the tab falls silent. */
  async stop(): Promise<void>
  {
    // Let a play() in progress settle first, or it would start the tone
    // after this stop
    await this.#starting?.catch(() => undefined);
    const context = this.#context;
    this.#context = undefined;
    await context?.close();
  }
}

const player = new TonePlayer();

function showStatus(text: string): void
{
  const status = document.getElementById('status');
  if (status) status.textContent = text;

  if (import.meta.env.DEV)
  {
    console.log(`[test-audio] ${text}`);
  }
}

async function runCommand(command: TestAudioCommand): Promise<TestAudioControlReply>
{
  try
  {
    if (command === 'play')
    {
      await player.play();
    }
    else
    {
      await player.stop();
    }
    showStatus(`Test tone: ${player.isPlaying ? 'playing' : 'stopped'}`);
    return { ok: true };
  }
  catch (err)
  {
    const error = err instanceof Error ? err.message : String(err);
    showStatus(`Test tone: ${command} failed - ${error}`);
    return { ok: false, error };
  }
}

function isControlMessage(message: unknown): message is TestAudioControlMessage
{
  return (message as TestAudioControlMessage | undefined)?.action === TEST_AUDIO_CONTROL_ACTION;
}

// The buttons, for trying the page by hand
document.getElementById('play')?.addEventListener('click', () => { runCommand('play'); });
document.getElementById('stop')?.addEventListener('click', () => { runCommand('stop'); });

// Listen only once this page knows which tab it is in. The runner's message
// goes to every extension page, and each one decides synchronously whether it
// is the addressee, so no other page holds the reply channel open. A message
// sent before this point finds no receiver, and the runner retries.
chrome.tabs.getCurrent().then((tab) =>
{
  const ownTabId = tab?.id;

  // Opened somewhere other than a tab (e.g. as a popup's page): nothing can
  // address it, so say so instead of listening
  if (ownTabId === undefined)
  {
    showStatus('Test tone: not running in a tab, so the test runner cannot reach this page');
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
  {
    if (!isControlMessage(message) || message.tabId !== ownTabId) return;

    runCommand(message.command).then(sendResponse);
    return true;  // async response
  });
});

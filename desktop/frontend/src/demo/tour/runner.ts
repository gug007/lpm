import { wait } from "../wait";
import * as cursor from "./cursor";
import { doneCheck, stepDone, stepProject } from "./done";
import { center, click, reveal, type, waitFor } from "./dom";
import type { TourStepWire } from "./protocol";
import { STEPS, type StepContext } from "./steps";

const FADE_AFTER_MS = 1500;
const LAND_MS = 6000;
// Even a step done without the pointer waits a beat, as a person would, for
// the menu or dialog the last one closed to go.
const QUIET_GAP_MS = 250;

type Report = (stage: number, playing: boolean) => void;

// Plays a page's tour against the app: on its beats while the visitor watches,
// or up to a step they pick. A step counts as done whoever does it.
export class TourRunner {
  private steps: TourStepWire[] = [];
  private landed = new Set<number>();
  private playing = false;
  private run = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private report: Report) {}

  load(steps: TourStepWire[]): void {
    this.steps = steps;
    this.landed.clear();
    this.publish();
  }

  // Counts steps in order, latching each one seen done so a later move (back
  // to another project, say) never takes it back.
  stage(): number {
    let i = 0;
    while (i < this.steps.length && (this.landed.has(i) || stepDone(this.steps, i))) this.landed.add(i++);
    return i;
  }

  publish(): void {
    this.report(this.stage(), this.playing);
  }

  // Mimes every step left on its beat, timed from now.
  play(): void {
    const token = this.cancel();
    this.playing = true;
    this.publish();
    const t0 = performance.now();
    this.enqueue(async () => {
      for (let i = this.stage(); i < this.steps.length; i = Math.max(i + 1, this.stage())) {
        const due = t0 + this.steps[i].beatMs - 900;
        await wait(Math.max(0, due - performance.now()));
        if (token !== this.run) return;
        await this.perform(i, false, token);
      }
      await wait(FADE_AFTER_MS);
      if (token !== this.run) return;
      cursor.hide();
      this.playing = false;
      this.publish();
    });
  }

  // Carries out every step up to `index`, showing the pointer only on that one.
  runTo(index: number): void {
    const token = this.cancel();
    this.enqueue(async () => {
      for (let i = this.stage(); i <= index && i < this.steps.length; i++) {
        await this.perform(i, i !== index, token);
      }
      await wait(FADE_AFTER_MS);
      if (token === this.run) cursor.hide();
    });
  }

  // Lands whatever is left, or every step up to `last`, without miming it, as
  // when the frame scrolls away or opens on a tour already under way.
  settle(last = this.steps.length - 1): void {
    const token = this.cancel();
    const end = Math.min(last, this.steps.length - 1);
    this.enqueue(async () => {
      for (let i = this.stage(); i <= end; i++) await this.perform(i, true, token);
    });
  }

  // The visitor took over: stop miming, keep what has happened.
  interrupt(): void {
    if (!this.playing) return;
    this.cancel();
    cursor.hide();
  }

  private cancel(): number {
    this.run++;
    this.playing = false;
    this.publish();
    return this.run;
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue.then(job, job).catch((err) => console.warn("[demo tour]", err));
  }

  private async perform(index: number, quiet: boolean, token: number): Promise<void> {
    if (this.landed.has(index) || stepDone(this.steps, index)) return;
    const step = this.steps[index];
    const ctx: StepContext = {
      project: stepProject(this.steps, index),
      click: async (el, button = 0) => {
        if (quiet) await wait(QUIET_GAP_MS);
        else if (token === this.run) {
          reveal(el);
          await cursor.moveTo(center(el));
          await cursor.tap();
        }
        click(el, button);
      },
      type: (el, text) => type(el, text, quiet ? 0 : 32),
    };
    const landed = doneCheck(this.steps, index);
    try {
      await STEPS[step.id](step as never, ctx);
      if (landed) await waitFor(landed, LAND_MS);
    } catch (err) {
      console.warn(`[demo tour] step ${index} (${step.id}) did not land:`, err);
    }
    this.landed.add(index);
    this.publish();
  }
}


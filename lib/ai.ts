import OpenAI from "openai";
import { init, wrapOpenAI } from "neatlogs";

let setupPromise: Promise<void> | undefined;

export async function setup(): Promise<void> {
  setupPromise ??= init({
    apiKey: process.env.NEATLOGS_API_KEY,
    endpoint: "https://ingest.neatlogs.com",
    workflowName: "stockpilot",
  });
  await setupPromise;
}

export const openai = wrapOpenAI(new OpenAI());
export const model = process.env.MODEL;

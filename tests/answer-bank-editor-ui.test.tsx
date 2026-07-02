import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { AnswerBankEditor } from "@/components/AnswerBankEditor";
import { createDefaultAnswerBank } from "@/lib/answerBank";

import { setupDom } from "./test-helpers";

let teardownDom: (() => void) | null = null;

beforeEach(() => {
  teardownDom = setupDom();
  globalThis.fetch = undefined as unknown as typeof fetch;
});

afterEach(() => {
  teardownDom?.();
  teardownDom = null;
});

test("saved answers are presented in human terms and can be edited and saved", async () => {
  const items = createDefaultAnswerBank().slice(0, 1);
  let savedBody = "";
  globalThis.fetch = async (_input, init) => {
    savedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ items: JSON.parse(savedBody) }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const user = userEvent.setup({ document: globalThis.document });
  const view = render(<AnswerBankEditor initialItems={items} />);

  assert.match(document.body.textContent ?? "", /Where it may be reused/i);
  assert.match(document.body.textContent ?? "", /Review preference/i);
  assert.doesNotMatch(document.body.textContent ?? "", /questionPatterns|regex|confidence|intent/i);

  const questionInput = view.getByPlaceholderText("Why are you interested in this role?");
  await user.clear(questionInput);
  await user.type(questionInput, "Why are you interested in ApplyPilot?");

  const answerArea = view.getByPlaceholderText("Write the answer you would want to review and reuse later.");
  await user.clear(answerArea);
  await user.type(answerArea, "I enjoy careful workflow products and human-in-the-loop systems.");

  await user.click(view.getByRole("button", { name: /Save answers/i }));

  await waitFor(() => assert.match(savedBody, /Why are you interested in ApplyPilot\?/i));
  await waitFor(() => assert.match(savedBody, /human-in-the-loop systems/i));
  await waitFor(() => assert.match(document.body.textContent ?? "", /Saved locally\./i));
});

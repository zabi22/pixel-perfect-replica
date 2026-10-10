import type { Step } from "./schema";

/** Starter plans made only of supported step types. They are proposals, never results. */
export type Template = { id: string; name: string; summary: string; instruction: string; steps: Step[] };

export const TEMPLATES: Template[] = [
  {
    id: "smoke",
    name: "Homepage smoke test",
    summary: "Homepage loads and shows a main heading.",
    instruction: "Open the homepage and check that it loads with a visible main heading.",
    steps: [
      { action: "goto", path: "/" },
      { action: "assertVisible", target: { by: "role", role: "heading", name: "" } },
    ],
  },
  {
    id: "nav",
    name: "Navigation test",
    summary: "Click a menu link and confirm the page changed.",
    instruction: "Open the homepage, click the navigation link to the about page, and check the URL changed.",
    steps: [
      { action: "goto", path: "/" },
      { action: "click", target: { by: "role", role: "link", name: "About" } },
      { action: "assertUrl", contains: "about" },
    ],
  },
  {
    id: "contact",
    name: "Contact form test",
    summary: "Fill the contact form with test data and submit.",
    instruction: "Go to the contact page, fill in name, email and message with test data, submit, and verify a confirmation message.",
    steps: [
      { action: "goto", path: "/contact" },
      { action: "fill", target: { by: "label", value: "Name" }, value: "DeployProof Test" },
      { action: "fill", target: { by: "label", value: "Email" }, value: "qa@example.com" },
      { action: "fill", target: { by: "label", value: "Message" }, value: "Automated test message, please ignore." },
      { action: "click", target: { by: "role", role: "button", name: "Send" } },
      { action: "assertText", text: "Thank you" },
    ],
  },
  {
    id: "content",
    name: "Key-page content test",
    summary: "A specific page shows the text you expect.",
    instruction: "Open a key page and verify that important text is present.",
    steps: [
      { action: "goto", path: "/" },
      { action: "assertText", text: "Replace with text you expect" },
    ],
  },
];

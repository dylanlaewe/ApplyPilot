export type RegressionAts =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "jobvite"
  | "workday"
  | "smartrecruiters"
  | "icims"
  | "generic";

export type RegressionFieldExpectation = {
  step: number;
  label: string;
  selector: string;
  expected: string;
  required: boolean;
  control:
    | "text"
    | "textarea"
    | "native_select"
    | "radio"
    | "aria_combobox"
    | "menu_button"
    | "file";
  tags?: Array<"dropdown" | "autocomplete" | "file_upload" | "sensitive" | "repeater_education" | "repeater_employment">;
  framePath?: string;
};

export type RegressionStep = {
  step: number;
  path: string;
  heading: string;
  continueSelector?: string;
  transitionMode?: "full_navigation" | "spa";
  expectations: RegressionFieldExpectation[];
};

export type RegressionCase = {
  id: string;
  ats: RegressionAts;
  title: string;
  entryPath: string;
  steps: RegressionStep[];
};

function wrapHtml(title: string, body: string, script = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
      .shell { max-width: 760px; margin: 0 auto; }
      .card { border: 1px solid #e2e8f0; border-radius: 20px; padding: 24px; background: #fff; }
      .stack { display: grid; gap: 16px; }
      .two-up { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      label, .field { display: grid; gap: 6px; font-weight: 600; }
      input, select, textarea, button[data-control="input"] {
        padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 12px; font: inherit; background: #fff;
      }
      textarea { min-height: 100px; }
      .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      .action-link, .action-button { display: inline-flex; align-items: center; justify-content: center; padding: 10px 16px; border-radius: 999px; background: #0f172a; color: #fff; border: 0; text-decoration: none; font-weight: 700; cursor: pointer; }
      [role="listbox"] { border: 1px solid #cbd5e1; border-radius: 12px; padding: 6px; margin-top: 8px; background: white; }
      [role="option"] { padding: 8px 10px; border-radius: 8px; cursor: pointer; }
      [role="option"]:hover { background: #eff6ff; }
      .muted { color: #475569; font-size: 14px; }
      .hidden { display: none; }
      .resume-card { font-size: 14px; color: #0f172a; background: #f8fafc; border-radius: 12px; padding: 10px 12px; }
      .section-title { font-size: 18px; font-weight: 700; margin: 4px 0; }
      .section-subtle { color: #64748b; font-size: 14px; }
      iframe { width: 100%; min-height: 560px; border: 1px solid #cbd5e1; border-radius: 16px; }
      @media (max-width: 760px) { .two-up { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="shell">${body}</main>
    <script>
      const setupUploadPreview = (inputId, previewId) => {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        if (!input || !preview) return;
        input.addEventListener("change", () => {
          preview.textContent = input.files?.[0]?.name || "";
        });
      };

      const setupCombobox = (inputId, listId) => {
        const input = document.getElementById(inputId);
        const list = document.getElementById(listId);
        if (!input || !list) return;
        const show = () => { list.style.display = "block"; };
        const hide = () => { list.style.display = "none"; };
        input.addEventListener("click", show);
        input.addEventListener("input", show);
        list.querySelectorAll('[role="option"]').forEach((option) => {
          option.addEventListener("click", () => {
            input.value = option.getAttribute("data-value") || option.textContent || "";
            hide();
            input.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });
      };

      const setupMenuButton = (buttonId, listId) => {
        const button = document.getElementById(buttonId);
        const list = document.getElementById(listId);
        if (!button || !list) return;
        button.addEventListener("click", () => {
          list.style.display = list.style.display === "block" ? "none" : "block";
        });
        list.querySelectorAll('[role="option"]').forEach((option) => {
          option.addEventListener("click", () => {
            button.textContent = option.textContent || "";
            button.setAttribute("data-selected-value", option.textContent || "");
            list.style.display = "none";
            button.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });
      };
    </script>
    ${script ? `<script>${script}</script>` : ""}
  </body>
</html>`;
}

function field(label: string, control: string) {
  return `<div class="field"><div>${label}</div>${control}</div>`;
}

export const regressionCases: RegressionCase[] = [
  {
    id: "greenhouse-fixture",
    ats: "greenhouse",
    title: "Greenhouse fixture",
    entryPath: "/greenhouse",
    steps: [
      {
        step: 1,
        path: "/greenhouse",
        heading: "Greenhouse Application",
        continueSelector: "#gh-next",
        transitionMode: "full_navigation",
        expectations: [
          { step: 1, label: "First Name", selector: "#gh_first_name", expected: "Avery", required: true, control: "text" },
          { step: 1, label: "Email", selector: "#gh_email", expected: "avery@example.com", required: true, control: "text" },
          {
            step: 1,
            label: "Resume",
            selector: "#gh_resume",
            expected: "benchmark.synthetic-resume.pdf",
            required: true,
            control: "file",
            tags: ["file_upload"]
          }
        ]
      },
      {
        step: 2,
        path: "/greenhouse/step-2",
        heading: "Greenhouse Additional Details",
        expectations: [
          { step: 2, label: "LinkedIn Profile", selector: "#gh_linkedin", expected: "https://www.linkedin.com/in/avery-benchmark", required: true, control: "text" },
          { step: 2, label: "Portfolio Website", selector: "#gh_portfolio", expected: "https://portfolio.applypilot.local", required: false, control: "text" }
        ]
      }
    ]
  },
  {
    id: "lever-fixture",
    ats: "lever",
    title: "Lever fixture",
    entryPath: "/lever",
    steps: [
      {
        step: 1,
        path: "/lever",
        heading: "Lever Application",
        expectations: [
          {
            step: 1,
            label: "City",
            selector: "#lever_city",
            expected: "Boston, Massachusetts, United States",
            required: true,
            control: "aria_combobox",
            tags: ["autocomplete"]
          },
          {
            step: 1,
            label: "Are you authorized to work in the United States?",
            selector: "#lever_work_auth",
            expected: "Yes",
            required: true,
            control: "native_select",
            tags: ["dropdown", "sensitive"]
          },
          {
            step: 1,
            label: "Will you now or in the future require sponsorship?",
            selector: "#lever_sponsorship",
            expected: "No",
            required: true,
            control: "native_select",
            tags: ["dropdown", "sensitive"]
          }
        ]
      }
    ]
  },
  {
    id: "ashby-fixture",
    ats: "ashby",
    title: "Ashby fixture",
    entryPath: "/ashby",
    steps: [
      {
        step: 1,
        path: "/ashby",
        heading: "Ashby Application",
        continueSelector: "#ashby-next",
        transitionMode: "spa",
        expectations: [
          { step: 1, label: "First Name", selector: "#ashby_first_name", expected: "Avery", required: true, control: "text" },
          { step: 1, label: "Last Name", selector: "#ashby_last_name", expected: "Benchmark", required: true, control: "text" }
        ]
      },
      {
        step: 2,
        path: "/ashby/step-2",
        heading: "Ashby Follow Up",
        expectations: [
          {
            step: 2,
            label: "Country",
            selector: "#ashby_country_button",
            expected: "United States",
            required: true,
            control: "menu_button",
            tags: ["dropdown", "sensitive"]
          },
          {
            step: 2,
            label: "GitHub",
            selector: "#ashby_github",
            expected: "https://github.com/applypilot-benchmark",
            required: false,
            control: "text"
          }
        ]
      }
    ]
  },
  {
    id: "workable-fixture",
    ats: "workable",
    title: "Workable fixture",
    entryPath: "/workable",
    steps: [
      {
        step: 1,
        path: "/workable",
        heading: "Workable Application",
        expectations: [
          { step: 1, label: "Phone", selector: "#workable_phone", expected: "+1 6178338317", required: true, control: "text" },
          {
            step: 1,
            label: "Desired salary range",
            selector: "#workable_salary",
            expected: "$120,000 - $140,000",
            required: true,
            control: "native_select",
            tags: ["dropdown"]
          },
          {
            step: 1,
            label: "When can you start?",
            selector: "#workable_start",
            expected: "2 weeks",
            required: true,
            control: "native_select",
            tags: ["dropdown"]
          }
        ]
      }
    ]
  },
  {
    id: "jobvite-fixture",
    ats: "jobvite",
    title: "Jobvite fixture",
    entryPath: "/jobvite",
    steps: [
      {
        step: 1,
        path: "/jobvite",
        heading: "Jobvite Application",
        expectations: [
          {
            step: 1,
            label: "Are you authorized to work in the United States?",
            selector: "#jobvite_work_auth_yes",
            expected: "Yes",
            required: true,
            control: "radio",
            tags: ["sensitive"]
          },
          {
            step: 1,
            label: "Will you now or in the future require sponsorship?",
            selector: "#jobvite_sponsorship_no",
            expected: "No",
            required: true,
            control: "radio",
            tags: ["sensitive"]
          },
          {
            step: 1,
            label: "Resume / CV",
            selector: "#jobvite_resume",
            expected: "benchmark.synthetic-resume.pdf",
            required: true,
            control: "file",
            tags: ["file_upload"]
          }
        ]
      }
    ]
  },
  {
    id: "workday-fixture",
    ats: "workday",
    title: "Workday fixture",
    entryPath: "/workday",
    steps: [
      {
        step: 1,
        path: "/workday",
        heading: "Workday My Information",
        continueSelector: "#workday-next",
        transitionMode: "full_navigation",
        expectations: [
          { step: 1, label: "First Name", selector: "#wd_first_name", expected: "Avery", required: true, control: "text" },
          {
            step: 1,
            label: "Country",
            selector: "#wd_country_button",
            expected: "United States",
            required: true,
            control: "menu_button",
            tags: ["dropdown", "sensitive"]
          }
        ]
      },
      {
        step: 2,
        path: "/workday/step-2",
        heading: "Workday Experience",
        expectations: [
          {
            step: 2,
            label: "School",
            selector: "#wd_school",
            expected: "Commonwealth State University",
            required: true,
            control: "text",
            tags: ["repeater_education"]
          },
          {
            step: 2,
            label: "Degree",
            selector: "#wd_degree_button",
            expected: "Bachelor of Science",
            required: true,
            control: "menu_button",
            tags: ["dropdown", "repeater_education"]
          },
          {
            step: 2,
            label: "Field of Study",
            selector: "#wd_major",
            expected: "Computer Science",
            required: true,
            control: "text",
            tags: ["repeater_education"]
          },
          {
            step: 2,
            label: "Company",
            selector: "#wd_company",
            expected: "Benchmark Systems",
            required: true,
            control: "text",
            tags: ["repeater_employment"]
          },
          {
            step: 2,
            label: "Job Title",
            selector: "#wd_title",
            expected: "Software Engineer",
            required: true,
            control: "text",
            tags: ["repeater_employment"]
          }
        ]
      }
    ]
  },
  {
    id: "smartrecruiters-fixture",
    ats: "smartrecruiters",
    title: "SmartRecruiters fixture",
    entryPath: "/smartrecruiters",
    steps: [
      {
        step: 1,
        path: "/smartrecruiters",
        heading: "SmartRecruiters Application",
        expectations: [
          {
            step: 1,
            label: "Location",
            selector: "#sr_location",
            expected: "Boston, Massachusetts, United States",
            required: true,
            control: "aria_combobox",
            tags: ["autocomplete"]
          },
          { step: 1, label: "Website", selector: "#sr_website", expected: "https://portfolio.applypilot.local", required: false, control: "text" },
          {
            step: 1,
            label: "Resume",
            selector: "#sr_resume",
            expected: "benchmark.synthetic-resume.pdf",
            required: true,
            control: "file",
            tags: ["file_upload"]
          }
        ]
      }
    ]
  },
  {
    id: "icims-fixture",
    ats: "icims",
    title: "iCIMS fixture",
    entryPath: "/icims",
    steps: [
      {
        step: 1,
        path: "/icims",
        heading: "iCIMS Application",
        expectations: [
          { step: 1, label: "First Name", selector: "#icims_first_name", expected: "Avery", required: true, control: "text", framePath: "/icims/frame" },
          { step: 1, label: "Last Name", selector: "#icims_last_name", expected: "Benchmark", required: true, control: "text", framePath: "/icims/frame" },
          {
            step: 1,
            label: "Country",
            selector: "#icims_country",
            expected: "United States",
            required: true,
            control: "native_select",
            tags: ["dropdown", "sensitive"],
            framePath: "/icims/frame"
          }
        ]
      }
    ]
  },
  {
    id: "generic-fixture",
    ats: "generic",
    title: "Generic HTML fixture",
    entryPath: "/generic",
    steps: [
      {
        step: 1,
        path: "/generic",
        heading: "Generic Application",
        expectations: [
          { step: 1, label: "Full Name", selector: "#generic_full_name", expected: "Avery Benchmark", required: true, control: "text" },
          { step: 1, label: "GitHub", selector: "#generic_github", expected: "https://github.com/applypilot-benchmark", required: false, control: "text" },
          { step: 1, label: "Portfolio", selector: "#generic_portfolio", expected: "https://portfolio.applypilot.local", required: false, control: "text" }
        ]
      }
    ]
  }
];

const caseMap = new Map(regressionCases.map((item) => [item.id, item]));

export function getRegressionCaseByPath(pathname: string) {
  const normalized = pathname === "/" ? "/generic" : pathname.replace(/\/+$/, "") || "/";
  for (const testCase of regressionCases) {
    const matchedStep = testCase.steps.find((step) => step.path === normalized);
    if (matchedStep) {
      return {
        testCase,
        step: matchedStep
      };
    }
  }

  return null;
}

export function renderRegressionFixture(pathname: string, origin: string) {
  if (pathname === "/icims/frame") {
    return wrapHtml(
      "iCIMS Embedded Form",
      `<div class="card stack">
        <h1>iCIMS Candidate Details</h1>
        <label for="icims_first_name">First Name<input id="icims_first_name" name="icims_first_name" required /></label>
        <label for="icims_last_name">Last Name<input id="icims_last_name" name="icims_last_name" required /></label>
        <label for="icims_country">Country
          <select id="icims_country" required>
            <option value="">Select</option>
            <option>Canada</option>
            <option>United States</option>
          </select>
        </label>
      </div>`
    );
  }

  const match = getRegressionCaseByPath(pathname);
  if (!match) {
    return wrapHtml("Fixture Not Found", `<div class="card"><h1>Fixture not found</h1><p class="muted">${pathname}</p></div>`);
  }

  const { testCase, step } = match;

  if (testCase.id === "greenhouse-fixture" && step.step === 1) {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        <p class="muted">Structured-first application with a full navigation continuation.</p>
        <div class="two-up">
          <label for="gh_first_name">First Name<input id="gh_first_name" name="first_name" required autocomplete="given-name" /></label>
          <label for="gh_email">Email<input id="gh_email" name="email" type="email" required autocomplete="email" /></label>
        </div>
        <label for="gh_resume">Resume<input id="gh_resume" name="resume" type="file" required /></label>
        <div id="gh_resume_card" class="resume-card"></div>
        <div class="actions"><a class="action-link" id="gh-next" href="${origin}/greenhouse/step-2">Save and Continue</a></div>
      </div>`,
      `setupUploadPreview("gh_resume", "gh_resume_card");`
    );
  }

  if (testCase.id === "greenhouse-fixture" && step.step === 2) {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        <label for="gh_linkedin">LinkedIn Profile<input id="gh_linkedin" name="linkedin" type="url" required /></label>
        <label for="gh_portfolio">Portfolio Website<input id="gh_portfolio" name="portfolio" type="url" /></label>
      </div>`
    );
  }

  if (testCase.id === "lever-fixture") {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        ${field("City", `<input id="lever_city" role="combobox" aria-controls="lever_city_list" required /><div id="lever_city_list" role="listbox" style="display:none">
          <div role="option" data-value="Boston, Massachusetts, United States">Boston, Massachusetts, United States</div>
          <div role="option" data-value="Berlin, Germany">Berlin, Germany</div>
        </div>`)}
        <label for="lever_work_auth">Are you authorized to work in the United States?
          <select id="lever_work_auth" required>
            <option value="">Select</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </label>
        <label for="lever_sponsorship">Will you now or in the future require sponsorship?
          <select id="lever_sponsorship" required>
            <option value="">Select</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </label>
      </div>`,
      `setupCombobox("lever_city", "lever_city_list");`
    );
  }

  if (testCase.id === "ashby-fixture" && step.step === 1) {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <div id="ashby-root">
          <h1>${step.heading}</h1>
          <div class="two-up">
            <label for="ashby_first_name">First Name<input id="ashby_first_name" required /></label>
            <label for="ashby_last_name">Last Name<input id="ashby_last_name" required /></label>
          </div>
          <div class="actions"><button class="action-button" type="button" id="ashby-next">Continue</button></div>
        </div>
      </div>`,
      `
        const root = document.getElementById("ashby-root");
        document.getElementById("ashby-next").addEventListener("click", () => {
          history.pushState({ step: 2 }, "", "/ashby/step-2");
          root.innerHTML = \`
            <h1>Ashby Follow Up</h1>
            <div class="field">
              <div id="ashby_country_label">Country</div>
              <button id="ashby_country_button" type="button" aria-haspopup="listbox" aria-labelledby="ashby_country_label ashby_country_button">Select country</button>
              <div id="ashby_country_list" role="listbox" style="display:none">
                <div role="option">Canada</div>
                <div role="option">United States</div>
                <div role="option">United Kingdom</div>
              </div>
            </div>
            <label for="ashby_github">GitHub<input id="ashby_github" type="url" /></label>
          \`;
          setupMenuButton("ashby_country_button", "ashby_country_list");
        });
      `
    );
  }

  if (testCase.id === "ashby-fixture" && step.step === 2) {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        <div class="field">
          <div id="ashby_country_label">Country</div>
          <button id="ashby_country_button" type="button" aria-haspopup="listbox" aria-labelledby="ashby_country_label ashby_country_button">Select country</button>
          <div id="ashby_country_list" role="listbox" style="display:none">
            <div role="option">Canada</div>
            <div role="option">United States</div>
            <div role="option">United Kingdom</div>
          </div>
        </div>
        <label for="ashby_github">GitHub<input id="ashby_github" type="url" /></label>
      </div>`,
      `setupMenuButton("ashby_country_button", "ashby_country_list");`
    );
  }

  if (testCase.id === "workable-fixture") {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        <label for="workable_phone">Phone<input id="workable_phone" type="tel" required /></label>
        <label for="workable_salary">Desired salary range
          <select id="workable_salary" required>
            <option value="">Select</option>
            <option>$90,000 - $110,000</option>
            <option>$120,000 - $140,000</option>
            <option>$150,000+</option>
          </select>
        </label>
        <label for="workable_start">When can you start?
          <select id="workable_start" required>
            <option value="">Select</option>
            <option>Immediately</option>
            <option>1 week</option>
            <option>2 weeks</option>
          </select>
        </label>
      </div>`
    );
  }

  if (testCase.id === "jobvite-fixture") {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        <fieldset>
          <legend>Are you authorized to work in the United States?</legend>
          <label><input id="jobvite_work_auth_no" type="radio" name="jobvite_work_auth" value="no" /> No</label>
          <label><input id="jobvite_work_auth_yes" type="radio" name="jobvite_work_auth" value="yes" /> Yes</label>
        </fieldset>
        <fieldset>
          <legend>Will you now or in the future require sponsorship?</legend>
          <label><input id="jobvite_sponsorship_yes" type="radio" name="jobvite_sponsorship" value="yes" /> Yes</label>
          <label><input id="jobvite_sponsorship_no" type="radio" name="jobvite_sponsorship" value="no" /> No</label>
        </fieldset>
        <label for="jobvite_resume">Resume / CV<input id="jobvite_resume" type="file" required /></label>
        <div id="jobvite_resume_card" class="resume-card"></div>
      </div>`,
      `setupUploadPreview("jobvite_resume", "jobvite_resume_card");`
    );
  }

  if (testCase.id === "workday-fixture" && step.step === 1) {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        <label for="wd_first_name">First Name<input id="wd_first_name" required /></label>
        <div class="field">
          <div id="wd_country_label">Country</div>
          <button id="wd_country_button" type="button" aria-haspopup="listbox" aria-labelledby="wd_country_label wd_country_button">Select country</button>
          <div id="wd_country_list" role="listbox" style="display:none">
            <div role="option">Canada</div>
            <div role="option">United States</div>
            <div role="option">United Kingdom</div>
          </div>
        </div>
        <div class="actions"><a class="action-link" id="workday-next" href="${origin}/workday/step-2">Next</a></div>
      </div>`,
      `setupMenuButton("wd_country_button", "wd_country_list");`
    );
  }

  if (testCase.id === "workday-fixture" && step.step === 2) {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        <section class="stack">
          <div>
            <div class="section-title">Education</div>
            <div class="section-subtle">Repeatable section fixture with an existing visible entry.</div>
          </div>
          <button class="action-button" type="button">Add another education</button>
          <label for="wd_school">School<input id="wd_school" required /></label>
          <div class="field">
            <div id="wd_degree_label">Degree</div>
            <button id="wd_degree_button" type="button" aria-haspopup="listbox" aria-labelledby="wd_degree_label wd_degree_button">Select degree</button>
            <div id="wd_degree_list" role="listbox" style="display:none">
              <div role="option">Associate Degree</div>
              <div role="option">Bachelor of Science</div>
              <div role="option">Master of Science</div>
            </div>
          </div>
          <label for="wd_major">Field of Study<input id="wd_major" required /></label>
        </section>
        <section class="stack">
          <div>
            <div class="section-title">Experience</div>
            <div class="section-subtle">Employment entry stays visible after navigation.</div>
          </div>
          <button class="action-button" type="button">Add another role</button>
          <label for="wd_company">Company<input id="wd_company" required /></label>
          <label for="wd_title">Job Title<input id="wd_title" required /></label>
        </section>
      </div>`,
      `setupMenuButton("wd_degree_button", "wd_degree_list");`
    );
  }

  if (testCase.id === "smartrecruiters-fixture") {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        ${field("Location", `<input id="sr_location" role="combobox" aria-controls="sr_location_list" required /><div id="sr_location_list" role="listbox" style="display:none">
          <div role="option" data-value="Boston, Massachusetts, United States">Boston, Massachusetts, United States</div>
          <div role="option" data-value="Chicago, Illinois, United States">Chicago, Illinois, United States</div>
        </div>`)}
        <label for="sr_website">Website<input id="sr_website" type="url" /></label>
        <label for="sr_resume">Resume<input id="sr_resume" type="file" required /></label>
        <div id="sr_resume_card" class="resume-card"></div>
      </div>`,
      `setupCombobox("sr_location", "sr_location_list"); setupUploadPreview("sr_resume", "sr_resume_card");`
    );
  }

  if (testCase.id === "icims-fixture") {
    return wrapHtml(
      testCase.title,
      `<div class="card stack">
        <h1>${step.heading}</h1>
        <p class="muted">Embedded applicant frame.</p>
        <iframe title="iCIMS form" src="${origin}/icims/frame"></iframe>
      </div>`
    );
  }

  return wrapHtml(
    testCase.title,
    `<div class="card stack">
      <h1>${step.heading}</h1>
      <label for="generic_full_name">Full Name<input id="generic_full_name" required /></label>
      <label for="generic_github">GitHub<input id="generic_github" type="url" /></label>
      <label for="generic_portfolio">Portfolio<input id="generic_portfolio" type="url" /></label>
    </div>`
  );
}
